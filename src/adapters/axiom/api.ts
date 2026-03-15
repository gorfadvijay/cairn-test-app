/**
 * Axiom API client
 * REST API at https://api.axiom.co
 * Auth: Bearer token (API token)
 */

interface AxiomCredentials {
  apiToken: string;
}

let credentials: AxiomCredentials | null = null;

export function setCredentials(creds: AxiomCredentials) {
  credentials = creds;
}

export function getCredentials(): AxiomCredentials {
  if (!credentials)
    throw new Error("Not logged in. Run: cairn login axiom");
  return credentials;
}

export async function axiomApi<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const creds = getCredentials();

  const res = await fetch(`https://api.axiom.co/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${creds.apiToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Axiom API error (${res.status}): ${text}`);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
