/**
 * Turso SQLite provisioner
 * Create/delete databases via the Turso API
 */

import { tursoApi } from "./api.ts";

interface CreateDatabaseResult {
  databaseId: string;
  name: string;
  hostname: string;
  connectionUrl: string;
}

/**
 * Create a new Turso database
 */
export async function createTursoDatabase(
  name: string,
  group?: string,
): Promise<CreateDatabaseResult> {
  // Ensure group exists — create if not
  const targetGroup = group || "default";
  try {
    await tursoApi("GET", `/groups/${targetGroup}`);
  } catch {
    await tursoApi("POST", "/groups", {
      name: targetGroup,
      location: "aws-us-east-1",
    });
  }

  const result = await tursoApi<{
    database: {
      DbId: string;
      Name: string;
      Hostname: string;
    };
  }>("POST", "/databases", {
    name,
    group: targetGroup,
  });

  const db = result.database;
  return {
    databaseId: db.DbId,
    name: db.Name,
    hostname: db.Hostname,
    connectionUrl: `libsql://${db.Hostname}`,
  };
}

/**
 * Delete a Turso database
 */
export async function deleteTursoDatabase(name: string): Promise<void> {
  await tursoApi("DELETE", `/databases/${name}`);
}

/**
 * Create an auth token for a database
 */
export async function createTursoDatabaseToken(
  dbName: string,
): Promise<string> {
  const result = await tursoApi<{ jwt: string }>(
    "POST",
    `/databases/${dbName}/auth/tokens`,
  );
  return result.jwt;
}

/**
 * List all Turso databases
 */
export async function listTursoDatabases(): Promise<unknown[]> {
  const result = await tursoApi<{ databases: unknown[] }>("GET", "/databases");
  return result.databases;
}
