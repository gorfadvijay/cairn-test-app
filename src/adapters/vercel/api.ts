/**
 * Vercel API client
 * REST API at https://api.vercel.com
 * Auth: Bearer token
 */

interface VercelCredentials {
  apiToken: string;
}

let credentials: VercelCredentials | null = null;

export function setCredentials(creds: VercelCredentials) {
  credentials = creds;
}

export function getCredentials(): VercelCredentials {
  if (!credentials)
    throw new Error("Not logged in. Run: cairn login vercel");
  return credentials;
}

export async function vercelApi<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const creds = getCredentials();

  const res = await fetch(`https://api.vercel.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${creds.apiToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vercel API error (${res.status}): ${text}`);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
