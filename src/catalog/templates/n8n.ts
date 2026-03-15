import type { AppTemplate } from "../registry.ts";

export const n8n: AppTemplate = {
  id: "n8n",
  name: "n8n",
  description: "Workflow automation tool — connect APIs, automate tasks, build integrations",
  category: "automation",
  image: "n8nio/n8n:latest",
  version: "1.0.0",
  website: "https://n8n.io",
  license: "Sustainable Use License",
  requires: { postgres: true },
  envVars: {
    N8N_HOST: { description: "Hostname for n8n", default: "0.0.0.0" },
    N8N_PORT: { description: "Port for n8n", default: "5678" },
    N8N_ENCRYPTION_KEY: { description: "Encryption key for credentials", required: true },
    WEBHOOK_URL: { description: "Public URL for webhooks", required: true },
  },
  port: 5678,
  healthCheck: "/healthz",
  toHcl(projectName: string): string {
    return `# ${projectName} — n8n Workflow Automation
# Deployed with Cairn

project "${projectName}" {
  runtime = "bun"
}

service "n8n" {
  image   = "n8nio/n8n:latest"
  expose  = true
  port    = 5678

  env {
    N8N_HOST           = "0.0.0.0"
    N8N_PORT           = "5678"
    DB_TYPE            = "postgresdb"
    N8N_ENCRYPTION_KEY = secret.n8n_encryption_key
    WEBHOOK_URL        = secret.n8n_webhook_url
  }
}

postgres "main" {
  version = "16"
}
`;
  },
};
