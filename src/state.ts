/**
 * Local state store
 * Tracks what resources Cairn has provisioned
 * Stored in .cairn/state.json (production) or .cairn/state.branch-{name}.json (branches)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "fs";

const STATE_DIR = ".cairn";
const STATE_FILE = `${STATE_DIR}/state.json`;

export interface CairnState {
  project: string;
  target: string;
  branch?: string;
  resources: Record<string, Record<string, string>>;
  lastDeployedAt?: string;
  lastDeployedSha?: string;
}

function stateFilePath(branch?: string): string {
  if (!branch) return STATE_FILE;
  return `${STATE_DIR}/state.branch-${branch}.json`;
}

export function loadState(branch?: string): CairnState {
  const file = stateFilePath(branch);
  if (!existsSync(file)) {
    return { project: "", target: "", resources: {} };
  }
  return JSON.parse(readFileSync(file, "utf-8"));
}

export function saveState(state: CairnState, branch?: string): void {
  if (!existsSync(STATE_DIR)) {
    mkdirSync(STATE_DIR, { recursive: true });
  }
  state.lastDeployedAt = new Date().toISOString();
  const file = stateFilePath(branch);
  writeFileSync(file, JSON.stringify(state, null, 2));
}

export function clearState(branch?: string): void {
  const file = stateFilePath(branch);
  if (existsSync(file)) {
    if (branch) {
      unlinkSync(file);
    } else {
      writeFileSync(
        file,
        JSON.stringify({ project: "", target: "", resources: {} }),
      );
    }
  }
}

/** List all branch environments that have state files */
export function listBranches(): string[] {
  if (!existsSync(STATE_DIR)) return [];
  const files = readdirSync(STATE_DIR);
  return files
    .filter((f) => f.startsWith("state.branch-") && f.endsWith(".json"))
    .map((f) => f.replace("state.branch-", "").replace(".json", ""));
}
