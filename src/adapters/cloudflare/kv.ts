import { cf, accountPath } from "./api.ts";

export async function createKVNamespace(
  title: string,
): Promise<{ id: string }> {
  return cf("POST", accountPath("/storage/kv/namespaces"), { title });
}

export async function deleteKVNamespace(namespaceId: string): Promise<void> {
  await cf("DELETE", accountPath(`/storage/kv/namespaces/${namespaceId}`));
}

export async function listKVNamespaces(): Promise<unknown[]> {
  return cf("GET", accountPath("/storage/kv/namespaces"));
}
