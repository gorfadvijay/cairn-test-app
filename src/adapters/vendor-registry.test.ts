import { test, expect, describe } from "bun:test";
import {
  resolvePostgresVendor,
  resolveRedisVendor,
  vendorRequiresLogin,
} from "./vendor-registry.ts";

describe("Vendor Registry", () => {
  describe("resolvePostgresVendor", () => {
    test("explicit neon vendor is respected", () => {
      expect(resolvePostgresVendor({ name: "main", version: "16", vendor: "neon" }, "cloudflare")).toBe("neon");
    });

    test("explicit neon vendor overrides railway target", () => {
      expect(resolvePostgresVendor({ name: "main", version: "16", vendor: "neon" }, "railway")).toBe("neon");
    });

    test("defaults to cloudflare (D1) for cloudflare target", () => {
      expect(resolvePostgresVendor({ name: "main", version: "16" }, "cloudflare")).toBe("cloudflare");
    });

    test("defaults to cloudflare (D1) for cf target", () => {
      expect(resolvePostgresVendor({ name: "main", version: "16" }, "cf")).toBe("cloudflare");
    });

    test("defaults to railway for railway target", () => {
      expect(resolvePostgresVendor({ name: "main", version: "16" }, "railway")).toBe("railway");
    });
  });

  describe("resolveRedisVendor", () => {
    test("explicit upstash vendor is respected", () => {
      expect(resolveRedisVendor({ name: "cache", version: "7", vendor: "upstash" }, "cloudflare")).toBe("upstash");
    });

    test("explicit upstash vendor overrides railway target", () => {
      expect(resolveRedisVendor({ name: "cache", version: "7", vendor: "upstash" }, "railway")).toBe("upstash");
    });

    test("defaults to cloudflare (KV) for cloudflare target", () => {
      expect(resolveRedisVendor({ name: "cache", version: "7" }, "cloudflare")).toBe("cloudflare");
    });

    test("defaults to railway for railway target", () => {
      expect(resolveRedisVendor({ name: "cache", version: "7" }, "railway")).toBe("railway");
    });
  });

  describe("vendorRequiresLogin", () => {
    test("neon requires login", () => {
      expect(vendorRequiresLogin("neon")).toBe(true);
    });

    test("upstash requires login", () => {
      expect(vendorRequiresLogin("upstash")).toBe(true);
    });

    test("cloudflare does not require separate login", () => {
      expect(vendorRequiresLogin("cloudflare")).toBe(false);
    });

    test("railway does not require separate login", () => {
      expect(vendorRequiresLogin("railway")).toBe(false);
    });
  });
});
