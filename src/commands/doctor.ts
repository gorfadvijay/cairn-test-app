/**
 * cairn doctor — verify all vendor connections at once
 * Scans saved credentials and calls verify() on each vendor adapter
 */

import chalk from "chalk";
import { listVendors } from "../adapters/vendor-sdk.ts";
import { loadVendorCredentials } from "../secrets/local.ts";

export async function doctorCommand() {
  console.log(chalk.bold("\n⛰  Cairn Doctor — checking all connections\n"));

  const vendors = listVendors();
  if (vendors.length === 0) {
    console.log(chalk.yellow("  No vendors registered."));
    return;
  }

  // Group by category
  const categories: Record<string, typeof vendors> = {};
  for (const v of vendors) {
    if (!categories[v.category]) categories[v.category] = [];
    categories[v.category]!.push(v);
  }

  const categoryLabels: Record<string, string> = {
    deploy: "DEPLOY TARGETS",
    database: "DATABASES",
    cache: "CACHE",
    jobs: "BACKGROUND JOBS",
    email: "EMAIL",
    analytics: "ANALYTICS",
    auth: "AUTH",
    monitoring: "MONITORING",
    logging: "LOGGING",
  };

  let configured = 0;
  let total = 0;

  for (const [category, vendorList] of Object.entries(categories)) {
    const label = categoryLabels[category] || category.toUpperCase();
    console.log(chalk.dim(`  ${label}`));

    for (const vendor of vendorList) {
      total++;
      const creds = loadVendorCredentials(vendor.id);

      if (!creds) {
        console.log(
          chalk.gray(`    ${vendor.name.padEnd(16)} `) +
          chalk.red("✗ not configured") +
          chalk.dim(` — run: cairn login ${vendor.id}`),
        );
        continue;
      }

      try {
        const result = await vendor.verify(creds);
        if (result.ok) {
          configured++;
          console.log(
            chalk.gray(`    ${vendor.name.padEnd(16)} `) +
            chalk.green("✓ connected") +
            (result.detail ? chalk.dim(` (${result.detail})`) : ""),
          );
        } else {
          console.log(
            chalk.gray(`    ${vendor.name.padEnd(16)} `) +
            chalk.red("✗ credentials invalid") +
            chalk.dim(` — run: cairn login ${vendor.id}`),
          );
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "unknown error";
        console.log(
          chalk.gray(`    ${vendor.name.padEnd(16)} `) +
          chalk.red(`✗ error: ${msg}`),
        );
      }
    }
    console.log();
  }

  console.log(
    chalk.bold(`  Summary: ${configured}/${total} vendors configured\n`),
  );
}
