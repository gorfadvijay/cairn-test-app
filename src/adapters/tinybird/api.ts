/**
 * TinyBird API client
 * REST API at https://api.{region}.tinybird.co
 * Auth: Bearer token
 */

interface TinyBirdCredentials {
  apiToken: string;
  host: string;
}

let credentials: TinyBirdCredentials | null = null;

export function setCredentials(creds: TinyBirdCredentials) {
  credentials = creds;
}

export function getCredentials(): TinyBirdCredentials {
  if (!credentials)
    throw new Error("Not logged in. Run: cairn login tinybird");
  return credentials;
}

export async function tinybirdApi<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const creds = getCredentials();
  const host = creds.host || "api.tinybird.co";
  const baseUrl = host.startsWith("http") ? host : `https://${host}`;

  const res = await fetch(`${baseUrl}/v0${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${creds.apiToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TinyBird API error (${res.status}): ${text}`);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
