/**
 * Neon Postgres provisioner
 * Create/delete projects and branches via the Neon API
 */

import { neonApi } from "./api.ts";

interface CreateProjectResult {
  projectId: string;
  branchId: string;
  databaseName: string;
  host: string;
  connectionUri: string;
}

interface CreateBranchResult {
  branchId: string;
  host: string;
}

/**
 * Create a Neon project with a default database
 */
export async function createNeonProject(
  name: string,
): Promise<CreateProjectResult> {
  const result = await neonApi<{
    project: { id: string };
    branch: { id: string };
    databases: { name: string }[];
    connection_uris: { connection_uri: string; connection_parameters: { host: string } }[];
  }>("POST", "/projects", {
    project: { name },
    branch: { database_name: name },
  });

  const uri = result.connection_uris[0];
  if (!uri) throw new Error("Neon API error: no connection URI returned");

  return {
    projectId: result.project.id,
    branchId: result.branch.id,
    databaseName: result.databases[0]?.name ?? name,
    host: uri.connection_parameters.host,
    connectionUri: uri.connection_uri,
  };
}

/**
 * Delete a Neon project
 */
export async function deleteNeonProject(projectId: string): Promise<void> {
  await neonApi("DELETE", `/projects/${projectId}`);
}

/**
 * Get the connection URI for a Neon project
 */
export async function getNeonConnectionUri(
  projectId: string,
  roleName: string,
  databaseName: string,
): Promise<string> {
  const params = new URLSearchParams({
    role_name: roleName,
    database_name: databaseName,
  });

  const result = await neonApi<{ uri: string }>(
    "GET",
    `/projects/${projectId}/connection_uri?${params.toString()}`,
  );

  return result.uri;
}

/**
 * Create a branch on a Neon project (for branch environments)
 */
export async function createNeonBranch(
  projectId: string,
  branchName: string,
): Promise<CreateBranchResult> {
  const result = await neonApi<{
    branch: { id: string };
    endpoints: { host: string }[];
  }>("POST", `/projects/${projectId}/branches`, {
    branch: { name: branchName },
  });

  return {
    branchId: result.branch.id,
    host: result.endpoints[0]?.host ?? "",
  };
}

/**
 * Delete a branch from a Neon project
 */
export async function deleteNeonBranch(
  projectId: string,
  branchId: string,
): Promise<void> {
  await neonApi("DELETE", `/projects/${projectId}/branches/${branchId}`);
}
