import { test, expect, beforeAll, afterAll } from "bun:test";
import { $ } from "bun";

const TEST_PORT = 3199;
let serverProc: any;
let cookies = "";

beforeAll(async () => {
  // Clean DB for fresh test
  await $`rm -f ${import.meta.dir}/.data/console.db ${import.meta.dir}/.data/console.db-wal ${import.meta.dir}/.data/console.db-shm`.quiet().nothrow();
  // Start server
  serverProc = Bun.spawn(["bun", "index.ts"], {
    cwd: import.meta.dir,
    env: { ...process.env, PORT: String(TEST_PORT) },
    stdout: "pipe",
    stderr: "pipe",
  });
  // Wait for server to start
  await new Promise((r) => setTimeout(r, 1500));
});

afterAll(() => {
  serverProc?.kill();
});

// Helper to make API calls
async function api(path: string, opts?: RequestInit & { noCookie?: boolean }) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts?.headers as Record<string, string>),
  };
  if (cookies && !opts?.noCookie) headers["Cookie"] = cookies;

  const res = await fetch(`http://localhost:${TEST_PORT}/api${path}`, {
    ...opts,
    headers,
  });

  // Capture cookies
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) {
    const match = setCookie.match(/cairn_session=([^;]+)/);
    if (match) cookies = `cairn_session=${match[1]}`;
  }

  return { status: res.status, data: await res.json() };
}

// ─── Auth Tests ──────────────────────────────────────────

test("GET /api/auth/me returns null when not logged in", async () => {
  const { data } = await api("/auth/me", { noCookie: true });
  expect(data.user).toBeNull();
});

test("POST /api/auth/signup creates user and sets session", async () => {
  const { status, data } = await api("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email: "test@cairn.dev", password: "password123", name: "Test" }),
  });
  expect(status).toBe(201);
  expect(data.user.email).toBe("test@cairn.dev");
  expect(data.user.name).toBe("Test");
});

test("GET /api/auth/me returns user when logged in", async () => {
  const { data } = await api("/auth/me");
  expect(data.user.email).toBe("test@cairn.dev");
});

test("POST /api/auth/signup rejects duplicate email", async () => {
  const { status, data } = await api("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email: "test@cairn.dev", password: "pass", name: "Dup" }),
  });
  expect(status).toBe(409);
  expect(data.error).toContain("already registered");
});

test("POST /api/auth/login works with correct credentials", async () => {
  // Clear cookies first
  cookies = "";
  const { status, data } = await api("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "test@cairn.dev", password: "password123" }),
  });
  expect(status).toBe(200);
  expect(data.user.email).toBe("test@cairn.dev");
});

test("POST /api/auth/login rejects wrong password", async () => {
  const { status } = await api("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "test@cairn.dev", password: "wrong" }),
    noCookie: true,
  });
  expect(status).toBe(401);
});

// ─── Project Tests ───────────────────────────────────────

let projectId: string;

test("POST /api/projects creates a project", async () => {
  const { status, data } = await api("/projects", {
    method: "POST",
    body: JSON.stringify({ name: "test-app", target: "railway" }),
  });
  expect(status).toBe(201);
  expect(data.project.name).toBe("test-app");
  projectId = data.project.id;
});

test("GET /api/projects lists user projects", async () => {
  const { data } = await api("/projects");
  expect(data.projects.length).toBeGreaterThanOrEqual(1);
  expect(data.projects.some((p: any) => p.name === "test-app")).toBe(true);
});

test("GET /api/projects/:id returns project detail", async () => {
  const { data } = await api(`/projects/${projectId}`);
  expect(data.project.name).toBe("test-app");
  expect(data.project.target).toBe("railway");
});

test("PUT /api/projects/:id/state syncs state", async () => {
  const state = {
    target: "railway",
    resources: {
      "railway:project": { id: "proj-123" },
      "railway:pg:main": { serviceId: "pg-1", name: "postgres-main" },
    },
  };
  const { data } = await api(`/projects/${projectId}/state`, {
    method: "PUT",
    body: JSON.stringify(state),
  });
  expect(data.ok).toBe(true);
});

test("GET /api/projects/:id/resources returns parsed resources", async () => {
  const { data } = await api(`/projects/${projectId}/resources`);
  expect(data.resources.length).toBe(2);
  expect(data.target).toBe("railway");
  expect(data.resources[0].type).toBe("railway");
});

// ─── Secrets Tests ───────────────────────────────────────

test("POST /api/projects/:id/secrets sets a secret", async () => {
  const { status } = await api(`/projects/${projectId}/secrets`, {
    method: "POST",
    body: JSON.stringify({ key: "DB_URL", value: "postgres://localhost" }),
  });
  expect(status).toBe(201);
});

test("GET /api/projects/:id/secrets lists keys (not values)", async () => {
  const { data } = await api(`/projects/${projectId}/secrets`);
  expect(data.secrets.length).toBe(1);
  expect(data.secrets[0].key).toBe("DB_URL");
  // Value should NOT be returned
  expect(data.secrets[0].value).toBeUndefined();
});

test("DELETE /api/projects/:id/secrets/:key removes secret", async () => {
  const { data } = await api(`/projects/${projectId}/secrets/DB_URL`, {
    method: "DELETE",
  });
  expect(data.ok).toBe(true);

  const { data: after } = await api(`/projects/${projectId}/secrets`);
  expect(after.secrets.length).toBe(0);
});

// ─── Deploy Tests ────────────────────────────────────────

test("POST /api/projects/:id/deploy triggers a deployment", async () => {
  const { status, data } = await api(`/projects/${projectId}/deploy`, {
    method: "POST",
  });
  expect(status).toBe(201);
  expect(data.deployment.status).toBe("queued");
});

test("GET /api/projects/:id/deployments lists deployments", async () => {
  const { data } = await api(`/projects/${projectId}/deployments`);
  expect(data.deployments.length).toBeGreaterThanOrEqual(1);
  expect(data.deployments[0].triggered_by).toBe("console");
});

// ─── Auth guard Tests ────────────────────────────────────

test("API returns 401 without auth", async () => {
  const { status } = await api("/projects", { noCookie: true });
  expect(status).toBe(401);
});

test("POST /api/auth/logout clears session", async () => {
  const { data } = await api("/auth/logout", { method: "POST" });
  expect(data.ok).toBe(true);
});

// ─── Cleanup ─────────────────────────────────────────────

test("DELETE /api/projects/:id deletes project", async () => {
  // Re-login
  await api("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "test@cairn.dev", password: "password123" }),
  });

  const { data } = await api(`/projects/${projectId}`, { method: "DELETE" });
  expect(data.ok).toBe(true);
});
