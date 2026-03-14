import { test, expect, describe } from "bun:test";
import { getLatestDeployment, getDeploymentLogs, getEnvironmentLogs } from "./logs.ts";

/**
 * Railway logs tests
 * Unit tests for log fetching logic.
 * Live API tests require a Railway token (run manually).
 */

describe("Railway logs module", () => {
  test("getLatestDeployment is exported and callable", () => {
    expect(typeof getLatestDeployment).toBe("function");
  });

  test("getDeploymentLogs is exported and callable", () => {
    expect(typeof getDeploymentLogs).toBe("function");
  });

  test("getEnvironmentLogs is exported and callable", () => {
    expect(typeof getEnvironmentLogs).toBe("function");
  });

  test("functions require credentials to execute", async () => {
    // Without setting credentials, these should throw
    try {
      await getLatestDeployment("fake-service", "fake-env");
      expect(true).toBe(false); // should not reach here
    } catch (e: unknown) {
      const error = e as Error;
      expect(error.message).toContain("Not logged in");
    }
  });
});
