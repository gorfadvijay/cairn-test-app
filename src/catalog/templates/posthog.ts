import type { AppTemplate } from "../registry.ts";

export const posthog: AppTemplate = {
  id: "posthog",
  name: "PostHog",
  description: "Open-source product analytics, session recording, feature flags, and A/B testing",
  category: "analytics",
  image: "posthog/posthog:latest",
  version: "1.0.0",
  website: "https://posthog.com",
  license: "MIT",
  requires: { postgres: true, redis: true },
  envVars: {
    SECRET_KEY: { description: "Django secret key for encryption", required: true, default: "cairn-posthog-secret-change-me" },
    SITE_URL: { description: "Public URL of your PostHog instance", required: true },
    IS_DOCKER: { description: "Docker environment flag", default: "true" },
  },
  port: 8000,
  healthCheck: "/_health",
  toHcl(projectName: string): string {
    return `# ${projectName} — PostHog Analytics
# Deployed with Cairn

project "${projectName}" {
  runtime = "bun"
}

service "posthog" {
  image   = "posthog/posthog:latest"
  expose  = true
  port    = 8000

  env {
    SECRET_KEY = secret.posthog_secret_key
    IS_DOCKER  = "true"
  }
}

postgres "main" {
  version = "16"
}

redis "cache" {
  version = "7"
}
`;
  },
};
