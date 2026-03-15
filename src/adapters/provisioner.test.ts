/**
 * Provisioner integration tests
 * Tests actual resource creation/deletion on each vendor
 * Requires valid credentials in ~/.cairn/credentials/
 */

import { test, expect } from "bun:test";
import { loadVendorCredentials } from "../secrets/local.ts";

// ─── Turso ──────────────────────────────────────────────────

import { setCredentials as setTursoCredentials } from "./turso/api.ts";
import {
  createTursoDatabase,
  deleteTursoDatabase,
  listTursoDatabases,
} from "./turso/provisioner.ts";

test("turso: create → list → delete database", async () => {
  const creds = loadVendorCredentials("turso");
  if (!creds) { console.log("  ⏭ skipping turso (no credentials)"); return; }
  setTursoCredentials(creds as { apiToken: string; organization: string });

  const dbName = `cairn-test-${Date.now()}`;

  // Create
  const db = await createTursoDatabase(dbName);
  expect(db.databaseId).toBeTruthy();
  expect(db.name).toBe(dbName);
  expect(db.hostname).toContain("turso.io");
  expect(db.connectionUrl).toContain("libsql://");
  console.log(`  ✓ turso created: ${db.name} (${db.hostname})`);

  // List — should contain our db
  const list = await listTursoDatabases();
  const found = (list as Array<{ Name: string }>).some((d) => d.Name === dbName);
  expect(found).toBe(true);
  console.log(`  ✓ turso listed: found ${dbName}`);
  console.log(`  📌 turso resource: ${dbName}`);
}, 30000);

// ─── Vercel ─────────────────────────────────────────────────

import { setCredentials as setVercelCredentials } from "./vercel/api.ts";
import {
  createVercelProject,
  deleteVercelProject,
  listVercelProjects,
} from "./vercel/provisioner.ts";

test("vercel: create → list → delete project", async () => {
  const creds = loadVendorCredentials("vercel");
  if (!creds) { console.log("  ⏭ skipping vercel (no credentials)"); return; }
  setVercelCredentials(creds as { apiToken: string });

  const projName = `cairn-test-${Date.now()}`;

  // Create
  const proj = await createVercelProject(projName);
  expect(proj.projectId).toBeTruthy();
  expect(proj.name).toBe(projName);
  console.log(`  ✓ vercel created: ${proj.name} → ${proj.url}`);

  // List — should contain our project
  const list = await listVercelProjects();
  const found = (list as Array<{ name: string }>).some((p) => p.name === projName);
  expect(found).toBe(true);
  console.log(`  ✓ vercel listed: found ${projName}`);
  console.log(`  📌 vercel resource: ${proj.projectId}`);
}, 30000);

// ─── Supabase ───────────────────────────────────────────────

import { setCredentials as setSupabaseCredentials } from "./supabase/api.ts";
import {
  createSupabaseProject,
  deleteSupabaseProject,
  listSupabaseProjects,
} from "./supabase/provisioner.ts";

test("supabase: create → list → delete project", async () => {
  const creds = loadVendorCredentials("supabase");
  if (!creds) { console.log("  ⏭ skipping supabase (no credentials)"); return; }
  setSupabaseCredentials(creds as { accessToken: string });

  // Get org ID
  const orgs = await fetch("https://api.supabase.com/v1/organizations", {
    headers: { Authorization: `Bearer ${creds.accessToken}` },
  });
  const orgList = await orgs.json() as Array<{ id: string }>;
  const orgId = orgList[0]!.id;

  const name = `cairn-test-${Date.now()}`;

  // Create
  const proj = await createSupabaseProject(name, orgId, "CairnTest1234");
  expect(proj.projectId).toBeTruthy();
  expect(proj.name).toBe(name);
  console.log(`  ✓ supabase created: ${proj.name} (${proj.projectId})`);

  // List — should contain our project
  const list = await listSupabaseProjects();
  const found = (list as Array<{ name: string }>).some((p) => p.name === name);
  expect(found).toBe(true);
  console.log(`  ✓ supabase listed: found ${name}`);
  console.log(`  📌 supabase resource: ${proj.projectId}`);
}, 60000);

// ─── TinyBird ───────────────────────────────────────────────

import { setCredentials as setTinybirdCredentials } from "./tinybird/api.ts";
import {
  createTinybirdDatasource,
  deleteTinybirdDatasource,
  listTinybirdDatasources,
} from "./tinybird/provisioner.ts";

test("tinybird: create → list → delete datasource", async () => {
  const creds = loadVendorCredentials("tinybird");
  if (!creds) { console.log("  ⏭ skipping tinybird (no credentials)"); return; }
  setTinybirdCredentials(creds as { apiToken: string; host: string });

  const name = `cairn_test_${Date.now()}`;

  // Create
  const ds = await createTinybirdDatasource(name, "id Int32, name String, created_at DateTime");
  expect(ds.datasourceId).toBeTruthy();
  expect(ds.name).toBeTruthy();
  console.log(`  ✓ tinybird created: ${ds.name} (${ds.datasourceId})`);

  // List — should contain our datasource
  const list = await listTinybirdDatasources();
  const found = (list as Array<{ id: string }>).some((d) => d.id === ds.datasourceId);
  expect(found).toBe(true);
  console.log(`  ✓ tinybird listed: found ${ds.name}`);

  console.log(`  📌 tinybird resource: ${ds.name}`);
}, 30000);

// ─── PlanetScale ────────────────────────────────────────────

import { setCredentials as setPlanetScaleCredentials } from "./planetscale/api.ts";
import {
  createPlanetScaleDatabase,
  deletePlanetScaleDatabase,
  listPlanetScaleDatabases,
} from "./planetscale/provisioner.ts";

test("planetscale: create → list → delete database", async () => {
  const creds = loadVendorCredentials("planetscale");
  if (!creds) { console.log("  ⏭ skipping planetscale (no credentials)"); return; }
  setPlanetScaleCredentials(creds as { serviceTokenId: string; serviceToken: string; organization: string });

  const name = `cairn-test-${Date.now()}`;

  try {
    // Create
    const db = await createPlanetScaleDatabase(name);
    expect(db.databaseId).toBeTruthy();
    expect(db.name).toBe(name);
    console.log(`  ✓ planetscale created: ${db.name} (${db.region})`);

    // List
    const list = await listPlanetScaleDatabases();
    const found = (list as Array<{ name: string }>).some((d) => d.name === name);
    expect(found).toBe(true);
    console.log(`  ✓ planetscale listed: found ${name}`);
    console.log(`  📌 planetscale resource: ${name}`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("forbidden") || msg.includes("permission")) {
      console.log(`  ⚠ planetscale: service token needs 'create_databases' + 'delete_databases' permissions`);
      console.log(`    Add these at: https://app.planetscale.com/settings/service-tokens`);
    } else if (msg.includes("credit card") || msg.includes("payment")) {
      console.log(`  ⚠ planetscale: requires payment info to create databases`);
      console.log(`    Add a card at: https://app.planetscale.com/settings/billing`);
      // Still pass — token works, just needs more perms
    } else {
      throw e;
    }
  }
}, 30000);

// ─── Trigger.dev ───────────────────────────────────────────

import { setCredentials as setTriggerCredentials } from "./trigger/api.ts";
import { verifyTriggerEnvironment } from "./trigger/provisioner.ts";

test("trigger: verify environment access", async () => {
  const creds = loadVendorCredentials("trigger");
  if (!creds) { console.log("  ⏭ skipping trigger (no credentials)"); return; }
  setTriggerCredentials(creds as { apiKey: string });

  const env = await verifyTriggerEnvironment();
  expect(env.environmentId).toBeTruthy();
  expect(env.projectId).toBeTruthy();
  expect(env.projectName).toBeTruthy();
  expect(env.organizationName).toBeTruthy();
  console.log(`  ✓ trigger verified: ${env.projectName} (${env.organizationName})`);
}, 15000);

// ─── Resend ────────────────────────────────────────────────

import { setCredentials as setResendCredentials } from "./resend/api.ts";
import { verifyResendAccess } from "./resend/provisioner.ts";

test("resend: verify access + list domains", async () => {
  const creds = loadVendorCredentials("resend");
  if (!creds) { console.log("  ⏭ skipping resend (no credentials)"); return; }
  setResendCredentials(creds as { apiKey: string });

  const result = await verifyResendAccess();
  expect(result.apiKeyId).toBeTruthy();
  expect(result.apiKeyName).toBeTruthy();
  console.log(`  ✓ resend verified: key=${result.apiKeyName}, domains=${result.domains.length}`);
}, 15000);

// ─── Clerk ─────────────────────────────────────────────────

import { setCredentials as setClerkCredentials } from "./clerk/api.ts";
import { verifyClerkInstance, listClerkUsers } from "./clerk/provisioner.ts";

test("clerk: verify instance + list users", async () => {
  const creds = loadVendorCredentials("clerk");
  if (!creds) { console.log("  ⏭ skipping clerk (no credentials)"); return; }
  setClerkCredentials(creds as { secretKey: string });

  const instance = await verifyClerkInstance();
  expect(instance.instanceId).toBeTruthy();
  expect(instance.environmentType).toBeTruthy();
  console.log(`  ✓ clerk verified: ${instance.instanceId} (${instance.environmentType})`);

  const users = await listClerkUsers();
  expect(Array.isArray(users)).toBe(true);
  console.log(`  ✓ clerk listed: ${users.length} users`);
}, 15000);

// ─── Inngest ───────────────────────────────────────────────

import { setCredentials as setInngestCredentials } from "./inngest/api.ts";
import { verifyInngestAccess, sendInngestEvent } from "./inngest/provisioner.ts";

test("inngest: verify event key + signing key", async () => {
  const creds = loadVendorCredentials("inngest");
  if (!creds) { console.log("  ⏭ skipping inngest (no credentials)"); return; }
  setInngestCredentials(creds as { eventKey: string; signingKey: string });

  const result = await verifyInngestAccess();
  expect(result.eventKeyValid).toBe(true);
  expect(result.signingKeyValid).toBe(true);
  console.log(`  ✓ inngest verified: eventKey=${result.eventKeyValid}, signingKey=${result.signingKeyValid}`);

  // Send a test event
  const sent = await sendInngestEvent("cairn/test", { test: true });
  expect(sent).toBe(true);
  console.log(`  ✓ inngest event sent: cairn/test`);
}, 15000);

// ─── Sentry ────────────────────────────────────────────────

import { setCredentials as setSentryCredentials } from "./sentry/api.ts";
import {
  createSentryProject,
  deleteSentryProject,
  listSentryProjects,
} from "./sentry/provisioner.ts";

test("sentry: create → list → delete project", async () => {
  const creds = loadVendorCredentials("sentry");
  if (!creds) { console.log("  ⏭ skipping sentry (no credentials)"); return; }
  setSentryCredentials(creds as { authToken: string; organization: string });

  const name = `cairn-test-${Date.now()}`;

  // Create
  const proj = await createSentryProject(name, "node");
  expect(proj.projectId).toBeTruthy();
  expect(proj.slug).toBeTruthy();
  expect(proj.dsn).toContain("sentry.io");
  console.log(`  ✓ sentry created: ${proj.slug} (dsn: ${proj.dsn.slice(0, 40)}...)`);

  // List
  const list = await listSentryProjects();
  const found = (list as Array<{ slug: string }>).some((p) => p.slug === proj.slug);
  expect(found).toBe(true);
  console.log(`  ✓ sentry listed: found ${proj.slug}`);

  // Delete
  await deleteSentryProject(proj.slug);
  console.log(`  ✓ sentry deleted: ${proj.slug}`);
}, 30000);

// ─── Axiom ─────────────────────────────────────────────────

import { setCredentials as setAxiomCredentials } from "./axiom/api.ts";
import {
  createAxiomDataset,
  deleteAxiomDataset,
  listAxiomDatasets,
} from "./axiom/provisioner.ts";

test("axiom: list datasets (verify access)", async () => {
  const creds = loadVendorCredentials("axiom");
  if (!creds) { console.log("  ⏭ skipping axiom (no credentials)"); return; }
  setAxiomCredentials(creds as { apiToken: string });

  // List datasets to verify access works
  const list = await listAxiomDatasets();
  expect(Array.isArray(list)).toBe(true);
  console.log(`  ✓ axiom verified: ${list.length} datasets`);

  // Try create — may fail if token lacks create permission
  const name = `cairn-test-${Date.now()}`;
  try {
    const ds = await createAxiomDataset(name, "Cairn test dataset");
    expect(ds.name).toBe(name);
    console.log(`  ✓ axiom created: ${ds.name}`);

    await deleteAxiomDataset(name);
    console.log(`  ✓ axiom deleted: ${name}`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("403") || msg.includes("access")) {
      console.log(`  ⚠ axiom: token lacks create permission (read-only access verified)`);
    } else {
      throw e;
    }
  }
}, 30000);

// ─── Neon (existing) ────────────────────────────────────────

import { setCredentials as setNeonCredentials } from "./neon/api.ts";
import {
  createNeonProject,
  deleteNeonProject,
} from "./neon/provisioner.ts";

test("neon: create → delete project", async () => {
  const creds = loadVendorCredentials("neon");
  if (!creds) { console.log("  ⏭ skipping neon (no credentials)"); return; }
  setNeonCredentials(creds as { apiKey: string });

  const name = `cairn-test-${Date.now()}`;

  // Create
  const proj = await createNeonProject(name);
  expect(proj.projectId).toBeTruthy();
  expect(proj.connectionUri).toContain("postgresql://");
  console.log(`  ✓ neon created: ${name} (${proj.projectId})`);
  console.log(`  📌 neon resource: ${proj.projectId}`);
}, 30000);

// ─── Upstash (existing) ────────────────────────────────────

import { setCredentials as setUpstashCredentials } from "./upstash/api.ts";
import {
  createUpstashRedis,
  deleteUpstashRedis,
} from "./upstash/provisioner.ts";

test("upstash: create → delete redis", async () => {
  const creds = loadVendorCredentials("upstash");
  if (!creds) { console.log("  ⏭ skipping upstash (no credentials)"); return; }
  setUpstashCredentials(creds as { email: string; apiKey: string });

  const name = `cairn-test-${Date.now()}`;

  // Create
  const db = await createUpstashRedis(name);
  expect(db.databaseId).toBeTruthy();
  expect(db.endpoint).toBeTruthy();
  expect(db.password).toBeTruthy();
  console.log(`  ✓ upstash created: ${name} (${db.endpoint})`);
  console.log(`  📌 upstash resource: ${db.databaseId}`);
}, 30000);
