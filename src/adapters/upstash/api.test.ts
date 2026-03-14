import { test, expect } from "bun:test";
import { setCredentials, getCredentials, verifyToken } from "./api";
import { getUpstashRedisUrl } from "./provisioner";

test("getCredentials throws when not set", () => {
  // Reset by importing fresh — but since module state persists,
  // we test this first before setting credentials
  expect(() => getCredentials()).toThrow("Not logged in");
});

test("credential set/get round-trip", () => {
  setCredentials({ email: "test@example.com", apiKey: "key_123" });
  const creds = getCredentials();
  expect(creds.email).toBe("test@example.com");
  expect(creds.apiKey).toBe("key_123");
});

test("verifyToken requires credentials", async () => {
  // verifyToken calls upstashApi which calls getCredentials,
  // credentials are set from the previous test so it will try to fetch.
  // We verify it at least attempts the request (will fail with network error).
  try {
    await verifyToken();
  } catch (e: unknown) {
    const error = e as Error;
    // Should fail with a network/API error, not a credentials error
    expect(error.message).not.toContain("Not logged in");
  }
});

test("getUpstashRedisUrl builds correct URL format", () => {
  const url = getUpstashRedisUrl("my-db.upstash.io", 6379, "secret123");
  expect(url).toBe("rediss://:secret123@my-db.upstash.io:6379");
});

test("module exports are callable", () => {
  expect(typeof setCredentials).toBe("function");
  expect(typeof getCredentials).toBe("function");
  expect(typeof verifyToken).toBe("function");
  expect(typeof getUpstashRedisUrl).toBe("function");
});
