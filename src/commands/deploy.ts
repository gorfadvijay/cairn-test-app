import chalk from "chalk";
import ora from "ora";
import { parseCairnHcl } from "../parser/hcl.ts";
import { deployToCloudflare } from "../adapters/cloudflare/deploy.ts";
import { deployToRailway } from "../adapters/railway/deploy.ts";
import { loadVendorCredentials } from "../secrets/local.ts";
import { setCredentials } from "../adapters/cloudflare/api.ts";
import { setCredentials as setRailwayCredentials } from "../adapters/railway/api.ts";

export async function deployCommand(options: { target: string }) {
  const spinner = ora("Reading cairn.hcl...").start();

  try {
    const config = parseCairnHcl("cairn.hcl");
    spinner.succeed(`Parsed: ${config.project.name}`);

    switch (options.target) {
      case "cloudflare":
      case "cf": {
        const creds = loadVendorCredentials("cloudflare");
        if (!creds) {
          spinner.fail(
            "Not logged in to Cloudflare. Run: cairn login cloudflare",
          );
          return;
        }
        setCredentials(
          creds as { apiToken: string; accountId: string } | {
            email: string;
            apiKey: string;
            accountId: string;
          },
        );

        console.log(chalk.bold(`\n⛰  Deploying to Cloudflare\n`));
        await deployToCloudflare(config);
        break;
      }

      case "railway": {
        const rwCreds = loadVendorCredentials("railway");
        if (!rwCreds) {
          spinner.fail(
            "Not logged in to Railway. Run: cairn login railway",
          );
          return;
        }
        setRailwayCredentials(rwCreds as { apiToken: string });

        console.log(chalk.bold(`\n⛰  Deploying to Railway\n`));
        await deployToRailway(config);
        break;
      }

      default:
        spinner.fail(
          `Unknown target: ${options.target}. Available: cloudflare, railway`,
        );
    }
  } catch (e: unknown) {
    const error = e as Error;
    spinner.fail(error.message);
  }
}
