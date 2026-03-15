# Cairn — Phase-by-Phase Build Plan

## Phase 1: Core CLI + Cloudflare MVP ✅ COMPLETE

**Status: Done**

| Component | Status |
|---|---|
| HCL parser (cairn.hcl → CairnConfig) | ✅ |
| `cairn init` — scaffold project | ✅ |
| `cairn dev` — Docker Compose local env | ✅ |
| `cairn login cloudflare` — dual auth | ✅ |
| `cairn deploy` — D1, KV, R2, Workers | ✅ |
| `cairn destroy` — tear down all resources | ✅ |
| `cairn status` — show project state | ✅ |
| `cairn secret set/list` — local JSON secrets | ✅ |
| `cairn logs` — placeholder | ✅ |
| Bun.build() bundling for Workers | ✅ |
| State management (.cairn/state.json) | ✅ |
| 29 tests passing | ✅ |

**Effort spent:** ~2-3 days | **Deliverable:** Working CLI, end-to-end lifecycle proven

---

## Phase 2: Auth Block (Better Auth Integration) ✅ COMPLETE
**Priority: Highest impact — every app needs auth**

| Task | Status | Effort |
|---|---|---|
| Add `auth "main" {}` block to HCL spec | ✅ | 2h |
| Parse auth block in hcl.ts → CairnConfig | ✅ | 2h |
| Add `AuthConfig` to types.ts | ✅ | 1h |
| Docker adapter: spin up Better Auth container in dev | ✅ | 4h |
| Cloudflare adapter: deploy Better Auth as a Worker | ✅ | 8h |
| Generate auth SDK client for user's app (env vars, helper) | ✅ | 4h |
| Auto-wire `AUTH_URL` env var into service bindings | ✅ | 2h |
| Auth dashboard route (list users, sessions) | ✅ | 6h |
| Social providers config (`providers = ["google", "github"]`) | ✅ | 4h |
| Tests for auth provisioning | ✅ | 4h |

**Total effort:** ~4-5 days | **Deliverable:** `auth "main" { providers = ["google", "github"] }` in cairn.hcl, working auth in dev + prod

**cairn.hcl example after this phase:**
```hcl
auth "main" {
  providers = ["google", "github"]
  session   = "jwt"
}

service "api" {
  command = "bun run src/index.ts"
  expose  = true
  env {
    AUTH_URL = auth.main.url
  }
}
```

---

## Phase 3: Railway Adapter (Multi-Target Proof) ✅ COMPLETE
**Priority: Proves Cairn isn't Cloudflare-locked**

| Task | Status | Effort |
|---|---|---|
| Railway API client (similar to `api.ts` pattern) | ✅ | 4h |
| `cairn login railway` | ✅ | 2h |
| Railway deploy adapter: create project + service | ✅ | 6h |
| Railway Postgres provisioning (native, not D1 mapping) | ✅ | 4h |
| Railway Redis provisioning (native) | ✅ | 3h |
| Railway volume storage (R2 equivalent) | ✅ | 3h |
| `cairn deploy --target railway` flag already exists | ✅ | 0h |
| Railway destroy adapter | ✅ | 3h |
| Railway status/logs (real logs, not placeholder) | ✅ | 4h |
| Tests for Railway adapter | ✅ | 4h |
| Adapter interface refactor (extract common interface) | ✅ | 4h |

**Total effort:** ~5-6 days | **Deliverable:** Same cairn.hcl deploys to Cloudflare OR Railway with `--target`

---

## Phase 4: First Vendor Integrations (Neon + Upstash) ✅ COMPLETE
**Priority: First marketplace vendors, replaces Cloudflare-native services**

| Task | Status | Effort |
|---|---|---|
| Vendor registry system (vendor name → adapter) | ✅ | 4h |
| `vendor` attribute in HCL blocks: `postgres "main" { vendor = "neon" }` | ✅ | 3h |
| Neon API client | ✅ | 4h |
| Neon Postgres provisioner (create project + database + connection string) | ✅ | 6h |
| Neon branch databases (for branch environments later) | ✅ | 4h |
| `cairn login neon` | ✅ | 2h |
| Upstash API client | ✅ | 4h |
| Upstash Redis provisioner | ✅ | 4h |
| `cairn login upstash` | ✅ | 2h |
| Fallback logic: no vendor specified → use cloud-native (D1/KV) | ✅ | 3h |
| Destroy support for vendor resources | ✅ | 3h |
| Tests | ✅ | 4h |

**Total effort:** ~6-7 days | **Deliverable:** `postgres "main" { vendor = "neon" }` provisions real Postgres, not D1

**cairn.hcl example after this phase:**
```hcl
postgres "main" {
  vendor  = "neon"
  version = "16"
}

redis "cache" {
  vendor = "upstash"
}
```

---

## Phase 5: Console MVP (Web Dashboard) ✅ COMPLETE
**Priority: Revenue starts here — this is the managed/hosted version**

| Task | Status | Effort |
|---|---|---|
| Console project setup (Bun.serve + HTML imports) | ✅ | 4h |
| Auth for Console itself (session-based, dogfooding Phase 2) | ✅ | 4h |
| Project list view (read .cairn/state.json remotely) | ✅ | 6h |
| Deploy trigger from web UI | ✅ | 6h |
| Resource dashboard (D1s, KVs, R2s, Workers listed) | ✅ | 6h |
| Logs viewer (stream worker logs) | ✅ | 8h |
| Environment variables / secrets management UI | ✅ | 4h |
| Usage metrics (Cloudflare analytics API) | ✅ | 6h |
| Billing integration (Stripe or UnitPay) | ✅ | 8h |
| Team/org support (multi-user) | ✅ | 8h |
| Console API (REST, used by both CLI and web) | ✅ | 8h |
| Hosted state storage (replace local state.json) | ✅ | 6h |

**Total effort:** ~10-12 days | **Deliverable:** Web dashboard at console.cairn.dev, deploy from browser, first paying users

---

## Phase 6: Branch Environments ✅ COMPLETE
**Priority: Killer feature — PR = complete isolated world**

| Task | Status | Effort |
|---|---|---|
| `cairn branch create <name>` command | ✅ | 4h |
| Branch state isolation (separate state per branch) | ✅ | 4h |
| Cloudflare: deploy branch-prefixed Workers | ✅ | 4h |
| Cloudflare: branch-prefixed D1/KV/R2 | ✅ | 6h |
| Neon: database branching (native, zero-copy) | ✅ | 4h |
| Branch URL generation (`branch-name.app.workers.dev`) | ✅ | 3h |
| `cairn branch destroy <name>` — cleanup | ✅ | 3h |
| GitHub webhook: auto-create branch env on PR open | ✅ | 8h |
| GitHub webhook: auto-destroy on PR merge/close | ✅ | 4h |
| PR comment with branch URL | ✅ | 3h |
| Console UI: branch environment list + status | ✅ | 6h |
| Tests | ✅ | 4h |

**Total effort:** ~7-8 days | **Deliverable:** Open a PR → get a full isolated environment with its own DB, cache, compute

---

## Phase 7: App Store (One-Click OSS Deploys) ✅ COMPLETE
**Effort: ~2-3 weeks**

| Task | Status | Details |
|---|---|---|
| Curated catalog of open-source tools | ✅ | 6 apps: PostHog, Plausible, n8n, Gitea, Uptime Kuma, Ghost |
| Each has a pre-built cairn.hcl | ✅ | Template registry with toHcl() generation |
| `cairn install posthog` → provisions everything | ✅ | Interactive CLI with project setup + secrets guidance |
| Console marketplace UI | ✅ | App Store page with search, categories, app cards |
| Template versioning + updates | ✅ | `cairn update` command + .cairn/installed.json tracking |

---

## Phase 8: More Vendors + Marketplace
**Effort: ~2-3 weeks**

- Vendor SDK / adapter interface for third-party contributions
- Vendor onboarding flow
- Revenue share / referral tracking
- Categories: databases, auth, payments, email, monitoring, etc.
- At least 10-15 vendors integrated

---

## Phase 9: Concierge (White-Glove DevOps)
**Effort: ~ongoing, services business**

- AI-assisted infrastructure review
- Migration tooling (existing infra → Cairn)
- Custom vendor integration for enterprise
- SLA-backed support tier

---

## Timeline Overview

| Phase | What | Effort | Cumulative |
|---|---|---|---|
| 1 ✅ | Core CLI + Cloudflare | Done | Done |
| 2 ✅ | Auth (Better Auth) | Done | ~1 week |
| 3 ✅ | Railway adapter | Done | ~2 weeks |
| 4 ✅ | Neon + Upstash vendors | Done | ~3 weeks |
| 5 ✅ | Console MVP | Done | ~5-6 weeks |
| 6 ✅ | Branch environments | Done | ~7-8 weeks |
| 7 ✅ | App Store | Done | ~10-11 weeks |
| 8 | Marketplace expansion | ~2-3 weeks | ~13-14 weeks |
| 9 | Concierge | Ongoing | — |

**Compliance (SOC2/GDPR/HIPAA): Deferred** — will layer in when Console has paying customers.

---

## Recommended Next Move

**Phase 8 (Marketplace Expansion)** — expand to 10-15 vendors, add vendor SDK for third-party contributions, vendor onboarding flow, revenue share/referral tracking, and categorized marketplace.
