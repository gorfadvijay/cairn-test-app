/**
 * Local secret store
 * Stores credentials in ~/.cairn/credentials/
 * Stores project secrets in ~/.cairn/secrets.json
 *
 * For MVP this is simple JSON files (not encrypted)
 * v0.2 will add Infisical integration
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const CAIRN_HOME = join(homedir(), ".cairn");
const CREDS_DIR = join(CAIRN_HOME, "credentials");
const SECRETS_FILE = join(CAIRN_HOME, "secrets.json");

function ensureDirs() {
  if (!existsSync(CAIRN_HOME)) mkdirSync(CAIRN_HOME, { recursive: true });
  if (!existsSync(CREDS_DIR)) mkdirSync(CREDS_DIR, { recursive: true });
}

// --- Vendor credentials ---

export function saveVendorCredentials(
  vendor: string,
  creds: Record<string, string>,
): void {
  ensureDirs();
  writeFileSync(
    join(CREDS_DIR, `${vendor}.json`),
    JSON.stringify(creds, null, 2),
  );
}

export function loadVendorCredentials(
  vendor: string,
): Record<string, string> | null {
  const file = join(CREDS_DIR, `${vendor}.json`);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf-8"));
}

export function hasVendorCredentials(vendor: string): boolean {
  return existsSync(join(CREDS_DIR, `${vendor}.json`));
}

// --- Project secrets ---

export function setSecret(key: string, value: string): void {
  ensureDirs();
  const secrets = loadSecrets();
  secrets[key] = value;
  writeFileSync(SECRETS_FILE, JSON.stringify(secrets, null, 2));
}

export function getSecret(key: string): string | undefined {
  return loadSecrets()[key];
}

export function listSecrets(): Record<string, string> {
  return loadSecrets();
}

function loadSecrets(): Record<string, string> {
  if (!existsSync(SECRETS_FILE)) return {};
  return JSON.parse(readFileSync(SECRETS_FILE, "utf-8"));
}
