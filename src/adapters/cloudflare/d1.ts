import { cf, accountPath } from "./api.ts";

export async function createD1Database(
  name: string,
): Promise<{ id: string; name: string }> {
  const result = await cf<{ uuid: string; name: string }>(
    "POST",
    accountPath("/d1/database"),
    { name },
  );
  // Cloudflare returns `uuid`, normalize to `id`
  return { id: result.uuid, name: result.name };
}

export async function deleteD1Database(databaseId: string): Promise<void> {
  await cf("DELETE", accountPath(`/d1/database/${databaseId}`));
}

export async function runD1Query(
  databaseId: string,
  sql: string,
): Promise<unknown> {
  return cf("POST", accountPath(`/d1/database/${databaseId}/query`), { sql });
}

export async function listD1Databases(): Promise<unknown[]> {
  return cf("GET", accountPath("/d1/database"));
}
