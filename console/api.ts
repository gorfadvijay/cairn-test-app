/**
 * Console REST API
 * Used by both the web UI and the CLI
 */

import { requireAuth } from "./auth.ts";
import * as db from "./db.ts";

function generateId(): string {
  return crypto.randomUUID();
}

// ─── Projects ────────────────────────────────────────────

/** GET /api/projects */
export function listProjects(req: Request): Response {
  const user = requireAuth(req);
  if (user instanceof Response) return user;

  const projects = db.getProjectsByUser.all(user.id);
  return Response.json({
    projects: projects.map((p) => ({
      ...p,
      state: JSON.parse(p.state),
    })),
  });
}

/** POST /api/projects */
export async function createProject(req: Request): Promise<Response> {
  const user = requireAuth(req);
  if (user instanceof Response) return user;

  const { name, target } = await req.json();
  if (!name) return Response.json({ error: "Name required" }, { status: 400 });

  const id = generateId();
  db.createProject.run(id, user.id, name, target || "cloudflare", "{}");

  return Response.json({ project: { id, name, target: target || "cloudflare", state: {}, updated_at: new Date().toISOString() } }, { status: 201 });
}

/** GET /api/projects/:id */
export function getProject(req: Request, id: string): Response {
  const user = requireAuth(req);
  if (user instanceof Response) return user;

  const project = db.getProjectById.get(id);
  if (!project || project.user_id !== user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const resources = JSON.parse(project.state);
  const deployments = db.getDeploymentsByProject.all(id);
  const team = db.getTeamMembers.all(id);

  return Response.json({
    project: { ...project, state: resources },
    deployments,
    team,
  });
}

/** DELETE /api/projects/:id */
export function deleteProjectHandler(req: Request, id: string): Response {
  const user = requireAuth(req);
  if (user instanceof Response) return user;

  const project = db.getProjectById.get(id);
  if (!project || project.user_id !== user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  db.deleteProject.run(id);
  return Response.json({ ok: true });
}

/** PUT /api/projects/:id/state — sync state from CLI */
export async function syncState(req: Request, id: string): Promise<Response> {
  const user = requireAuth(req);
  if (user instanceof Response) return user;

  const project = db.getProjectById.get(id);
  if (!project || project.user_id !== user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const state = await req.json();
  db.updateProjectState.run(JSON.stringify(state), id);

  return Response.json({ ok: true });
}

// ─── Deployments ─────────────────────────────────────────

/** POST /api/projects/:id/deploy */
export async function triggerDeploy(req: Request, id: string): Promise<Response> {
  const user = requireAuth(req);
  if (user instanceof Response) return user;

  const project = db.getProjectById.get(id);
  if (!project || project.user_id !== user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const deployId = generateId();
  db.createDeployment.run(deployId, id, "pending", project.target, "console");

  // TODO: Actually trigger the deploy via Cairn CLI or API
  // For now, mark as queued
  db.updateDeployment.run("queued", "Deploy queued from console", deployId);

  return Response.json({ deployment: { id: deployId, status: "queued" } }, { status: 201 });
}

/** GET /api/projects/:id/deployments */
export function listDeployments(req: Request, id: string): Response {
  const user = requireAuth(req);
  if (user instanceof Response) return user;

  const project = db.getProjectById.get(id);
  if (!project || project.user_id !== user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const deployments = db.getDeploymentsByProject.all(id);
  return Response.json({ deployments });
}

// ─── Resources ───────────────────────────────────────────

/** GET /api/projects/:id/resources */
export function listResources(req: Request, id: string): Response {
  const user = requireAuth(req);
  if (user instanceof Response) return user;

  const project = db.getProjectById.get(id);
  if (!project || project.user_id !== user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const state = JSON.parse(project.state);
  const resources = Object.entries(state.resources || {}).map(([key, value]) => ({
    key,
    type: key.split(":")[0],
    name: key.split(":").slice(1).join(":"),
    ...(value as Record<string, unknown>),
  }));

  return Response.json({ resources, target: state.target });
}

// ─── Secrets ─────────────────────────────────────────────

/** GET /api/projects/:id/secrets */
export function listSecrets(req: Request, id: string): Response {
  const user = requireAuth(req);
  if (user instanceof Response) return user;

  const project = db.getProjectById.get(id);
  if (!project || project.user_id !== user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // Return keys only, not values (security)
  const secrets = db.getSecretsByProject.all(id);
  return Response.json({ secrets });
}

/** POST /api/projects/:id/secrets */
export async function setSecretHandler(req: Request, id: string): Promise<Response> {
  const user = requireAuth(req);
  if (user instanceof Response) return user;

  const project = db.getProjectById.get(id);
  if (!project || project.user_id !== user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const { key, value } = await req.json();
  if (!key || !value) {
    return Response.json({ error: "Key and value required" }, { status: 400 });
  }

  db.setSecret.run(generateId(), id, key, value);
  return Response.json({ ok: true }, { status: 201 });
}

/** DELETE /api/projects/:id/secrets/:key */
export function deleteSecretHandler(req: Request, projectId: string, key: string): Response {
  const user = requireAuth(req);
  if (user instanceof Response) return user;

  const project = db.getProjectById.get(projectId);
  if (!project || project.user_id !== user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  db.deleteSecret.run(projectId, key);
  return Response.json({ ok: true });
}

// ─── Branches ───────────────────────────────────────────

/** GET /api/projects/:id/branches */
export function listBranches(req: Request, id: string): Response {
  const user = requireAuth(req);
  if (user instanceof Response) return user;

  const project = db.getProjectById.get(id);
  if (!project || project.user_id !== user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const branches = db.getBranchesByProject.all(id);
  return Response.json({
    branches: branches.map((b) => ({
      ...b,
      state: JSON.parse(b.state),
      urls: JSON.parse(b.urls),
    })),
  });
}

/** POST /api/projects/:id/branches */
export async function createBranchHandler(req: Request, id: string): Promise<Response> {
  const user = requireAuth(req);
  if (user instanceof Response) return user;

  const project = db.getProjectById.get(id);
  if (!project || project.user_id !== user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const { name, pr_number } = await req.json();
  if (!name) return Response.json({ error: "Branch name required" }, { status: 400 });

  // Check if branch already exists
  const existing = db.getBranchByName.get(id, name);
  if (existing) {
    return Response.json({ error: "Branch already exists" }, { status: 409 });
  }

  const branchId = generateId();
  db.createBranch.run(branchId, id, name, "deploying", "{}", "{}", pr_number || null);

  return Response.json({
    branch: { id: branchId, name, status: "deploying", pr_number: pr_number || null },
  }, { status: 201 });
}

/** PUT /api/projects/:id/branches/:name */
export async function updateBranchHandler(req: Request, id: string, branchName: string): Promise<Response> {
  const user = requireAuth(req);
  if (user instanceof Response) return user;

  const project = db.getProjectById.get(id);
  if (!project || project.user_id !== user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const branch = db.getBranchByName.get(id, branchName);
  if (!branch) {
    return Response.json({ error: "Branch not found" }, { status: 404 });
  }

  const { status, state, urls } = await req.json();
  db.updateBranch.run(
    status || branch.status,
    state ? JSON.stringify(state) : branch.state,
    urls ? JSON.stringify(urls) : branch.urls,
    branch.id,
  );

  return Response.json({ ok: true });
}

/** DELETE /api/projects/:id/branches/:name */
export function deleteBranchHandler(req: Request, id: string, branchName: string): Response {
  const user = requireAuth(req);
  if (user instanceof Response) return user;

  const project = db.getProjectById.get(id);
  if (!project || project.user_id !== user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const branch = db.getBranchByName.get(id, branchName);
  if (!branch) {
    return Response.json({ error: "Branch not found" }, { status: 404 });
  }

  db.deleteBranch.run(branch.id);
  return Response.json({ ok: true });
}

// ─── Team ────────────────────────────────────────────────

/** GET /api/projects/:id/team */
export function listTeam(req: Request, id: string): Response {
  const user = requireAuth(req);
  if (user instanceof Response) return user;

  const project = db.getProjectById.get(id);
  if (!project || project.user_id !== user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const members = db.getTeamMembers.all(id);
  return Response.json({ members });
}

/** POST /api/projects/:id/team */
export async function addTeamMemberHandler(req: Request, id: string): Promise<Response> {
  const user = requireAuth(req);
  if (user instanceof Response) return user;

  const project = db.getProjectById.get(id);
  if (!project || project.user_id !== user.id) {
    return Response.json({ error: "Only project owner can manage team" }, { status: 403 });
  }

  const { email, role } = await req.json();
  const member = db.getUserByEmail.get(email);
  if (!member) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  db.addTeamMember.run(generateId(), id, member.id, role || "member");
  return Response.json({ ok: true }, { status: 201 });
}
