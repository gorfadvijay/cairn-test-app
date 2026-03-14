/**
 * Local state store
 * Tracks what resources Cairn has provisioned
 * Stored in .cairn/state.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";

const STATE_DIR = ".cairn";
const STATE_FILE = `${STATE_DIR}/state.json`;

export interface CairnState {
  project: string;
  target: string;
  resources: Record<string, Record<string, string>>;
  lastDeployedAt?: string;
  lastDeployedSha?: string;
}

export function loadState(): CairnState {
  if (!existsSync(STATE_FILE)) {
    return { project: "", target: "", resources: {} };
  }
  return JSON.parse(readFileSync(STATE_FILE, "utf-8"));
}

export function saveState(state: CairnState): void {
  if (!existsSync(STATE_DIR)) {
    mkdirSync(STATE_DIR, { recursive: true });
  }
  state.lastDeployedAt = new Date().toISOString();
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export function clearState(): void {
  if (existsSync(STATE_FILE)) {
    writeFileSync(
      STATE_FILE,
      JSON.stringify({ project: "", target: "", resources: {} }),
    );
  }
}
