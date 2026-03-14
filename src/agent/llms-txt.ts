import type { CairnConfig } from "../parser/types.ts";
import { writeFileSync } from "fs";

export function generateLlmsTxt(config: CairnConfig): string {
  const lines: string[] = [
    `# Cairn Project: ${config.project.name}`,
    ``,
    `## Infrastructure`,
    `- Runtime: ${config.project.runtime}`,
  ];

  if (config.services.length) {
    lines.push(
      `- Services: ${config.services.map((s) => `${s.name}${s.expose ? " (public)" : ""}`).join(", ")}`,
    );
  }
  if (config.postgres.length) {
    lines.push(
      `- Database: ${config.postgres.map((p) => `${p.name} (Postgres ${p.version})`).join(", ")}`,
    );
  }
  if (config.redis.length) {
    lines.push(
      `- Cache: ${config.redis.map((r) => `${r.name} (Redis ${r.version})`).join(", ")}`,
    );
  }
  if (config.storage.length) {
    lines.push(
      `- Storage: ${config.storage.map((s) => s.name).join(", ")}`,
    );
  }

  lines.push(
    ``,
    `## Commands`,
    "- `cairn dev` — start local development",
    "- `cairn deploy` — deploy to Cloudflare",
    "- `cairn status` — show project status",
    "- `cairn destroy` — tear down resources",
    "- `cairn secret set <key> <value>` — set a secret",
    ``,
    `## Spec File`,
    "The infrastructure is defined in `cairn.hcl` at the project root.",
    `Edit this file to add/remove services and resources.`,
  );

  const content = lines.join("\n");
  writeFileSync("llms.txt", content);
  return content;
}
