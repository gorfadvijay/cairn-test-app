/**
 * Generates Better Auth server code for dev and Cloudflare Workers.
 * Cairn auto-generates these scripts so users never touch auth boilerplate.
 */

import type { AuthConfig } from "../../parser/types.ts";

const AUTH_DEV_PORT = 4000;

/**
 * Build social provider OAuth redirect/callback helpers.
 * Generates the route handlers for /api/auth/oauth/:provider and /api/auth/oauth/:provider/callback
 */
function buildOAuthRoutes(providers: string[], mode: "dev" | "worker"): string {
  const social = providers.filter((p) => p !== "email");
  if (social.length === 0) return "";

  const providerChecks = social
    .map((p) => `"${p}"`)
    .join(", ");

  if (mode === "dev") {
    return `
      // OAuth: redirect to provider
      if (path.startsWith("/api/auth/oauth/") && request.method === "GET" && !path.includes("/callback")) {
        const provider = path.split("/").pop();
        const supported = [${providerChecks}];
        if (!supported.includes(provider)) return json({ error: "Unsupported provider: " + provider }, 400);

        const upper = provider.toUpperCase();
        const clientId = process.env[upper + "_CLIENT_ID"];
        if (!clientId) return json({ error: "Missing " + upper + "_CLIENT_ID env var" }, 400);

        const redirectUri = new URL(request.url).origin + "/api/auth/oauth/" + provider + "/callback";
        const state = generateToken();

        let authUrl;
        if (provider === "google") {
          authUrl = "https://accounts.google.com/o/oauth2/v2/auth?client_id=" + clientId + "&redirect_uri=" + encodeURIComponent(redirectUri) + "&response_type=code&scope=openid%20email%20profile&state=" + state;
        } else if (provider === "github") {
          authUrl = "https://github.com/login/oauth/authorize?client_id=" + clientId + "&redirect_uri=" + encodeURIComponent(redirectUri) + "&scope=user:email&state=" + state;
        } else {
          return json({ error: "OAuth not configured for " + provider }, 400);
        }

        return Response.redirect(authUrl, 302);
      }

      // OAuth: callback from provider
      if (path.includes("/api/auth/oauth/") && path.endsWith("/callback") && request.method === "GET") {
        const parts = path.split("/");
        const provider = parts[parts.length - 2];
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        if (!code) return json({ error: "Missing code parameter" }, 400);

        const upper = provider.toUpperCase();
        const clientId = process.env[upper + "_CLIENT_ID"] || "";
        const clientSecret = process.env[upper + "_CLIENT_SECRET"] || "";
        const redirectUri = url.origin + "/api/auth/oauth/" + provider + "/callback";

        let tokenUrl, userInfoUrl, tokenBody;
        if (provider === "google") {
          tokenUrl = "https://oauth2.googleapis.com/token";
          userInfoUrl = "https://www.googleapis.com/oauth2/v2/userinfo";
          tokenBody = "grant_type=authorization_code&code=" + code + "&redirect_uri=" + encodeURIComponent(redirectUri) + "&client_id=" + clientId + "&client_secret=" + clientSecret;
        } else if (provider === "github") {
          tokenUrl = "https://github.com/login/oauth/access_token";
          userInfoUrl = "https://api.github.com/user";
          tokenBody = "grant_type=authorization_code&code=" + code + "&redirect_uri=" + encodeURIComponent(redirectUri) + "&client_id=" + clientId + "&client_secret=" + clientSecret;
        } else {
          return json({ error: "Unsupported provider" }, 400);
        }

        // Exchange code for access token
        const tokenRes = await fetch(tokenUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
          body: tokenBody,
        });
        const tokenData = await tokenRes.json();
        const accessToken = tokenData.access_token;
        if (!accessToken) return json({ error: "Failed to get access token", details: tokenData }, 400);

        // Fetch user info
        const userRes = await fetch(userInfoUrl, {
          headers: { Authorization: "Bearer " + accessToken, "Accept": "application/json", "User-Agent": "Cairn-Auth" },
        });
        const profile = await userRes.json();

        let email, name, image;
        if (provider === "google") {
          email = profile.email;
          name = profile.name || email.split("@")[0];
          image = profile.picture || null;
        } else if (provider === "github") {
          email = profile.email;
          name = profile.name || profile.login;
          image = profile.avatar_url || null;
          // GitHub may not return email in profile — fetch from emails endpoint
          if (!email) {
            const emailRes = await fetch("https://api.github.com/user/emails", {
              headers: { Authorization: "Bearer " + accessToken, "Accept": "application/json", "User-Agent": "Cairn-Auth" },
            });
            const emails = await emailRes.json();
            const primary = emails.find(e => e.primary) || emails[0];
            email = primary?.email;
          }
        }

        if (!email) return json({ error: "Could not get email from provider" }, 400);

        // Find or create user
        let users = await sql\`SELECT id, name, email FROM auth_user WHERE email = \${email}\`;
        let userId;
        if (users.length === 0) {
          userId = generateId();
          await sql\`INSERT INTO auth_user (id, name, email, email_verified, image) VALUES (\${userId}, \${name}, \${email}, true, \${image})\`;
        } else {
          userId = users[0].id;
        }

        // Upsert account link
        const existingAccount = await sql\`SELECT id FROM auth_account WHERE user_id = \${userId} AND provider_id = \${provider}\`;
        if (existingAccount.length === 0) {
          await sql\`INSERT INTO auth_account (id, account_id, provider_id, user_id) VALUES (\${generateId()}, \${profile.id || profile.sub || userId}, \${provider}, \${userId})\`;
        }

        // Create session
        const token = generateToken();
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await sql\`INSERT INTO auth_session (id, expires_at, token, user_id) VALUES (\${generateId()}, \${expiresAt}, \${token}, \${userId})\`;

        // Redirect to frontend with token
        const appUrl = process.env.APP_URL || url.origin.replace(":" + ${AUTH_DEV_PORT}, ":3000");
        return Response.redirect(appUrl + "?token=" + token, 302);
      }
`;
  }

  // Worker mode (D1)
  return `
      // OAuth: redirect to provider
      if (path.startsWith("/api/auth/oauth/") && request.method === "GET" && !path.includes("/callback")) {
        const provider = path.split("/").pop();
        const supported = [${providerChecks}];
        if (!supported.includes(provider)) return json({ error: "Unsupported provider: " + provider }, 400);

        const upper = provider.toUpperCase();
        const clientId = env[upper + "_CLIENT_ID"];
        if (!clientId) return json({ error: "Missing " + upper + "_CLIENT_ID binding" }, 400);

        const redirectUri = new URL(request.url).origin + "/api/auth/oauth/" + provider + "/callback";
        const state = generateToken();

        let authUrl;
        if (provider === "google") {
          authUrl = "https://accounts.google.com/o/oauth2/v2/auth?client_id=" + clientId + "&redirect_uri=" + encodeURIComponent(redirectUri) + "&response_type=code&scope=openid%20email%20profile&state=" + state;
        } else if (provider === "github") {
          authUrl = "https://github.com/login/oauth/authorize?client_id=" + clientId + "&redirect_uri=" + encodeURIComponent(redirectUri) + "&scope=user:email&state=" + state;
        } else {
          return json({ error: "OAuth not configured for " + provider }, 400);
        }

        return Response.redirect(authUrl, 302);
      }

      // OAuth: callback from provider
      if (path.includes("/api/auth/oauth/") && path.endsWith("/callback") && request.method === "GET") {
        const parts = path.split("/");
        const provider = parts[parts.length - 2];
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        if (!code) return json({ error: "Missing code parameter" }, 400);

        const upper = provider.toUpperCase();
        const clientId = env[upper + "_CLIENT_ID"] || "";
        const clientSecret = env[upper + "_CLIENT_SECRET"] || "";
        const redirectUri = url.origin + "/api/auth/oauth/" + provider + "/callback";

        let tokenUrl, userInfoUrl, tokenBody;
        if (provider === "google") {
          tokenUrl = "https://oauth2.googleapis.com/token";
          userInfoUrl = "https://www.googleapis.com/oauth2/v2/userinfo";
          tokenBody = "grant_type=authorization_code&code=" + code + "&redirect_uri=" + encodeURIComponent(redirectUri) + "&client_id=" + clientId + "&client_secret=" + clientSecret;
        } else if (provider === "github") {
          tokenUrl = "https://github.com/login/oauth/access_token";
          userInfoUrl = "https://api.github.com/user";
          tokenBody = "grant_type=authorization_code&code=" + code + "&redirect_uri=" + encodeURIComponent(redirectUri) + "&client_id=" + clientId + "&client_secret=" + clientSecret;
        } else {
          return json({ error: "Unsupported provider" }, 400);
        }

        const tokenRes = await fetch(tokenUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
          body: tokenBody,
        });
        const tokenData = await tokenRes.json();
        const accessToken = tokenData.access_token;
        if (!accessToken) return json({ error: "Failed to get access token" }, 400);

        const userRes = await fetch(userInfoUrl, {
          headers: { Authorization: "Bearer " + accessToken, "Accept": "application/json", "User-Agent": "Cairn-Auth" },
        });
        const profile = await userRes.json();

        let email, profileName, image;
        if (provider === "google") {
          email = profile.email;
          profileName = profile.name || email.split("@")[0];
          image = profile.picture || null;
        } else if (provider === "github") {
          email = profile.email;
          profileName = profile.name || profile.login;
          image = profile.avatar_url || null;
          if (!email) {
            const emailRes = await fetch("https://api.github.com/user/emails", {
              headers: { Authorization: "Bearer " + accessToken, "Accept": "application/json", "User-Agent": "Cairn-Auth" },
            });
            const emails = await emailRes.json();
            const primary = emails.find(e => e.primary) || emails[0];
            email = primary?.email;
          }
        }

        if (!email) return json({ error: "Could not get email from provider" }, 400);

        const now = new Date().toISOString();
        let user = await db.prepare("SELECT id, name, email FROM user WHERE email = ?").bind(email).first();
        if (!user) {
          const userId = generateId();
          await db.prepare("INSERT INTO user (id, name, email, emailVerified, image, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?, ?)").bind(userId, profileName, email, image, now, now).run();
          user = { id: userId, name: profileName, email };
        }

        const existingAccount = await db.prepare("SELECT id FROM account WHERE userId = ? AND providerId = ?").bind(user.id, provider).first();
        if (!existingAccount) {
          await db.prepare("INSERT INTO account (id, accountId, providerId, userId, accessToken, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(generateId(), profile.id || profile.sub || user.id, provider, user.id, accessToken, now, now).run();
        }

        const token = generateToken();
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        await db.prepare("INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, userId) VALUES (?, ?, ?, ?, ?, ?)").bind(generateId(), expiresAt, token, now, now, user.id).run();

        const appUrl = env.APP_URL || url.origin;
        return Response.redirect(appUrl + "?token=" + token, 302);
      }
`;
}

/**
 * Build the auth dashboard HTML route.
 * Simple admin UI showing users, sessions, and providers.
 */
function buildDashboardRoute(providers: string[], mode: "dev" | "worker"): string {
  const providersList = JSON.stringify(providers);

  if (mode === "dev") {
    return `
      // Auth dashboard
      if (path === "/api/auth/dashboard" && request.method === "GET") {
        const users = await sql\`SELECT id, name, email, email_verified, image, created_at FROM auth_user ORDER BY created_at DESC LIMIT 100\`;
        const sessions = await sql\`SELECT s.id, s.token, s.expires_at, s.created_at, u.email FROM auth_session s JOIN auth_user u ON s.user_id = u.id ORDER BY s.created_at DESC LIMIT 100\`;
        const totalUsers = await sql\`SELECT COUNT(*) as count FROM auth_user\`;
        const activeSessions = await sql\`SELECT COUNT(*) as count FROM auth_session WHERE expires_at > now()\`;

        return new Response(dashboardHtml({
          users,
          sessions,
          totalUsers: totalUsers[0]?.count || 0,
          activeSessions: activeSessions[0]?.count || 0,
          providers: ${providersList},
        }), {
          headers: { "Content-Type": "text/html", "Access-Control-Allow-Origin": "*" },
        });
      }
`;
  }

  // Worker mode
  return `
      // Auth dashboard
      if (path === "/api/auth/dashboard" && request.method === "GET") {
        const { results: users } = await db.prepare("SELECT id, name, email, emailVerified, image, createdAt FROM user ORDER BY createdAt DESC LIMIT 100").all();
        const { results: sessions } = await db.prepare("SELECT s.id, s.token, s.expiresAt, s.createdAt, u.email FROM session s JOIN user u ON s.userId = u.id ORDER BY s.createdAt DESC LIMIT 100").all();
        const totalRow = await db.prepare("SELECT COUNT(*) as count FROM user").first();
        const activeRow = await db.prepare("SELECT COUNT(*) as count FROM session WHERE expiresAt > datetime('now')").first();

        return new Response(dashboardHtml({
          users,
          sessions,
          totalUsers: totalRow?.count || 0,
          activeSessions: activeRow?.count || 0,
          providers: ${providersList},
        }), {
          headers: { "Content-Type": "text/html", "Access-Control-Allow-Origin": "*" },
        });
      }
`;
}

/**
 * The dashboard HTML template function — shared between dev and Worker.
 */
function dashboardHtmlFunction(): string {
  return `
function dashboardHtml({ users, sessions, totalUsers, activeSessions, providers }) {
  const userRows = (Array.isArray(users) ? users : []).map(u =>
    "<tr><td>" + (u.email || "") + "</td><td>" + (u.name || "") + "</td><td>" + (u.created_at || u.createdAt || "") + "</td></tr>"
  ).join("");

  const sessionRows = (Array.isArray(sessions) ? sessions : []).map(s =>
    "<tr><td>" + (s.email || "") + "</td><td>" + (s.token || "").slice(0, 12) + "...</td><td>" + (s.expires_at || s.expiresAt || "") + "</td></tr>"
  ).join("");

  return \`<!DOCTYPE html>
<html>
<head>
  <title>Cairn Auth Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0f1117; color: #e4e4e7; padding: 2rem; }
    h1 { font-size: 1.5rem; margin-bottom: 1.5rem; color: #fff; }
    h2 { font-size: 1.1rem; margin: 1.5rem 0 0.75rem; color: #a1a1aa; }
    .stats { display: flex; gap: 1rem; margin-bottom: 1.5rem; }
    .stat { background: #1c1c22; border: 1px solid #27272a; border-radius: 8px; padding: 1rem 1.5rem; }
    .stat-value { font-size: 1.5rem; font-weight: bold; color: #22c55e; }
    .stat-label { font-size: 0.8rem; color: #71717a; margin-top: 0.25rem; }
    .providers { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
    .provider { background: #27272a; border-radius: 4px; padding: 0.25rem 0.75rem; font-size: 0.85rem; }
    table { width: 100%; border-collapse: collapse; background: #1c1c22; border-radius: 8px; overflow: hidden; }
    th { text-align: left; padding: 0.75rem 1rem; background: #27272a; color: #a1a1aa; font-size: 0.8rem; text-transform: uppercase; }
    td { padding: 0.75rem 1rem; border-top: 1px solid #27272a; font-size: 0.9rem; }
    tr:hover td { background: #27272a40; }
  </style>
</head>
<body>
  <h1>Cairn Auth Dashboard</h1>
  <div class="stats">
    <div class="stat"><div class="stat-value">\${totalUsers}</div><div class="stat-label">Total Users</div></div>
    <div class="stat"><div class="stat-value">\${activeSessions}</div><div class="stat-label">Active Sessions</div></div>
  </div>
  <div class="providers">\${providers.map(p => "<span class=\\"provider\\">" + p + "</span>").join("")}</div>
  <h2>Users</h2>
  <table><thead><tr><th>Email</th><th>Name</th><th>Created</th></tr></thead><tbody>\${userRows || "<tr><td colspan=3 style=\\"color:#71717a\\">No users yet</td></tr>"}</tbody></table>
  <h2>Active Sessions</h2>
  <table><thead><tr><th>User</th><th>Token</th><th>Expires</th></tr></thead><tbody>\${sessionRows || "<tr><td colspan=3 style=\\"color:#71717a\\">No sessions</td></tr>"}</tbody></table>
</body>
</html>\`;
}
`;
}

/**
 * Generates a standalone auth dev server.
 * Same lightweight API as the Worker version, backed by local Postgres via Bun.sql.
 */
export function generateDevAuthServer(
  auth: AuthConfig,
  dbUrl: string,
  port: number = AUTH_DEV_PORT,
): string {
  const oauthRoutes = buildOAuthRoutes(auth.providers, "dev");
  const dashboardRoute = buildDashboardRoute(auth.providers, "dev");

  return `
// Bun.sql auto-reads DATABASE_URL from env
const sql = Bun.sql;

// Wait for Postgres to be ready (Docker may still be initializing)
async function waitForDb(maxRetries = 15) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await sql\`SELECT 1\`;
      return;
    } catch {
      console.log("Waiting for Postgres... (" + (i + 1) + "/" + maxRetries + ")");
      await Bun.sleep(2000);
    }
  }
  throw new Error("Could not connect to Postgres");
}
await waitForDb();

// Auto-create auth tables on startup
await sql\`CREATE TABLE IF NOT EXISTS "auth_user" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "email_verified" BOOLEAN NOT NULL DEFAULT false,
  "image" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
)\`;
await sql\`CREATE TABLE IF NOT EXISTS "auth_session" (
  "id" TEXT PRIMARY KEY,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "ip_address" TEXT,
  "user_agent" TEXT,
  "user_id" TEXT NOT NULL REFERENCES "auth_user"("id") ON DELETE CASCADE
)\`;
await sql\`CREATE TABLE IF NOT EXISTS "auth_account" (
  "id" TEXT PRIMARY KEY,
  "account_id" TEXT NOT NULL,
  "provider_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL REFERENCES "auth_user"("id") ON DELETE CASCADE,
  "password" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
)\`;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

function generateId() { return crypto.randomUUID(); }

function generateToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

${dashboardHtmlFunction()}

const server = Bun.serve({
  port: ${port},
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") return json({ ok: true });

    try {
${oauthRoutes}
${dashboardRoute}
      if (path === "/api/auth/sign-up" && request.method === "POST") {
        const { email, password, name } = await request.json();
        if (!email || !password) return json({ error: "Email and password required" }, 400);

        const existing = await sql\`SELECT id FROM auth_user WHERE email = \${email}\`;
        if (existing.length > 0) return json({ error: "User already exists" }, 409);

        const userId = generateId();
        const hashedPw = await hashPassword(password);
        const displayName = name || email.split("@")[0];

        await sql\`INSERT INTO auth_user (id, name, email) VALUES (\${userId}, \${displayName}, \${email})\`;
        await sql\`INSERT INTO auth_account (id, account_id, provider_id, user_id, password) VALUES (\${generateId()}, \${userId}, 'credential', \${userId}, \${hashedPw})\`;

        const token = generateToken();
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await sql\`INSERT INTO auth_session (id, expires_at, token, user_id) VALUES (\${generateId()}, \${expiresAt}, \${token}, \${userId})\`;

        return json({ user: { id: userId, email, name: displayName }, token });
      }

      if (path === "/api/auth/sign-in" && request.method === "POST") {
        const { email, password } = await request.json();
        if (!email || !password) return json({ error: "Email and password required" }, 400);

        const users = await sql\`SELECT id, name, email FROM auth_user WHERE email = \${email}\`;
        if (users.length === 0) return json({ error: "Invalid credentials" }, 401);
        const user = users[0];

        const accounts = await sql\`SELECT password FROM auth_account WHERE user_id = \${user.id} AND provider_id = 'credential'\`;
        const hashedPw = await hashPassword(password);
        if (accounts.length === 0 || accounts[0].password !== hashedPw) return json({ error: "Invalid credentials" }, 401);

        const token = generateToken();
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await sql\`INSERT INTO auth_session (id, expires_at, token, user_id) VALUES (\${generateId()}, \${expiresAt}, \${token}, \${user.id})\`;

        return json({ user, token });
      }

      if (path === "/api/auth/session" && request.method === "GET") {
        const authHeader = request.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
        const token = authHeader.slice(7);

        const sessions = await sql\`SELECT s.*, u.id as uid, u.name, u.email FROM auth_session s JOIN auth_user u ON s.user_id = u.id WHERE s.token = \${token} AND s.expires_at > now()\`;
        if (sessions.length === 0) return json({ error: "Invalid or expired session" }, 401);
        const s = sessions[0];

        return json({ user: { id: s.uid, name: s.name, email: s.email }, session: { expiresAt: s.expires_at } });
      }

      if (path === "/api/auth/sign-out" && request.method === "POST") {
        const authHeader = request.headers.get("Authorization");
        if (authHeader?.startsWith("Bearer ")) {
          const token = authHeader.slice(7);
          await sql\`DELETE FROM auth_session WHERE token = \${token}\`;
        }
        return json({ ok: true });
      }

      if (path === "/api/auth/users" && request.method === "GET") {
        const users = await sql\`SELECT id, name, email, created_at FROM auth_user ORDER BY created_at DESC LIMIT 100\`;
        return json({ users });
      }

      if (path === "/") {
        return json({ service: "cairn-auth", status: "ok", providers: ${JSON.stringify(auth.providers)} });
      }

      return json({ error: "Not found" }, 404);
    } catch (e) {
      return json({ error: e.message || "Internal error" }, 500);
    }
  },
});

console.log(\`Auth server running on http://localhost:\${server.port}\`);
`;
}

/**
 * Generates a Cloudflare Worker auth API backed by D1.
 * Uses D1 directly (no Node.js deps) so it runs natively on Workers.
 * Compatible with Better Auth's API shape for easy migration.
 */
export function generateWorkerAuthScript(auth: AuthConfig): string {
  const oauthRoutes = buildOAuthRoutes(auth.providers, "worker");
  const dashboardRoute = buildDashboardRoute(auth.providers, "worker");

  return `
// Cairn Auth Worker — lightweight auth API backed by D1
// API-compatible with Better Auth for future migration

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

function generateId() {
  return crypto.randomUUID();
}

function generateToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

${dashboardHtmlFunction()}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const db = env.AUTH_DB;

    // CORS preflight
    if (request.method === "OPTIONS") {
      return json({ ok: true });
    }

    try {
${oauthRoutes}
${dashboardRoute}
      // POST /api/auth/sign-up — register
      if (path === "/api/auth/sign-up" && request.method === "POST") {
        const { email, password, name } = await request.json();
        if (!email || !password) return json({ error: "Email and password required" }, 400);

        const existing = await db.prepare("SELECT id FROM user WHERE email = ?").bind(email).first();
        if (existing) return json({ error: "User already exists" }, 409);

        const userId = generateId();
        const hashedPw = await hashPassword(password);
        const now = new Date().toISOString();

        await db.prepare(
          "INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 0, ?, ?)"
        ).bind(userId, name || email.split("@")[0], email, now, now).run();

        await db.prepare(
          "INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)"
        ).bind(generateId(), userId, "credential", userId, hashedPw, now, now).run();

        // Auto-create session
        const token = generateToken();
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

        await db.prepare(
          "INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, userId) VALUES (?, ?, ?, ?, ?, ?)"
        ).bind(generateId(), expiresAt, token, now, now, userId).run();

        return json({ user: { id: userId, email, name: name || email.split("@")[0] }, token });
      }

      // POST /api/auth/sign-in — login
      if (path === "/api/auth/sign-in" && request.method === "POST") {
        const { email, password } = await request.json();
        if (!email || !password) return json({ error: "Email and password required" }, 400);

        const user = await db.prepare("SELECT id, name, email FROM user WHERE email = ?").bind(email).first();
        if (!user) return json({ error: "Invalid credentials" }, 401);

        const account = await db.prepare(
          "SELECT password FROM account WHERE userId = ? AND providerId = 'credential'"
        ).bind(user.id).first();

        const hashedPw = await hashPassword(password);
        if (!account || account.password !== hashedPw) return json({ error: "Invalid credentials" }, 401);

        const token = generateToken();
        const now = new Date().toISOString();
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

        await db.prepare(
          "INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, userId) VALUES (?, ?, ?, ?, ?, ?)"
        ).bind(generateId(), expiresAt, token, now, now, user.id).run();

        return json({ user, token });
      }

      // GET /api/auth/session — get current session
      if (path === "/api/auth/session" && request.method === "GET") {
        const authHeader = request.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

        const token = authHeader.slice(7);
        const session = await db.prepare(
          "SELECT s.*, u.id as uid, u.name, u.email FROM session s JOIN user u ON s.userId = u.id WHERE s.token = ? AND s.expiresAt > datetime('now')"
        ).bind(token).first();

        if (!session) return json({ error: "Invalid or expired session" }, 401);

        return json({ user: { id: session.uid, name: session.name, email: session.email }, session: { expiresAt: session.expiresAt } });
      }

      // POST /api/auth/sign-out — logout
      if (path === "/api/auth/sign-out" && request.method === "POST") {
        const authHeader = request.headers.get("Authorization");
        if (authHeader?.startsWith("Bearer ")) {
          const token = authHeader.slice(7);
          await db.prepare("DELETE FROM session WHERE token = ?").bind(token).run();
        }
        return json({ ok: true });
      }

      // GET /api/auth/users — list users (admin)
      if (path === "/api/auth/users" && request.method === "GET") {
        const { results } = await db.prepare("SELECT id, name, email, createdAt FROM user ORDER BY createdAt DESC LIMIT 100").all();
        return json({ users: results });
      }

      // GET / — health check
      if (path === "/") {
        return json({ service: "cairn-auth", status: "ok", providers: ${JSON.stringify(auth.providers)} });
      }

      return json({ error: "Not found" }, 404);
    } catch (e) {
      return json({ error: e.message || "Internal error" }, 500);
    }
  },
};
`;
}

/** The default port for the auth dev server */
export { AUTH_DEV_PORT };
