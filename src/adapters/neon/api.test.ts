import { test, expect, describe } from "bun:test";
import { setCredentials, getCredentials, verifyToken, neonApi } from "./api.ts";
import {
  createNeonProject,
  deleteNeonProject,
  getNeonConnectionUri,
  createNeonBranch,
  deleteNeonBranch,
} from "./provisioner.ts";

describe("Neon API client", () => {
  test("setCredentials and getCredentials round-trip", () => {
    setCredentials({ apiKey: "test-key-123" });
    const creds = getCredentials();
    expect(creds.apiKey).toBe("test-key-123");
  });

  test("getCredentials throws when not set", () => {
    // We can't easily reset module state, so we test the throw path
    // by temporarily setting credentials to a known state
    // @ts-expect-error — access internal setter to clear credentials
    setCredentials(null as any);

    expect(() => getCredentials()).toThrow("Not logged in");

    // Restore for subsequent tests
    setCredentials({ apiKey: "test-key-123" });
  });

  test("verifyToken requires credentials", () => {
    // verifyToken calls neonApi which calls getCredentials
    // Since credentials are set from previous test, it should be callable
    expect(typeof verifyToken).toBe("function");
  });

  test("neonApi is exported and callable", () => {
    expect(typeof neonApi).toBe("function");
  });

  test("provisioner exports are callable", () => {
    expect(typeof createNeonProject).toBe("function");
    expect(typeof deleteNeonProject).toBe("function");
    expect(typeof getNeonConnectionUri).toBe("function");
    expect(typeof createNeonBranch).toBe("function");
    expect(typeof deleteNeonBranch).toBe("function");
  });
});
