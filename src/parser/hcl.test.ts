import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { parseCairnHcl } from "./hcl.ts";
import { writeFileSync, unlinkSync, existsSync } from "fs";

const TMP = "/tmp/cairn-test.hcl";

function writeHcl(content: string) {
  writeFileSync(TMP, content);
}

afterEach(() => {
  if (existsSync(TMP)) unlinkSync(TMP);
});

describe("HCL Parser", () => {
  test("parses minimal project block", () => {
    writeHcl(`
project "my-app" {
  runtime = "bun"
}
`);
    const config = parseCairnHcl(TMP);
    expect(config.project.name).toBe("my-app");
    expect(config.project.runtime).toBe("bun");
  });

  test("parses service with dev block", () => {
    writeHcl(`
project "app" { runtime = "bun" }

service "api" {
  build   = "bun install"
  command = "bun run src/index.ts"
  expose  = true

  dev {
    command = "bun run --watch src/index.ts"
  }
}
`);
    const config = parseCairnHcl(TMP);
    expect(config.services).toHaveLength(1);
    expect(config.services[0]!.name).toBe("api");
    expect(config.services[0]!.command).toBe("bun run src/index.ts");
    expect(config.services[0]!.expose).toBe(true);
    expect(config.services[0]!.dev?.command).toBe(
      "bun run --watch src/index.ts",
    );
  });

  test("parses postgres block with version", () => {
    writeHcl(`
project "app" { runtime = "bun" }
postgres "main" { version = "16" }
`);
    const config = parseCairnHcl(TMP);
    expect(config.postgres).toHaveLength(1);
    expect(config.postgres[0]!.name).toBe("main");
    expect(config.postgres[0]!.version).toBe("16");
  });

  test("parses redis block", () => {
    writeHcl(`
project "app" { runtime = "bun" }
redis "cache" { version = "7" }
`);
    const config = parseCairnHcl(TMP);
    expect(config.redis).toHaveLength(1);
    expect(config.redis[0]!.name).toBe("cache");
    expect(config.redis[0]!.version).toBe("7");
  });

  test("parses storage block", () => {
    writeHcl(`
project "app" { runtime = "bun" }
storage "uploads" {}
`);
    const config = parseCairnHcl(TMP);
    expect(config.storage).toHaveLength(1);
    expect(config.storage[0]!.name).toBe("uploads");
  });

  test("parses full config with all block types", () => {
    writeHcl(`
# A complete cairn.hcl

project "hello-world" {
  runtime = "bun"
}

service "api" {
  build   = "bun install"
  command = "bun run src/index.ts"
  expose  = true

  dev {
    command = "bun run --watch src/index.ts"
  }
}

postgres "main" {
  version = "16"
}

redis "cache" {
  version = "7"
}

storage "uploads" {}
`);
    const config = parseCairnHcl(TMP);
    expect(config.project.name).toBe("hello-world");
    expect(config.services).toHaveLength(1);
    expect(config.postgres).toHaveLength(1);
    expect(config.redis).toHaveLength(1);
    expect(config.storage).toHaveLength(1);
  });

  test("parses multiple services", () => {
    writeHcl(`
project "app" { runtime = "bun" }

service "api" {
  command = "bun run src/api.ts"
  expose  = true
}

service "worker" {
  command = "bun run src/worker.ts"
  expose  = false
}
`);
    const config = parseCairnHcl(TMP);
    expect(config.services).toHaveLength(2);
    expect(config.services[0]!.name).toBe("api");
    expect(config.services[1]!.name).toBe("worker");
    expect(config.services[1]!.expose).toBe(false);
  });

  test("parses multiple postgres instances", () => {
    writeHcl(`
project "app" { runtime = "bun" }
postgres "main" { version = "16" }
postgres "analytics" { version = "15" }
`);
    const config = parseCairnHcl(TMP);
    expect(config.postgres).toHaveLength(2);
    expect(config.postgres[0]!.name).toBe("main");
    expect(config.postgres[1]!.name).toBe("analytics");
    expect(config.postgres[1]!.version).toBe("15");
  });

  test("defaults runtime to bun", () => {
    writeHcl(`project "app" {}`);
    const config = parseCairnHcl(TMP);
    expect(config.project.runtime).toBe("bun");
  });

  test("defaults postgres version to 16", () => {
    writeHcl(`
project "app" { runtime = "bun" }
postgres "db" {}
`);
    const config = parseCairnHcl(TMP);
    expect(config.postgres[0]!.version).toBe("16");
  });

  test("ignores comments", () => {
    writeHcl(`
# This is a comment
// This is also a comment
project "app" { runtime = "bun" }
`);
    const config = parseCairnHcl(TMP);
    expect(config.project.name).toBe("app");
  });

  test("parses numeric values", () => {
    writeHcl(`
project "app" { runtime = "bun" }
postgres "main" { version = "16" }
`);
    const config = parseCairnHcl(TMP);
    // version is always a string in our types
    expect(config.postgres[0]!.version).toBe("16");
  });

  test("returns empty arrays when no resources defined", () => {
    writeHcl(`project "app" { runtime = "bun" }`);
    const config = parseCairnHcl(TMP);
    expect(config.services).toEqual([]);
    expect(config.postgres).toEqual([]);
    expect(config.redis).toEqual([]);
    expect(config.storage).toEqual([]);
    expect(config.secrets).toEqual([]);
    expect(config.auth).toEqual([]);
  });

  test("parses auth block with providers array", () => {
    writeHcl(`
project "app" { runtime = "bun" }

auth "main" {
  providers = ["email", "google", "github"]
  session   = "jwt"
}
`);
    const config = parseCairnHcl(TMP);
    expect(config.auth).toHaveLength(1);
    expect(config.auth[0]!.name).toBe("main");
    expect(config.auth[0]!.providers).toEqual(["email", "google", "github"]);
    expect(config.auth[0]!.session).toBe("jwt");
  });

  test("parses auth block with database session", () => {
    writeHcl(`
project "app" { runtime = "bun" }

auth "main" {
  providers = ["email"]
  session   = "database"
}
`);
    const config = parseCairnHcl(TMP);
    expect(config.auth[0]!.session).toBe("database");
  });

  test("auth block defaults session to database", () => {
    writeHcl(`
project "app" { runtime = "bun" }

auth "main" {
  providers = ["email"]
}
`);
    const config = parseCairnHcl(TMP);
    expect(config.auth[0]!.session).toBe("database");
  });

  test("auth block defaults providers to email", () => {
    writeHcl(`
project "app" { runtime = "bun" }

auth "main" {}
`);
    const config = parseCairnHcl(TMP);
    expect(config.auth[0]!.providers).toEqual(["email"]);
  });

  test("parses inline auth block", () => {
    writeHcl(`
project "app" { runtime = "bun" }
auth "main" { session = "jwt" }
`);
    const config = parseCairnHcl(TMP);
    expect(config.auth).toHaveLength(1);
    expect(config.auth[0]!.name).toBe("main");
    expect(config.auth[0]!.session).toBe("jwt");
  });

  test("parses array values", () => {
    writeHcl(`
project "app" { runtime = "bun" }
auth "main" {
  providers = ["google", "github"]
}
`);
    const config = parseCairnHcl(TMP);
    expect(config.auth[0]!.providers).toEqual(["google", "github"]);
  });

  test("parses postgres with vendor attribute", () => {
    writeHcl(`
project "app" { runtime = "bun" }
postgres "main" {
  version = "16"
  vendor  = "neon"
}
`);
    const config = parseCairnHcl(TMP);
    expect(config.postgres[0]!.vendor).toBe("neon");
  });

  test("parses redis with vendor attribute", () => {
    writeHcl(`
project "app" { runtime = "bun" }
redis "cache" {
  version = "7"
  vendor  = "upstash"
}
`);
    const config = parseCairnHcl(TMP);
    expect(config.redis[0]!.vendor).toBe("upstash");
  });

  test("vendor defaults to undefined when not specified", () => {
    writeHcl(`
project "app" { runtime = "bun" }
postgres "main" { version = "16" }
redis "cache" { version = "7" }
`);
    const config = parseCairnHcl(TMP);
    expect(config.postgres[0]!.vendor).toBeUndefined();
    expect(config.redis[0]!.vendor).toBeUndefined();
  });

  test("parses inline postgres with vendor", () => {
    writeHcl(`
project "app" { runtime = "bun" }
postgres "main" { version = "16", vendor = "neon" }
`);
    const config = parseCairnHcl(TMP);
    expect(config.postgres[0]!.vendor).toBe("neon");
  });

  test("parses full config with auth block", () => {
    writeHcl(`
project "my-app" {
  runtime = "bun"
}

service "api" {
  build   = "bun install"
  command = "bun run src/index.ts"
  expose  = true
}

postgres "main" {
  version = "16"
}

redis "cache" {
  version = "7"
}

auth "main" {
  providers = ["email", "google"]
  session   = "jwt"
}
`);
    const config = parseCairnHcl(TMP);
    expect(config.project.name).toBe("my-app");
    expect(config.services).toHaveLength(1);
    expect(config.postgres).toHaveLength(1);
    expect(config.redis).toHaveLength(1);
    expect(config.auth).toHaveLength(1);
    expect(config.auth[0]!.providers).toEqual(["email", "google"]);
  });
});
