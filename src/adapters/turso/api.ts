/**
 * Turso API client
 * REST API at https://api.turso.tech/v1
 * Auth: Bearer token
 */

interface TursoCredentials {
  apiToken: string;
  organization: string;
}

let credentials: TursoCredentials | null = null;

export function setCredentials(creds: TursoCredentials) {
  credentials = creds;
}

export function getCredentials(): TursoCredentials {
  if (!credentials)
    throw new Error("Not logged in. Run: cairn login turso");
  return credentials;
}

export async function tursoApi<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const creds = getCredentials();
  const url = `https://api.turso.tech/v1/organizations/${creds.organization}${path}`;

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${creds.apiToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Turso API error (${res.status}): ${text}`);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
