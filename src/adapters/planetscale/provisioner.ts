/**
 * PlanetScale MySQL provisioner
 * Create/delete databases via the PlanetScale API
 */

import { planetscaleApi } from "./api.ts";

interface CreateDatabaseResult {
  databaseId: string;
  name: string;
  region: string;
  defaultBranch: string;
}

/**
 * Create a new PlanetScale database
 */
export async function createPlanetScaleDatabase(
  name: string,
  region?: string,
): Promise<CreateDatabaseResult> {
  const result = await planetscaleApi<{
    id: string;
    name: string;
    region: { slug: string };
    default_branch: { name: string };
  }>("POST", "/databases", {
    name,
    region: region || "us-east",
    cluster_size: "PS_10",
  });

  return {
    databaseId: result.id,
    name: result.name,
    region: result.region.slug,
    defaultBranch: result.default_branch.name,
  };
}

/**
 * Delete a PlanetScale database
 */
export async function deletePlanetScaleDatabase(
  name: string,
): Promise<void> {
  await planetscaleApi("DELETE", `/databases/${name}`);
}

/**
 * Create a connection string (password) for a database branch
 */
export async function createPlanetScalePassword(
  dbName: string,
  branch?: string,
): Promise<{ hostname: string; username: string; password: string; connectionUrl: string }> {
  const result = await planetscaleApi<{
    id: string;
    hostname: string;
    username: string;
    plain_text: string;
    database_branch: { name: string };
  }>("POST", `/databases/${dbName}/passwords`, {
    branch: branch || "main",
    name: "cairn-auto",
    role: "readwriter",
  });

  const connectionUrl = `mysql://${result.username}:${result.plain_text}@${result.hostname}/${dbName}?ssl={"rejectUnauthorized":true}`;

  return {
    hostname: result.hostname,
    username: result.username,
    password: result.plain_text,
    connectionUrl,
  };
}

/**
 * List all PlanetScale databases
 */
export async function listPlanetScaleDatabases(): Promise<unknown[]> {
  const result = await planetscaleApi<{ data: unknown[] }>("GET", "/databases");
  return result.data;
}
