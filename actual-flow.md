# Cairn — Actual System Flow

## High-Level Architecture

```
                          +------------------+
                          |    cairn.hcl     |
                          | (single config)  |
                          +--------+---------+
                                   |
                            HCL Parser
                          (src/parser/hcl.ts)
                                   |
                          +--------v---------+
                          |   CairnConfig    |
                          | project, services|
                          | postgres, redis  |
                          | storage, secrets |
                          | auth             |
                          +--------+---------+
                                   |
              +--------------------+--------------------+
              |                    |                    |
        cairn dev            cairn deploy         cairn branch
              |                    |                    |
    +---------v--------+    +------v------+    +-------v-------+
    | Docker Compose   |    |  Target?    |    | Branch State  |
    | Local containers |    +------+------+    | Isolation     |
    | pg, redis, app   |           |           +-------+-------+
    +------------------+     +-----+-----+             |
                             |           |       +-----+-----+
                       Cloudflare    Railway     |           |
                             |           |    Cloudflare  Railway
                             |           |    (prefixed)  (env)
                             v           v
                      +------+---+ +----+------+
                      | Workers  | | Services  |
                      | D1/KV/R2 | | Postgres  |
                      | (or Neon | | Redis     |
                      |  Upstash)| | Volumes   |
                      +----------+ +-----------+
```

---

## Phase 1: Core CLI + Cloudflare MVP

```
User
  |
  v
cairn init
  |---> Scaffold project directory
  |---> Generate cairn.hcl template
  |---> Create package.json
  |---> Create .gitignore
  v
cairn.hcl created
  |
  v
cairn dev
  |---> Parse cairn.hcl --> CairnConfig
  |---> Generate docker-compose.yml
  |       |---> Postgres containers
  |       |---> Redis containers
  |       |---> App service containers
  |---> Run `docker compose up`
  v
Local dev running (hot reload)
  |
  v
cairn deploy
  |---> Parse cairn.hcl --> CairnConfig
  |---> Load/create .cairn/state.json
  |---> Provision D1 databases
  |---> Provision KV namespaces
  |---> Provision R2 buckets
  |---> Bundle code (Bun.build())
  |---> Deploy Workers (Cloudflare API)
  |---> Save state
  v
Live on *.workers.dev
  |
  v
cairn status -----> Read .cairn/state.json --> Display resources + URLs
cairn logs <svc> -> Fetch worker logs (Cloudflare API)
cairn secret set -> Store in .cairn/secrets.json
cairn destroy ----> Delete all resources --> Clear state
```

---

## Phase 2: Auth Block (Better Auth)

```
cairn.hcl
  |
  +---> auth "main" {
  |       providers = ["google", "github"]
  |       session   = "jwt"
  |     }
  |
  v
cairn deploy
  |
  +---> Auth provisioning flow:
  |       |
  |       +---> Create D1 database for auth
  |       +---> Run schema migration (user, session, account, verification tables)
  |       +---> Generate auth Worker script (self-contained)
  |       +---> Deploy auth Worker
  |       +---> Generate .cairn/auth-client.ts (SDK for user's app)
  |       +---> Inject AUTH_URL binding into service Workers
  |       v
  |     Auth live at: https://cairn-{project}-auth-main.{subdomain}.workers.dev
  |
  +---> cairn dev (Docker)
          |
          +---> Spin up Better Auth container
          +---> Wire DATABASE_URL from Postgres container
          +---> Expose on localhost:{port}
```

---

## Phase 3: Railway Adapter (Multi-Target)

```
cairn deploy --target railway
  |
  v
+-------------------+
| Target Selection  |
+---+---------------+
    |
    +---> cloudflare (default)
    |       |---> Workers + D1 + KV + R2
    |
    +---> railway
            |
            v
      Create Railway Project (GraphQL API)
            |
            +---> Provision Postgres (Docker image: postgres:16)
            |       +---> Set env vars (POSTGRES_USER, etc.)
            |       +---> Attach volume (/var/lib/postgresql/data)
            |
            +---> Provision Redis (Docker image: redis:7-alpine)
            |       +---> Attach volume (/data)
            |
            +---> Deploy services
            |       +---> Source-based: GitHub repo --> Railway build
            |       +---> Image-based: Docker image --> Railway deploy
            |       +---> Wire DATABASE_URL, REDIS_URL, AUTH_URL
            |       +---> Generate public domain
            |
            +---> Save state (.cairn/state.json)
            v
      Live on *.up.railway.app

cairn destroy --target railway
  |---> Delete Railway project (cascades all services)
  |---> Delete external vendor resources (Neon, Upstash)
  |---> Clear state
```

---

## Phase 4: Vendor Integrations (Neon + Upstash)

```
cairn.hcl
  |
  +---> postgres "main" { vendor = "neon" }
  +---> redis "cache" { vendor = "upstash" }
  |
  v
Vendor Resolution (vendor-registry.ts)
  |
  +---> postgres vendor?
  |       |
  |       +---> "neon"       --> Neon API
  |       |       +---> cairn login neon (API key)
  |       |       +---> Create Neon project + database
  |       |       +---> Get connection URI
  |       |       +---> Inject DATABASE_URL binding
  |       |
  |       +---> "cloudflare" --> D1 (default on Cloudflare target)
  |       +---> "railway"    --> Native Postgres (default on Railway target)
  |
  +---> redis vendor?
          |
          +---> "upstash"    --> Upstash API
          |       +---> cairn login upstash (email + API key)
          |       +---> Create Upstash Redis database
          |       +---> Get Redis URL + REST credentials
          |       +---> Inject REDIS_URL binding
          |
          +---> "cloudflare" --> KV (default on Cloudflare target)
          +---> "railway"    --> Native Redis (default on Railway target)

Fallback Logic:
  no vendor specified + target=cloudflare --> use D1/KV
  no vendor specified + target=railway    --> use native Railway
  vendor specified                        --> use vendor regardless of target
```

---

## Phase 5: Console MVP (Web Dashboard)

```
Console (Bun.serve on :3100)
  |
  +---> Frontend (React SPA via HTML imports)
  |       |
  |       +---> /login ---------> Login form
  |       +---> /signup --------> Signup form
  |       +---> /projects ------> Project list
  |       +---> /projects/:id --> Project detail
  |       |       +---> Overview tab (state, deploy trigger)
  |       |       +---> Deployments tab (history)
  |       |       +---> Resources tab (DBs, caches, storage)
  |       |       +---> Secrets tab (env vars management)
  |       |       +---> Logs tab (real-time logs)
  |       |       +---> Branches tab (branch environments)
  |       |       +---> Team tab (members, roles)
  |       +---> /billing -------> Stripe integration
  |       +---> /marketplace ---> App Store UI
  |
  +---> REST API
  |       |
  |       +---> /api/auth/* ---------> Session-based auth (cookie)
  |       |       POST /signup, /login, /logout
  |       |       GET  /me
  |       |
  |       +---> /api/projects/* -----> CRUD projects
  |       |       GET  / (list), POST / (create)
  |       |       GET  /:id, DELETE /:id
  |       |       PUT  /:id/state (sync)
  |       |       POST /:id/deploy (trigger)
  |       |       GET  /:id/deployments
  |       |       GET  /:id/resources
  |       |       GET/POST /:id/secrets
  |       |       DELETE /:id/secrets/:key
  |       |       GET/POST /:id/branches
  |       |       PUT/DELETE /:id/branches/:name
  |       |       GET/POST /:id/team
  |       |       GET  /:id/metrics
  |       |       GET/POST/DELETE /:id/addons
  |       |
  |       +---> /api/marketplace/* --> App catalog
  |       +---> /api/billing/* ------> Stripe checkout + webhooks
  |
  +---> SQLite Database (console/.data/console.db)
          |
          +---> users (id, email, name, password_hash)
          +---> sessions (id, user_id, expires_at)
          +---> projects (id, user_id, name, target, state)
          +---> deployments (id, project_id, status, target, sha)
          +---> secrets (id, project_id, key, value)
          +---> team_members (id, project_id, user_id, role)
          +---> addons (id, project_id, app_id, version, status)
          +---> branches (id, project_id, name, status, state, urls, pr_number)
```

---

## Phase 6: Branch Environments

```
cairn branch create feature-x
  |
  v
Branch State Isolation
  |---> .cairn/state.json (production)
  |---> .cairn/state.branch-feature-x.json (branch)
  |
  v
Target?
  |
  +---> Cloudflare
  |       |
  |       +---> Deploy branch-prefixed Workers
  |       |       cairn-{project}-feature-x-{service}
  |       +---> Create branch-prefixed D1/KV/R2
  |       +---> Neon: zero-copy database branch (if vendor=neon)
  |       +---> Upstash: new Redis instance (if vendor=upstash)
  |       v
  |     Live at: https://cairn-{project}-feature-x-api.{sub}.workers.dev
  |
  +---> Railway
          |
          +---> Create Railway environment (environmentCreate mutation)
          +---> Deploy branch-prefixed services
          +---> Neon branch / Upstash Redis for branch
          +---> Generate domain
          v
        Live at: https://{branch-service}.up.railway.app

cairn branch list
  |---> Scan .cairn/state.branch-*.json
  |---> Display: name, status, URLs, resource count

cairn branch destroy feature-x
  |---> Load branch state
  |---> Delete all branch resources (Workers/services, DBs, caches)
  |---> Remove branch state file

GitHub Webhook (auto-branch):
  |
  PR opened --> POST /webhook
  |               |---> Verify HMAC-SHA256 signature
  |               |---> Extract branch name from PR
  |               |---> cairn branch create {branch}
  |               |---> Post PR comment with branch URLs
  |
  PR closed --> POST /webhook
                  |---> cairn branch destroy {branch}
```

---

## Phase 7: App Store (One-Click OSS Deploys)

```
cairn catalog
  |
  v
+----------------------------------------------------------+
| ANALYTICS                                                |
|   posthog    - Product analytics         [pg, redis]     |
|   plausible  - Privacy-friendly analytics [pg]           |
| AUTOMATION                                               |
|   n8n        - Workflow automation        [pg]           |
| DEVELOPER-TOOLS                                          |
|   gitea      - Self-hosted Git            [pg, storage]  |
| MONITORING                                               |
|   uptime-kuma - Uptime monitoring                        |
| CMS                                                      |
|   ghost      - Publishing platform        [pg]           |
+----------------------------------------------------------+

cairn install posthog
  |
  v
Template Registry (src/catalog/registry.ts)
  |---> Lookup AppTemplate by ID
  |---> Prompt: project name, target
  |---> Generate cairn.hcl via template.toHcl()
  |       |
  |       v
  |     project "my-posthog" { runtime = "bun" }
  |     service "posthog" {
  |       image  = "posthog/posthog:latest"
  |       port   = 8000
  |       expose = true
  |       env { ... }
  |     }
  |     postgres "main" { version = "16" }
  |     redis "cache" { version = "7" }
  |
  |---> Create package.json, .gitignore
  |---> Write .cairn/installed.json (version tracking)
  |---> Display secrets guidance
  v
Ready to: cairn deploy --target railway

cairn update
  |---> Read .cairn/installed.json
  |---> Compare versions with catalog
  |---> If newer version: update cairn.hcl + installed.json
  v
Updated (or "already up to date")

Deploy Flow for Image-Based Services:
  |
  +---> Target = Railway
  |       |---> serviceCreate with source: { image: "posthog/posthog:latest" }
  |       |---> Set PORT env var
  |       |---> Wire DATABASE_URL, REDIS_URL
  |       |---> Generate domain
  |       v
  |     Live on Railway
  |
  +---> Target = Cloudflare
          |---> Skip (Docker images can't run on Workers)
          |---> Log: "use --target railway instead"
```

---

## Complete CLI Command Map

```
cairn
  |
  +---> init                    Scaffold new project
  +---> dev                     Local Docker Compose environment
  +---> deploy [--target]       Deploy to cloud (cloudflare|railway)
  +---> destroy                 Tear down all resources
  +---> status                  Show project state + URLs
  +---> logs <service>          Tail service logs
  +---> login <vendor>          Auth: cloudflare|railway|neon|upstash
  +---> secret
  |       +---> set <k> <v>     Set a secret
  |       +---> list            List secrets
  +---> branch
  |       +---> create <name>   Create isolated branch env
  |       +---> destroy <name>  Tear down branch env
  |       +---> list            List all branches
  +---> install [app]           Install from App Store
  +---> catalog                 Browse App Store
  +---> update [app]            Check for template updates
```

---

## State Management

```
.cairn/
  |
  +---> state.json                    Production state
  |       {
  |         project: "my-app",
  |         target: "cloudflare",
  |         resources: {
  |           "d1:main": { id, name },
  |           "kv:cache": { id },
  |           "r2:files": { name },
  |           "worker:api": { scriptName, url },
  |           "auth:main": { scriptName, url, dbId },
  |           "neon:main": { projectId, connectionUri },
  |           "upstash:cache": { databaseId, redisUrl }
  |         },
  |         lastDeployedAt: "...",
  |         lastDeployedSha: "..."
  |       }
  |
  +---> state.branch-feature-x.json  Branch state (same structure)
  +---> secrets.json                  Local secrets store
  +---> auth-client.ts               Generated auth SDK
  +---> installed.json                App Store install manifest
```
