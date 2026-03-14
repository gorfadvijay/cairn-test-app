/**
 * Cloudflare API client
 * One file. All API calls go through here.
 *
 * Supports two auth modes:
 *   - API Token (recommended): single Bearer token, scoped permissions
 *   - Global API Key (legacy): email + key, full account access
 */

interface TokenCredentials {
  apiToken: string;
  accountId: string;
}

interface GlobalKeyCredentials {
  email: string;
  apiKey: string;
  accountId: string;
}

type CloudflareCredentials = TokenCredentials | GlobalKeyCredentials;

let credentials: CloudflareCredentials | null = null;

export function setCredentials(creds: CloudflareCredentials) {
  credentials = creds;
}

export function getCredentials(): CloudflareCredentials {
  if (!credentials)
    throw new Error("Not logged in. Run: cairn login cloudflare");
  return credentials;
}

function authHeaders(): Record<string, string> {
  const creds = getCredentials();
  if ("apiToken" in creds) {
    return { Authorization: `Bearer ${creds.apiToken}` };
  }
  return {
    "X-Auth-Email": creds.email,
    "X-Auth-Key": creds.apiKey,
  };
}

export async function cf<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `https://api.cloudflare.com/client/v4${path}`;

  const res = await fetch(url, {
    method,
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = (await res.json()) as {
    success: boolean;
    result: T;
    errors?: { message: string }[];
  };

  if (!data.success) {
    const errors = data.errors?.map((e) => e.message).join(", ");
    throw new Error(`Cloudflare API error: ${errors || res.statusText}`);
  }

  return data.result;
}

/**
 * Special upload for Workers (multipart form data)
 */
export async function cfUploadWorker(
  scriptName: string,
  scriptContent: string,
  bindings: Record<string, unknown>[],
): Promise<unknown> {
  const creds = getCredentials();
  const url = `https://api.cloudflare.com/client/v4/accounts/${creds.accountId}/workers/scripts/${scriptName}`;

  const metadata = {
    main_module: "index.js",
    bindings,
    compatibility_date: new Date().toISOString().split("T")[0],
  };

  const formData = new FormData();
  formData.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" }),
  );
  formData.append(
    "index.js",
    new Blob([scriptContent], { type: "application/javascript+module" }),
    "index.js",
  );

  const res = await fetch(url, {
    method: "PUT",
    headers: authHeaders(),
    body: formData,
  });

  const data = (await res.json()) as {
    success: boolean;
    result: unknown;
    errors?: { message: string }[];
  };
  if (!data.success) {
    const errors = data.errors?.map((e) => e.message).join(", ");
    throw new Error(`Worker upload failed: ${errors}`);
  }

  return data.result;
}

export function accountPath(path: string): string {
  return `/accounts/${getCredentials().accountId}${path}`;
}
