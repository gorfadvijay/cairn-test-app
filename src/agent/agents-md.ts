import type { CairnConfig } from "../parser/types.ts";
import { writeFileSync } from "fs";

export function generateAgentsMd(config: CairnConfig): string {
  const dbLines = config.postgres
    .map(
      (p) =>
        `- **Database (${p.name})**: Postgres ${p.version} — access via \`DATABASE_URL\` env var`,
    )
    .join("\n");

  const cacheLines = config.redis
    .map(
      (r) =>
        `- **Cache (${r.name})**: Redis ${r.version} — access via \`REDIS_URL\` env var`,
    )
    .join("\n");

  const storageLines = config.storage
    .map(
      (s) =>
        `- **Storage (${s.name})**: S3-compatible — access via \`S3_ENDPOINT\`, \`S3_ACCESS_KEY\`, \`S3_SECRET_KEY\` env vars`,
    )
    .join("\n");

  const content = `# AGENTS.md — Cairn Project Context

## Project: ${config.project.name}

This project uses Cairn for infrastructure management.
All infrastructure is defined in \`cairn.hcl\`.

## Available Resources

${dbLines}
${cacheLines}
${storageLines}

## How to Add Resources

Edit \`cairn.hcl\` and add a new block:

\`\`\`hcl
# Add a new database
postgres "analytics" {
  version = "16"
}

# Add a new cache
redis "sessions" {
  version = "7"
}

# Add a new storage bucket
storage "media" {}
\`\`\`

Then run \`cairn deploy\` to provision the new resources.

## How to Deploy

\`\`\`bash
cairn dev      # local development
cairn deploy   # deploy to Cloudflare
cairn status   # check status
cairn destroy  # tear down
\`\`\`

## Environment Variables

All resource connection strings are auto-injected. Never hardcode credentials.
Use \`cairn secret set <key> <value>\` for API keys and other secrets.
`;

  writeFileSync("AGENTS.md", content);
  return content;
}
