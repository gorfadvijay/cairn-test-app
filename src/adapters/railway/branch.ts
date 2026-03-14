/**
 * Railway branch environment deployer
 * Creates a new Railway environment within the existing project
 */

import type { CairnConfig } from "../../parser/types.ts";
import { railwayGql } from "./api.ts";
import { createService, createServiceDomain, setServiceVariable } from "./project.ts";
import { createPostgres, createRedis } from "./database.ts";
import { loadState, saveState } from "../../state.ts";
import { ensureGitHubRepo, deployFromRepo } from "./source.ts";
import { resolvePostgresVendor, resolveRedisVendor } from "../vendor-registry.ts";
import { loadVendorCredentials } from "../../secrets/local.ts";
import { setCredentials as setNeonCredentials } from "../neon/api.ts";
import { createNeonBranch, getNeonConnectionUri } from "../neon/provisioner.ts";
import { setCredentials as setUpstashCredentials } from "../upstash/api.ts";
import { createUpstashRedis, getUpstashRedisUrl } from "../upstash/provisioner.ts";

/** Sanitize branch name for Railway */
function sanitizeBranchName(branch: string): string {
  return branch.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 30);
}

/**
 * Create a Railway environment for a branch
 */
async function createEnvironment(
  projectId: string,
  name: string,
): Promise<{ id: string; name: string }> {
  const result = await railwayGql<{
    environmentCreate: { id: string; name: string };
  }>(`
    mutation($input: EnvironmentCreateInput!) {
      environmentCreate(input: $input) {
        id
        name
      }
    }
  `, {
    input: { projectId, name },
  });
  return result.environmentCreate;
}

/**
 * Delete a Railway environment
 */
async function deleteEnvironment(environmentId: string): Promise<void> {
  await railwayGql(`
    mutation($id: String!) {
      environmentDelete(id: $id)
    }
  `, { id: environmentId });
}

/**
 * Deploy a branch environment to Railway
 */
export async function deployBranchToRailway(
  config: CairnConfig,
  branch: string,
): Promise<{ urls: Record<string, string> }> {
  const prodState = loadState();
  const branchState = loadState(branch);
  const safeBranch = sanitizeBranchName(branch);
  const urls: Record<string, string> = {};

  branchState.project = config.project.name;
  branchState.target = "railway";
  branchState.branch = branch;

  // Must have a production Railway project to branch from
  const projectId = prodState.resources["railway:project"]?.id;
  if (!projectId) {
    throw new Error("No production Railway project found. Deploy production first.");
  }

  // 1. Create a Railway environment for this branch
  let envId = branchState.resources["railway:env"]?.id;
  if (!envId) {
    console.log(`  Creating Railway environment: ${safeBranch}...`);
    const env = await createEnvironment(projectId, safeBranch);
    envId = env.id;
    branchState.resources["railway:env"] = { id: envId, name: env.name };
    saveState(branchState, branch);
    console.log(`  ✓ Created environment: ${env.name}`);
  }

  // 2. Provision branch databases
  for (const pg of config.postgres) {
    const vendor = resolvePostgresVendor(pg, "railway");

    if (vendor === "neon") {
      const resourceKey = `neon:${pg.name}`;
      if (!branchState.resources[resourceKey]) {
        const neonCreds = loadVendorCredentials("neon");
        if (!neonCreds) throw new Error("Not logged in to Neon. Run: cairn login neon");
        setNeonCredentials(neonCreds as { apiKey: string });

        const prodNeon = prodState.resources[`neon:${pg.name}`];
        if (!prodNeon?.projectId) {
          throw new Error(`No production Neon database for ${pg.name}. Deploy production first.`);
        }

        console.log(`  Creating Neon branch: ${safeBranch}...`);
        const neonBranch = await createNeonBranch(prodNeon.projectId, `cairn-${safeBranch}`);
        const connectionUri = await getNeonConnectionUri(prodNeon.projectId, "neondb_owner", pg.name);

        branchState.resources[resourceKey] = {
          projectId: prodNeon.projectId,
          branchId: neonBranch.branchId,
          host: neonBranch.host,
          connectionUri,
        };
        saveState(branchState, branch);
        console.log(`  ✓ Neon branch created (zero-copy)`);
      }
    } else {
      // Railway native Postgres in the branch environment (branch-prefixed name)
      const resourceKey = `railway:pg:${pg.name}`;
      if (!branchState.resources[resourceKey]) {
        console.log(`  Creating Postgres (branch): ${pg.name}...`);
        const db = await createPostgres(projectId, envId, `${safeBranch}-${pg.name}`);
        branchState.resources[resourceKey] = { serviceId: db.serviceId, name: db.name };
        saveState(branchState, branch);
        console.log(`  ✓ Created branch Postgres: ${pg.name}`);
      }
    }
  }

  // 3. Provision branch Redis
  for (const rd of config.redis) {
    const vendor = resolveRedisVendor(rd, "railway");

    if (vendor === "upstash") {
      const resourceKey = `upstash:${rd.name}`;
      if (!branchState.resources[resourceKey]) {
        const upstashCreds = loadVendorCredentials("upstash");
        if (!upstashCreds) throw new Error("Not logged in to Upstash. Run: cairn login upstash");
        setUpstashCredentials(upstashCreds as { email: string; apiKey: string });

        console.log(`  Creating Upstash Redis (branch): ${rd.name}...`);
        const redis = await createUpstashRedis(`cairn-${config.project.name}-${safeBranch}-${rd.name}`);
        const redisUrl = getUpstashRedisUrl(redis.endpoint, redis.port, redis.password);

        branchState.resources[resourceKey] = {
          databaseId: redis.databaseId,
          redisUrl,
          restUrl: redis.restUrl,
          restToken: redis.restToken,
        };
        saveState(branchState, branch);
        console.log(`  ✓ Created branch Upstash Redis`);
      }
    } else {
      // Railway native Redis in the branch environment (branch-prefixed name)
      const resourceKey = `railway:redis:${rd.name}`;
      if (!branchState.resources[resourceKey]) {
        console.log(`  Creating Redis (branch): ${rd.name}...`);
        const redis = await createRedis(projectId, envId, `${safeBranch}-${rd.name}`);
        branchState.resources[resourceKey] = { serviceId: redis.serviceId, name: redis.name };
        saveState(branchState, branch);
        console.log(`  ✓ Created branch Redis: ${rd.name}`);
      }
    }
  }

  // 4. Deploy application services in the branch environment
  const { repo, branch: gitBranch, rootDir } = ensureGitHubRepo(config.project.name);

  for (const service of config.services) {
    if (!service.expose) continue;

    const resourceKey = `railway:service:${service.name}`;
    if (!branchState.resources[resourceKey]) {
      console.log(`  Deploying branch service: ${service.name}...`);

      const deployment = await deployFromRepo(projectId, envId, repo, gitBranch);
      const svcId = deployment.serviceId!;

      // Set rootDirectory if needed
      if (rootDir) {
        await railwayGql(
          `mutation($serviceId: String!, $envId: String!, $input: ServiceInstanceUpdateInput!) {
            serviceInstanceUpdate(serviceId: $serviceId, environmentId: $envId, input: $input)
          }`,
          { serviceId: svcId, envId, input: { rootDirectory: rootDir } },
        );
      }

      // Wire DATABASE_URL
      const firstPg = config.postgres[0];
      if (firstPg) {
        const pgResource = branchState.resources[`railway:pg:${firstPg.name}`];
        if (pgResource) {
          await setServiceVariable(projectId, envId, svcId, "DATABASE_URL", "${{" + pgResource.name + ".DATABASE_URL}}");
        }
        const neonResource = branchState.resources[`neon:${firstPg.name}`];
        if (neonResource?.connectionUri) {
          await setServiceVariable(projectId, envId, svcId, "DATABASE_URL", neonResource.connectionUri);
        }
      }

      // Wire REDIS_URL
      const firstRedis = config.redis[0];
      if (firstRedis) {
        const redisResource = branchState.resources[`railway:redis:${firstRedis.name}`];
        if (redisResource) {
          await setServiceVariable(projectId, envId, svcId, "REDIS_URL", "${{" + redisResource.name + ".REDIS_URL}}");
        }
        const upstashResource = branchState.resources[`upstash:${firstRedis.name}`];
        if (upstashResource?.redisUrl) {
          await setServiceVariable(projectId, envId, svcId, "REDIS_URL", upstashResource.redisUrl);
        }
      }

      // Generate domain
      const domain = await createServiceDomain(svcId, envId);
      const url = `https://${domain}`;

      branchState.resources[resourceKey] = {
        serviceId: svcId,
        url,
        deploymentId: deployment.deploymentId,
      };
      saveState(branchState, branch);
      urls[service.name] = url;
      console.log(`  ✓ Branch deployed: ${url}`);
    }
  }

  return { urls };
}

/**
 * Destroy a branch environment on Railway
 */
export async function destroyBranchOnRailway(
  branchState: CairnState,
): Promise<void> {
  // Delete the Railway environment (removes all services in that env)
  const envId = branchState.resources["railway:env"]?.id;
  if (envId) {
    try {
      await deleteEnvironment(envId);
      console.log(`  ✓ Destroyed Railway environment`);
    } catch (e: unknown) {
      console.log(`  ✗ Failed to destroy Railway env: ${(e as Error).message}`);
    }
  }

  // Clean up external vendor resources (Neon branches, Upstash)
  for (const [key, value] of Object.entries(branchState.resources)) {
    try {
      if (key.startsWith("neon:") && value.branchId) {
        const neonCreds = loadVendorCredentials("neon");
        if (neonCreds) {
          setNeonCredentials(neonCreds as { apiKey: string });
          const { deleteNeonBranch } = await import("../neon/provisioner.ts");
          await deleteNeonBranch(value.projectId!, value.branchId);
          console.log(`  ✓ Destroyed Neon branch`);
        }
      } else if (key.startsWith("upstash:") && value.databaseId) {
        const upstashCreds = loadVendorCredentials("upstash");
        if (upstashCreds) {
          setUpstashCredentials(upstashCreds as { email: string; apiKey: string });
          const { deleteUpstashRedis } = await import("../upstash/provisioner.ts");
          await deleteUpstashRedis(value.databaseId);
          console.log(`  ✓ Destroyed Upstash Redis`);
        }
      }
    } catch (e: unknown) {
      console.log(`  ✗ Failed to destroy ${key}: ${(e as Error).message}`);
    }
  }
}
