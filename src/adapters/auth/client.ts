/**
 * Generates a lightweight auth SDK client for the user's app.
 * Dropped into .cairn/auth-client.ts so users can import it directly.
 */

import type { AuthConfig } from "../../parser/types.ts";

/**
 * Generate a TypeScript auth client that wraps the Cairn auth API.
 * Users import this to get typed auth helpers without touching HTTP directly.
 */
export function generateAuthClient(auth: AuthConfig): string {
  const socialProviders = auth.providers.filter((p) => p !== "email");
  const hasOAuth = socialProviders.length > 0;

  return `/**
 * Cairn Auth Client — auto-generated, do not edit.
 * Import this in your app to interact with the auth API.
 *
 * Usage:
 *   import { authClient } from "./.cairn/auth-client";
 *   const { user, token } = await authClient.signUp({ email, password, name });
 */

const AUTH_URL = process.env.AUTH_URL || "http://localhost:4000";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthSession {
  user: AuthUser;
  token: string;
}

export interface SessionInfo {
  user: AuthUser;
  session: { expiresAt: string };
}

async function authFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(AUTH_URL + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const data = await res.json() as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || \`Auth request failed: \${res.status}\`);
  }
  return data;
}

export const authClient = {
  /** Register a new user with email and password */
  async signUp(params: { email: string; password: string; name?: string }): Promise<AuthSession> {
    return authFetch<AuthSession>("/api/auth/sign-up", {
      method: "POST",
      body: JSON.stringify(params),
    });
  },

  /** Sign in with email and password */
  async signIn(params: { email: string; password: string }): Promise<AuthSession> {
    return authFetch<AuthSession>("/api/auth/sign-in", {
      method: "POST",
      body: JSON.stringify(params),
    });
  },

  /** Validate a session token and get the current user */
  async getSession(token: string): Promise<SessionInfo> {
    return authFetch<SessionInfo>("/api/auth/session", {
      headers: { Authorization: \`Bearer \${token}\` },
    });
  },

  /** Sign out (invalidate the session token) */
  async signOut(token: string): Promise<void> {
    await authFetch("/api/auth/sign-out", {
      method: "POST",
      headers: { Authorization: \`Bearer \${token}\` },
    });
  },

  /** List all users (admin endpoint) */
  async listUsers(): Promise<{ users: AuthUser[] }> {
    return authFetch<{ users: AuthUser[] }>("/api/auth/users");
  },
${hasOAuth ? `
  /** Get the OAuth redirect URL for a social provider */
  getOAuthUrl(provider: ${socialProviders.map((p) => `"${p}"`).join(" | ")}): string {
    return AUTH_URL + "/api/auth/oauth/" + provider;
  },
` : ""}
  /** Get the auth dashboard URL */
  get dashboardUrl(): string {
    return AUTH_URL + "/api/auth/dashboard";
  },
};

export default authClient;
`;
}
