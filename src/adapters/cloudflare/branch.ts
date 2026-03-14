/**
 * Cloudflare branch environment deployer
 * Creates branch-prefixed Workers, D1, KV, R2
 */

import type { CairnConfig } from "../../parser/types.ts";
import { createD1Database, runD1Query } from "./d1.ts";
import { createKVNamespace } from "./kv.ts";
import { createR2Bucket } from "./r2.ts";
import { deployWorker, enableWorkerRoute, getWorkerSubdomain } from "./worker.ts";
import { loadState, saveState } from "../../state.ts";
import { resolvePostgresVendor, resolveRedisVendor } from "../vendor-registry.ts";
import { loadVendorCredentials } from "../../secrets/local.ts";
import { setCredentials as setNeonCredentials } from "../neon/api.ts";
import { createNeonBranch, getNeonConnectionUri } from "../neon/provisioner.ts";
import { setCredentials as setUpstashCredentials } from "../upstash/api.ts";
import { createUpstashRedis, getUpstashRedisUrl } from "../upstash/provisioner.ts";

/**
 * Bundle user code for Workers (reuse from main deploy)
 */
async function bundleForWorker(entryPoint: string): Promise<string> {
  const { resolve } = await import("path");
  const { existsSync } = await import("fs");
  const absPath = resolve(process.cwd(), entryPoint);

  if (!existsSync(absPath)) {
    return `export default {
  async fetch(request, env, ctx) {
    return new Response("Branch preview — deploy your app code to see it here.", {
      headers: { "Content-Type": "text/plain" },
    });
  }
};`;
  }

  const result = await Bun.build({
    entrypoints: [absPath],
    target: "browser",
    format: "esm",
    bundle: true,
    minify: false,
  });

  if (!result.success) {
    const messages = result.logs.map((l) => l.message).join("\n");
    throw new Error(`Bundle failed:\n${messages}`);
  }

  const output = result.outputs[0];
  if (!output) throw new Error("Bundle produced no output");
  return await output.text();
}

/** Sanitize branch name for use in resource names */
function sanitizeBranchName(branch: string): string {
  return branch.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 30);
}

/**
 * Deploy a branch environment to Cloudflare
 * Creates branch-prefixed versions of all resources
 */
export async function deployBranchToCloudflare(
  config: CairnConfig,
  branch: string,
): Promise<{ urls: Record<string, string> }> {
  const prodState = loadState();
  const branchState = loadState(branch);
  const safeBranch = sanitizeBranchName(branch);
  const bindings: Record<string, unknown>[] = [];
  const urls: Record<string, string> = {};

  branchState.project = config.project.name;
  branchState.target = prodState.target || "cloudflare";
  branchState.branch = branch;

  // 1. Provision branch databases
  for (const pg of config.postgres) {
    const vendor = resolvePostgresVendor(pg, "cloudflare");

    if (vendor === "neon") {
      // Use Neon branching — zero-copy branch from production database
      const resourceKey = `neon:${pg.name}`;
      if (!branchState.resources[resourceKey]) {
        const neonCreds = loadVendorCredentials("neon");
        if (!neonCreds) throw new Error("Not logged in to Neon. Run: cairn login neon");
        setNeonCredentials(neonCreds as { apiKey: string });

        // Get the production Neon project ID to branch from
        const prodNeon = prodState.resources[`neon:${pg.name}`];
        if (!prodNeon?.projectId) {
          throw new Error(`No production Neon database found for ${pg.name}. Deploy production first.`);
        }

        console.log(`  Creating Neon branch: ${safeBranch}...`);
        const neonBranch = await createNeonBranch(prodNeon.projectId, `cairn-${safeBranch}`);

        // Get connection URI for the branch
        const connectionUri = await getNeonConnectionUri(
          prodNeon.projectId,
          "neondb_owner",
          pg.name,
        );

        branchState.resources[resourceKey] = {
          projectId: prodNeon.projectId,
          branchId: neonBranch.branchId,
          host: neonBranch.host,
          connectionUri,
        };
        saveState(branchState, branch);
        console.log(`  ✓ Neon branch created (zero-copy from production)`);
      }

      bindings.push({
        type: "plain_text",
        name: `DB_${pg.name.toUpperCase()}_URL`,
        text: branchState.resources[resourceKey]!.connectionUri,
      });
      if (config.postgres.indexOf(pg) === 0) {
        bindings.push({ type: "plain_text", name: "DATABASE_URL", text: branchState.resources[resourceKey]!.connectionUri });
      }
    } else {
      // Cloudflare D1 — create branch-prefixed database
      const resourceKey = `d1:${pg.name}`;
      if (!branchState.resources[resourceKey]) {
        console.log(`  Creating D1 (branch): ${pg.name}...`);
        const db = await createD1Database(`cairn-${config.project.name}-${safeBranch}-${pg.name}`);
        branchState.resources[resourceKey] = { id: db.id, name: db.name };
        saveState(branchState, branch);
        console.log(`  ✓ Created branch D1: ${db.name}`);
      }

      bindings.push({ type: "d1", name: `DB_${pg.name.toUpperCase()}`, id: branchState.resources[resourceKey]!.id });
    }
  }

  // 2. Provision branch KV/Redis
  for (const rd of config.redis) {
    const vendor = resolveRedisVendor(rd, "cloudflare");

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

      bindings.push({ type: "plain_text", name: `REDIS_${rd.name.toUpperCase()}_URL`, text: branchState.resources[resourceKey]!.redisUrl });
      if (config.redis.indexOf(rd) === 0) {
        bindings.push({ type: "plain_text", name: "REDIS_URL", text: branchState.resources[resourceKey]!.redisUrl });
      }
    } else {
      const resourceKey = `kv:${rd.name}`;
      if (!branchState.resources[resourceKey]) {
        console.log(`  Creating KV (branch): ${rd.name}...`);
        const kv = await createKVNamespace(`cairn-${config.project.name}-${safeBranch}-${rd.name}`);
        branchState.resources[resourceKey] = { id: kv.id };
        saveState(branchState, branch);
        console.log(`  ✓ Created branch KV: ${rd.name}`);
      }

      bindings.push({ type: "kv_namespace", name: `KV_${rd.name.toUpperCase()}`, namespace_id: branchState.resources[resourceKey]!.id });
    }
  }

  // 3. Provision branch R2 buckets
  for (const st of config.storage) {
    const resourceKey = `r2:${st.name}`;
    const bucketName = `cairn-${config.project.name}-${safeBranch}-${st.name}`;
    if (!branchState.resources[resourceKey]) {
      console.log(`  Creating R2 (branch): ${st.name}...`);
      try {
        await createR2Bucket(bucketName);
      } catch (e: unknown) {
        if (!(e as Error).message?.includes("already exists")) throw e;
      }
      branchState.resources[resourceKey] = { name: bucketName };
      saveState(branchState, branch);
      console.log(`  ✓ Created branch R2: ${st.name}`);
    }

    bindings.push({ type: "r2_bucket", name: `R2_${st.name.toUpperCase()}`, bucket_name: branchState.resources[resourceKey]!.name });
  }

  // 4. Deploy branch Workers
  for (const service of config.services) {
    if (!service.expose) continue;

    const scriptName = `cairn-${config.project.name}-${safeBranch}-${service.name}`;
    console.log(`  Deploying branch Worker: ${service.name}...`);

    const entryPoint = service.command.split(" ").pop() || "src/index.ts";
    const bundledCode = await bundleForWorker(entryPoint);

    await deployWorker(scriptName, bundledCode, bindings);
    await enableWorkerRoute(scriptName);

    const subdomain = await getWorkerSubdomain();
    const url = `https://${scriptName}.${subdomain}.workers.dev`;

    branchState.resources[`worker:${service.name}`] = { scriptName, url };
    saveState(branchState, branch);
    urls[service.name] = url;
    console.log(`  ✓ Branch deployed: ${url}`);
  }

  return { urls };
}

/**
 * Destroy a branch environment on Cloudflare
 */
export async function destroyBranchOnCloudflare(
  branchState: CairnState,
): Promise<void> {
  const { deleteD1Database } = await import("./d1.ts");
  const { deleteKVNamespace } = await import("./kv.ts");
  const { deleteR2Bucket } = await import("./r2.ts");
  const { deleteWorker } = await import("./worker.ts");

  for (const [key, value] of Object.entries(branchState.resources)) {
    try {
      if (key.startsWith("d1:") && value.id) {
        await deleteD1Database(value.id);
      } else if (key.startsWith("kv:") && value.id) {
        await deleteKVNamespace(value.id);
      } else if (key.startsWith("r2:") && value.name) {
        await deleteR2Bucket(value.name);
      } else if (key.startsWith("worker:") && value.scriptName) {
        await deleteWorker(value.scriptName);
      } else if (key.startsWith("neon:") && value.branchId) {
        const neonCreds = loadVendorCredentials("neon");
        if (neonCreds) {
          setNeonCredentials(neonCreds as { apiKey: string });
          const { deleteNeonBranch } = await import("../neon/provisioner.ts");
          await deleteNeonBranch(value.projectId!, value.branchId);
        }
      } else if (key.startsWith("upstash:") && value.databaseId) {
        const upstashCreds = loadVendorCredentials("upstash");
        if (upstashCreds) {
          setUpstashCredentials(upstashCreds as { email: string; apiKey: string });
          const { deleteUpstashRedis } = await import("../upstash/provisioner.ts");
          await deleteUpstashRedis(value.databaseId);
        }
      }
      console.log(`  ✓ Destroyed ${key}`);
    } catch (e: unknown) {
      console.log(`  ✗ Failed to destroy ${key}: ${(e as Error).message}`);
    }
  }
}
