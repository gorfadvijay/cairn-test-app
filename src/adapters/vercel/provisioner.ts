/**
 * Vercel provisioner
 * Create/delete projects via the Vercel API
 */

import { vercelApi } from "./api.ts";

interface CreateProjectResult {
  projectId: string;
  name: string;
  url: string;
}

/**
 * Create a new Vercel project
 */
export async function createVercelProject(
  name: string,
  framework?: string,
): Promise<CreateProjectResult> {
  const result = await vercelApi<{
    id: string;
    name: string;
    link?: { deployHooks?: unknown[] };
  }>("POST", "/v10/projects", {
    name,
    framework: framework || null,
  });

  return {
    projectId: result.id,
    name: result.name,
    url: `https://${result.name}.vercel.app`,
  };
}

/**
 * Delete a Vercel project
 */
export async function deleteVercelProject(
  projectId: string,
): Promise<void> {
  await vercelApi("DELETE", `/v9/projects/${projectId}`);
}

/**
 * Set environment variables on a Vercel project
 */
export async function setVercelEnvVars(
  projectId: string,
  envVars: Record<string, string>,
  target?: string[],
): Promise<void> {
  const envList = Object.entries(envVars).map(([key, value]) => ({
    key,
    value,
    type: "encrypted",
    target: target || ["production", "preview", "development"],
  }));

  await vercelApi("POST", `/v10/projects/${projectId}/env`, envList);
}

/**
 * List all Vercel projects
 */
export async function listVercelProjects(): Promise<unknown[]> {
  const result = await vercelApi<{ projects: unknown[] }>(
    "GET",
    "/v9/projects",
  );
  return result.projects;
}
