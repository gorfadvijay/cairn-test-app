/**
 * Cairn Console — Web Dashboard
 * Bun.serve() with HTML imports + REST API
 */

import index from "./index.html";
import { handleSignup, handleLogin, handleLogout, handleMe } from "./auth.ts";
import {
  listProjects,
  createProject,
  getProject,
  deleteProjectHandler,
  syncState,
  triggerDeploy,
  listDeployments,
  listResources,
  listSecrets,
  setSecretHandler,
  deleteSecretHandler,
  listBranches,
  createBranchHandler,
  updateBranchHandler,
  deleteBranchHandler,
  listTeam,
  addTeamMemberHandler,
} from "./api.ts";
import { getMetrics } from "./metrics.ts";
import { getMarketplace, getMarketplaceApp, installAddon, listAddons, removeAddon } from "./marketplace.ts";
import { getBilling, createCheckout, handleWebhook } from "./billing.ts";

const PORT = process.env.PORT || 3100;
const isDev = process.env.NODE_ENV !== "production";
const ALLOWED_ORIGINS = process.env.CONSOLE_URL
  ? [process.env.CONSOLE_URL]
  : ["http://localhost:3100"];

/** Add CORS and security headers to response */
function withHeaders(res: Response, req: Request): Response {
  const origin = req.headers.get("Origin") || "";
  if (ALLOWED_ORIGINS.includes(origin) || isDev) {
    res.headers.set("Access-Control-Allow-Origin", origin || "*");
    res.headers.set("Access-Control-Allow-Credentials", "true");
  }
  if (!isDev) {
    res.headers.set("X-Content-Type-Options", "nosniff");
    res.headers.set("X-Frame-Options", "DENY");
    res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  }
  return res;
}

/** Extract path params from URL pattern matching */
function matchRoute(
  pathname: string,
  pattern: string,
): Record<string, string> | null {
  const patternParts = pattern.split("/");
  const pathParts = pathname.split("/");

  if (patternParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i]!.startsWith(":")) {
      params[patternParts[i]!.slice(1)] = pathParts[i]!;
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

const server = Bun.serve({
  port: PORT,
  routes: {
    "/": index,
    "/login": index,
    "/signup": index,
    "/projects": index,
    "/projects/*": index,
    "/billing": index,
    "/marketplace": index,
    "/health": () => Response.json({ status: "ok", uptime: process.uptime() }),
    "/api/health": () => Response.json({ status: "ok", uptime: process.uptime() }),
  },
  async fetch(req) {
    const url = new URL(req.url);
    const { pathname } = url;
    const method = req.method;

    // ─── CORS preflight ──────────────────────
    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": req.headers.get("Origin") || "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // ─── Health check (for Railway/deploy targets) ───
    if (pathname === "/health" || pathname === "/api/health") {
      return Response.json({ status: "ok", uptime: process.uptime() });
    }

    // ─── Auth API ──────────────────────────
    if (pathname === "/api/auth/signup" && method === "POST") return withHeaders(await handleSignup(req), req);
    if (pathname === "/api/auth/login" && method === "POST") return withHeaders(await handleLogin(req), req);
    if (pathname === "/api/auth/logout" && method === "POST") return withHeaders(handleLogout(req), req);
    if (pathname === "/api/auth/me" && method === "GET") return withHeaders(handleMe(req), req);

    // ─── Projects API ──────────────────────
    if (pathname === "/api/projects" && method === "GET") return withHeaders(listProjects(req), req);
    if (pathname === "/api/projects" && method === "POST") return withHeaders(await createProject(req), req);

    // Project-specific routes
    let params = matchRoute(pathname, "/api/projects/:id");
    if (params) {
      if (method === "GET") return withHeaders(getProject(req, params.id!), req);
      if (method === "DELETE") return withHeaders(deleteProjectHandler(req, params.id!), req);
    }

    params = matchRoute(pathname, "/api/projects/:id/state");
    if (params && method === "PUT") return withHeaders(await syncState(req, params.id!), req);

    params = matchRoute(pathname, "/api/projects/:id/deploy");
    if (params && method === "POST") return withHeaders(await triggerDeploy(req, params.id!), req);

    params = matchRoute(pathname, "/api/projects/:id/deployments");
    if (params && method === "GET") return withHeaders(listDeployments(req, params.id!), req);

    params = matchRoute(pathname, "/api/projects/:id/resources");
    if (params && method === "GET") return withHeaders(listResources(req, params.id!), req);

    // Secrets
    params = matchRoute(pathname, "/api/projects/:id/secrets");
    if (params) {
      if (method === "GET") return withHeaders(listSecrets(req, params.id!), req);
      if (method === "POST") return withHeaders(await setSecretHandler(req, params.id!), req);
    }

    params = matchRoute(pathname, "/api/projects/:id/secrets/:key");
    if (params && method === "DELETE") {
      return withHeaders(deleteSecretHandler(req, params.id!, params.key!), req);
    }

    // Branches
    params = matchRoute(pathname, "/api/projects/:id/branches");
    if (params) {
      if (method === "GET") return withHeaders(listBranches(req, params.id!), req);
      if (method === "POST") return withHeaders(await createBranchHandler(req, params.id!), req);
    }

    params = matchRoute(pathname, "/api/projects/:id/branches/:name");
    if (params) {
      if (method === "PUT") return withHeaders(await updateBranchHandler(req, params.id!, params.name!), req);
      if (method === "DELETE") return withHeaders(deleteBranchHandler(req, params.id!, params.name!), req);
    }

    // Team
    params = matchRoute(pathname, "/api/projects/:id/team");
    if (params) {
      if (method === "GET") return withHeaders(listTeam(req, params.id!), req);
      if (method === "POST") return withHeaders(await addTeamMemberHandler(req, params.id!), req);
    }

    // Metrics
    params = matchRoute(pathname, "/api/projects/:id/metrics");
    if (params && method === "GET") return withHeaders(await getMetrics(req, params.id!), req);

    // Marketplace
    if (pathname === "/api/marketplace" && method === "GET") return withHeaders(getMarketplace(req), req);

    params = matchRoute(pathname, "/api/marketplace/:id");
    if (params && method === "GET") return withHeaders(getMarketplaceApp(req, params.id!), req);

    // Addons (installed apps per project)
    params = matchRoute(pathname, "/api/projects/:id/addons");
    if (params) {
      if (method === "GET") return withHeaders(listAddons(req, params.id!), req);
      if (method === "POST") return withHeaders(await installAddon(req, params.id!), req);
    }

    params = matchRoute(pathname, "/api/projects/:id/addons/:appId");
    if (params && method === "DELETE") return withHeaders(removeAddon(req, params.id!, params.appId!), req);

    // Billing
    if (pathname === "/api/billing" && method === "GET") return withHeaders(getBilling(req), req);
    if (pathname === "/api/billing/checkout" && method === "POST") return withHeaders(await createCheckout(req), req);
    if (pathname === "/api/billing/webhook" && method === "POST") return withHeaders(await handleWebhook(req), req);

    return new Response("Not Found", { status: 404 });
  },
  development: isDev ? { hmr: true, console: true } : false,
});

console.log(`⛰  Cairn Console running at http://localhost:${server.port} [${isDev ? "dev" : "production"}]`);
