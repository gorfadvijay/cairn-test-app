import chalk from "chalk";
import ora from "ora";
import { loadState, clearState } from "../state.ts";
import { loadVendorCredentials } from "../secrets/local.ts";
import { setCredentials } from "../adapters/cloudflare/api.ts";
import { deleteD1Database } from "../adapters/cloudflare/d1.ts";
import { deleteKVNamespace } from "../adapters/cloudflare/kv.ts";
import { deleteR2Bucket } from "../adapters/cloudflare/r2.ts";
import { deleteWorker } from "../adapters/cloudflare/worker.ts";
import { setCredentials as setRailwayCredentials } from "../adapters/railway/api.ts";
import { destroyRailwayProject } from "../adapters/railway/destroy.ts";
import { setCredentials as setNeonCredentials } from "../adapters/neon/api.ts";
import { deleteNeonProject } from "../adapters/neon/provisioner.ts";
import { setCredentials as setUpstashCredentials } from "../adapters/upstash/api.ts";
import { deleteUpstashRedis } from "../adapters/upstash/provisioner.ts";

export async function destroyCommand() {
  const state = loadState();

  if (Object.keys(state.resources).length === 0) {
    console.log(chalk.yellow("Nothing to destroy."));
    return;
  }

  // Detect target from state
  const isRailway = state.target === "railway" || !!state.resources["railway:project"];

  if (isRailway) {
    await destroyRailway(state);
  } else {
    await destroyCloudflare(state);
  }

  clearState();
  console.log(chalk.green("\n✓ All resources destroyed"));
}

async function destroyRailway(
  state: ReturnType<typeof loadState>,
) {
  const creds = loadVendorCredentials("railway");
  if (!creds) {
    console.log(chalk.red("Not logged in. Run: cairn login railway"));
    return;
  }
  setRailwayCredentials(creds as { apiToken: string });

  console.log(chalk.bold("\n⛰  Destroying Railway resources\n"));

  const projectId = state.resources["railway:project"]?.id;
  if (projectId) {
    const spinner = ora("Destroying Railway project...").start();
    try {
      await destroyRailwayProject(projectId);
      spinner.succeed("Destroyed Railway project (all services removed)");
    } catch (e: unknown) {
      const error = e as Error;
      spinner.fail(`Failed to destroy project: ${error.message}`);
    }
  }
}

async function destroyCloudflare(
  state: ReturnType<typeof loadState>,
) {
  const creds = loadVendorCredentials("cloudflare");
  if (!creds) {
    console.log(chalk.red("Not logged in. Run: cairn login cloudflare"));
    return;
  }
  setCredentials(
    creds as { apiToken: string; accountId: string } | {
      email: string;
      apiKey: string;
      accountId: string;
    },
  );

  console.log(chalk.bold("\n⛰  Destroying resources\n"));

  // Track D1 IDs already deleted (auth: entries share D1 with d1:auth-* entries)
  const deletedD1Ids = new Set<string>();

  for (const [key, value] of Object.entries(state.resources)) {
    // Skip metadata keys (e.g. auth-migrated:main)
    if (key.startsWith("auth-migrated:")) continue;

    const spinner = ora(`Destroying ${key}...`).start();
    try {
      if (key.startsWith("d1:") && value.id) {
        await deleteD1Database(value.id);
        deletedD1Ids.add(value.id);
      } else if (key.startsWith("kv:") && value.id) {
        await deleteKVNamespace(value.id);
      } else if (key.startsWith("r2:") && value.name) {
        await deleteR2Bucket(value.name);
      } else if (key.startsWith("worker:") && value.scriptName) {
        await deleteWorker(value.scriptName);
      } else if (key.startsWith("auth:") && value.scriptName) {
        await deleteWorker(value.scriptName);
        if (value.dbId && !deletedD1Ids.has(value.dbId)) {
          await deleteD1Database(value.dbId);
          deletedD1Ids.add(value.dbId);
        }
      } else if (key.startsWith("neon:") && value.projectId) {
        const neonCreds = loadVendorCredentials("neon");
        if (neonCreds) {
          setNeonCredentials(neonCreds as { apiKey: string });
          await deleteNeonProject(value.projectId);
        }
      } else if (key.startsWith("upstash:") && value.databaseId) {
        const upstashCreds = loadVendorCredentials("upstash");
        if (upstashCreds) {
          setUpstashCredentials(upstashCreds as { email: string; apiKey: string });
          await deleteUpstashRedis(value.databaseId);
        }
      }
      spinner.succeed(`Destroyed ${key}`);
    } catch (e: unknown) {
      const error = e as Error;
      spinner.fail(`Failed to destroy ${key}: ${error.message}`);
    }
  }
}
