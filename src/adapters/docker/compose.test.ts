import { test, expect, describe } from "bun:test";
import { generateDockerCompose, generateDevEnvVars } from "./compose.ts";
import { parse } from "yaml";
import type { CairnConfig } from "../../parser/types.ts";

function makeConfig(overrides: Partial<CairnConfig> = {}): CairnConfig {
  return {
    project: { name: "test-app", runtime: "bun" },
    services: [],
    postgres: [],
    redis: [],
    storage: [],
    secrets: [],
    auth: [],
    ...overrides,
  };
}

describe("generateDockerCompose", () => {
  test("generates postgres service", () => {
    const config = makeConfig({
      postgres: [{ name: "main", version: "16" }],
    });
    const yml = generateDockerCompose(config);
    const composed = parse(yml);

    expect(composed.services["cairn-pg-main"]).toBeDefined();
    expect(composed.services["cairn-pg-main"].image).toBe("postgres:16");
    expect(composed.services["cairn-pg-main"].ports).toContain("5432:5432");
  });

  test("generates redis service", () => {
    const config = makeConfig({
      redis: [{ name: "cache", version: "7" }],
    });
    const yml = generateDockerCompose(config);
    const composed = parse(yml);

    expect(composed.services["cairn-rd-cache"]).toBeDefined();
    expect(composed.services["cairn-rd-cache"].image).toBe("redis:7-alpine");
    expect(composed.services["cairn-rd-cache"].ports).toContain("6379:6379");
  });

  test("generates minio service for storage", () => {
    const config = makeConfig({
      storage: [{ name: "uploads" }],
    });
    const yml = generateDockerCompose(config);
    const composed = parse(yml);

    expect(composed.services["cairn-s3-uploads"]).toBeDefined();
    expect(composed.services["cairn-s3-uploads"].image).toBe(
      "minio/minio:latest",
    );
  });

  test("offsets ports for multiple postgres instances", () => {
    const config = makeConfig({
      postgres: [
        { name: "main", version: "16" },
        { name: "analytics", version: "15" },
      ],
    });
    const yml = generateDockerCompose(config);
    const composed = parse(yml);

    expect(composed.services["cairn-pg-main"].ports).toContain("5432:5432");
    expect(composed.services["cairn-pg-analytics"].ports).toContain(
      "5433:5432",
    );
  });

  test("offsets ports for multiple redis instances", () => {
    const config = makeConfig({
      redis: [
        { name: "cache", version: "7" },
        { name: "sessions", version: "7" },
      ],
    });
    const yml = generateDockerCompose(config);
    const composed = parse(yml);

    expect(composed.services["cairn-rd-cache"].ports).toContain("6379:6379");
    expect(composed.services["cairn-rd-sessions"].ports).toContain(
      "6380:6379",
    );
  });

  test("creates volumes for stateful services", () => {
    const config = makeConfig({
      postgres: [{ name: "main", version: "16" }],
      storage: [{ name: "uploads" }],
    });
    const yml = generateDockerCompose(config);
    const composed = parse(yml);

    expect(composed.volumes["cairn-pg-main-data"]).toBeDefined();
    expect(composed.volumes["cairn-s3-uploads-data"]).toBeDefined();
  });

  test("generates empty compose for no resources", () => {
    const config = makeConfig();
    const yml = generateDockerCompose(config);
    const composed = parse(yml);

    expect(Object.keys(composed.services)).toHaveLength(0);
  });
});

describe("generateDevEnvVars", () => {
  test("generates DATABASE_URL for first postgres", () => {
    const config = makeConfig({
      postgres: [{ name: "main", version: "16" }],
    });
    const env = generateDevEnvVars(config);

    expect(env.DATABASE_URL).toBe("postgres://cairn:cairn@localhost:5432/main");
    expect(env.POSTGRES_MAIN_URL).toBe(
      "postgres://cairn:cairn@localhost:5432/main",
    );
  });

  test("generates offset URLs for multiple postgres", () => {
    const config = makeConfig({
      postgres: [
        { name: "main", version: "16" },
        { name: "analytics", version: "15" },
      ],
    });
    const env = generateDevEnvVars(config);

    expect(env.DATABASE_URL).toBe("postgres://cairn:cairn@localhost:5432/main");
    expect(env.POSTGRES_ANALYTICS_URL).toBe(
      "postgres://cairn:cairn@localhost:5433/analytics",
    );
  });

  test("generates REDIS_URL for first redis", () => {
    const config = makeConfig({
      redis: [{ name: "cache", version: "7" }],
    });
    const env = generateDevEnvVars(config);

    expect(env.REDIS_URL).toBe("redis://localhost:6379");
    expect(env.REDIS_CACHE_URL).toBe("redis://localhost:6379");
  });

  test("generates S3 vars for storage", () => {
    const config = makeConfig({
      storage: [{ name: "uploads" }],
    });
    const env = generateDevEnvVars(config);

    expect(env.S3_ENDPOINT).toBe("http://localhost:9000");
    expect(env.S3_BUCKET).toBe("uploads");
    expect(env.S3_ACCESS_KEY).toBe("cairn");
  });

  test("generates AUTH_URL for first auth instance", () => {
    const config = makeConfig({
      auth: [{ name: "main", providers: ["email"], session: "database" }],
    });
    const env = generateDevEnvVars(config);

    expect(env.AUTH_URL).toBe("http://localhost:4000");
    expect(env.AUTH_MAIN_URL).toBe("http://localhost:4000");
  });

  test("generates offset AUTH URLs for multiple auth instances", () => {
    const config = makeConfig({
      auth: [
        { name: "main", providers: ["email"], session: "database" },
        { name: "admin", providers: ["email", "google"], session: "jwt" },
      ],
    });
    const env = generateDevEnvVars(config);

    expect(env.AUTH_URL).toBe("http://localhost:4000");
    expect(env.AUTH_MAIN_URL).toBe("http://localhost:4000");
    expect(env.AUTH_ADMIN_URL).toBe("http://localhost:4001");
  });

  test("no AUTH_URL when no auth configured", () => {
    const config = makeConfig();
    const env = generateDevEnvVars(config);

    expect(env.AUTH_URL).toBeUndefined();
  });
});
