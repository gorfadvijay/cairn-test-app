/**
 * Upstash API client
 * Upstash uses a REST API at https://api.upstash.com/v2
 * Auth: Basic auth with base64-encoded email:apiKey
 */

interface UpstashCredentials {
  email: string;
  apiKey: string;
}

let credentials: UpstashCredentials | null = null;

export function setCredentials(creds: UpstashCredentials) {
  credentials = creds;
}

export function getCredentials(): UpstashCredentials {
  if (!credentials)
    throw new Error("Not logged in. Run: cairn login upstash");
  return credentials;
}

/**
 * Execute a REST request against the Upstash API
 */
export async function upstashApi<T = unknown>(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const creds = getCredentials();
  const encoded = btoa(`${creds.email}:${creds.apiKey}`);

  const res = await fetch(`https://api.upstash.com/v2${path}`, {
    method,
    headers: {
      Authorization: `Basic ${encoded}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upstash API error (${res.status}): ${text}`);
  }

  const data = (await res.json()) as T;
  return data;
}

/**
 * Verify credentials by listing databases
 */
export async function verifyToken(): Promise<unknown[]> {
  return upstashApi<unknown[]>("GET", "/redis/databases");
}
