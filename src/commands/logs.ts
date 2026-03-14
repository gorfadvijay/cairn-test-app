import chalk from "chalk";
import { loadState } from "../state.ts";
import { loadVendorCredentials } from "../secrets/local.ts";
import { setCredentials as setRailwayCredentials } from "../adapters/railway/api.ts";
import {
  getLatestDeployment,
  getDeploymentLogs,
  getEnvironmentLogs,
} from "../adapters/railway/logs.ts";

export async function logsCommand(service: string) {
  const state = loadState();
  const isRailway =
    state.target === "railway" || !!state.resources["railway:project"];

  if (isRailway) {
    await railwayLogs(service, state);
  } else {
    cloudfareLogs(service);
  }
}

function cloudfareLogs(service: string) {
  console.log(chalk.bold(`\n⛰  Logs for ${service}\n`));
  console.log(`View logs in Cloudflare dashboard:`);
  console.log(
    chalk.cyan(
      `https://dash.cloudflare.com → Workers & Pages → cairn-*-${service} → Logs`,
    ),
  );
  console.log(chalk.dim(`\nReal-time log tailing will be added in v0.2`));
}

async function railwayLogs(
  service: string,
  state: ReturnType<typeof loadState>,
) {
  const creds = loadVendorCredentials("railway");
  if (!creds) {
    console.log(chalk.red("Not logged in. Run: cairn login railway"));
    return;
  }
  setRailwayCredentials(creds as { apiToken: string });

  // Find the service in state
  const serviceResource =
    state.resources[`railway:service:${service}`] ||
    state.resources[`railway:auth:${service}`];
  const envId = state.resources["railway:project"]?.envId;

  if (!serviceResource?.serviceId || !envId) {
    console.log(chalk.red(`Service "${service}" not found in deployed state.`));
    console.log(
      chalk.dim(
        `Available: ${Object.keys(state.resources)
          .filter((k) => k.startsWith("railway:service:") || k.startsWith("railway:auth:"))
          .map((k) => k.split(":").pop())
          .join(", ")}`,
      ),
    );
    return;
  }

  console.log(chalk.bold(`\n⛰  Logs for ${service} (Railway)\n`));

  // Get latest deployment
  const deployment = await getLatestDeployment(
    serviceResource.serviceId,
    envId,
  );

  if (!deployment) {
    console.log(chalk.yellow("No deployments found for this service."));
    return;
  }

  console.log(
    chalk.dim(
      `Deployment: ${deployment.id.slice(0, 8)} | Status: ${deployment.status} | ${deployment.createdAt}\n`,
    ),
  );

  // Fetch both build and runtime logs
  try {
    const [buildLogs, runtimeLogs] = await Promise.all([
      getDeploymentLogs(deployment.id),
      getEnvironmentLogs(deployment.id),
    ]);

    if (buildLogs.length > 0) {
      console.log(chalk.bold("Build logs:"));
      for (const log of buildLogs) {
        const color = log.severity === "error" ? chalk.red : chalk.dim;
        console.log(color(`  ${log.message}`));
      }
      console.log();
    }

    if (runtimeLogs.length > 0) {
      console.log(chalk.bold("Runtime logs:"));
      for (const log of runtimeLogs) {
        const ts = new Date(log.timestamp).toLocaleTimeString();
        const color = log.severity === "error" ? chalk.red : chalk.white;
        console.log(color(`  [${ts}] ${log.message}`));
      }
    }

    if (buildLogs.length === 0 && runtimeLogs.length === 0) {
      console.log(chalk.yellow("No logs available yet."));
    }
  } catch (e: unknown) {
    const error = e as Error;
    console.log(chalk.red(`Failed to fetch logs: ${error.message}`));
  }
}
