import { cf, cfUploadWorker, accountPath } from "./api.ts";

export async function deployWorker(
  scriptName: string,
  scriptContent: string,
  bindings: Record<string, unknown>[],
): Promise<unknown> {
  return cfUploadWorker(scriptName, scriptContent, bindings);
}

export async function deleteWorker(scriptName: string): Promise<void> {
  await cf("DELETE", accountPath(`/workers/scripts/${scriptName}`));
}

export async function getWorkerSubdomain(): Promise<string> {
  const result = await cf<{ subdomain: string }>(
    "GET",
    accountPath("/workers/subdomain"),
  );
  return result.subdomain;
}

/**
 * Enable workers.dev route for a script
 */
export async function enableWorkerRoute(scriptName: string): Promise<void> {
  await cf("POST", accountPath(`/workers/scripts/${scriptName}/subdomain`), {
    enabled: true,
  });
}
