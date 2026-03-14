import { test, expect, describe } from "bun:test";
import {
  generateDevAuthServer,
  generateWorkerAuthScript,
  AUTH_DEV_PORT,
} from "./generate.ts";
import { generateAuthClient } from "./client.ts";
import type { AuthConfig } from "../../parser/types.ts";

function makeAuth(overrides: Partial<AuthConfig> = {}): AuthConfig {
  return {
    name: "main",
    providers: ["email"],
    session: "database",
    ...overrides,
  };
}

describe("generateDevAuthServer", () => {
  test("generates Bun.sql-backed server", () => {
    const code = generateDevAuthServer(
      makeAuth(),
      "postgres://cairn:cairn@localhost:5432/main",
    );
    expect(code).toContain("Bun.sql");
    expect(code).toContain(`port: ${AUTH_DEV_PORT}`);
  });

  test("auto-creates auth tables on startup", () => {
    const code = generateDevAuthServer(
      makeAuth(),
      "postgres://cairn:cairn@localhost:5432/main",
    );
    expect(code).toContain("CREATE TABLE IF NOT EXISTS");
    expect(code).toContain("auth_user");
    expect(code).toContain("auth_session");
    expect(code).toContain("auth_account");
  });

  test("includes sign-up endpoint", () => {
    const code = generateDevAuthServer(
      makeAuth(),
      "postgres://cairn:cairn@localhost:5432/main",
    );
    expect(code).toContain("/api/auth/sign-up");
  });

  test("includes sign-in endpoint", () => {
    const code = generateDevAuthServer(
      makeAuth(),
      "postgres://cairn:cairn@localhost:5432/main",
    );
    expect(code).toContain("/api/auth/sign-in");
  });

  test("uses custom port", () => {
    const code = generateDevAuthServer(
      makeAuth(),
      "postgres://cairn:cairn@localhost:5432/main",
      4500,
    );
    expect(code).toContain("port: 4500");
  });

  test("includes providers in health check", () => {
    const code = generateDevAuthServer(
      makeAuth({ providers: ["email", "google"] }),
      "postgres://cairn:cairn@localhost:5432/main",
    );
    expect(code).toContain('"email"');
    expect(code).toContain('"google"');
  });

  test("includes CORS headers", () => {
    const code = generateDevAuthServer(
      makeAuth(),
      "postgres://cairn:cairn@localhost:5432/main",
    );
    expect(code).toContain("Access-Control-Allow-Origin");
  });

  test("includes OAuth routes when social providers present", () => {
    const code = generateDevAuthServer(
      makeAuth({ providers: ["email", "google", "github"] }),
      "postgres://cairn:cairn@localhost:5432/main",
    );
    expect(code).toContain("/api/auth/oauth/");
    expect(code).toContain("accounts.google.com");
    expect(code).toContain("github.com/login/oauth");
    expect(code).toContain("/callback");
  });

  test("does not include OAuth routes for email-only", () => {
    const code = generateDevAuthServer(
      makeAuth({ providers: ["email"] }),
      "postgres://cairn:cairn@localhost:5432/main",
    );
    expect(code).not.toContain("/api/auth/oauth/");
  });

  test("includes auth dashboard route", () => {
    const code = generateDevAuthServer(
      makeAuth(),
      "postgres://cairn:cairn@localhost:5432/main",
    );
    expect(code).toContain("/api/auth/dashboard");
    expect(code).toContain("dashboardHtml");
    expect(code).toContain("Total Users");
    expect(code).toContain("Active Sessions");
  });
});

describe("generateWorkerAuthScript", () => {
  test("generates Cloudflare Worker format", () => {
    const code = generateWorkerAuthScript(makeAuth());
    expect(code).toContain("export default");
    expect(code).toContain("async fetch(request, env)");
    expect(code).toContain("env.AUTH_DB");
  });

  test("includes sign-up endpoint", () => {
    const code = generateWorkerAuthScript(makeAuth());
    expect(code).toContain("/api/auth/sign-up");
    expect(code).toContain("INSERT INTO user");
  });

  test("includes sign-in endpoint", () => {
    const code = generateWorkerAuthScript(makeAuth());
    expect(code).toContain("/api/auth/sign-in");
    expect(code).toContain("Invalid credentials");
  });

  test("includes session endpoint", () => {
    const code = generateWorkerAuthScript(makeAuth());
    expect(code).toContain("/api/auth/session");
    expect(code).toContain("Bearer");
  });

  test("includes sign-out endpoint", () => {
    const code = generateWorkerAuthScript(makeAuth());
    expect(code).toContain("/api/auth/sign-out");
    expect(code).toContain("DELETE FROM session");
  });

  test("includes health check with providers", () => {
    const code = generateWorkerAuthScript(
      makeAuth({ providers: ["email", "google"] }),
    );
    expect(code).toContain("cairn-auth");
    expect(code).toContain('"email"');
    expect(code).toContain('"google"');
  });

  test("includes users list endpoint", () => {
    const code = generateWorkerAuthScript(makeAuth());
    expect(code).toContain("/api/auth/users");
    expect(code).toContain("SELECT id, name, email");
  });

  test("includes CORS headers", () => {
    const code = generateWorkerAuthScript(makeAuth());
    expect(code).toContain("Access-Control-Allow-Origin");
  });

  test("includes OAuth routes for social providers", () => {
    const code = generateWorkerAuthScript(
      makeAuth({ providers: ["email", "github"] }),
    );
    expect(code).toContain("/api/auth/oauth/");
    expect(code).toContain("github.com/login/oauth");
    expect(code).toContain("/callback");
  });

  test("includes dashboard route", () => {
    const code = generateWorkerAuthScript(makeAuth());
    expect(code).toContain("/api/auth/dashboard");
    expect(code).toContain("dashboardHtml");
  });
});

describe("generateAuthClient", () => {
  test("generates typed auth client", () => {
    const code = generateAuthClient(makeAuth());
    expect(code).toContain("authClient");
    expect(code).toContain("signUp");
    expect(code).toContain("signIn");
    expect(code).toContain("getSession");
    expect(code).toContain("signOut");
    expect(code).toContain("listUsers");
  });

  test("includes TypeScript types", () => {
    const code = generateAuthClient(makeAuth());
    expect(code).toContain("interface AuthUser");
    expect(code).toContain("interface AuthSession");
    expect(code).toContain("interface SessionInfo");
  });

  test("reads AUTH_URL from env", () => {
    const code = generateAuthClient(makeAuth());
    expect(code).toContain("process.env.AUTH_URL");
    expect(code).toContain("http://localhost:4000");
  });

  test("includes OAuth URL helper for social providers", () => {
    const code = generateAuthClient(
      makeAuth({ providers: ["email", "google", "github"] }),
    );
    expect(code).toContain("getOAuthUrl");
    expect(code).toContain('"google"');
    expect(code).toContain('"github"');
  });

  test("does not include OAuth URL helper for email-only", () => {
    const code = generateAuthClient(makeAuth({ providers: ["email"] }));
    expect(code).not.toContain("getOAuthUrl");
  });

  test("includes dashboard URL", () => {
    const code = generateAuthClient(makeAuth());
    expect(code).toContain("dashboardUrl");
    expect(code).toContain("/api/auth/dashboard");
  });

  test("exports default", () => {
    const code = generateAuthClient(makeAuth());
    expect(code).toContain("export default authClient");
  });
});
