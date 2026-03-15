import type { AppTemplate } from "../registry.ts";

export const uptimeKuma: AppTemplate = {
  id: "uptime-kuma",
  name: "Uptime Kuma",
  description: "Self-hosted monitoring tool — uptime checks, status pages, notifications",
  category: "monitoring",
  image: "louislam/uptime-kuma:latest",
  version: "1.0.0",
  website: "https://uptime.kuma.pet",
  license: "MIT",
  requires: {},
  envVars: {},
  port: 3001,
  healthCheck: "/api/status-page/heartbeat",
  toHcl(projectName: string): string {
    return `# ${projectName} — Uptime Kuma Monitoring
# Deployed with Cairn

project "${projectName}" {
  runtime = "bun"
}

service "uptime-kuma" {
  image   = "louislam/uptime-kuma:latest"
  expose  = true
  port    = 3001
}

storage "data" {}
`;
  },
};
