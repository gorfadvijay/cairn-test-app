/**
 * Branch environment commands
 * cairn branch create <name> — create isolated branch environment
 * cairn branch destroy <name> — tear down branch environment
 * cairn branch list — list all branch environments
 */

import chalk from "chalk";
import ora from "ora";
import { parseCairnHcl } from "../parser/hcl.ts";
import { loadState, clearState, listBranches } from "../state.ts";
import { loadVendorCredentials } from "../secrets/local.ts";
import { setCredentials as setCfCredentials } from "../adapters/cloudflare/api.ts";
import { setCredentials as setRailwayCredentials } from "../adapters/railway/api.ts";

export async function branchCreateCommand(name: string, options: { target?: string }) {
  const spinner = ora("Reading cairn.hcl...").start();

  try {
    const config = parseCairnHcl("cairn.hcl");
    spinner.succeed(`Parsed: ${config.project.name}`);

    // Check if branch already exists
    const existing = listBranches();
    if (existing.includes(name)) {
      console.log(chalk.yellow(`Branch "${name}" already exists. Updating...`));
    }

    // Determine target from production state or option
    const prodState = loadState();
    const target = options.target || prodState.target || "cloudflare";

    console.log(chalk.bold(`\n⛰  Creating branch environment: ${chalk.cyan(name)}\n`));
    console.log(`  Target: ${target}`);
    console.log(`  Base: production\n`);

    switch (target) {
      case "cloudflare":
      case "cf": {
        const creds = loadVendorCredentials("cloudflare");
        if (!creds) {
          console.log(chalk.red("Not logged in to Cloudflare. Run: cairn login cloudflare"));
          return;
        }
        setCfCredentials(
          creds as { apiToken: string; accountId: string } | {
            email: string; apiKey: string; accountId: string;
          },
        );

        const { deployBranchToCloudflare } = await import("../adapters/cloudflare/branch.ts");
        const result = await deployBranchToCloudflare(config, name);
        printBranchUrls(name, result.urls);
        break;
      }

      case "railway": {
        const rwCreds = loadVendorCredentials("railway");
        if (!rwCreds) {
          console.log(chalk.red("Not logged in to Railway. Run: cairn login railway"));
          return;
        }
        setRailwayCredentials(rwCreds as { apiToken: string });

        const { deployBranchToRailway } = await import("../adapters/railway/branch.ts");
        const result = await deployBranchToRailway(config, name);
        printBranchUrls(name, result.urls);
        break;
      }

      default:
        console.log(chalk.red(`Unknown target: ${target}. Available: cloudflare, railway`));
    }
  } catch (e: unknown) {
    spinner.fail((e as Error).message);
  }
}

export async function branchDestroyCommand(name: string) {
  const spinner = ora(`Destroying branch: ${name}...`).start();

  try {
    const branchState = loadState(name);
    if (Object.keys(branchState.resources).length === 0) {
      spinner.fail(`No branch environment found: ${name}`);
      return;
    }

    const target = branchState.target || "cloudflare";
    spinner.succeed(`Found branch: ${name} (${target})`);

    console.log(chalk.bold(`\n⛰  Destroying branch environment: ${chalk.cyan(name)}\n`));

    switch (target) {
      case "cloudflare":
      case "cf": {
        const creds = loadVendorCredentials("cloudflare");
        if (!creds) {
          console.log(chalk.red("Not logged in to Cloudflare. Run: cairn login cloudflare"));
          return;
        }
        setCfCredentials(
          creds as { apiToken: string; accountId: string } | {
            email: string; apiKey: string; accountId: string;
          },
        );

        const { destroyBranchOnCloudflare } = await import("../adapters/cloudflare/branch.ts");
        await destroyBranchOnCloudflare(branchState);
        break;
      }

      case "railway": {
        const rwCreds = loadVendorCredentials("railway");
        if (!rwCreds) {
          console.log(chalk.red("Not logged in to Railway. Run: cairn login railway"));
          return;
        }
        setRailwayCredentials(rwCreds as { apiToken: string });

        const { destroyBranchOnRailway } = await import("../adapters/railway/branch.ts");
        await destroyBranchOnRailway(branchState);
        break;
      }
    }

    clearState(name);
    console.log(chalk.green(`\n✓ Branch "${name}" destroyed`));
  } catch (e: unknown) {
    spinner.fail((e as Error).message);
  }
}

export function branchListCommand() {
  const branches = listBranches();

  if (branches.length === 0) {
    console.log(chalk.yellow("No branch environments found."));
    console.log(chalk.dim("Create one with: cairn branch create <name>"));
    return;
  }

  console.log(chalk.bold("\n⛰  Branch Environments\n"));

  for (const branch of branches) {
    const state = loadState(branch);
    const resourceCount = Object.keys(state.resources).length;
    const target = state.target || "unknown";

    // Collect URLs from worker/service resources
    const urls: string[] = [];
    for (const [key, value] of Object.entries(state.resources)) {
      if (value.url) urls.push(value.url);
    }

    console.log(`  ${chalk.cyan(branch)}`);
    console.log(`    Target: ${target} | Resources: ${resourceCount}`);
    if (state.lastDeployedAt) {
      console.log(`    Last deployed: ${new Date(state.lastDeployedAt).toLocaleString()}`);
    }
    if (urls.length > 0) {
      for (const url of urls) {
        console.log(`    ${chalk.dim("→")} ${url}`);
      }
    }
    console.log();
  }
}

function printBranchUrls(branch: string, urls: Record<string, string>) {
  console.log(chalk.green(`\n✓ Branch "${branch}" deployed!`));
  console.log("\nBranch URLs:");
  for (const [name, url] of Object.entries(urls)) {
    console.log(`  ${name} → ${url}`);
  }
}
