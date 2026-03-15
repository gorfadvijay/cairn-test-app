/**
 * Console Marketplace API
 * Serves the app catalog and handles installs from the web UI
 */

import { requireAuth } from "./auth.ts";
import * as db from "./db.ts";

// Inline catalog data (mirrors src/catalog but for the console API)
// In production, this would be a shared module or fetched from a registry service

interface MarketplaceApp {
  id: string;
  name: string;
  description: string;
  category: string;
  image: string;
  version: string;
  website: string;
  license: string;
  requires: { postgres?: boolean; redis?: boolean; storage?: boolean };
  port: number;
  healthCheck?: string;
}

const CATALOG: MarketplaceApp[] = [
  {
    id: "posthog",
    name: "PostHog",
    description: "Open-source product analytics, session recording, feature flags, and A/B testing",
    category: "analytics",
    image: "posthog/posthog:latest",
    version: "1.0.0",
    website: "https://posthog.com",
    license: "MIT",
    requires: { postgres: true, redis: true },
    port: 8000,
    healthCheck: "/_health",
  },
  {
    id: "plausible",
    name: "Plausible Analytics",
    description: "Lightweight, privacy-friendly web analytics — no cookies, GDPR compliant",
    category: "analytics",
    image: "ghcr.io/plausible/community-edition:latest",
    version: "1.0.0",
    website: "https://plausible.io",
    license: "AGPL-3.0",
    requires: { postgres: true },
    port: 8000,
    healthCheck: "/api/health",
  },
  {
    id: "n8n",
    name: "n8n",
    description: "Workflow automation tool — connect APIs, automate tasks, build integrations",
    category: "automation",
    image: "n8nio/n8n:latest",
    version: "1.0.0",
    website: "https://n8n.io",
    license: "Sustainable Use License",
    requires: { postgres: true },
    port: 5678,
    healthCheck: "/healthz",
  },
  {
    id: "gitea",
    name: "Gitea",
    description: "Lightweight self-hosted Git service — repositories, issues, pull requests, CI/CD",
    category: "developer-tools",
    image: "gitea/gitea:latest",
    version: "1.0.0",
    website: "https://gitea.io",
    license: "MIT",
    requires: { postgres: true, storage: true },
    port: 3000,
    healthCheck: "/api/healthz",
  },
  {
    id: "uptime-kuma",
    name: "Uptime Kuma",
    description: "Self-hosted monitoring tool — uptime checks, status pages, notifications",
    category: "monitoring",
    image: "louislam/uptime-kuma:latest",
    version: "1.0.0",
    website: "https://uptime.kuma.pet",
    license: "MIT",
    requires: {},
    port: 3001,
  },
  {
    id: "ghost",
    name: "Ghost",
    description: "Professional publishing platform — blogs, newsletters, memberships, and paid subscriptions",
    category: "cms",
    image: "ghost:5-alpine",
    version: "1.0.0",
    website: "https://ghost.org",
    license: "MIT",
    requires: { postgres: true },
    port: 2368,
  },
];

/** GET /api/marketplace */
export function getMarketplace(_req: Request): Response {
  // Group by category
  const categories: Record<string, MarketplaceApp[]> = {};
  for (const app of CATALOG) {
    if (!categories[app.category]) categories[app.category] = [];
    categories[app.category]!.push(app);
  }

  return Response.json({ apps: CATALOG, categories });
}

/** GET /api/marketplace/:id */
export function getMarketplaceApp(_req: Request, id: string): Response {
  const app = CATALOG.find((a) => a.id === id);
  if (!app) return Response.json({ error: "App not found" }, { status: 404 });
  return Response.json({ app });
}

/** POST /api/projects/:projectId/addons — install an app as addon */
export async function installAddon(req: Request, projectId: string): Promise<Response> {
  const user = requireAuth(req);
  if (user instanceof Response) return user;

  const project = db.getProjectById.get(projectId);
  if (!project || project.user_id !== user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const { appId } = await req.json();
  const app = CATALOG.find((a) => a.id === appId);
  if (!app) return Response.json({ error: "App not found" }, { status: 404 });

  // Check if already installed
  const existing = db.getAddonByApp.get(projectId, appId);
  if (existing) {
    return Response.json({ error: "App already installed" }, { status: 409 });
  }

  const addonId = crypto.randomUUID();
  db.createAddon.run(addonId, projectId, appId, app.version, "installed");

  return Response.json({
    addon: { id: addonId, appId, version: app.version, status: "installed" },
  }, { status: 201 });
}

/** GET /api/projects/:projectId/addons — list installed addons */
export function listAddons(req: Request, projectId: string): Response {
  const user = requireAuth(req);
  if (user instanceof Response) return user;

  const project = db.getProjectById.get(projectId);
  if (!project || project.user_id !== user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const addons = db.getAddonsByProject.all(projectId);
  // Enrich with catalog data
  const enriched = addons.map((a) => {
    const app = CATALOG.find((c) => c.id === a.app_id);
    return { ...a, app };
  });

  return Response.json({ addons: enriched });
}

/** DELETE /api/projects/:projectId/addons/:appId */
export function removeAddon(req: Request, projectId: string, appId: string): Response {
  const user = requireAuth(req);
  if (user instanceof Response) return user;

  const project = db.getProjectById.get(projectId);
  if (!project || project.user_id !== user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  db.deleteAddon.run(projectId, appId);
  return Response.json({ ok: true });
}
