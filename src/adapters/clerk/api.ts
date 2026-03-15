/**
 * Clerk API client
 * REST API at https://api.clerk.com
 * Auth: Bearer token (Secret key)
 */

interface ClerkCredentials {
  secretKey: string;
}

let credentials: ClerkCredentials | null = null;

export function setCredentials(creds: ClerkCredentials) {
  credentials = creds;
}

export function getCredentials(): ClerkCredentials {
  if (!credentials)
    throw new Error("Not logged in. Run: cairn login clerk");
  return credentials;
}

export async function clerkApi<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const creds = getCredentials();

  const res = await fetch(`https://api.clerk.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${creds.secretKey}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Clerk API error (${res.status}): ${text}`);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
