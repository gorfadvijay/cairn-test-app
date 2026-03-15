/**
 * Inngest API client
 * REST API at https://api.inngest.com
 * Auth: Bearer token (signing key for verification, event key for sending)
 */

interface InngestCredentials {
  eventKey: string;
  signingKey: string;
}

let credentials: InngestCredentials | null = null;

export function setCredentials(creds: InngestCredentials) {
  credentials = creds;
}

export function getCredentials(): InngestCredentials {
  if (!credentials)
    throw new Error("Not logged in. Run: cairn login inngest");
  return credentials;
}

export async function inngestApi<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const creds = getCredentials();

  const res = await fetch(`https://api.inngest.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${creds.signingKey}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Inngest API error (${res.status}): ${text}`);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
