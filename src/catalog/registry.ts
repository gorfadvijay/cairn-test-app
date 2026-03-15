/**
 * App Store — Template Registry
 * Curated catalog of open-source tools with pre-built cairn.hcl configs
 */

export interface AppTemplate {
  /** Unique slug (e.g. "posthog") */
  id: string;
  /** Display name */
  name: string;
  /** Short description */
  description: string;
  /** Category for marketplace UI */
  category: "analytics" | "automation" | "developer-tools" | "monitoring" | "communication" | "cms";
  /** Docker image to deploy */
  image: string;
  /** Current template version */
  version: string;
  /** Website URL */
  website: string;
  /** License */
  license: string;
  /** Required infrastructure */
  requires: {
    postgres?: boolean;
    redis?: boolean;
    storage?: boolean;
  };
  /** Environment variables the app needs (key → description) */
  envVars: Record<string, { description: string; default?: string; required?: boolean }>;
  /** Port the app listens on */
  port: number;
  /** Health check path */
  healthCheck?: string;
  /** Generated cairn.hcl content */
  toHcl(projectName: string): string;
}

/** Import all templates */
import { posthog } from "./templates/posthog.ts";
import { plausible } from "./templates/plausible.ts";
import { n8n } from "./templates/n8n.ts";
import { gitea } from "./templates/gitea.ts";
import { uptimeKuma } from "./templates/uptime-kuma.ts";
import { ghost } from "./templates/ghost.ts";

/** All available templates indexed by ID */
export const catalog: Record<string, AppTemplate> = {
  posthog,
  plausible,
  n8n,
  gitea,
  "uptime-kuma": uptimeKuma,
  ghost,
};

/** Get a template by ID */
export function getTemplate(id: string): AppTemplate | undefined {
  return catalog[id];
}

/** List all templates */
export function listTemplates(): AppTemplate[] {
  return Object.values(catalog);
}

/** List templates by category */
export function listByCategory(category: string): AppTemplate[] {
  return listTemplates().filter((t) => t.category === category);
}

/** Search templates by name or description */
export function searchTemplates(query: string): AppTemplate[] {
  const q = query.toLowerCase();
  return listTemplates().filter(
    (t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.id.includes(q),
  );
}

/** Get all unique categories */
export function getCategories(): string[] {
  return [...new Set(listTemplates().map((t) => t.category))];
}
