/**
 * Supabase API client
 * REST API at https://api.supabase.com/v1
 * Auth: Bearer token (access token)
 */

interface SupabaseCredentials {
  accessToken: string;
}

let credentials: SupabaseCredentials | null = null;

export function setCredentials(creds: SupabaseCredentials) {
  credentials = creds;
}

export function getCredentials(): SupabaseCredentials {
  if (!credentials)
    throw new Error("Not logged in. Run: cairn login supabase");
  return credentials;
}

export async function supabaseApi<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const creds = getCredentials();

  const res = await fetch(`https://api.supabase.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase API error (${res.status}): ${text}`);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
