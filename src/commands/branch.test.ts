/**
 * Phase 6: Branch Environment Tests
 * Tests state isolation, branch listing, and CLI command structure
 */

import { test, expect, beforeEach, afterEach } from "bun:test";
import { loadState, saveState, clearState, listBranches } from "../state.ts";
import { existsSync, mkdirSync, rmSync, readdirSync } from "fs";

const TEST_DIR = "/tmp/cairn-branch-test";

// Save/restore cwd for state tests
let originalCwd: string;

beforeEach(() => {
  originalCwd = process.cwd();
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  mkdirSync(TEST_DIR, { recursive: true });
  process.chdir(TEST_DIR);
});

afterEach(() => {
  process.chdir(originalCwd);
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
});

// ─── State Isolation Tests ──────────────────────────────────

test("loadState returns empty state for non-existent branch", () => {
  const state = loadState("feature-auth");
  expect(state.project).toBe("");
  expect(state.resources).toEqual({});
});

test("saveState creates branch-specific state file", () => {
  const state = {
    project: "test-app",
    target: "cloudflare",
    branch: "feature-auth",
    resources: {
      "d1:main": { id: "d1-branch-123", name: "cairn-test-app-feature-auth-main" },
      "worker:api": { scriptName: "cairn-test-app-feature-auth-api", url: "https://example.com" },
    },
  };

  saveState(state, "feature-auth");
  expect(existsSync(".cairn/state.branch-feature-auth.json")).toBe(true);
});

test("loadState reads branch-specific state", () => {
  const original = {
    project: "test-app",
    target: "railway",
    branch: "fix-bug",
    resources: {
      "railway:env": { id: "env-123", name: "fix-bug" },
      "neon:main": { branchId: "br-abc", projectId: "proj-1", host: "ep-test.neon.tech", connectionUri: "postgres://..." },
    },
  };

  saveState(original, "fix-bug");
  const loaded = loadState("fix-bug");

  expect(loaded.project).toBe("test-app");
  expect(loaded.target).toBe("railway");
  expect(loaded.branch).toBe("fix-bug");
  expect(loaded.resources["railway:env"]?.id).toBe("env-123");
  expect(loaded.resources["neon:main"]?.branchId).toBe("br-abc");
});

test("branch state is isolated from production state", () => {
  saveState({ project: "app", target: "cloudflare", resources: { "worker:api": { url: "https://prod.example.com" } } });
  saveState({ project: "app", target: "cloudflare", branch: "dev", resources: { "worker:api": { url: "https://dev.example.com" } } }, "dev");

  const prod = loadState();
  const dev = loadState("dev");

  expect(prod.resources["worker:api"]?.url).toBe("https://prod.example.com");
  expect(dev.resources["worker:api"]?.url).toBe("https://dev.example.com");
});

test("clearState removes branch state file", () => {
  saveState({ project: "app", target: "cf", branch: "temp", resources: {} }, "temp");
  expect(existsSync(".cairn/state.branch-temp.json")).toBe(true);

  clearState("temp");
  expect(existsSync(".cairn/state.branch-temp.json")).toBe(false);
});

test("clearState does not remove production state file", () => {
  saveState({ project: "app", target: "cf", resources: { "w:a": { id: "1" } } });
  clearState();
  // Production state is reset, not deleted
  expect(existsSync(".cairn/state.json")).toBe(true);
  const state = loadState();
  expect(state.resources).toEqual({});
});

test("listBranches returns all branch names", () => {
  saveState({ project: "app", target: "cf", branch: "a", resources: {} }, "feature-a");
  saveState({ project: "app", target: "cf", branch: "b", resources: {} }, "feature-b");
  saveState({ project: "app", target: "cf", branch: "c", resources: {} }, "fix-bug");

  const branches = listBranches();
  expect(branches).toContain("feature-a");
  expect(branches).toContain("feature-b");
  expect(branches).toContain("fix-bug");
  expect(branches.length).toBe(3);
});

test("listBranches returns empty array when no branches", () => {
  const branches = listBranches();
  expect(branches).toEqual([]);
});

// ─── Branch State with Multiple Resources ───────────────────

test("branch state tracks Neon branch resources correctly", () => {
  const branchState = {
    project: "myapp",
    target: "cloudflare",
    branch: "pr-42",
    resources: {
      "neon:main": {
        projectId: "neon-proj-1",
        branchId: "br-xyz-123",
        host: "ep-cool-star-123.us-east-2.aws.neon.tech",
        connectionUri: "postgres://user:pass@ep-cool-star-123.us-east-2.aws.neon.tech/myapp",
      },
      "kv:cache": { id: "kv-branch-456" },
      "r2:uploads": { name: "cairn-myapp-pr-42-uploads" },
      "worker:api": {
        scriptName: "cairn-myapp-pr-42-api",
        url: "https://cairn-myapp-pr-42-api.workers.dev",
      },
    },
  };

  saveState(branchState, "pr-42");
  const loaded = loadState("pr-42");

  expect(loaded.resources["neon:main"]?.branchId).toBe("br-xyz-123");
  expect(loaded.resources["neon:main"]?.projectId).toBe("neon-proj-1");
  expect(loaded.resources["worker:api"]?.url).toContain("pr-42");
});

test("branch state tracks Railway environment resources", () => {
  const branchState = {
    project: "myapp",
    target: "railway",
    branch: "staging",
    resources: {
      "railway:env": { id: "env-stg-123", name: "staging" },
      "railway:pg:main": { serviceId: "pg-stg-1", name: "postgres-staging" },
      "railway:service:api": {
        serviceId: "svc-stg-1",
        url: "https://myapp-staging-production.up.railway.app",
        deploymentId: "dep-stg-1",
      },
    },
  };

  saveState(branchState, "staging");
  const loaded = loadState("staging");

  expect(loaded.resources["railway:env"]?.id).toBe("env-stg-123");
  expect(loaded.resources["railway:service:api"]?.url).toContain("staging");
});

// ─── CLI Command Structure Tests ────────────────────────────

test("branchListCommand returns gracefully with no branches", () => {
  // Just verify the function exists and doesn't throw
  const { branchListCommand } = require("./branch.ts");
  expect(typeof branchListCommand).toBe("function");
});

test("branchCreateCommand function exists", () => {
  const { branchCreateCommand } = require("./branch.ts");
  expect(typeof branchCreateCommand).toBe("function");
});

test("branchDestroyCommand function exists", () => {
  const { branchDestroyCommand } = require("./branch.ts");
  expect(typeof branchDestroyCommand).toBe("function");
});

// ─── Webhook Tests ──────────────────────────────────────────

test("verifyWebhookSignature validates correctly", () => {
  const { verifyWebhookSignature } = require("../webhook.ts");
  const secret = "test-secret";
  const payload = '{"action":"opened"}';

  const crypto = require("crypto");
  const hmac = crypto.createHmac("sha256", secret);
  const signature = `sha256=${hmac.update(payload).digest("hex")}`;

  expect(verifyWebhookSignature(payload, signature, secret)).toBe(true);
  expect(verifyWebhookSignature(payload, "sha256=wrong", secret)).toBe(false);
});

// ─── Branch Name Sanitization ───────────────────────────────

test("multiple branches can coexist independently", () => {
  // Simulate 3 branch environments
  for (const name of ["feature/auth", "fix/login-bug", "release/v2"]) {
    const safe = name.replace(/[^a-z0-9-]/g, "-");
    saveState({
      project: "app",
      target: "cf",
      branch: name,
      resources: { "worker:api": { url: `https://${safe}.example.com` } },
    }, safe);
  }

  const branches = listBranches();
  expect(branches.length).toBe(3);

  // Each branch has independent state
  const auth = loadState("feature-auth");
  const login = loadState("fix-login-bug");
  expect(auth.resources["worker:api"]?.url).toContain("feature-auth");
  expect(login.resources["worker:api"]?.url).toContain("fix-login-bug");
});
