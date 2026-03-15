import type { AppTemplate } from "../registry.ts";

export const ghost: AppTemplate = {
  id: "ghost",
  name: "Ghost",
  description: "Professional publishing platform — blogs, newsletters, memberships, and paid subscriptions",
  category: "cms",
  image: "ghost:5-alpine",
  version: "1.0.0",
  website: "https://ghost.org",
  license: "MIT",
  requires: { postgres: true },
  envVars: {
    url: { description: "Public URL of your Ghost blog", required: true },
    mail__transport: { description: "Email transport (e.g. SMTP)", default: "Direct" },
  },
  port: 2368,
  healthCheck: "/ghost/api/v4/admin/site/",
  toHcl(projectName: string): string {
    return `# ${projectName} — Ghost Publishing Platform
# Deployed with Cairn

project "${projectName}" {
  runtime = "bun"
}

service "ghost" {
  image   = "ghost:5-alpine"
  expose  = true
  port    = 2368

  env {
    url              = secret.ghost_url
    database__client = "postgres"
  }
}

postgres "main" {
  version = "16"
}

storage "content" {}
`;
  },
};
