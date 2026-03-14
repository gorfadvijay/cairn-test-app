import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { loadState, saveState, clearState } from "./state.ts";
import { existsSync, rmSync, mkdirSync } from "fs";

const STATE_DIR = ".cairn";
const STATE_FILE = `${STATE_DIR}/state.json`;

// Tests run in a temp directory to avoid polluting the project
const TEST_DIR = "/tmp/cairn-state-test";

beforeEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  mkdirSync(TEST_DIR, { recursive: true });
  process.chdir(TEST_DIR);
});

afterEach(() => {
  process.chdir("/Users/vijayg/Desktop/Cairn");
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
});

describe("State Manager", () => {
  test("returns empty state when no file exists", () => {
    const state = loadState();
    expect(state.project).toBe("");
    expect(state.target).toBe("");
    expect(state.resources).toEqual({});
  });

  test("saves and loads state", () => {
    const state = loadState();
    state.project = "my-app";
    state.target = "cloudflare";
    state.resources["d1:main"] = { id: "abc123", name: "cairn-my-app-main" };

    saveState(state);

    const loaded = loadState();
    expect(loaded.project).toBe("my-app");
    expect(loaded.target).toBe("cloudflare");
    expect(loaded.resources["d1:main"]!.id).toBe("abc123");
    expect(loaded.lastDeployedAt).toBeDefined();
  });

  test("clearState resets to empty", () => {
    const state = loadState();
    state.project = "my-app";
    state.resources["d1:main"] = { id: "abc123" };
    saveState(state);

    clearState();

    const cleared = loadState();
    expect(cleared.project).toBe("");
    expect(Object.keys(cleared.resources)).toHaveLength(0);
  });

  test("saveState creates .cairn directory", () => {
    expect(existsSync(STATE_DIR)).toBe(false);
    saveState(loadState());
    expect(existsSync(STATE_DIR)).toBe(true);
  });

  test("saveState sets lastDeployedAt", () => {
    const before = new Date().toISOString();
    const state = loadState();
    saveState(state);
    const loaded = loadState();

    expect(loaded.lastDeployedAt).toBeDefined();
    // Should be a valid ISO date string
    expect(new Date(loaded.lastDeployedAt!).toISOString()).toBe(
      loaded.lastDeployedAt,
    );
  });
});
