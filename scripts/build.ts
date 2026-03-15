/**
 * Build script for Cairn CLI
 * Bundles src/index.ts into dist/index.js and creates dist/cli.js with shebang
 */

import { mkdirSync, writeFileSync, existsSync, chmodSync } from "fs";

console.log("Building Cairn CLI...\n");

// Clean dist
if (existsSync("dist")) {
  const { rmSync } = await import("fs");
  rmSync("dist", { recursive: true });
}
mkdirSync("dist", { recursive: true });

// Bundle with Bun
const result = await Bun.build({
  entrypoints: ["src/index.ts"],
  outdir: "dist",
  target: "bun",
  format: "esm",
  bundle: true,
  minify: false,
  external: [
    // Keep these external — they have native bindings or complex module resolution
    "prompts",
    "chokidar",
    "@trigger.dev/sdk",
  ],
});

if (!result.success) {
  console.error("Build failed:");
  for (const log of result.logs) {
    console.error(`  ${log.message}`);
  }
  process.exit(1);
}

const output = result.outputs[0];
if (!output) {
  console.error("Build produced no output");
  process.exit(1);
}

const bundledCode = await output.text();
const sizeKB = (bundledCode.length / 1024).toFixed(1);

// Write the bundled index.js
writeFileSync("dist/index.js", bundledCode);
console.log(`  ✓ dist/index.js (${sizeKB}KB)`);

// Create cli.js with shebang that delegates to index.js
const cliScript = `#!/usr/bin/env bun
import "./index.js";
`;
writeFileSync("dist/cli.js", cliScript);
chmodSync("dist/cli.js", 0o755);
console.log(`  ✓ dist/cli.js (executable)`);

console.log(`\n✓ Build complete! Run with: bun dist/cli.js`);
console.log(`  Or link globally: bun link`);
