/**
 * cairn install <app> — One-click OSS deploy
 * Fetches template from catalog, writes cairn.hcl, optionally deploys
 */

import chalk from "chalk";
import prompts from "prompts";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { getTemplate, listTemplates, searchTemplates } from "../catalog/registry.ts";

export async function installCommand(app?: string) {
  // If no app specified, show catalog
  if (!app) {
    showCatalog();
    return;
  }

  const template = getTemplate(app);
  if (!template) {
    // Try fuzzy search
    const matches = searchTemplates(app);
    if (matches.length > 0) {
      console.log(chalk.yellow(`\nApp "${app}" not found. Did you mean:\n`));
      for (const m of matches) {
        console.log(`  ${chalk.cyan(m.id)} — ${m.description}`);
      }
    } else {
      console.log(chalk.red(`\nApp "${app}" not found in the catalog.\n`));
      console.log("Available apps:");
      showCatalog();
    }
    return;
  }

  console.log(chalk.bold(`\n⛰  Install ${chalk.cyan(template.name)}\n`));
  console.log(`  ${template.description}`);
  console.log(`  Image: ${chalk.dim(template.image)}`);
  console.log(`  License: ${template.license}`);
  console.log(`  Website: ${chalk.dim(template.website)}`);

  // Show requirements
  const reqs: string[] = [];
  if (template.requires.postgres) reqs.push("Postgres");
  if (template.requires.redis) reqs.push("Redis");
  if (template.requires.storage) reqs.push("Storage");
  if (reqs.length > 0) {
    console.log(`  Requires: ${reqs.join(", ")}`);
  }
  console.log();

  // Prompt for project name
  const response = await prompts([
    {
      type: "text",
      name: "name",
      message: "Project name:",
      initial: `my-${template.id}`,
    },
    {
      type: "select",
      name: "mode",
      message: "Setup mode:",
      choices: [
        { title: "Create new project directory", value: "new" },
        { title: "Write cairn.hcl in current directory", value: "current" },
      ],
    },
    {
      type: "select",
      name: "target",
      message: "Deploy target:",
      choices: [
        { title: "Railway (recommended for Docker images)", value: "railway" },
        { title: "Cloudflare", value: "cloudflare" },
      ],
    },
  ]);

  if (!response.name) return;

  const projectName = response.name;
  const hcl = template.toHcl(projectName);

  if (response.mode === "new") {
    if (existsSync(projectName)) {
      console.log(chalk.red(`\nDirectory ${projectName} already exists`));
      return;
    }

    mkdirSync(projectName, { recursive: true });
    writeFileSync(`${projectName}/cairn.hcl`, hcl);
    writeFileSync(
      `${projectName}/package.json`,
      JSON.stringify(
        {
          name: projectName,
          version: "0.1.0",
          scripts: {
            dev: "cairn dev",
            deploy: `cairn deploy --target ${response.target}`,
          },
        },
        null,
        2,
      ),
    );
    writeFileSync(`${projectName}/.gitignore`, ".cairn/\nnode_modules/\n.env\n");

    // Write installed app metadata
    mkdirSync(`${projectName}/.cairn`, { recursive: true });
    writeFileSync(
      `${projectName}/.cairn/installed.json`,
      JSON.stringify(
        {
          apps: [
            {
              id: template.id,
              version: template.version,
              installedAt: new Date().toISOString(),
            },
          ],
        },
        null,
        2,
      ),
    );

    console.log(chalk.green(`\n✓ Created ${projectName}/`));
    console.log(`\nNext steps:`);
    console.log(chalk.cyan(`  cd ${projectName}`));

    // Show required env vars
    const required = Object.entries(template.envVars).filter(([, v]) => v.required);
    if (required.length > 0) {
      console.log(chalk.cyan(`  # Set required secrets:`));
      for (const [key] of required) {
        console.log(chalk.cyan(`  cairn secret set ${key} <value>`));
      }
    }

    console.log(chalk.cyan(`  cairn login ${response.target}`));
    console.log(chalk.cyan(`  cairn deploy --target ${response.target}`));
  } else {
    // Write to current directory
    writeFileSync("cairn.hcl", hcl);

    // Track installed app
    if (!existsSync(".cairn")) mkdirSync(".cairn", { recursive: true });
    const installedPath = ".cairn/installed.json";
    let installed: { apps: any[] } = { apps: [] };
    if (existsSync(installedPath)) {
      installed = JSON.parse(readFileSync(installedPath, "utf-8"));
    }

    // Add or update
    const idx = installed.apps.findIndex((a: any) => a.id === template.id);
    const entry = {
      id: template.id,
      version: template.version,
      installedAt: new Date().toISOString(),
    };
    if (idx >= 0) {
      installed.apps[idx] = entry;
    } else {
      installed.apps.push(entry);
    }
    writeFileSync(installedPath, JSON.stringify(installed, null, 2));

    console.log(chalk.green(`\n✓ Created cairn.hcl for ${template.name}`));
    console.log(`\nNext steps:`);
    console.log(chalk.cyan(`  cairn deploy --target ${response.target}`));
  }
}

export function catalogCommand() {
  showCatalog();
}

function showCatalog() {
  const templates = listTemplates();

  console.log(chalk.bold("\n⛰  Cairn App Store\n"));
  console.log(chalk.dim("  One command to deploy. cairn install <app>\n"));

  // Group by category
  const byCategory: Record<string, typeof templates> = {};
  for (const t of templates) {
    if (!byCategory[t.category]) byCategory[t.category] = [];
    byCategory[t.category]!.push(t);
  }

  for (const [category, apps] of Object.entries(byCategory)) {
    console.log(chalk.bold(`  ${category.toUpperCase()}`));
    for (const app of apps) {
      const reqs: string[] = [];
      if (app.requires.postgres) reqs.push("pg");
      if (app.requires.redis) reqs.push("redis");
      if (app.requires.storage) reqs.push("storage");
      const reqStr = reqs.length > 0 ? chalk.dim(` [${reqs.join(", ")}]`) : "";
      console.log(`    ${chalk.cyan(app.id.padEnd(16))} ${app.description}${reqStr}`);
    }
    console.log();
  }

  console.log(chalk.dim("  Usage: cairn install <app-name>"));
  console.log(chalk.dim("  Example: cairn install posthog\n"));
}
