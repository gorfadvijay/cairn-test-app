/**
 * Phase 7: App Store / Catalog Tests
 */

import { test, expect } from "bun:test";
import {
  getTemplate,
  listTemplates,
  searchTemplates,
  listByCategory,
  getCategories,
  catalog,
} from "./registry.ts";

// ─── Catalog Registry Tests ─────────────────────────────

test("catalog contains all 6 templates", () => {
  const templates = listTemplates();
  expect(templates.length).toBe(6);
});

test("catalog has expected app IDs", () => {
  expect(catalog["posthog"]).toBeDefined();
  expect(catalog["plausible"]).toBeDefined();
  expect(catalog["n8n"]).toBeDefined();
  expect(catalog["gitea"]).toBeDefined();
  expect(catalog["uptime-kuma"]).toBeDefined();
  expect(catalog["ghost"]).toBeDefined();
});

test("getTemplate returns correct template", () => {
  const posthog = getTemplate("posthog");
  expect(posthog).toBeDefined();
  expect(posthog!.name).toBe("PostHog");
  expect(posthog!.category).toBe("analytics");
  expect(posthog!.image).toContain("posthog");
});

test("getTemplate returns undefined for unknown app", () => {
  expect(getTemplate("nonexistent")).toBeUndefined();
});

// ─── Template Structure Tests ───────────────────────────

test("all templates have required fields", () => {
  for (const template of listTemplates()) {
    expect(template.id).toBeTruthy();
    expect(template.name).toBeTruthy();
    expect(template.description).toBeTruthy();
    expect(template.category).toBeTruthy();
    expect(template.image).toBeTruthy();
    expect(template.version).toBeTruthy();
    expect(template.website).toContain("http");
    expect(template.license).toBeTruthy();
    expect(typeof template.port).toBe("number");
    expect(typeof template.toHcl).toBe("function");
  }
});

test("all templates generate valid HCL", () => {
  for (const template of listTemplates()) {
    const hcl = template.toHcl("test-project");
    expect(hcl).toContain('project "test-project"');
    expect(hcl).toContain("service");
    expect(hcl).toContain("expose");
  }
});

test("templates requiring postgres include postgres block", () => {
  const posthog = getTemplate("posthog")!;
  expect(posthog.requires.postgres).toBe(true);
  const hcl = posthog.toHcl("test");
  expect(hcl).toContain('postgres "main"');
});

test("templates requiring redis include redis block", () => {
  const posthog = getTemplate("posthog")!;
  expect(posthog.requires.redis).toBe(true);
  const hcl = posthog.toHcl("test");
  expect(hcl).toContain('redis "cache"');
});

test("uptime-kuma has no database requirements", () => {
  const kuma = getTemplate("uptime-kuma")!;
  expect(kuma.requires.postgres).toBeUndefined();
  expect(kuma.requires.redis).toBeUndefined();
  const hcl = kuma.toHcl("test");
  expect(hcl).not.toContain("postgres");
  expect(hcl).not.toContain("redis");
});

// ─── Search & Filter Tests ──────────────────────────────

test("searchTemplates finds by name", () => {
  const results = searchTemplates("ghost");
  expect(results.length).toBe(1);
  expect(results[0]!.id).toBe("ghost");
});

test("searchTemplates finds by description keyword", () => {
  const results = searchTemplates("analytics");
  expect(results.length).toBeGreaterThanOrEqual(2); // posthog + plausible
});

test("searchTemplates is case-insensitive", () => {
  const results = searchTemplates("POSTHOG");
  expect(results.length).toBe(1);
});

test("searchTemplates returns empty for no match", () => {
  const results = searchTemplates("xyz-nonexistent");
  expect(results.length).toBe(0);
});

test("listByCategory returns correct apps", () => {
  const analytics = listByCategory("analytics");
  expect(analytics.length).toBe(2); // posthog, plausible
  expect(analytics.every((a) => a.category === "analytics")).toBe(true);
});

test("getCategories returns all unique categories", () => {
  const cats = getCategories();
  expect(cats).toContain("analytics");
  expect(cats).toContain("automation");
  expect(cats).toContain("developer-tools");
  expect(cats).toContain("monitoring");
  expect(cats).toContain("cms");
  expect(cats.length).toBe(5);
});

// ─── HCL Generation Tests ──────────────────────────────

test("n8n template generates correct HCL structure", () => {
  const hcl = getTemplate("n8n")!.toHcl("my-n8n");
  expect(hcl).toContain('project "my-n8n"');
  expect(hcl).toContain("n8nio/n8n");
  expect(hcl).toContain("port    = 5678");
  expect(hcl).toContain('postgres "main"');
});

test("gitea template includes storage block", () => {
  const hcl = getTemplate("gitea")!.toHcl("my-gitea");
  expect(hcl).toContain('storage "repos"');
});

test("ghost template includes correct image", () => {
  const hcl = getTemplate("ghost")!.toHcl("my-blog");
  expect(hcl).toContain("ghost:5-alpine");
  expect(hcl).toContain("port    = 2368");
});

// ─── CLI Command Tests ──────────────────────────────────

test("installCommand function exists", () => {
  const { installCommand } = require("../commands/install.ts");
  expect(typeof installCommand).toBe("function");
});

test("catalogCommand function exists", () => {
  const { catalogCommand } = require("../commands/install.ts");
  expect(typeof catalogCommand).toBe("function");
});

test("updateCommand function exists", () => {
  const { updateCommand } = require("../commands/update.ts");
  expect(typeof updateCommand).toBe("function");
});

// ─── Template Version Tests ─────────────────────────────

test("all templates have semantic version", () => {
  for (const template of listTemplates()) {
    expect(template.version).toMatch(/^\d+\.\d+\.\d+$/);
  }
});

test("each template has unique ID", () => {
  const ids = listTemplates().map((t) => t.id);
  const unique = new Set(ids);
  expect(unique.size).toBe(ids.length);
});
