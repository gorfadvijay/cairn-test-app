/**
 * TinyBird provisioner
 * Create/delete datasources via the TinyBird API
 */

import { getCredentials } from "./api.ts";
import { tinybirdApi } from "./api.ts";

interface CreateDatasourceResult {
  datasourceId: string;
  name: string;
}

/**
 * Create a new TinyBird datasource with a schema
 * TinyBird requires form-urlencoded POST for datasource creation
 */
export async function createTinybirdDatasource(
  name: string,
  schema: string,
): Promise<CreateDatasourceResult> {
  const creds = getCredentials();
  const host = creds.host || "api.tinybird.co";
  const baseUrl = host.startsWith("http") ? host : `https://${host}`;

  const body = new URLSearchParams({
    format: "csv",
    name,
    schema,
  });

  const res = await fetch(`${baseUrl}/v0/datasources`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.apiToken}`,
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TinyBird API error (${res.status}): ${text}`);
  }

  const result = await res.json() as { datasource: { id: string; name: string } };
  return {
    datasourceId: result.datasource.id,
    name: result.datasource.name,
  };
}

/**
 * Delete a TinyBird datasource
 */
export async function deleteTinybirdDatasource(
  name: string,
): Promise<void> {
  await tinybirdApi("DELETE", `/datasources/${name}`);
}

/**
 * List all TinyBird datasources
 */
export async function listTinybirdDatasources(): Promise<unknown[]> {
  const result = await tinybirdApi<{ datasources: unknown[] }>(
    "GET",
    "/datasources",
  );
  return result.datasources;
}
