/**
 * Vendor registry — maps vendor names to their provisioning adapters.
 * Determines which vendor to use for postgres/redis based on:
 * 1. Explicit vendor in cairn.hcl (e.g. vendor = "neon")
 * 2. Deploy target fallback (cloudflare → D1/KV, railway → native)
 */

import type { PostgresConfig, RedisConfig } from "../parser/types.ts";

export type PostgresVendor = "neon" | "cloudflare" | "railway";
export type RedisVendor = "upstash" | "cloudflare" | "railway";

/**
 * Resolve which Postgres vendor to use.
 * Priority: explicit vendor > target-appropriate default
 */
export function resolvePostgresVendor(
  pg: PostgresConfig,
  target: string,
): PostgresVendor {
  if (pg.vendor) return pg.vendor;

  // Default: use cloud-native for each target
  switch (target) {
    case "cloudflare":
    case "cf":
      return "cloudflare"; // D1
    case "railway":
      return "railway"; // native Postgres
    default:
      return "cloudflare";
  }
}

/**
 * Resolve which Redis vendor to use.
 * Priority: explicit vendor > target-appropriate default
 */
export function resolveRedisVendor(
  rd: RedisConfig,
  target: string,
): RedisVendor {
  if (rd.vendor) return rd.vendor;

  // Default: use cloud-native for each target
  switch (target) {
    case "cloudflare":
    case "cf":
      return "cloudflare"; // KV
    case "railway":
      return "railway"; // native Redis
    default:
      return "cloudflare";
  }
}

/**
 * Check if a vendor requires separate login credentials
 */
export function vendorRequiresLogin(vendor: string): boolean {
  return [
    "neon", "upstash", "trigger", "resend", "clerk",
    "inngest", "sentry", "axiom", "tinybird", "turso",
    "vercel", "supabase", "planetscale",
  ].includes(vendor);
}
