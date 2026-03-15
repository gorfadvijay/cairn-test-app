import { stringify } from "yaml";
import { execSync } from "child_process";
import type { CairnConfig } from "../../parser/types.ts";

/** Check if a port is already in use by a non-Docker process */
function isPortTaken(port: number): boolean {
  try {
    const result = execSync(`lsof -i :${port} -sTCP:LISTEN`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    // Check if any non-Docker process is using it
    const lines = result.trim().split("\n").slice(1); // skip header
    return lines.some((line) => !line.includes("com.docke") && !line.includes("docker"));
  } catch {
    return false; // lsof returns non-zero if nothing is listening
  }
}

/** Find a free port starting from the desired one */
function findFreePort(desired: number): number {
  let port = desired;
  while (isPortTaken(port)) {
    console.log(`  ⚠ Port ${port} in use, trying ${port + 1}...`);
    port++;
  }
  return port;
}

/** Resolved ports for this session — computed once and reused */
let resolvedPorts: {
  postgres: number;
  redis: number;
  minio: number;
  minioConsole: number;
  auth: number;
} | null = null;

export function getBasePorts() {
  if (!resolvedPorts) {
    resolvedPorts = {
      postgres: findFreePort(5432),
      redis: findFreePort(6379),
      minio: findFreePort(9000),
      minioConsole: findFreePort(9001),
      auth: 4000,
    };
  }
  return resolvedPorts;
}

/** Reset resolved ports — used in tests */
export function resetPorts() {
  resolvedPorts = null;
}

/**
 * Generates docker-compose.yml from CairnConfig
 * Runs infrastructure (Postgres, Redis, MinIO) in Docker
 * The user's app runs directly via Bun (not in Docker)
 */
export function generateDockerCompose(config: CairnConfig): string {
  const services: Record<string, unknown> = {};
  const volumes: Record<string, unknown> = {};

  // Postgres — each instance gets an offset port
  config.postgres.forEach((pg, idx) => {
    const serviceName = `cairn-pg-${pg.name}`;
    const hostPort = getBasePorts().postgres + idx;
    services[serviceName] = {
      image: `postgres:${pg.version}`,
      ports: [`${hostPort}:5432`],
      environment: {
        POSTGRES_USER: "cairn",
        POSTGRES_PASSWORD: "cairn",
        POSTGRES_DB: pg.name,
      },
      volumes: [`${serviceName}-data:/var/lib/postgresql/data`],
      healthcheck: {
        test: ["CMD-SHELL", "pg_isready -U cairn"],
        interval: "2s",
        timeout: "5s",
        retries: 10,
      },
    };
    volumes[`${serviceName}-data`] = {};
  });

  // Redis — each instance gets an offset port
  config.redis.forEach((rd, idx) => {
    const serviceName = `cairn-rd-${rd.name}`;
    const hostPort = getBasePorts().redis + idx;
    services[serviceName] = {
      image: `redis:${rd.version}-alpine`,
      ports: [`${hostPort}:6379`],
      healthcheck: {
        test: ["CMD", "redis-cli", "ping"],
        interval: "2s",
        timeout: "5s",
        retries: 10,
      },
    };
  });

  // MinIO (S3-compatible storage) — each instance gets offset ports
  config.storage.forEach((st, idx) => {
    const serviceName = `cairn-s3-${st.name}`;
    const apiPort = getBasePorts().minio + idx * 2;
    const consolePort = getBasePorts().minioConsole + idx * 2;
    services[serviceName] = {
      image: "minio/minio:latest",
      command: `server /data --console-address ':9001'`,
      ports: [`${apiPort}:9000`, `${consolePort}:9001`],
      environment: {
        MINIO_ROOT_USER: "cairn",
        MINIO_ROOT_PASSWORD: "cairnpass123",
      },
      volumes: [`${serviceName}-data:/data`],
    };
    volumes[`${serviceName}-data`] = {};
  });

  const compose = { services, volumes };

  return stringify(compose);
}

/**
 * Generates the environment variables for the user's app
 * These are auto-injected when running the app locally
 */
export function generateDevEnvVars(
  config: CairnConfig,
): Record<string, string> {
  const env: Record<string, string> = {};

  config.postgres.forEach((pg, idx) => {
    const port = getBasePorts().postgres + idx;
    const url = `postgres://cairn:cairn@localhost:${port}/${pg.name}`;
    env[`POSTGRES_${pg.name.toUpperCase()}_URL`] = url;
    // First postgres also gets the generic DATABASE_URL
    if (idx === 0) env["DATABASE_URL"] = url;
  });

  config.redis.forEach((rd, idx) => {
    const port = getBasePorts().redis + idx;
    const url = `redis://localhost:${port}`;
    env[`REDIS_${rd.name.toUpperCase()}_URL`] = url;
    if (idx === 0) env["REDIS_URL"] = url;
  });

  config.storage.forEach((st, idx) => {
    const port = getBasePorts().minio + idx * 2;
    env[`S3_${st.name.toUpperCase()}_ENDPOINT`] = `http://localhost:${port}`;
    env[`S3_${st.name.toUpperCase()}_ACCESS_KEY`] = "cairn";
    env[`S3_${st.name.toUpperCase()}_SECRET_KEY`] = "cairnpass123";
    env[`S3_${st.name.toUpperCase()}_BUCKET`] = st.name;
    // First storage also gets the generic S3_* vars
    if (idx === 0) {
      env["S3_ENDPOINT"] = `http://localhost:${port}`;
      env["S3_ACCESS_KEY"] = "cairn";
      env["S3_SECRET_KEY"] = "cairnpass123";
      env["S3_BUCKET"] = st.name;
    }
  });

  // Auth — auto-inject AUTH_URL for each auth instance
  config.auth.forEach((auth, idx) => {
    const port = getBasePorts().auth + idx;
    env[`AUTH_${auth.name.toUpperCase()}_URL`] = `http://localhost:${port}`;
    if (idx === 0) env["AUTH_URL"] = `http://localhost:${port}`;
  });

  return env;
}
