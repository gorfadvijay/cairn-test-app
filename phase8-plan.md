# Phase 8: Marketplace Expansion — Detailed Plan

## Goal
Expand from 4 vendor integrations to 10-15. Add `cairn doctor` for verification. Build the vendor SDK pattern so adding new vendors is fast and consistent.

---

## Current State (What We Have)

```
Vendor        Category        Auth Method         Status
──────────────────────────────────────────────────────────
Cloudflare    Deploy target   API Token / Key     ✅ DONE (Phase 1)
Railway       Deploy target   API Token           ✅ DONE (Phase 3)
Neon          Database        API Key (Bearer)    ✅ DONE (Phase 4)
Upstash       Redis/Cache     Email + API Key     ✅ DONE (Phase 4)
──────────────────────────────────────────────────────────
Total: 4 integrations
```

### Existing Pattern (per vendor)
Each vendor has 3 files:
```
src/adapters/{vendor}/
  ├── api.ts          # API client (auth, REST/GraphQL helper)
  ├── provisioner.ts  # Create/delete resources
  └── api.test.ts     # Unit tests
```
Plus registration in:
- `src/adapters/vendor-registry.ts` — resolve vendor from cairn.hcl
- `src/commands/login.ts` — `cairn login {vendor}` command
- `src/secrets/local.ts` — credential storage (~/.cairn/credentials/{vendor}.json)

---

## New Vendors to Add

### Tier 1 — High Priority (core infrastructure)

| # | Vendor | Category | cairn.hcl Block | API | Auth |
|---|--------|----------|----------------|-----|------|
| 1 | **Vercel** | Deploy target | `deploy target = "vercel"` | REST API | Bearer token |
| 2 | **Supabase** | Database + Auth | `postgres "main" { vendor = "supabase" }` | REST API | Service role key |
| 3 | **PlanetScale** | Database | `postgres "main" { vendor = "planetscale" }` | REST API | Service token |
| 4 | **Turso** | Database (SQLite) | `sqlite "main" { vendor = "turso" }` | REST API | API token |

### Tier 2 — High Value (differentiation)

| # | Vendor | Category | cairn.hcl Block | API | Auth |
|---|--------|----------|----------------|-----|------|
| 5 | **Trigger.dev** | Background Jobs | `jobs "queue" { vendor = "trigger" }` | REST API | API key |
| 6 | **TinyBird** | Analytics/Data | `analytics "events" { vendor = "tinybird" }` | REST API | Bearer token |
| 7 | **Resend** | Email | `email "transactional" { vendor = "resend" }` | REST API | API key |

### Tier 3 — Ecosystem Expansion

| # | Vendor | Category | cairn.hcl Block | API | Auth |
|---|--------|----------|----------------|-----|------|
| 8 | **Clerk** | Auth | `auth "main" { vendor = "clerk" }` | REST API | Secret key |
| 9 | **Inngest** | Background Jobs | `jobs "queue" { vendor = "inngest" }` | REST API | Event key + signing key |
| 10 | **Sentry** | Monitoring | `monitoring "errors" { vendor = "sentry" }` | REST API | Auth token |
| 11 | **Axiom** | Logging | `logging "logs" { vendor = "axiom" }` | REST API | API token |

---

## New cairn.hcl Block Types

Currently supported: `project`, `service`, `postgres`, `redis`, `storage`, `secret`, `auth`

### Adding:
```hcl
# Background jobs
jobs "background" {
  vendor = "trigger"    # or "inngest"
}

# Analytics / data pipeline
analytics "events" {
  vendor = "tinybird"
}

# Email
email "transactional" {
  vendor = "resend"
}

# SQLite (edge database)
sqlite "main" {
  vendor = "turso"
}

# Monitoring
monitoring "errors" {
  vendor = "sentry"
}

# Logging
logging "logs" {
  vendor = "axiom"
}
```

---

## `cairn doctor` Command

Verifies all configured integrations at once:

```
$ cairn doctor

⛰  Cairn Doctor — checking all connections

  DEPLOY TARGETS
    Cloudflare    ✓ authenticated (account: vijay@cairn.dev)
    Railway       ✓ authenticated (team: cairn)
    Vercel        ✗ not configured — run: cairn login vercel

  DATABASES
    Neon          ✓ connected (3 projects)
    Supabase      ✗ not configured — run: cairn login supabase
    PlanetScale   ✗ not configured — run: cairn login planetscale
    Turso         ✗ not configured — run: cairn login turso

  CACHE
    Upstash       ✓ connected (2 databases)

  SERVICES
    Trigger.dev   ✗ not configured — run: cairn login trigger
    TinyBird      ✗ not configured — run: cairn login tinybird
    Resend        ✓ connected (domain: cairn.dev)

  AUTH
    Clerk         ✗ not configured — run: cairn login clerk

  OBSERVABILITY
    Sentry        ✗ not configured — run: cairn login sentry
    Axiom         ✗ not configured — run: cairn login axiom

  Summary: 5/13 vendors configured
```

### How doctor works:
1. Scan `~/.cairn/credentials/` for saved credential files
2. For each found: call `verifyToken()` on that vendor's API client
3. For each not found: show "not configured" with login command
4. Show summary

---

## Vendor SDK Interface

Standardize the pattern so every vendor follows the same structure:

```typescript
// src/adapters/vendor-sdk.ts — base interface

export interface VendorAdapter {
  /** Vendor identifier (used in cairn.hcl, CLI, credentials) */
  id: string;

  /** Human-readable name */
  name: string;

  /** Category: database, cache, jobs, email, analytics, auth, monitoring, logging, deploy */
  category: string;

  /** URL where user gets their API key */
  credentialsUrl: string;

  /** What fields to prompt during `cairn login` */
  loginFields: { name: string; type: "text" | "password"; message: string }[];

  /** Verify credentials work — called during login and doctor */
  verify(creds: Record<string, string>): Promise<{ ok: boolean; detail?: string }>;

  /** Provision a resource — called during deploy */
  provision(name: string, config: Record<string, unknown>): Promise<Record<string, string>>;

  /** Destroy a resource — called during destroy */
  destroy(resourceId: string): Promise<void>;

  /** Get connection details (URL, keys) for env var injection */
  getConnectionEnv(resource: Record<string, string>): Record<string, string>;
}
```

### Example: Adding Resend takes ~30 minutes with this pattern:

```typescript
// src/adapters/resend/adapter.ts
import type { VendorAdapter } from "../vendor-sdk.ts";

export const resendAdapter: VendorAdapter = {
  id: "resend",
  name: "Resend",
  category: "email",
  credentialsUrl: "https://resend.com/api-keys",
  loginFields: [
    { name: "apiKey", type: "password", message: "API Key:" },
  ],

  async verify(creds) {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${creds.apiKey}` },
    });
    if (!res.ok) return { ok: false };
    const data = await res.json();
    return { ok: true, detail: `${data.data?.length || 0} domains` };
  },

  async provision(name) {
    // Resend doesn't provision per-project — just needs API key wired
    return { configured: "true" };
  },

  async destroy() {
    // No-op for Resend
  },

  getConnectionEnv(resource) {
    return { RESEND_API_KEY: "from-credentials" };
  },
};
```

---

## Implementation Order

### Step 1: Foundation (before adding vendors)
| Task | Files | Effort |
|------|-------|--------|
| Create `VendorAdapter` interface | `src/adapters/vendor-sdk.ts` | 2h |
| Refactor Neon + Upstash to use interface | Existing files | 3h |
| Add new HCL block types to parser | `src/parser/hcl.ts`, `types.ts` | 2h |
| Build `cairn doctor` command | `src/commands/doctor.ts` | 3h |
| Auto-register vendors from adapter files | `src/adapters/vendor-registry.ts` | 2h |
| Tests for SDK + doctor | test files | 2h |

### Step 2: Tier 1 Vendors
| Task | Files | Effort |
|------|-------|--------|
| Vercel adapter (deploy target) | `src/adapters/vercel/*` | 6h |
| Supabase adapter (database) | `src/adapters/supabase/*` | 4h |
| PlanetScale adapter (database) | `src/adapters/planetscale/*` | 4h |
| Turso adapter (SQLite) | `src/adapters/turso/*` | 4h |
| Tests | test files | 3h |

### Step 3: Tier 2 Vendors
| Task | Files | Effort |
|------|-------|--------|
| Trigger.dev adapter (jobs) | `src/adapters/trigger/*` | 4h |
| TinyBird adapter (analytics) | `src/adapters/tinybird/*` | 4h |
| Resend adapter (email) | `src/adapters/resend/*` | 3h |
| Tests | test files | 2h |

### Step 4: Tier 3 Vendors
| Task | Files | Effort |
|------|-------|--------|
| Clerk adapter (auth) | `src/adapters/clerk/*` | 4h |
| Inngest adapter (jobs) | `src/adapters/inngest/*` | 4h |
| Sentry adapter (monitoring) | `src/adapters/sentry/*` | 3h |
| Axiom adapter (logging) | `src/adapters/axiom/*` | 3h |
| Tests | test files | 3h |

### Step 5: Console + Marketplace UI
| Task | Files | Effort |
|------|-------|--------|
| Vendor catalog page in Console | `console/marketplace.ts`, `app.tsx` | 4h |
| "Connected" status per vendor | Console UI | 3h |
| Revenue share / referral tracking | `console/billing.ts` | 4h |
| Vendor onboarding flow docs | Documentation | 2h |

---

## New Files Created (Phase 8)

```
src/adapters/vendor-sdk.ts           # VendorAdapter interface
src/adapters/vendor-sdk.test.ts      # SDK tests
src/commands/doctor.ts               # cairn doctor command

src/adapters/vercel/api.ts           # Vercel REST client
src/adapters/vercel/deploy.ts        # Vercel deploy adapter
src/adapters/vercel/api.test.ts

src/adapters/supabase/api.ts         # Supabase REST client
src/adapters/supabase/provisioner.ts # DB provisioning
src/adapters/supabase/api.test.ts

src/adapters/planetscale/api.ts
src/adapters/planetscale/provisioner.ts
src/adapters/planetscale/api.test.ts

src/adapters/turso/api.ts
src/adapters/turso/provisioner.ts
src/adapters/turso/api.test.ts

src/adapters/trigger/api.ts
src/adapters/trigger/provisioner.ts
src/adapters/trigger/api.test.ts

src/adapters/tinybird/api.ts
src/adapters/tinybird/provisioner.ts
src/adapters/tinybird/api.test.ts

src/adapters/resend/api.ts
src/adapters/resend/provisioner.ts
src/adapters/resend/api.test.ts

src/adapters/clerk/api.ts
src/adapters/clerk/provisioner.ts
src/adapters/clerk/api.test.ts

src/adapters/inngest/api.ts
src/adapters/inngest/provisioner.ts
src/adapters/inngest/api.test.ts

src/adapters/sentry/api.ts
src/adapters/sentry/provisioner.ts
src/adapters/sentry/api.test.ts

src/adapters/axiom/api.ts
src/adapters/axiom/provisioner.ts
src/adapters/axiom/api.test.ts
```

---

## cairn.hcl After Phase 8

```hcl
project "my-app" {
  runtime = "bun"
}

service "api" {
  command = "bun run src/index.ts"
  expose  = true
  env {
    DATABASE_URL = postgres.main.url
    REDIS_URL    = redis.cache.url
  }
}

# Database — pick your vendor
postgres "main" {
  vendor  = "neon"       # or "supabase", "planetscale", "railway"
  version = "16"
}

# Cache
redis "cache" {
  vendor = "upstash"     # or "railway"
}

# Auth — pick your vendor
auth "main" {
  vendor    = "clerk"    # or built-in Better Auth
  providers = ["google", "github"]
}

# Background jobs
jobs "background" {
  vendor = "trigger"     # or "inngest"
}

# Email
email "transactional" {
  vendor = "resend"
}

# Analytics
analytics "events" {
  vendor = "tinybird"
}

# Monitoring
monitoring "errors" {
  vendor = "sentry"
}

# Logging
logging "logs" {
  vendor = "axiom"
}

# Storage (existing)
storage "files" {}
```

---

## Verification Flow

```
1. cairn login {vendor}
   └──> Prompt for credentials
   └──> Call vendor.verify(creds)
   └──> ✓ Connected / ✗ Invalid
   └──> Save to ~/.cairn/credentials/{vendor}.json

2. cairn doctor
   └──> Scan all known vendors
   └──> For each with saved creds: call verify()
   └──> For each without: show "not configured"
   └──> Summary: X/Y configured

3. cairn deploy
   └──> For each HCL block with vendor:
        └──> Load creds from ~/.cairn/credentials/
        └──> Call vendor.provision()
        └──> Inject env vars (vendor.getConnectionEnv())
        └──> Save resource IDs to state

4. cairn destroy
   └──> For each resource in state:
        └──> Call vendor.destroy()
        └──> Clear state
```

---

## Success Criteria

- [ ] `VendorAdapter` interface standardized
- [ ] `cairn doctor` shows all vendor statuses
- [ ] Login verifies API key immediately (not at deploy time)
- [ ] 11 new vendors added (total 15)
- [ ] New HCL block types: `jobs`, `analytics`, `email`, `sqlite`, `monitoring`, `logging`
- [ ] Console marketplace shows all vendors with "connected" status
- [ ] All new vendors have unit tests
- [ ] `test-full-flow.sh` updated with Phase 8 tests
- [ ] `build.md` updated to Phase 8 ✅ COMPLETE

**Estimated effort: ~2-3 weeks**
