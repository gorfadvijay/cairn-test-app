/**
 * Railway API client
 * Railway uses a GraphQL API at https://backboard.railway.app/graphql/v2
 * Auth: single Bearer token
 */

interface RailwayCredentials {
  apiToken: string;
}

let credentials: RailwayCredentials | null = null;

export function setCredentials(creds: RailwayCredentials) {
  credentials = creds;
}

export function getCredentials(): RailwayCredentials {
  if (!credentials)
    throw new Error("Not logged in. Run: cairn login railway");
  return credentials;
}

/**
 * Execute a GraphQL query against the Railway API
 */
export async function railwayGql<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const creds = getCredentials();

  const res = await fetch("https://backboard.railway.app/graphql/v2", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  const data = (await res.json()) as {
    data?: T;
    errors?: { message: string }[];
  };

  if (data.errors?.length) {
    const messages = data.errors.map((e) => e.message).join(", ");
    throw new Error(`Railway API error: ${messages}`);
  }

  if (!data.data) {
    throw new Error(`Railway API error: No data returned (${res.status})`);
  }

  return data.data;
}

/**
 * Verify the token works by fetching the current user
 */
export async function verifyToken(): Promise<{ name: string; email: string }> {
  const result = await railwayGql<{ me: { name: string; email: string } }>(`
    query { me { name email } }
  `);
  return result.me;
}

/**
 * Get the user's default workspace ID
 */
export async function getWorkspaceId(): Promise<string> {
  const result = await railwayGql<{
    me: { workspaces: { id: string; name: string }[] };
  }>(`
    query { me { workspaces { id name } } }
  `);

  const workspaces = result.me.workspaces;
  if (!workspaces.length) throw new Error("No Railway workspace found");
  return workspaces[0]!.id;
}
