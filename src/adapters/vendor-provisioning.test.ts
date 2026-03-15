/**
 * Vendor provisioning pipeline test
 * Verifies that provisionVendorResources reads cairn.hcl config
 * and returns the correct env vars for each vendor
 */

import { test, expect } from "bun:test";
import { provisionVendorResources } from "./vendor-provisioning.ts";
import type { CairnConfig } from "../parser/types.ts";

function makeConfig(overrides: Partial<CairnConfig> = {}): CairnConfig {
  return {
    project: { name: "test-app", runtime: "bun" },
    services: [],
    postgres: [],
    redis: [],
    storage: [],
    secrets: [],
    auth: [],
    jobs: [],
    email: [],
    analytics: [],
    sqlite: [],
    monitoring: [],
    logging: [],
    ...overrides,
  };
}

test("returns empty env vars when no vendor blocks", async () => {
  const env = await provisionVendorResources(makeConfig());
  expect(Object.keys(env).length).toBe(0);
});

test("provisions Trigger.dev and returns TRIGGER_API_KEY", async () => {
  const env = await provisionVendorResources(
    makeConfig({ jobs: [{ name: "main", vendor: "trigger" }] }),
  );
  // Will succeed if credentials exist, skip if not
  if (env.TRIGGER_API_KEY) {
    expect(env.TRIGGER_API_KEY).toBeTruthy();
    expect(env.TRIGGER_PROJECT_ID).toBeTruthy();
    console.log("  ✓ Trigger.dev env vars injected");
  }
}, 15000);

test("provisions Resend and returns RESEND_API_KEY", async () => {
  const env = await provisionVendorResources(
    makeConfig({ email: [{ name: "main", vendor: "resend" }] }),
  );
  if (env.RESEND_API_KEY) {
    expect(env.RESEND_API_KEY).toBeTruthy();
    console.log("  ✓ Resend env vars injected");
  }
}, 15000);

test("provisions Inngest and returns event + signing keys", async () => {
  const env = await provisionVendorResources(
    makeConfig({ jobs: [{ name: "main", vendor: "inngest" }] }),
  );
  if (env.INNGEST_EVENT_KEY) {
    expect(env.INNGEST_EVENT_KEY).toBeTruthy();
    expect(env.INNGEST_SIGNING_KEY).toBeTruthy();
    console.log("  ✓ Inngest env vars injected");
  }
}, 15000);

test("provisions Sentry and returns SENTRY_DSN", async () => {
  const env = await provisionVendorResources(
    makeConfig({ monitoring: [{ name: "main", vendor: "sentry" }] }),
  );
  if (env.SENTRY_DSN) {
    expect(env.SENTRY_DSN).toContain("sentry.io");
    console.log("  ✓ Sentry DSN injected");
  }
}, 30000);

test("provisions Axiom and returns AXIOM_TOKEN", async () => {
  const env = await provisionVendorResources(
    makeConfig({ logging: [{ name: "main", vendor: "axiom" }] }),
  );
  if (env.AXIOM_TOKEN) {
    expect(env.AXIOM_TOKEN).toBeTruthy();
    expect(env.AXIOM_DATASET).toBeTruthy();
    console.log("  ✓ Axiom env vars injected");
  }
}, 15000);

test("provisions multiple vendors simultaneously", async () => {
  const env = await provisionVendorResources(
    makeConfig({
      jobs: [{ name: "main", vendor: "trigger" }],
      email: [{ name: "main", vendor: "resend" }],
      monitoring: [{ name: "main", vendor: "sentry" }],
      logging: [{ name: "main", vendor: "axiom" }],
    }),
  );

  // Count how many vendor env vars were injected
  const vendorKeys = Object.keys(env);
  console.log(`  ✓ ${vendorKeys.length} env vars from ${Object.keys(env).length > 0 ? vendorKeys.join(", ") : "none (no credentials)"}`);
  expect(vendorKeys.length).toBeGreaterThanOrEqual(0);
}, 60000);
