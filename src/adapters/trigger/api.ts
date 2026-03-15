/**
 * Trigger.dev API client
 * REST API at https://api.trigger.dev
 * Auth: Bearer token (API key)
 */

interface TriggerCredentials {
  apiKey: string;
}

let credentials: TriggerCredentials | null = null;

export function setCredentials(creds: TriggerCredentials) {
  credentials = creds;
}

export function getCredentials(): TriggerCredentials {
  if (!credentials)
    throw new Error("Not logged in. Run: cairn login trigger");
  return credentials;
}

export async function triggerApi<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const creds = getCredentials();

  const res = await fetch(`https://api.trigger.dev/api/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${creds.apiKey}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Trigger.dev API error (${res.status}): ${text}`);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
