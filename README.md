# Cairn

**The infrastructure app store. One file, every service, any cloud, one command.**

Cairn lets you define your entire stack in a single `cairn.hcl` file and deploy to any cloud with one command. Database, cache, auth, email, payments, monitoring — all wired together automatically.

## Quick Start

```bash
# Install
bun install -g cairn-cli

# Create a project
cairn init

# Run locally (Postgres + Redis in Docker, app hot-reloading)
cairn dev

# Deploy to production
cairn login cloudflare
cairn deploy
```

## Example `cairn.hcl`

```hcl
project "my-saas" {
  runtime = "bun"
}

service "api" {
  command = "bun run src/index.ts"
  expose  = true
  dev { command = "bun run --watch src/index.ts" }
}

postgres "main" { version = "16" }
redis "cache" { version = "7" }
storage "uploads" {}

auth "main" {
  providers = ["google", "github"]
}

jobs "background" { vendor = "trigger" }
email "transactional" { vendor = "resend" }
monitoring "errors" { vendor = "sentry" }
logging "logs" { vendor = "axiom" }
```

One file. `cairn dev` runs everything locally. `cairn deploy` ships it.

## Features

- **15 vendors** — Cloudflare, Railway, Neon, Upstash, Trigger.dev, Resend, Clerk, Inngest, Sentry, Axiom, Tinybird, Turso, Vercel, Supabase, PlanetScale
- **2 deploy targets** — Cloudflare (D1, KV, R2, Workers) and Railway (Postgres, Redis, containers)
- **Built-in auth** — Better Auth with social login, MFA, RBAC
- **Local dev** — Docker Compose auto-generated, hot reload, env vars injected
- **Branch environments** — Per-PR isolated environments with database branching
- **App Store** — One-click deploy for PostHog, Plausible, n8n, Gitea, Ghost, Uptime Kuma
- **Agent-native** — AI agents can read and write `cairn.hcl`

## Commands

```
cairn init          Create a new project
cairn dev           Start local dev environment
cairn deploy        Deploy to production
cairn destroy       Tear down all resources
cairn status        Show project status
cairn logs <svc>    Tail service logs
cairn login <vendor> Connect to a vendor
cairn secret set    Manage secrets
cairn doctor        Check all vendor connections
cairn branch create Create branch environment
cairn install       Deploy an app from the store
cairn catalog       Browse available apps
```

## Deploy Targets

```bash
cairn deploy                    # Cloudflare (default)
cairn deploy --target railway   # Railway
```

## Vendor Login

```bash
cairn login cloudflare   # Workers, D1, KV, R2
cairn login railway      # Containers, Postgres, Redis
cairn login neon         # Serverless Postgres with branching
cairn login upstash      # Serverless Redis
cairn login trigger      # Background jobs
cairn login resend       # Transactional email
cairn login sentry       # Error monitoring
cairn login axiom        # Log management
cairn doctor             # Check all connections
```

## Requirements

- [Bun](https://bun.sh) >= 1.0
- [Docker](https://docker.com) (for `cairn dev`)

## License

MIT
