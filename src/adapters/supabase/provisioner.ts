/**
 * Supabase provisioner
 * Create/delete projects via the Supabase Management API
 */

import { supabaseApi } from "./api.ts";

interface CreateProjectResult {
  projectId: string;
  name: string;
  region: string;
  endpoint: string;
  anonKey: string;
  serviceRoleKey: string;
  databaseUrl: string;
}

/**
 * Create a new Supabase project
 */
export async function createSupabaseProject(
  name: string,
  orgId: string,
  dbPassword: string,
  region?: string,
): Promise<CreateProjectResult> {
  const result = await supabaseApi<{
    id: string;
    name: string;
    region: string;
    endpoint: string;
    anon_key: string;
    service_role_key: string;
    database: { host: string };
  }>("POST", "/projects", {
    name,
    organization_id: orgId,
    db_pass: dbPassword,
    region: region || "us-east-1",
    plan: "free",
  });

  return {
    projectId: result.id,
    name: result.name,
    region: result.region,
    endpoint: result.endpoint || `https://${result.id}.supabase.co`,
    anonKey: result.anon_key || "",
    serviceRoleKey: result.service_role_key || "",
    databaseUrl: result.database?.host
      ? `postgresql://postgres:${dbPassword}@${result.database.host}:5432/postgres`
      : "",
  };
}

/**
 * Delete a Supabase project
 */
export async function deleteSupabaseProject(
  projectId: string,
): Promise<void> {
  await supabaseApi("DELETE", `/projects/${projectId}`);
}

/**
 * List all Supabase projects
 */
export async function listSupabaseProjects(): Promise<unknown[]> {
  return supabaseApi<unknown[]>("GET", "/projects");
}

/**
 * Get project API keys
 */
export async function getSupabaseApiKeys(
  projectId: string,
): Promise<{ anonKey: string; serviceRoleKey: string }> {
  const keys = await supabaseApi<Array<{ name: string; api_key: string }>>(
    "GET",
    `/projects/${projectId}/api-keys`,
  );

  const anon = keys.find((k) => k.name === "anon");
  const service = keys.find((k) => k.name === "service_role");

  return {
    anonKey: anon?.api_key || "",
    serviceRoleKey: service?.api_key || "",
  };
}
