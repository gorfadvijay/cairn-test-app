import chalk from "chalk";
import { loadState } from "../state.ts";
import { parseCairnHcl } from "../parser/hcl.ts";
import { loadVendorCredentials } from "../secrets/local.ts";
import { setCredentials as setRailwayCredentials } from "../adapters/railway/api.ts";
import { getLatestDeployment } from "../adapters/railway/logs.ts";

export async function statusCommand() {
  try {
    const config = parseCairnHcl("cairn.hcl");
    const state = loadState();

    console.log(chalk.bold(`\n⛰  ${config.project.name}\n`));
    console.log(`Runtime: ${config.project.runtime}`);
    console.log(
      `Services: ${config.services.map((s) => s.name).join(", ")}`,
    );

    const resources = [
      ...config.postgres.map((p) => `pg:${p.name}`),
      ...config.redis.map((r) => `redis:${r.name}`),
      ...config.storage.map((s) => `s3:${s.name}`),
      ...config.auth.map((a) => `auth:${a.name}`),
    ];
    console.log(`Resources: ${resources.join(", ")}`);

    if (Object.keys(state.resources).length > 0) {
      const isRailway =
        state.target === "railway" || !!state.resources["railway:project"];

      console.log(
        chalk.bold(`\nTarget: ${isRailway ? "Railway" : "Cloudflare"}`),
      );
      console.log(chalk.bold("\nDeployed resources:"));

      for (const [key, value] of Object.entries(state.resources)) {
        console.log(
          `  ${key}: ${value.url || value.id || value.name || "provisioned"}`,
        );
      }

      // Railway-specific: fetch live deployment status
      if (isRailway) {
        await showRailwayStatus(state);
      }

      if (state.lastDeployedAt) {
        console.log(chalk.dim(`\nLast deployed: ${state.lastDeployedAt}`));
      }
    } else {
      console.log(chalk.dim("\nNot deployed yet. Run: cairn deploy"));
    }
  } catch {
    console.log(chalk.red("No cairn.hcl found. Run: cairn init"));
  }
}

async function showRailwayStatus(state: ReturnType<typeof loadState>) {
  const creds = loadVendorCredentials("railway");
  if (!creds) return;

  setRailwayCredentials(creds as { apiToken: string });

  const envId = state.resources["railway:project"]?.envId;
  if (!envId) return;

  // Collect all service keys
  const serviceKeys = Object.entries(state.resources).filter(
    ([k]) => k.startsWith("railway:service:") || k.startsWith("railway:auth:"),
  );

  if (serviceKeys.length === 0) return;

  console.log(chalk.bold("\nService health:"));

  for (const [key, value] of serviceKeys) {
    if (!value.serviceId) continue;
    const name = key.split(":").pop();

    try {
      const deployment = await getLatestDeployment(value.serviceId, envId);
      if (deployment) {
        const statusColor =
          deployment.status === "SUCCESS"
            ? chalk.green
            : deployment.status === "FAILED"
              ? chalk.red
              : chalk.yellow;
        console.log(`  ${name}: ${statusColor(deployment.status)}`);
      } else {
        console.log(`  ${name}: ${chalk.dim("no deployments")}`);
      }
    } catch {
      console.log(`  ${name}: ${chalk.dim("unable to fetch status")}`);
    }
  }
}
