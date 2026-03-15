/**
 * Vercel deployment orchestrator
 * Creates a Vercel project, provisions databases via third-party vendors,
 * sets env vars, and deploys via GitHub repo connection.
 *
 * Vercel doesn't have native Postgres/Redis — uses Neon/Upstash by default.
 */

import { execSync } from "child_process";
import type { CairnConfig } from "../../parser/types.ts";
import {
  createVercelProject,
  setVercelEnvVars,
} from "./provisioner.ts";
import { vercelApi } from "./api.ts";
import { loadState, saveState } from "../../state.ts";
import { generateAuthClient } from "../auth/client.ts";
import { loadVendorCredentials } from "../../secrets/local.ts";
import { setCredentials as setNeonCredentials } from "../neon/api.ts";
import { createNeonProject } from "../neon/provisioner.ts";
import { setCredentials as setUpstashCredentials } from "../upstash/api.ts";
import {
  createUpstashRedis,
  getUpstashRedisUrl,
} from "../upstash/provisioner.ts";
import { provisionVendorResources } from "../vendor-provisioning.ts";

/** Ensure GitHub repo exists and return repo info */
function ensureGitHubRepo(projectName: string): {
  repo: string;
  branch: string;
} {
  const run = (cmd: string) =>
    execSync(cmd, { stdio: "pipe", cwd: process.cwd() }).toString().trim();

  // Ensure git repo
  try {
    run("git rev-parse --git-dir");
  } catch {
    console.log("  Initializing git repo...");
    run("git init");
  }

  // Ensure at least one commit
  try {
    run("git rev-parse HEAD");
  } catch {
    console.log("  Creating initial commit...");
    run("git add -A");
    run('git commit -m "cairn: initial deploy"');
  }

  const branch = run("git rev-parse --abbrev-ref HEAD");

  // Check for GitHub remote
  let repo: string;
  try {
    const remoteUrl = run("git remote get-url origin");
    // Parse owner/repo from URL
    const match = remoteUrl.match(
      /github\.com[:/]([^/]+\/[^/.]+)/,
    );
    if (match) {
      repo = match[1]!;
    } else {
      throw new Error("Not a GitHub remote");
    }
  } catch {
    // Create GitHub repo
    console.log("  Creating GitHub repo...");
    try {
      run(
        `gh repo create ${projectName} --private --source=. --push`,
      );
      const remoteUrl = run("git remote get-url origin");
      const match = remoteUrl.match(
        /github\.com[:/]([^/]+\/[^/.]+)/,
      );
      repo = match?.[1] || projectName;
    } catch {
      throw new Error(
        "Failed to create GitHub repo. Install `gh` CLI: https://cli.github.com",
      );
    }
  }

  // Push latest
  try {
    run(`git push origin ${branch}`);
  } catch {
    // May already be up to date
  }

  return { repo, branch };
}

export async function deployToVercel(config: CairnConfig): Promise<void> {
  const state = loadState();
  state.target = "vercel";

  // 1. Ensure GitHub repo
  const hasSourceServices = config.services.some((s) => s.expose && !s.image);
  let gitSource: { repo: string; branch: string } | null = null;
  if (hasSourceServices) {
    gitSource = ensureGitHubRepo(config.project.name);
    console.log(
      `  ✓ Source ready: ${gitSource.repo} (${gitSource.branch})`,
    );
  }

  // 2. Provision databases (Vercel has no native DB — default to Neon)
  const envVars: Record<string, string> = {};

  for (const pg of config.postgres) {
    const resourceKey = `neon:${pg.name}`;
    if (!state.resources[resourceKey]) {
      const neonCreds = loadVendorCredentials("neon");
      if (!neonCreds) {
        throw new Error(
          "Vercel needs a database provider. Run: cairn login neon",
        );
      }
      setNeonCredentials(neonCreds as { apiKey: string });

      console.log(`Creating Neon Postgres: ${pg.name}...`);
      const project = await createNeonProject(
        `cairn-${config.project.name}-${pg.name}`,
      );

      state.resources[resourceKey] = {
        projectId: project.projectId,
        connectionUri: project.connectionUri,
      };
      saveState(state);
      console.log(`  ✓ Created Neon Postgres: ${pg.name}`);
    } else {
      console.log(`  ✓ Neon Postgres already exists: ${pg.name}`);
    }

    envVars[`DB_${pg.name.toUpperCase()}_URL`] =
      state.resources[resourceKey]!.connectionUri;
    if (config.postgres.indexOf(pg) === 0) {
      envVars["DATABASE_URL"] =
        state.resources[resourceKey]!.connectionUri;
    }
  }

  // 3. Provision Redis (Vercel has no native Redis — default to Upstash)
  for (const rd of config.redis) {
    const resourceKey = `upstash:${rd.name}`;
    if (!state.resources[resourceKey]) {
      const upstashCreds = loadVendorCredentials("upstash");
      if (!upstashCreds) {
        throw new Error(
          "Vercel needs a cache provider. Run: cairn login upstash",
        );
      }
      setUpstashCredentials(
        upstashCreds as { email: string; apiKey: string },
      );

      console.log(`Creating Upstash Redis: ${rd.name}...`);
      const redis = await createUpstashRedis(
        `cairn-${config.project.name}-${rd.name}`,
      );
      const redisUrl = getUpstashRedisUrl(
        redis.endpoint,
        redis.port,
        redis.password,
      );

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

    envVars[`REDIS_${rd.name.toUpperCase()}_URL`] =
      state.resources[resourceKey]!.redisUrl;
    if (config.redis.indexOf(rd) === 0) {
      envVars["REDIS_URL"] = state.resources[resourceKey]!.redisUrl;
    }
  }

  // 4. Provision vendor resources (Trigger.dev, Resend, Sentry, etc.)
  const hasVendorBlocks =
    config.jobs.length > 0 ||
    config.email.length > 0 ||
    config.analytics.length > 0 ||
    config.monitoring.length > 0 ||
    config.logging.length > 0;

  if (hasVendorBlocks) {
    console.log(`\nProvisioning vendor resources...`);
    const vendorEnv = await provisionVendorResources(config);
    Object.assign(envVars, vendorEnv);
  }

  // 5. Deploy services to Vercel
  for (const service of config.services) {
    if (!service.expose) continue;

    const resourceKey = `vercel:project:${service.name}`;

    if (!state.resources[resourceKey]) {
      console.log(`Creating Vercel project: ${service.name}...`);

      // Create Vercel project
      const proj = await createVercelProject(
        `cairn-${config.project.name}-${service.name}`,
      );

      // Set all env vars
      if (Object.keys(envVars).length > 0) {
        console.log(
          `  Setting ${Object.keys(envVars).length} env vars...`,
        );
        await setVercelEnvVars(proj.projectId, envVars);
      }

      // Link to GitHub repo
      if (gitSource) {
        const [owner, repo] = gitSource.repo.split("/");
        try {
          await vercelApi("PATCH", `/v9/projects/${proj.projectId}`, {
            gitRepository: {
              type: "github",
              repo: gitSource.repo,
            },
          });
          console.log(`  ✓ Linked to GitHub: ${gitSource.repo}`);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          console.log(
            `  ⚠ Could not auto-link GitHub: ${msg}`,
          );
          console.log(
            `    Link manually: https://vercel.com/${owner}/${repo}/settings/git`,
          );
        }
      }

      state.resources[resourceKey] = {
        projectId: proj.projectId,
        name: proj.name,
        url: proj.url,
      };
      saveState(state);
      console.log(`  ✓ Vercel project created: ${proj.url}`);
    } else {
      // Project exists — trigger redeploy
      const existing = state.resources[resourceKey]!;
      console.log(`  Redeploying ${service.name}...`);

      // Update env vars
      if (Object.keys(envVars).length > 0) {
        await setVercelEnvVars(existing.projectId, envVars);
      }

      // Push to trigger auto-deploy
      if (gitSource) {
        try {
          execSync(`git push origin ${gitSource.branch}`, {
            stdio: "pipe",
            cwd: process.cwd(),
          });
        } catch {
          // Already up to date
        }
      }

      console.log(
        `  ✓ Redeploy triggered: ${existing.url}`,
      );
    }
  }

  console.log("\n✓ Deployment complete!");
  console.log("\nLive URLs:");
  for (const service of config.services) {
    const resource = state.resources[`vercel:project:${service.name}`];
    if (resource?.url) {
      console.log(`  ${service.name} → ${resource.url}`);
    }
  }
}
