/**
 * Resend API client
 * REST API at https://api.resend.com
 * Auth: Bearer token (API key)
 */

interface ResendCredentials {
  apiKey: string;
}

let credentials: ResendCredentials | null = null;

export function setCredentials(creds: ResendCredentials) {
  credentials = creds;
}

export function getCredentials(): ResendCredentials {
  if (!credentials)
    throw new Error("Not logged in. Run: cairn login resend");
  return credentials;
}

export async function resendApi<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const creds = getCredentials();

  const res = await fetch(`https://api.resend.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${creds.apiKey}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend API error (${res.status}): ${text}`);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
