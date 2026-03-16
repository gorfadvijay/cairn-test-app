/**
 * Console auth — session-based authentication
 * Dogfoods the auth pattern from Phase 2
 */

import {
  createUser,
  getUserByEmail,
  getUserById,
  createSession,
  getSession,
  deleteSession,
} from "./db.ts";

const COOKIE_NAME = "cairn_session";
const SESSION_TTL_DAYS = 30;
const isProd = process.env.NODE_ENV === "production";

function generateId(): string {
  return crypto.randomUUID();
}

async function hashPassword(password: string): Promise<string> {
  return await Bun.password.hash(password, { algorithm: "bcrypt", cost: 10 });
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await Bun.password.verify(password, hash);
}

function sessionExpiry(): string {
  const d = new Date();
  d.setDate(d.getDate() + SESSION_TTL_DAYS);
  return d.toISOString();
}

function setSessionCookie(headers: Headers, sessionId: string) {
  const secure = isProd ? "; Secure" : "";
  headers.set(
    "Set-Cookie",
    `${COOKIE_NAME}=${sessionId}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${SESSION_TTL_DAYS * 86400}`,
  );
}

function clearSessionCookie(headers: Headers) {
  const secure = isProd ? "; Secure" : "";
  headers.set(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; HttpOnly${secure}; Max-Age=0`,
  );
}

function getSessionIdFromRequest(req: Request): string | null {
  const cookie = req.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return match?.[1] || null;
}

/** Get the authenticated user from request, or null */
export function getAuthUser(req: Request): { id: string; email: string; name: string } | null {
  const sessionId = getSessionIdFromRequest(req);
  if (!sessionId) return null;

  const session = getSession.get(sessionId);
  if (!session) return null;

  const user = getUserById.get(session.user_id);
  return user || null;
}

/** Require auth — returns user or 401 response */
export function requireAuth(req: Request): { id: string; email: string; name: string } | Response {
  const user = getAuthUser(req);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return user;
}

/** POST /api/auth/signup */
export async function handleSignup(req: Request): Promise<Response> {
  const { email, password, name } = await req.json();

  if (!email || !password) {
    return Response.json({ error: "Email and password required" }, { status: 400 });
  }

  const existing = getUserByEmail.get(email);
  if (existing) {
    return Response.json({ error: "Email already registered" }, { status: 409 });
  }

  const id = generateId();
  const passwordHash = await hashPassword(password);
  createUser.get(id, email, name || email.split("@")[0], passwordHash);

  // Auto-login after signup
  const sessionId = generateId();
  createSession.run(sessionId, id, sessionExpiry());

  const headers = new Headers({ "Content-Type": "application/json" });
  setSessionCookie(headers, sessionId);

  return new Response(
    JSON.stringify({ user: { id, email, name: name || email.split("@")[0] } }),
    { status: 201, headers },
  );
}

/** POST /api/auth/login */
export async function handleLogin(req: Request): Promise<Response> {
  const { email, password } = await req.json();

  if (!email || !password) {
    return Response.json({ error: "Email and password required" }, { status: 400 });
  }

  const user = getUserByEmail.get(email);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return Response.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const sessionId = generateId();
  createSession.run(sessionId, user.id, sessionExpiry());

  const headers = new Headers({ "Content-Type": "application/json" });
  setSessionCookie(headers, sessionId);

  return new Response(
    JSON.stringify({ user: { id: user.id, email: user.email, name: user.name } }),
    { headers },
  );
}

/** POST /api/auth/logout */
export function handleLogout(req: Request): Response {
  const sessionId = getSessionIdFromRequest(req);
  if (sessionId) deleteSession.run(sessionId);

  const headers = new Headers({ "Content-Type": "application/json" });
  clearSessionCookie(headers);

  return new Response(JSON.stringify({ ok: true }), { headers });
}

/** GET /api/auth/me */
export function handleMe(req: Request): Response {
  const user = getAuthUser(req);
  if (!user) return Response.json({ user: null });
  return Response.json({ user });
}
