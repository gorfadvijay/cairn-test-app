/**
 * Railway database provisioning
 * Creates real Postgres and Redis instances via Railway's plugin system
 */

import { railwayGql } from "./api.ts";

export interface RailwayPlugin {
  id: string;
  name: string;
}

/**
 * Create a Postgres database in a Railway project
 * Returns the plugin ID and connection URL variable reference
 */
export async function createPostgres(
  projectId: string,
  environmentId: string,
  name: string,
): Promise<{ serviceId: string; name: string }> {
  // Create a Postgres service using the database template
  const result = await railwayGql<{
    serviceCreate: { id: string; name: string };
  }>(`
    mutation($input: ServiceCreateInput!) {
      serviceCreate(input: $input) {
        id
        name
      }
    }
  `, {
    input: {
      projectId,
      name: `postgres-${name}`,
      source: { image: "postgres:16" },
    },
  });

  const serviceId = result.serviceCreate.id;

  // Set Postgres environment variables
  const vars: Record<string, string> = {
    POSTGRES_USER: "cairn",
    POSTGRES_PASSWORD: "cairn",
    POSTGRES_DB: name,
    PGDATA: "/var/lib/postgresql/data/pgdata",
  };

  for (const [key, value] of Object.entries(vars)) {
    await railwayGql(`
      mutation($input: VariableUpsertInput!) {
        variableUpsert(input: $input)
      }
    `, {
      input: { projectId, environmentId, serviceId, name: key, value },
    });
  }

  // Add a volume for persistence
  await railwayGql(`
    mutation($input: VolumeCreateInput!) {
      volumeCreate(input: $input) { id }
    }
  `, {
    input: {
      projectId,
      environmentId,
      serviceId,
      mountPath: "/var/lib/postgresql/data",
    },
  });

  return { serviceId, name: `postgres-${name}` };
}

/**
 * Create a Redis instance in a Railway project
 */
export async function createRedis(
  projectId: string,
  environmentId: string,
  name: string,
): Promise<{ serviceId: string; name: string }> {
  const result = await railwayGql<{
    serviceCreate: { id: string; name: string };
  }>(`
    mutation($input: ServiceCreateInput!) {
      serviceCreate(input: $input) {
        id
        name
      }
    }
  `, {
    input: {
      projectId,
      name: `redis-${name}`,
      source: { image: "redis:7-alpine" },
    },
  });

  const serviceId = result.serviceCreate.id;

  // Add a volume for Redis persistence
  await railwayGql(`
    mutation($input: VolumeCreateInput!) {
      volumeCreate(input: $input) { id }
    }
  `, {
    input: {
      projectId,
      environmentId,
      serviceId,
      mountPath: "/data",
    },
  });

  return { serviceId, name: `redis-${name}` };
}

/**
 * Get the internal connection URL for a Postgres service
 * Railway provides internal networking between services via variable references
 */
export function getPostgresUrl(serviceName: string): string {
  return "${{" + serviceName + ".DATABASE_URL}}";
}

/**
 * Get the internal connection URL for a Redis service
 */
export function getRedisUrl(serviceName: string): string {
  return "${{" + serviceName + ".REDIS_URL}}";
}
