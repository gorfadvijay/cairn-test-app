/**
 * Sentry API client
 * REST API at https://sentry.io/api/0/
 * Auth: Bearer token (Auth token)
 */

interface SentryCredentials {
  authToken: string;
  organization: string;
}

let credentials: SentryCredentials | null = null;

export function setCredentials(creds: SentryCredentials) {
  credentials = creds;
}

export function getCredentials(): SentryCredentials {
  if (!credentials)
    throw new Error("Not logged in. Run: cairn login sentry");
  return credentials;
}

export async function sentryApi<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const creds = getCredentials();

  const res = await fetch(`https://sentry.io/api/0${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${creds.authToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sentry API error (${res.status}): ${text}`);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
