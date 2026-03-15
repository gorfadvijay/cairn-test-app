/**
 * Neon API client
 * Neon uses a REST API at https://console.neon.tech/api/v2
 * Auth: Bearer token (API key)
 */

const BASE_URL = "https://console.neon.tech/api/v2";

interface NeonCredentials {
  apiKey: string;
  orgId?: string;
}

let credentials: NeonCredentials | null = null;

export function setCredentials(creds: NeonCredentials) {
  credentials = creds;
}

export function getCredentials(): NeonCredentials {
  if (!credentials)
    throw new Error("Not logged in. Run: cairn login neon");
  return credentials;
}

/**
 * Generic REST helper for the Neon API
 */
export async function neonApi<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const creds = getCredentials();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${creds.apiKey}`,
    "Content-Type": "application/json",
  };
  if (creds.orgId) {
    headers["Neon-Organization"] = creds.orgId;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Neon API error (${res.status}): ${text}`);
  }

  // DELETE may return 204 with no body
  if (res.status === 204) return undefined as T;

  return (await res.json()) as T;
}

/**
 * Verify the API key works by fetching projects
 */
export async function verifyToken(): Promise<{ projects: unknown[] }> {
  const result = await neonApi<{ projects: unknown[] }>("GET", "/projects");
  return result;
}
