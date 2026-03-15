/**
 * PlanetScale API client
 * REST API at https://api.planetscale.com/v1
 * Auth: Service Token (id:token)
 */

interface PlanetScaleCredentials {
  serviceTokenId: string;
  serviceToken: string;
  organization: string;
}

let credentials: PlanetScaleCredentials | null = null;

export function setCredentials(creds: PlanetScaleCredentials) {
  credentials = creds;
}

export function getCredentials(): PlanetScaleCredentials {
  if (!credentials)
    throw new Error("Not logged in. Run: cairn login planetscale");
  return credentials;
}

export async function planetscaleApi<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const creds = getCredentials();
  const url = `https://api.planetscale.com/v1/organizations/${creds.organization}${path}`;

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `${creds.serviceTokenId}:${creds.serviceToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PlanetScale API error (${res.status}): ${text}`);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
