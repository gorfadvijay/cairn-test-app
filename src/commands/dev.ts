import chalk from "chalk";
import { parseCairnHcl } from "../parser/hcl.ts";
import {
  startDevEnvironment,
  stopDevEnvironment,
} from "../adapters/docker/runner.ts";
import { generateDevEnvVars } from "../adapters/docker/compose.ts";

export async function devCommand() {
  try {
    const config = parseCairnHcl("cairn.hcl");

    console.log(chalk.bold(`\n⛰  Cairn Dev Environment\n`));
    console.log(chalk.dim(`Project: ${config.project.name}`));
    console.log(chalk.dim(`Runtime: ${config.project.runtime}\n`));

    // Show what will be started
    if (config.postgres.length)
      console.log(
        `  📦 Postgres: ${config.postgres.map((p) => p.name).join(", ")}`,
      );
    if (config.redis.length)
      console.log(
        `  📦 Redis: ${config.redis.map((r) => r.name).join(", ")}`,
      );
    if (config.storage.length)
      console.log(
        `  📦 Storage: ${config.storage.map((s) => s.name).join(", ")}`,
      );
    if (config.auth.length)
      console.log(
        `  🔐 Auth: ${config.auth.map((a) => `${a.name} (${a.providers.join(", ")})`).join(", ")}`,
      );
    console.log();

    // Start everything
    const processes = await startDevEnvironment(config);

    // Show env vars
    const envVars = generateDevEnvVars(config);
    console.log(chalk.dim("\nAuto-injected environment variables:"));
    for (const [key, value] of Object.entries(envVars)) {
      console.log(chalk.dim(`  ${key}=${value}`));
    }

    console.log(chalk.green("\n✓ Dev environment running"));
    console.log(chalk.dim("Press Ctrl+C to stop\n"));

    // Handle shutdown
    process.on("SIGINT", () => {
      console.log(chalk.yellow("\n\nStopping..."));
      processes.forEach((p) => p.kill());
      stopDevEnvironment();
      console.log(chalk.green("✓ Stopped"));
      process.exit(0);
    });
  } catch (e: unknown) {
    const error = e as NodeJS.ErrnoException;
    if (error.code === "ENOENT") {
      console.log(chalk.red("No cairn.hcl found. Run: cairn init"));
    } else {
      console.log(chalk.red(`Error: ${error.message}`));
    }
  }
}
