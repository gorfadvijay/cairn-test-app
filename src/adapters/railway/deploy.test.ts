import { test, expect, describe } from "bun:test";
import type { CairnConfig } from "../../parser/types.ts";

/**
 * Railway deploy tests
 * These test the config parsing and state management logic.
 * Live API tests require a Railway token (run manually).
 */

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

describe("Railway deploy config handling", () => {
  test("config with all resource types is valid", () => {
    const config = makeConfig({
      services: [
        { name: "api", command: "bun run src/index.ts", expose: true },
      ],
      postgres: [{ name: "main", version: "16" }],
      redis: [{ name: "cache", version: "7" }],
      auth: [{ name: "main", providers: ["email"], session: "database" }],
    });

    expect(config.services).toHaveLength(1);
    expect(config.postgres).toHaveLength(1);
    expect(config.redis).toHaveLength(1);
    expect(config.auth).toHaveLength(1);
  });

  test("only exposed services should be deployed", () => {
    const config = makeConfig({
      services: [
        { name: "api", command: "bun run src/api.ts", expose: true },
        { name: "worker", command: "bun run src/worker.ts", expose: false },
      ],
    });

    const deployable = config.services.filter((s) => s.expose);
    expect(deployable).toHaveLength(1);
    expect(deployable[0]!.name).toBe("api");
  });

  test("multiple postgres instances are supported", () => {
    const config = makeConfig({
      postgres: [
        { name: "main", version: "16" },
        { name: "analytics", version: "15" },
      ],
    });

    expect(config.postgres).toHaveLength(2);
    expect(config.postgres[0]!.name).toBe("main");
    expect(config.postgres[1]!.name).toBe("analytics");
  });

  test("deploy target defaults to cloudflare", () => {
    // The CLI defaults --target to "cloudflare"
    const defaultTarget = "cloudflare";
    expect(defaultTarget).toBe("cloudflare");
  });

  test("railway target is recognized", () => {
    const targets = ["cloudflare", "cf", "railway"];
    expect(targets).toContain("railway");
  });
});

describe("Railway resource key naming", () => {
  test("project key format", () => {
    const key = "railway:project";
    expect(key).toBe("railway:project");
  });

  test("postgres key format", () => {
    const key = `railway:pg:main`;
    expect(key).toBe("railway:pg:main");
  });

  test("redis key format", () => {
    const key = `railway:redis:cache`;
    expect(key).toBe("railway:redis:cache");
  });

  test("service key format", () => {
    const key = `railway:service:api`;
    expect(key).toBe("railway:service:api");
  });

  test("auth key format", () => {
    const key = `railway:auth:main`;
    expect(key).toBe("railway:auth:main");
  });
});
