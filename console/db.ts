/**
 * Console database layer
 * Uses bun:sqlite for local dev, designed to swap to Postgres (Bun.sql) for prod
 */

import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "fs";
import { resolve } from "path";

const DATA_DIR = resolve(import.meta.dir, ".data");
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(resolve(DATA_DIR, "console.db"));
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

// Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    password_hash TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    target TEXT DEFAULT 'cloudflare',
    state TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS deployments (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending',
    target TEXT NOT NULL,
    triggered_by TEXT DEFAULT 'console',
    logs TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS secrets (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(project_id, key)
  );

  CREATE TABLE IF NOT EXISTS team_members (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member',
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(project_id, user_id)
  );
`);

// User queries
export const createUser = db.prepare<
  { id: string; email: string; name: string; password_hash: string },
  [string, string, string, string]
>("INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?) RETURNING *");

export const getUserByEmail = db.prepare<
  { id: string; email: string; name: string; password_hash: string },
  [string]
>("SELECT * FROM users WHERE email = ?");

export const getUserById = db.prepare<
  { id: string; email: string; name: string },
  [string]
>("SELECT id, email, name FROM users WHERE id = ?");

// Session queries
export const createSession = db.prepare(
  "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
);

export const getSession = db.prepare<
  { id: string; user_id: string; expires_at: string },
  [string]
>("SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')");

export const deleteSession = db.prepare("DELETE FROM sessions WHERE id = ?");

// Project queries
export const createProject = db.prepare(
  "INSERT INTO projects (id, user_id, name, target, state) VALUES (?, ?, ?, ?, ?)",
);

export const getProjectsByUser = db.prepare<
  { id: string; name: string; target: string; state: string; created_at: string; updated_at: string },
  [string]
>("SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC");

export const getProjectById = db.prepare<
  { id: string; user_id: string; name: string; target: string; state: string; created_at: string; updated_at: string },
  [string]
>("SELECT * FROM projects WHERE id = ?");

export const updateProjectState = db.prepare(
  "UPDATE projects SET state = ?, updated_at = datetime('now') WHERE id = ?",
);

export const deleteProject = db.prepare("DELETE FROM projects WHERE id = ?");

// Deployment queries
export const createDeployment = db.prepare(
  "INSERT INTO deployments (id, project_id, status, target, triggered_by) VALUES (?, ?, ?, ?, ?)",
);

export const getDeploymentsByProject = db.prepare<
  { id: string; status: string; target: string; triggered_by: string; created_at: string; completed_at: string },
  [string]
>("SELECT * FROM deployments WHERE project_id = ? ORDER BY created_at DESC LIMIT 20");

export const updateDeployment = db.prepare(
  "UPDATE deployments SET status = ?, logs = ?, completed_at = datetime('now') WHERE id = ?",
);

// Secrets queries
export const setSecret = db.prepare(
  "INSERT INTO secrets (id, project_id, key, value) VALUES (?, ?, ?, ?) ON CONFLICT(project_id, key) DO UPDATE SET value = excluded.value",
);

export const getSecretsByProject = db.prepare<
  { id: string; key: string; created_at: string },
  [string]
>("SELECT id, key, created_at FROM secrets WHERE project_id = ?");

export const deleteSecret = db.prepare(
  "DELETE FROM secrets WHERE project_id = ? AND key = ?",
);

// Team queries
export const addTeamMember = db.prepare(
  "INSERT INTO team_members (id, project_id, user_id, role) VALUES (?, ?, ?, ?)",
);

export const getTeamMembers = db.prepare<
  { user_id: string; role: string; email: string; name: string },
  [string]
>(`SELECT tm.user_id, tm.role, u.email, u.name
   FROM team_members tm JOIN users u ON tm.user_id = u.id
   WHERE tm.project_id = ?`);

export const removeTeamMember = db.prepare(
  "DELETE FROM team_members WHERE project_id = ? AND user_id = ?",
);

// Branch environment queries
db.exec(`
  CREATE TABLE IF NOT EXISTS branches (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'deploying',
    state TEXT DEFAULT '{}',
    urls TEXT DEFAULT '{}',
    pr_number INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(project_id, name)
  );
`);

export const createBranch = db.prepare(
  "INSERT INTO branches (id, project_id, name, status, state, urls, pr_number) VALUES (?, ?, ?, ?, ?, ?, ?)",
);

export const getBranchesByProject = db.prepare<
  { id: string; name: string; status: string; state: string; urls: string; pr_number: number | null; created_at: string; updated_at: string },
  [string]
>("SELECT * FROM branches WHERE project_id = ? ORDER BY created_at DESC");

export const getBranchByName = db.prepare<
  { id: string; project_id: string; name: string; status: string; state: string; urls: string; pr_number: number | null; created_at: string },
  [string, string]
>("SELECT * FROM branches WHERE project_id = ? AND name = ?");

export const updateBranch = db.prepare(
  "UPDATE branches SET status = ?, state = ?, urls = ?, updated_at = datetime('now') WHERE id = ?",
);

export const deleteBranch = db.prepare("DELETE FROM branches WHERE id = ?");

export { db };
