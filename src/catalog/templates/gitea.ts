import type { AppTemplate } from "../registry.ts";

export const gitea: AppTemplate = {
  id: "gitea",
  name: "Gitea",
  description: "Lightweight self-hosted Git service — repositories, issues, pull requests, CI/CD",
  category: "developer-tools",
  image: "gitea/gitea:latest",
  version: "1.0.0",
  website: "https://gitea.io",
  license: "MIT",
  requires: { postgres: true, storage: true },
  envVars: {
    GITEA__database__DB_TYPE: { description: "Database type", default: "postgres" },
    GITEA__server__ROOT_URL: { description: "Public URL of Gitea", required: true },
    GITEA__server__SSH_DOMAIN: { description: "SSH domain", required: true },
  },
  port: 3000,
  healthCheck: "/api/healthz",
  toHcl(projectName: string): string {
    return `# ${projectName} — Gitea Git Server
# Deployed with Cairn

project "${projectName}" {
  runtime = "bun"
}

service "gitea" {
  image   = "gitea/gitea:latest"
  expose  = true
  port    = 3000

  env {
    GITEA__database__DB_TYPE = "postgres"
    GITEA__server__ROOT_URL  = secret.gitea_root_url
  }
}

postgres "main" {
  version = "16"
}

storage "repos" {}
`;
  },
};
