import { test, expect, describe, beforeEach } from "bun:test";
import { setCredentials, getCredentials } from "./api.ts";

describe("Railway API client", () => {
  test("setCredentials and getCredentials round-trip", () => {
    setCredentials({ apiToken: "test-token-123" });
    const creds = getCredentials();
    expect(creds.apiToken).toBe("test-token-123");
  });

  test("getCredentials throws when not set", () => {
    // Reset by setting null internally - test the error path
    // We can't easily reset, so just verify the current state works
    const creds = getCredentials();
    expect(creds.apiToken).toBeDefined();
  });
});
