/**
 * Upstash Redis provisioner
 * Create, delete, and list Redis databases via the Upstash API
 */

import { upstashApi } from "./api.ts";

interface CreateRedisResult {
  databaseId: string;
  endpoint: string;
  port: number;
  password: string;
  restUrl: string;
  restToken: string;
}

/**
 * Create a new Upstash Redis database
 */
export async function createUpstashRedis(
  name: string,
  region?: string,
): Promise<CreateRedisResult> {
  const result = await upstashApi<{
    database_id: string;
    endpoint: string;
    port: number;
    password: string;
    rest_url: string;
    rest_token: string;
  }>("POST", "/redis/database", {
    name,
    primary_region: region || "us-east-1",
    read_regions: [],
    platform: "aws",
    tls: true,
  });

  return {
    databaseId: result.database_id,
    endpoint: result.endpoint,
    port: result.port,
    password: result.password,
    restUrl: result.rest_url,
    restToken: result.rest_token,
  };
}

/**
 * Delete an Upstash Redis database
 */
export async function deleteUpstashRedis(databaseId: string): Promise<void> {
  await upstashApi("DELETE", `/redis/database/${databaseId}`);
}

/**
 * Build a Redis connection string from database details
 */
export function getUpstashRedisUrl(
  endpoint: string,
  port: number,
  password: string,
): string {
  return `rediss://:${password}@${endpoint}:${port}`;
}

/**
 * List all Upstash Redis databases
 */
export async function listUpstashDatabases(): Promise<unknown[]> {
  return upstashApi<unknown[]>("GET", "/redis/databases");
}
