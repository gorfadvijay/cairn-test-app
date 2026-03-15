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
  },
  async fetch(req) {
    const url = new URL(req.url);
    const { pathname } = url;
    const method = req.method;

    // ─── Auth API ──────────────────────────
    if (pathname === "/api/auth/signup" && method === "POST") return handleSignup(req);
    if (pathname === "/api/auth/login" && method === "POST") return handleLogin(req);
    if (pathname === "/api/auth/logout" && method === "POST") return handleLogout(req);
    if (pathname === "/api/auth/me" && method === "GET") return handleMe(req);

    // ─── Projects API ──────────────────────
    if (pathname === "/api/projects" && method === "GET") return listProjects(req);
    if (pathname === "/api/projects" && method === "POST") return createProject(req);

    // Project-specific routes
    let params = matchRoute(pathname, "/api/projects/:id");
    if (params) {
      if (method === "GET") return getProject(req, params.id!);
      if (method === "DELETE") return deleteProjectHandler(req, params.id!);
    }

    params = matchRoute(pathname, "/api/projects/:id/state");
    if (params && method === "PUT") return syncState(req, params.id!);

    params = matchRoute(pathname, "/api/projects/:id/deploy");
    if (params && method === "POST") return triggerDeploy(req, params.id!);

    params = matchRoute(pathname, "/api/projects/:id/deployments");
    if (params && method === "GET") return listDeployments(req, params.id!);

    params = matchRoute(pathname, "/api/projects/:id/resources");
    if (params && method === "GET") return listResources(req, params.id!);

    // Secrets
    params = matchRoute(pathname, "/api/projects/:id/secrets");
    if (params) {
      if (method === "GET") return listSecrets(req, params.id!);
      if (method === "POST") return setSecretHandler(req, params.id!);
    }

    params = matchRoute(pathname, "/api/projects/:id/secrets/:key");
    if (params && method === "DELETE") {
      return deleteSecretHandler(req, params.id!, params.key!);
    }

    // Branches
    params = matchRoute(pathname, "/api/projects/:id/branches");
    if (params) {
      if (method === "GET") return listBranches(req, params.id!);
      if (method === "POST") return createBranchHandler(req, params.id!);
    }

    params = matchRoute(pathname, "/api/projects/:id/branches/:name");
    if (params) {
      if (method === "PUT") return updateBranchHandler(req, params.id!, params.name!);
      if (method === "DELETE") return deleteBranchHandler(req, params.id!, params.name!);
    }

    // Team
    params = matchRoute(pathname, "/api/projects/:id/team");
    if (params) {
      if (method === "GET") return listTeam(req, params.id!);
      if (method === "POST") return addTeamMemberHandler(req, params.id!);
    }

    // Metrics
    params = matchRoute(pathname, "/api/projects/:id/metrics");
    if (params && method === "GET") return getMetrics(req, params.id!);

    // Marketplace
    if (pathname === "/api/marketplace" && method === "GET") return getMarketplace(req);

    params = matchRoute(pathname, "/api/marketplace/:id");
    if (params && method === "GET") return getMarketplaceApp(req, params.id!);

    // Addons (installed apps per project)
    params = matchRoute(pathname, "/api/projects/:id/addons");
    if (params) {
      if (method === "GET") return listAddons(req, params.id!);
      if (method === "POST") return installAddon(req, params.id!);
    }

    params = matchRoute(pathname, "/api/projects/:id/addons/:appId");
    if (params && method === "DELETE") return removeAddon(req, params.id!, params.appId!);

    // Billing
    if (pathname === "/api/billing" && method === "GET") return getBilling(req);
    if (pathname === "/api/billing/checkout" && method === "POST") return createCheckout(req);
    if (pathname === "/api/billing/webhook" && method === "POST") return handleWebhook(req);

    return new Response("Not Found", { status: 404 });
  },
  development: process.env.NODE_ENV !== "production" ? {
    hmr: true,
    console: true,
  } : false,
});

console.log(`⛰  Cairn Console running at http://localhost:${server.port}`);
