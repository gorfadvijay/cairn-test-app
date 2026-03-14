/**
 * Railway deployment orchestrator
 * Creates a Railway project with all services, databases, and auth
 */

import { execSync } from "child_process";
import type { CairnConfig } from "../../parser/types.ts";
import {
  createProject,
  createService,
  createServiceDomain,
  getProductionEnvId,
  setServiceVariable,
} from "./project.ts";
import { createPostgres, createRedis } from "./database.ts";
import { loadState, saveState } from "../../state.ts";
import { generateAuthClient } from "../auth/client.ts";
import { ensureGitHubRepo, deployFromRepo, redeployService } from "./source.ts";
import { resolvePostgresVendor, resolveRedisVendor } from "../vendor-registry.ts";
import { loadVendorCredentials } from "../../secrets/local.ts";
import { setCredentials as setNeonCredentials } from "../neon/api.ts";
import { createNeonProject } from "../neon/provisioner.ts";
import { setCredentials as setUpstashCredentials } from "../upstash/api.ts";
import { createUpstashRedis, getUpstashRedisUrl } from "../upstash/provisioner.ts";

export async function deployToRailway(config: CairnConfig): Promise<void> {
  const state = loadState();
  state.target = "railway";

  // 1. Create or reuse Railway project
  let projectId = state.resources["railway:project"]?.id;
  let envId = state.resources["railway:project"]?.envId;

  if (!projectId) {
    console.log(`Creating Railway project: ${config.project.name}...`);
    const project = await createProject(`cairn-${config.project.name}`);
    projectId = project.id;
    envId = getProductionEnvId(project);
    state.resources["railway:project"] = { id: projectId, envId };
    saveState(state);
    console.log(`  ✓ Created project: ${project.name}`);
  } else {
    console.log(`  ✓ Railway project exists`);
  }

  // 2. Provision Postgres databases (Railway native or Neon)
  for (const pg of config.postgres) {
    const vendor = resolvePostgresVendor(pg, "railway");

    if (vendor === "neon") {
      const resourceKey = `neon:${pg.name}`;
      if (!state.resources[resourceKey]) {
        const neonCreds = loadVendorCredentials("neon");
        if (!neonCreds) throw new Error("Not logged in to Neon. Run: cairn login neon");
        setNeonCredentials(neonCreds as { apiKey: string });

        console.log(`Creating Neon Postgres: ${pg.name}...`);
        const neonProject = await createNeonProject(`cairn-${config.project.name}-${pg.name}`);

        state.resources[resourceKey] = {
          projectId: neonProject.projectId,
          connectionUri: neonProject.connectionUri,
        };
        saveState(state);
        console.log(`  ✓ Created Neon Postgres: ${pg.name}`);
      } else {
        console.log(`  ✓ Neon Postgres already exists: ${pg.name}`);
      }
    } else {
      // Default: Railway native Postgres
      const resourceKey = `railway:pg:${pg.name}`;
      if (!state.resources[resourceKey]) {
        console.log(`Creating Postgres: ${pg.name}...`);
        const db = await createPostgres(projectId, envId!, pg.name);
        state.resources[resourceKey] = {
          serviceId: db.serviceId,
          name: db.name,
        };
        saveState(state);
        console.log(`  ✓ Created Postgres: ${pg.name}`);
      } else {
        console.log(`  ✓ Postgres already exists: ${pg.name}`);
      }
    }
  }

  // 3. Provision Redis instances (Railway native or Upstash)
  for (const rd of config.redis) {
    const vendor = resolveRedisVendor(rd, "railway");

    if (vendor === "upstash") {
      const resourceKey = `upstash:${rd.name}`;
      if (!state.resources[resourceKey]) {
        const upstashCreds = loadVendorCredentials("upstash");
        if (!upstashCreds) throw new Error("Not logged in to Upstash. Run: cairn login upstash");
        setUpstashCredentials(upstashCreds as { email: string; apiKey: string });

        console.log(`Creating Upstash Redis: ${rd.name}...`);
        const upstashRedis = await createUpstashRedis(`cairn-${config.project.name}-${rd.name}`);
        const redisUrl = getUpstashRedisUrl(upstashRedis.endpoint, upstashRedis.port, upstashRedis.password);

        state.resources[resourceKey] = {
          databaseId: upstashRedis.databaseId,
          redisUrl,
          restUrl: upstashRedis.restUrl,
          restToken: upstashRedis.restToken,
        };
        saveState(state);
        console.log(`  ✓ Created Upstash Redis: ${rd.name}`);
      } else {
        console.log(`  ✓ Upstash Redis already exists: ${rd.name}`);
      }
    } else {
      // Default: Railway native Redis
      const resourceKey = `railway:redis:${rd.name}`;
      if (!state.resources[resourceKey]) {
        console.log(`Creating Redis: ${rd.name}...`);
        const redis = await createRedis(projectId, envId!, rd.name);
        state.resources[resourceKey] = {
          serviceId: redis.serviceId,
          name: redis.name,
        };
        saveState(state);
        console.log(`  ✓ Created Redis: ${rd.name}`);
      } else {
        console.log(`  ✓ Redis already exists: ${rd.name}`);
      }
    }
  }

  // 4. Deploy auth services
  for (const auth of config.auth) {
    const resourceKey = `railway:auth:${auth.name}`;
    if (!state.resources[resourceKey]) {
      console.log(`Creating auth service: ${auth.name}...`);

      // Create auth service
      const authService = await createService(
        projectId,
        `auth-${auth.name}`,
      );

      // Set the auth service to use a Docker image with Bun
      await setServiceVariable(
        projectId,
        envId!,
        authService.id,
        "RAILWAY_DOCKERFILE_PATH",
        "Dockerfile.auth",
      );

      // Wire DATABASE_URL from the first Postgres service
      const firstPg = config.postgres[0];
      if (firstPg) {
        const pgResource = state.resources[`railway:pg:${firstPg.name}`];
        if (pgResource) {
          await setServiceVariable(
            projectId,
            envId!,
            authService.id,
            "DATABASE_URL",
            "${{" + pgResource.name + ".DATABASE_URL}}",
          );
        }
      }

      // Generate a domain for the auth service
      const domain = await createServiceDomain(authService.id, envId!);
      const authUrl = `https://${domain}`;

      state.resources[resourceKey] = {
        serviceId: authService.id,
        url: authUrl,
      };
      saveState(state);
      console.log(`  ✓ Auth service created: ${authUrl}`);

      // Generate auth SDK client for the user's app
      if (config.auth.indexOf(auth) === 0) {
        const { mkdirSync, writeFileSync } = await import("fs");
        const { existsSync } = await import("fs");
        if (!existsSync(".cairn")) mkdirSync(".cairn", { recursive: true });
        writeFileSync(".cairn/auth-client.ts", generateAuthClient(auth));
        console.log(`  ✓ Generated auth client: .cairn/auth-client.ts`);
      }
    } else {
      console.log(`  ✓ Auth already exists: ${auth.name}`);
    }
  }

  // 5. Deploy application services via GitHub repo
  // Auto-handles: git init, GitHub repo creation, commit, push
  const { repo, branch } = ensureGitHubRepo(config.project.name);
  console.log(`  ✓ Source ready: ${repo} (${branch})`);

  for (const service of config.services) {
    if (!service.expose) continue;

    const resourceKey = `railway:service:${service.name}`;
    if (!state.resources[resourceKey]) {
      console.log(`Creating service: ${service.name}...`);

      // Run build step if defined
      if (service.build) {
        console.log(`  Running build: ${service.build}...`);
        execSync(service.build, { stdio: "inherit", cwd: process.cwd() });
      }

      // Deploy from GitHub repo (creates service + triggers build)
      console.log(`  Deploying from ${repo} (${branch})...`);
      const deployment = await deployFromRepo(projectId, envId!, repo, branch);
      const svcId = deployment.serviceId!;

      // Wire environment variables from databases
      const firstPg = config.postgres[0];
      if (firstPg) {
        const pgResource = state.resources[`railway:pg:${firstPg.name}`];
        if (pgResource) {
          await setServiceVariable(
            projectId,
            envId!,
            svcId,
            "DATABASE_URL",
            "${{" + pgResource.name + ".DATABASE_URL}}",
          );
        }
      }

      const firstRedis = config.redis[0];
      if (firstRedis) {
        const redisResource =
          state.resources[`railway:redis:${firstRedis.name}`];
        if (redisResource) {
          await setServiceVariable(
            projectId,
            envId!,
            svcId,
            "REDIS_URL",
            "${{" + redisResource.name + ".REDIS_URL}}",
          );
        }
      }

      // Wire AUTH_URL
      const firstAuth = config.auth[0];
      if (firstAuth) {
        const authResource =
          state.resources[`railway:auth:${firstAuth.name}`];
        if (authResource?.url) {
          await setServiceVariable(
            projectId,
            envId!,
            svcId,
            "AUTH_URL",
            authResource.url,
          );
        }
      }

      // Generate a domain
      const domain = await createServiceDomain(svcId, envId!);
      const url = `https://${domain}`;

      console.log(`  ✓ Deployment triggered (${deployment.deploymentId?.slice(0, 8) || "building"})`);

      state.resources[resourceKey] = {
        serviceId: svcId,
        url,
        deploymentId: deployment.deploymentId,
      };
      saveState(state);
      console.log(`  ✓ Deployed: ${url}`);
    } else {
      // Service exists — push latest changes and redeploy
      const existing = state.resources[resourceKey]!;
      if (existing.serviceId) {
        console.log(`  Redeploying ${service.name}...`);
        try {
          // Push any new changes before redeploying
          execSync(`git push origin ${branch}`, { stdio: "pipe", cwd: process.cwd() });
        } catch {
          // Already up to date
        }
        const deployment = await redeployService(existing.serviceId, envId!);
        existing.deploymentId = deployment.deploymentId;
        saveState(state);
        console.log(`  ✓ Deployment triggered (${deployment.deploymentId?.slice(0, 8) || "pending"})`);
      }
    }
  }

  console.log("\n✓ Deployment complete!");
  console.log("\nLive URLs:");
  for (const auth of config.auth) {
    const resource = state.resources[`railway:auth:${auth.name}`];
    if (resource?.url) {
      console.log(`  auth:${auth.name} → ${resource.url}`);
    }
  }
  for (const service of config.services) {
    const resource = state.resources[`railway:service:${service.name}`];
    if (resource?.url) {
      console.log(`  ${service.name} → ${resource.url}`);
    }
  }
}
