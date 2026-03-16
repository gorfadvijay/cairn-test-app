/**
 * The main deployment orchestrator for Cloudflare
 * Reads CairnConfig, provisions resources, deploys code
 */

import { existsSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";
import type { CairnConfig } from "../../parser/types.ts";
import { createD1Database, runD1Query } from "./d1.ts";
import { createKVNamespace } from "./kv.ts";
import { createR2Bucket } from "./r2.ts";
import {
  deployWorker,
  enableWorkerRoute,
  getWorkerSubdomain,
} from "./worker.ts";
import { loadState, saveState } from "../../state.ts";
import { generateWorkerAuthScript } from "../auth/generate.ts";
import { generateAuthClient } from "../auth/client.ts";
import { resolvePostgresVendor, resolveRedisVendor } from "../vendor-registry.ts";
import { loadVendorCredentials } from "../../secrets/local.ts";
import {
  setCredentials as setNeonCredentials,
} from "../neon/api.ts";
import { createNeonProject } from "../neon/provisioner.ts";
import {
  setCredentials as setUpstashCredentials,
} from "../upstash/api.ts";
import { createUpstashRedis, getUpstashRedisUrl } from "../upstash/provisioner.ts";
import { provisionVendorResources } from "../vendor-provisioning.ts";

/**
 * Bundle a user's entrypoint into a single ESM file for Workers
 * Uses Bun.build() so imports, TypeScript, etc. all resolve correctly
 */
/**
 * Shim that makes Bun.serve() code work inside Cloudflare Workers.
 * Captures the fetch handler from Bun.serve({ fetch }) and exports it
 * as the Worker's default fetch handler. Also injects env bindings into
 * process.env so user code like `process.env.DATABASE_URL` works.
 */
const WORKER_SHIM = `
// Cairn Worker shim — bridges Bun.serve() to Cloudflare Workers
let __cairn_fetch_handler = null;
const Bun = {
  serve(opts) {
    __cairn_fetch_handler = opts.fetch;
    return { port: 0, stop() {} };
  }
};
globalThis.Bun = Bun;
globalThis.process = globalThis.process || { env: {} };
`;

const WORKER_EXPORT = `
// Export the captured fetch handler as Worker default
export default {
  async fetch(request, env, ctx) {
    // Inject env bindings into process.env so user code works
    for (const [k, v] of Object.entries(env)) {
      if (typeof v === "string") globalThis.process.env[k] = v;
    }
    if (__cairn_fetch_handler) {
      return __cairn_fetch_handler(request);
    }
    return new Response("No fetch handler found", { status: 500 });
  }
};
`;

export async function bundleForWorker(entryPoint: string): Promise<string> {
  const absPath = resolve(process.cwd(), entryPoint);

  if (!existsSync(absPath)) {
    // No source file — return a placeholder Worker
    return `export default {
  async fetch(request, env, ctx) {
    return new Response("Hello from Cairn! Deploy your app code to see it here.", {
      headers: { "Content-Type": "text/plain" },
    });
  }
};`;
  }

  const result = await Bun.build({
    entrypoints: [absPath],
    target: "browser", // Workers use Web APIs (browser-like)
    format: "esm",
    bundle: true,
    minify: false, // Keep readable for debugging
  });

  if (!result.success) {
    const messages = result.logs.map((l) => l.message).join("\n");
    throw new Error(`Bundle failed:\n${messages}`);
  }

  const output = result.outputs[0];
  if (!output) {
    throw new Error("Bundle produced no output");
  }

  let code = await output.text();

  // Check if bundled code already exports a default fetch handler (Worker-native)
  if (code.includes("export default") && !code.includes("Bun.serve")) {
    return code;
  }

  // Wrap Bun.serve() code with the Worker shim
  // Strip any existing export default that Bun.build might have added
  code = code.replace(/export\s+default\s+\{[^}]*\};?\s*$/, "");

  return WORKER_SHIM + code + WORKER_EXPORT;
}

export async function deployToCloudflare(config: CairnConfig): Promise<void> {
  const state = loadState();
  const bindings: Record<string, unknown>[] = [];

  // 1. Provision databases (D1 or Neon based on vendor)
  for (const pg of config.postgres) {
    const vendor = resolvePostgresVendor(pg, "cloudflare");

    if (vendor === "neon") {
      const resourceKey = `neon:${pg.name}`;
      if (!state.resources[resourceKey]) {
        const neonCreds = loadVendorCredentials("neon");
        if (!neonCreds) throw new Error("Not logged in to Neon. Run: cairn login neon");
        setNeonCredentials(neonCreds as { apiKey: string });

        console.log(`Creating Neon Postgres: ${pg.name}...`);
        const project = await createNeonProject(`cairn-${config.project.name}-${pg.name}`);

        state.resources[resourceKey] = {
          projectId: project.projectId,
          connectionUri: project.connectionUri,
        };
        saveState(state);
        console.log(`  ✓ Created Neon Postgres: ${pg.name}`);
      } else {
        console.log(`  ✓ Neon Postgres already exists: ${pg.name}`);
      }

      // Inject DATABASE_URL as plain text binding
      bindings.push({
        type: "plain_text",
        name: `DB_${pg.name.toUpperCase()}_URL`,
        text: state.resources[resourceKey]!.connectionUri,
      });
      if (config.postgres.indexOf(pg) === 0) {
        bindings.push({
          type: "plain_text",
          name: "DATABASE_URL",
          text: state.resources[resourceKey]!.connectionUri,
        });
      }
    } else {
      // Default: Cloudflare D1
      const resourceKey = `d1:${pg.name}`;
      if (!state.resources[resourceKey]) {
        console.log(`Creating D1 database: ${pg.name}...`);
        const db = await createD1Database(
          `cairn-${config.project.name}-${pg.name}`,
        );
        state.resources[resourceKey] = { id: db.id, name: db.name };
        saveState(state);
        console.log(`  ✓ Created D1: ${db.name} (${db.id})`);
      } else {
        console.log(`  ✓ D1 already exists: ${pg.name}`);
      }

      bindings.push({
        type: "d1",
        name: `DB_${pg.name.toUpperCase()}`,
        id: state.resources[resourceKey]!.id,
      });
    }
  }

  // 2. Provision Redis/KV (KV or Upstash based on vendor)
  for (const rd of config.redis) {
    const vendor = resolveRedisVendor(rd, "cloudflare");

    if (vendor === "upstash") {
      const resourceKey = `upstash:${rd.name}`;
      if (!state.resources[resourceKey]) {
        const upstashCreds = loadVendorCredentials("upstash");
        if (!upstashCreds) throw new Error("Not logged in to Upstash. Run: cairn login upstash");
        setUpstashCredentials(upstashCreds as { email: string; apiKey: string });

        console.log(`Creating Upstash Redis: ${rd.name}...`);
        const redis = await createUpstashRedis(`cairn-${config.project.name}-${rd.name}`);
        const redisUrl = getUpstashRedisUrl(redis.endpoint, redis.port, redis.password);

        state.resources[resourceKey] = {
          databaseId: redis.databaseId,
          redisUrl,
          restUrl: redis.restUrl,
          restToken: redis.restToken,
        };
        saveState(state);
        console.log(`  ✓ Created Upstash Redis: ${rd.name}`);
      } else {
        console.log(`  ✓ Upstash Redis already exists: ${rd.name}`);
      }

      bindings.push({
        type: "plain_text",
        name: `REDIS_${rd.name.toUpperCase()}_URL`,
        text: state.resources[resourceKey]!.redisUrl,
      });
      if (config.redis.indexOf(rd) === 0) {
        bindings.push({
          type: "plain_text",
          name: "REDIS_URL",
          text: state.resources[resourceKey]!.redisUrl,
        });
      }
    } else {
      // Default: Cloudflare KV
      const resourceKey = `kv:${rd.name}`;
      if (!state.resources[resourceKey]) {
        console.log(`Creating KV namespace: ${rd.name}...`);
        const kv = await createKVNamespace(
          `cairn-${config.project.name}-${rd.name}`,
        );
        state.resources[resourceKey] = { id: kv.id };
        saveState(state);
        console.log(`  ✓ Created KV: ${rd.name} (${kv.id})`);
      } else {
        console.log(`  ✓ KV already exists: ${rd.name}`);
      }

      bindings.push({
        type: "kv_namespace",
        name: `KV_${rd.name.toUpperCase()}`,
        namespace_id: state.resources[resourceKey]!.id,
      });
    }
  }

  // 3. Provision R2 buckets
  for (const st of config.storage) {
    const resourceKey = `r2:${st.name}`;
    const bucketName = `cairn-${config.project.name}-${st.name}`;
    if (!state.resources[resourceKey]) {
      console.log(`Creating R2 bucket: ${st.name}...`);
      try {
        await createR2Bucket(bucketName);
        state.resources[resourceKey] = { name: bucketName };
        saveState(state);
        console.log(`  ✓ Created R2: ${st.name}`);
      } catch (e: unknown) {
        const error = e as Error;
        if (error.message.includes("already exists")) {
          state.resources[resourceKey] = { name: bucketName };
          saveState(state);
          console.log(`  ✓ R2 bucket already exists: ${st.name}`);
        } else {
          throw e;
        }
      }
    } else {
      console.log(`  ✓ R2 already exists: ${st.name}`);
    }

    bindings.push({
      type: "r2_bucket",
      name: `R2_${st.name.toUpperCase()}`,
      bucket_name: state.resources[resourceKey]!.name,
    });
  }

  // 4. Deploy auth Workers (Better Auth on Cloudflare)
  for (const auth of config.auth) {
    const authScriptName = `cairn-${config.project.name}-auth-${auth.name}`;

    // Auth needs its own D1 database for users/sessions
    const authDbKey = `d1:auth-${auth.name}`;
    if (!state.resources[authDbKey]) {
      console.log(`Creating D1 for auth: ${auth.name}...`);
      const db = await createD1Database(
        `cairn-${config.project.name}-auth-${auth.name}`,
      );
      state.resources[authDbKey] = { id: db.id, name: db.name };
      saveState(state);
      console.log(`  ✓ Created D1 for auth: ${db.name} (${db.id})`);
    } else {
      console.log(`  ✓ D1 for auth already exists: ${auth.name}`);
    }

    // Run auth schema migration on D1
    const authDbId = state.resources[authDbKey]!.id;
    if (!state.resources[`auth-migrated:${auth.name}`]) {
      console.log(`  Running auth schema migration...`);
      await runD1Query(
        authDbId,
        `CREATE TABLE IF NOT EXISTS "user" (
          "id" TEXT PRIMARY KEY,
          "name" TEXT NOT NULL,
          "email" TEXT NOT NULL UNIQUE,
          "emailVerified" INTEGER NOT NULL DEFAULT 0,
          "image" TEXT,
          "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
          "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
        )`,
      );
      await runD1Query(
        authDbId,
        `CREATE TABLE IF NOT EXISTS "session" (
          "id" TEXT PRIMARY KEY,
          "expiresAt" TEXT NOT NULL,
          "token" TEXT NOT NULL UNIQUE,
          "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
          "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
          "ipAddress" TEXT,
          "userAgent" TEXT,
          "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
        )`,
      );
      await runD1Query(
        authDbId,
        `CREATE TABLE IF NOT EXISTS "account" (
          "id" TEXT PRIMARY KEY,
          "accountId" TEXT NOT NULL,
          "providerId" TEXT NOT NULL,
          "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
          "accessToken" TEXT,
          "refreshToken" TEXT,
          "idToken" TEXT,
          "accessTokenExpiresAt" TEXT,
          "refreshTokenExpiresAt" TEXT,
          "scope" TEXT,
          "password" TEXT,
          "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
          "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
        )`,
      );
      await runD1Query(
        authDbId,
        `CREATE TABLE IF NOT EXISTS "verification" (
          "id" TEXT PRIMARY KEY,
          "identifier" TEXT NOT NULL,
          "value" TEXT NOT NULL,
          "expiresAt" TEXT NOT NULL,
          "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
          "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
        )`,
      );
      state.resources[`auth-migrated:${auth.name}`] = { migrated: "true" };
      saveState(state);
      console.log(`  ✓ Auth schema created`);
    }

    const authBindings: Record<string, unknown>[] = [
      {
        type: "d1",
        name: "AUTH_DB",
        id: authDbId,
      },
    ];

    // Generate auth Worker script (self-contained, no external deps)
    console.log(`Deploying auth Worker: ${auth.name}...`);
    const authScript = generateWorkerAuthScript(auth);

    await deployWorker(authScriptName, authScript, authBindings);
    await enableWorkerRoute(authScriptName);

    const subdomain = await getWorkerSubdomain();
    const authUrl = `https://${authScriptName}.${subdomain}.workers.dev`;

    state.resources[`auth:${auth.name}`] = {
      scriptName: authScriptName,
      url: authUrl,
      dbId: state.resources[authDbKey]!.id,
    };
    saveState(state);
    console.log(`  ✓ Auth deployed: ${authUrl}`);

    // Generate auth SDK client for the user's app
    if (config.auth.indexOf(auth) === 0) {
      const { mkdirSync: mkdirS, writeFileSync: writeFS } = await import("fs");
      if (!existsSync(".cairn")) mkdirS(".cairn", { recursive: true });
      writeFS(".cairn/auth-client.ts", generateAuthClient(auth));
      console.log(`  ✓ Generated auth client: .cairn/auth-client.ts`);
    }

    // Add AUTH_URL as a plain text binding for service Workers
    bindings.push({
      type: "plain_text",
      name: `AUTH_${auth.name.toUpperCase()}_URL`,
      text: authUrl,
    });
    if (config.auth.indexOf(auth) === 0) {
      bindings.push({
        type: "plain_text",
        name: "AUTH_URL",
        text: authUrl,
      });
    }
  }

  // 5. Provision vendor resources (Trigger.dev, Resend, Sentry, etc.)
  const hasVendorBlocks =
    config.jobs.length > 0 ||
    config.email.length > 0 ||
    config.analytics.length > 0 ||
    config.monitoring.length > 0 ||
    config.logging.length > 0;

  if (hasVendorBlocks) {
    console.log(`\nProvisioning vendor resources...`);
    const vendorEnv = await provisionVendorResources(config);

    // Inject vendor env vars as plain text bindings
    for (const [key, value] of Object.entries(vendorEnv)) {
      bindings.push({ type: "plain_text", name: key, text: value });
    }
  }

  // 6. Run build step if defined, then deploy Workers
  for (const service of config.services) {
    if (!service.expose) continue;

    // Image-based services (from App Store) can't deploy to Cloudflare Workers
    if (service.image) {
      console.log(`  ⚠ Skipping ${service.name}: Docker image-based services require Railway or container targets`);
      console.log(`    Image: ${service.image} — use \`cairn deploy --target railway\` instead`);
      continue;
    }

    // Run build command (e.g. "bun install") before bundling
    if (service.build) {
      console.log(`Running build: ${service.build}...`);
      execSync(service.build, { stdio: "inherit", cwd: process.cwd() });
    }

    const scriptName = `cairn-${config.project.name}-${service.name}`;
    console.log(`Deploying Worker: ${service.name}...`);

    // Resolve entrypoint from the service command (last arg is typically the file)
    const entryPoint = service.command.split(" ").pop() || "src/index.ts";

    // Bundle the code with Bun.build() so all imports resolve
    console.log(`  Bundling ${entryPoint}...`);
    const bundledCode = await bundleForWorker(entryPoint);
    console.log(
      `  Bundled: ${(bundledCode.length / 1024).toFixed(1)}KB`,
    );

    await deployWorker(scriptName, bundledCode, bindings);
    await enableWorkerRoute(scriptName);

    const subdomain = await getWorkerSubdomain();
    const url = `https://${scriptName}.${subdomain}.workers.dev`;

    state.resources[`worker:${service.name}`] = { scriptName, url };
    saveState(state);
    console.log(`  ✓ Deployed: ${url}`);
  }

  console.log("\n✓ Deployment complete!");
  console.log("\nLive URLs:");
  for (const auth of config.auth) {
    const resource = state.resources[`auth:${auth.name}`];
    if (resource?.url) {
      console.log(`  auth:${auth.name} → ${resource.url}`);
    }
  }
  for (const service of config.services) {
    const resource = state.resources[`worker:${service.name}`];
    if (resource?.url) {
      console.log(`  ${service.name} → ${resource.url}`);
    }
  }
}
