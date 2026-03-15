/**
 * cairn update [app] — Check for and apply template updates
 */

import chalk from "chalk";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { getTemplate } from "../catalog/registry.ts";

interface InstalledApp {
  id: string;
  version: string;
  installedAt: string;
}

interface InstalledManifest {
  apps: InstalledApp[];
}

export function updateCommand(app?: string) {
  const installedPath = ".cairn/installed.json";

  if (!existsSync(installedPath)) {
    console.log(chalk.yellow("No installed apps found. Run: cairn install <app>"));
    return;
  }

  const manifest: InstalledManifest = JSON.parse(readFileSync(installedPath, "utf-8"));

  if (manifest.apps.length === 0) {
    console.log(chalk.yellow("No installed apps found."));
    return;
  }

  console.log(chalk.bold("\n⛰  Checking for updates\n"));

  const appsToCheck = app
    ? manifest.apps.filter((a) => a.id === app)
    : manifest.apps;

  if (app && appsToCheck.length === 0) {
    console.log(chalk.red(`App "${app}" is not installed.`));
    return;
  }

  let hasUpdates = false;

  for (const installed of appsToCheck) {
    const template = getTemplate(installed.id);
    if (!template) {
      console.log(chalk.dim(`  ${installed.id} — template no longer in catalog`));
      continue;
    }

    if (template.version !== installed.version) {
      console.log(
        `  ${chalk.cyan(installed.id)} ${chalk.red(installed.version)} → ${chalk.green(template.version)} ${chalk.yellow("(update available)")}`,
      );
      hasUpdates = true;

      // Update the version in manifest
      installed.version = template.version;
      installed.installedAt = new Date().toISOString();

      // Regenerate cairn.hcl with latest template
      const projectName = installed.id;
      try {
        const hcl = template.toHcl(projectName);
        writeFileSync("cairn.hcl", hcl);
        console.log(chalk.green(`    ✓ Updated cairn.hcl to v${template.version}`));
      } catch {
        console.log(chalk.yellow(`    ⚠ Could not update cairn.hcl (update manually)`));
      }
    } else {
      console.log(`  ${chalk.cyan(installed.id)} ${chalk.green(installed.version)} — up to date`);
    }
  }

  if (hasUpdates) {
    writeFileSync(installedPath, JSON.stringify(manifest, null, 2));
    console.log(chalk.green("\n✓ Updates applied. Run `cairn deploy` to deploy changes."));
  } else {
    console.log(chalk.green("\n✓ Everything is up to date."));
  }
}
