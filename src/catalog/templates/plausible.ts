import type { AppTemplate } from "../registry.ts";

export const plausible: AppTemplate = {
  id: "plausible",
  name: "Plausible Analytics",
  description: "Lightweight, privacy-friendly web analytics — no cookies, GDPR compliant",
  category: "analytics",
  image: "ghcr.io/plausible/community-edition:latest",
  version: "1.0.0",
  website: "https://plausible.io",
  license: "AGPL-3.0",
  requires: { postgres: true },
  envVars: {
    BASE_URL: { description: "Public URL of your Plausible instance", required: true },
    SECRET_KEY_BASE: { description: "Secret key for session encryption (min 64 chars)", required: true },
    TOTP_VAULT_KEY: { description: "Encryption key for TOTP secrets", required: true },
  },
  port: 8000,
  healthCheck: "/api/health",
  toHcl(projectName: string): string {
    return `# ${projectName} — Plausible Analytics
# Deployed with Cairn

project "${projectName}" {
  runtime = "bun"
}

service "plausible" {
  image   = "ghcr.io/plausible/community-edition:latest"
  expose  = true
  port    = 8000

  env {
    BASE_URL        = secret.plausible_base_url
    SECRET_KEY_BASE = secret.plausible_secret_key
    TOTP_VAULT_KEY  = secret.plausible_totp_key
  }
}

postgres "main" {
  version = "16"
}
`;
  },
};
