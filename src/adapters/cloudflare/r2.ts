import { cf, accountPath } from "./api.ts";

export async function createR2Bucket(name: string): Promise<unknown> {
  return cf("POST", accountPath("/r2/buckets"), { name });
}

export async function deleteR2Bucket(name: string): Promise<void> {
  await cf("DELETE", accountPath(`/r2/buckets/${name}`));
}

export async function listR2Buckets(): Promise<unknown[]> {
  return cf("GET", accountPath("/r2/buckets"));
}
