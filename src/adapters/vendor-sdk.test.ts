/**
 * Vendor SDK + Doctor tests
 */

import { test, expect } from "bun:test";
import {
  registerVendor,
  getVendor,
  listVendors,
  listVendorsByCategory,
  getVendorCategories,
} from "./vendor-sdk.ts";

// Import vendor registrations
import "./vendors.ts";

// ─── Vendor Registry Tests ─────────────────────────────────

test("all 15 vendors registered", () => {
  const vendors = listVendors();
  expect(vendors.length).toBe(15);
});

test("existing vendors registered", () => {
  expect(getVendor("cloudflare")).toBeDefined();
  expect(getVendor("railway")).toBeDefined();
  expect(getVendor("neon")).toBeDefined();
  expect(getVendor("upstash")).toBeDefined();
});

test("phase 7 vendors registered", () => {
  expect(getVendor("vercel")).toBeDefined();
  expect(getVendor("turso")).toBeDefined();
  expect(getVendor("tinybird")).toBeDefined();
  expect(getVendor("planetscale")).toBeDefined();
  expect(getVendor("supabase")).toBeDefined();
});

test("phase 8 vendors registered", () => {
  expect(getVendor("trigger")).toBeDefined();
  expect(getVendor("resend")).toBeDefined();
  expect(getVendor("clerk")).toBeDefined();
  expect(getVendor("inngest")).toBeDefined();
  expect(getVendor("sentry")).toBeDefined();
  expect(getVendor("axiom")).toBeDefined();
});

test("unknown vendor returns undefined", () => {
  expect(getVendor("nonexistent")).toBeUndefined();
});

test("vendors have required fields", () => {
  for (const vendor of listVendors()) {
    expect(vendor.id).toBeTruthy();
    expect(vendor.name).toBeTruthy();
    expect(vendor.category).toBeTruthy();
    expect(vendor.credentialsUrl).toContain("http");
    expect(vendor.loginFields.length).toBeGreaterThan(0);
    expect(typeof vendor.verify).toBe("function");
  }
});

test("all vendors have unique IDs", () => {
  const ids = listVendors().map((v) => v.id);
  expect(new Set(ids).size).toBe(ids.length);
});

// ─── Category Tests ─────────────────────────────────────────

test("deploy category has 3 vendors", () => {
  const deploys = listVendorsByCategory("deploy");
  expect(deploys.length).toBe(3); // cloudflare, railway, vercel
  expect(deploys.map((v) => v.id)).toContain("cloudflare");
  expect(deploys.map((v) => v.id)).toContain("railway");
  expect(deploys.map((v) => v.id)).toContain("vercel");
});

test("database category has 4 vendors", () => {
  const dbs = listVendorsByCategory("database");
  expect(dbs.length).toBe(4); // neon, turso, planetscale, supabase
});

test("cache category has upstash", () => {
  const cache = listVendorsByCategory("cache");
  expect(cache.length).toBe(1);
  expect(cache[0]!.id).toBe("upstash");
});

test("analytics category has tinybird", () => {
  const analytics = listVendorsByCategory("analytics");
  expect(analytics.length).toBe(1);
  expect(analytics[0]!.id).toBe("tinybird");
});

test("jobs category has trigger + inngest", () => {
  const jobs = listVendorsByCategory("jobs");
  expect(jobs.length).toBe(2);
  expect(jobs.map((v) => v.id)).toContain("trigger");
  expect(jobs.map((v) => v.id)).toContain("inngest");
});

test("email category has resend", () => {
  const email = listVendorsByCategory("email");
  expect(email.length).toBe(1);
  expect(email[0]!.id).toBe("resend");
});

test("auth category has clerk", () => {
  const auth = listVendorsByCategory("auth");
  expect(auth.length).toBe(1);
  expect(auth[0]!.id).toBe("clerk");
});

test("monitoring category has sentry", () => {
  const mon = listVendorsByCategory("monitoring");
  expect(mon.length).toBe(1);
  expect(mon[0]!.id).toBe("sentry");
});

test("logging category has axiom", () => {
  const log = listVendorsByCategory("logging");
  expect(log.length).toBe(1);
  expect(log[0]!.id).toBe("axiom");
});

test("getVendorCategories returns all categories", () => {
  const cats = getVendorCategories();
  expect(cats).toContain("deploy");
  expect(cats).toContain("database");
  expect(cats).toContain("cache");
  expect(cats).toContain("analytics");
  expect(cats).toContain("jobs");
  expect(cats).toContain("email");
  expect(cats).toContain("auth");
  expect(cats).toContain("monitoring");
  expect(cats).toContain("logging");
});

// ─── Login Field Tests ──────────────────────────────────────

test("vercel login requires apiToken", () => {
  const v = getVendor("vercel")!;
  expect(v.loginFields.length).toBe(1);
  expect(v.loginFields[0]!.name).toBe("apiToken");
  expect(v.loginFields[0]!.type).toBe("password");
});

test("turso login requires apiToken + organization", () => {
  const v = getVendor("turso")!;
  expect(v.loginFields.length).toBe(2);
  expect(v.loginFields.map((f) => f.name)).toContain("apiToken");
  expect(v.loginFields.map((f) => f.name)).toContain("organization");
});

test("tinybird login requires apiToken + host", () => {
  const v = getVendor("tinybird")!;
  expect(v.loginFields.length).toBe(2);
  expect(v.loginFields.map((f) => f.name)).toContain("apiToken");
  expect(v.loginFields.map((f) => f.name)).toContain("host");
});

test("planetscale login requires 3 fields", () => {
  const v = getVendor("planetscale")!;
  expect(v.loginFields.length).toBe(3);
  expect(v.loginFields.map((f) => f.name)).toContain("serviceTokenId");
  expect(v.loginFields.map((f) => f.name)).toContain("serviceToken");
  expect(v.loginFields.map((f) => f.name)).toContain("organization");
});

test("supabase login requires accessToken", () => {
  const v = getVendor("supabase")!;
  expect(v.loginFields.length).toBe(1);
  expect(v.loginFields[0]!.name).toBe("accessToken");
  expect(v.loginFields[0]!.type).toBe("password");
});

test("trigger login requires apiKey", () => {
  const v = getVendor("trigger")!;
  expect(v.loginFields.length).toBe(1);
  expect(v.loginFields[0]!.name).toBe("apiKey");
  expect(v.loginFields[0]!.type).toBe("password");
});

test("resend login requires apiKey", () => {
  const v = getVendor("resend")!;
  expect(v.loginFields.length).toBe(1);
  expect(v.loginFields[0]!.name).toBe("apiKey");
  expect(v.loginFields[0]!.type).toBe("password");
});

test("clerk login requires secretKey", () => {
  const v = getVendor("clerk")!;
  expect(v.loginFields.length).toBe(1);
  expect(v.loginFields[0]!.name).toBe("secretKey");
  expect(v.loginFields[0]!.type).toBe("password");
});

test("inngest login requires eventKey + signingKey", () => {
  const v = getVendor("inngest")!;
  expect(v.loginFields.length).toBe(2);
  expect(v.loginFields.map((f) => f.name)).toContain("eventKey");
  expect(v.loginFields.map((f) => f.name)).toContain("signingKey");
});

test("sentry login requires authToken + organization", () => {
  const v = getVendor("sentry")!;
  expect(v.loginFields.length).toBe(2);
  expect(v.loginFields.map((f) => f.name)).toContain("authToken");
  expect(v.loginFields.map((f) => f.name)).toContain("organization");
});

test("axiom login requires apiToken", () => {
  const v = getVendor("axiom")!;
  expect(v.loginFields.length).toBe(1);
  expect(v.loginFields[0]!.name).toBe("apiToken");
  expect(v.loginFields[0]!.type).toBe("password");
});

// ─── Credentials URL Tests ──────────────────────────────────

test("all credentials URLs are valid HTTPS", () => {
  for (const vendor of listVendors()) {
    expect(vendor.credentialsUrl).toMatch(/^https:\/\//);
  }
});

// ─── Doctor Command Tests ───────────────────────────────────

test("doctorCommand function exists", () => {
  const { doctorCommand } = require("../commands/doctor.ts");
  expect(typeof doctorCommand).toBe("function");
});
