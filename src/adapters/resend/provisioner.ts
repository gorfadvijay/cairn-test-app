/**
 * Resend provisioner
 * Resend doesn't need per-project provisioning — just API key wiring.
 * We verify access via the API keys endpoint and support domain management.
 */

import { resendApi } from "./api.ts";

interface ResendVerifyResult {
  apiKeyId: string;
  apiKeyName: string;
  domains: Array<{ id: string; name: string; status: string }>;
}

/**
 * Verify Resend access by listing API keys and domains
 */
export async function verifyResendAccess(): Promise<ResendVerifyResult> {
  const keys = await resendApi<{
    data: Array<{ id: string; name: string; created_at: string }>;
  }>("GET", "/api-keys");

  const domains = await resendApi<{
    data: Array<{ id: string; name: string; status: string }>;
  }>("GET", "/domains");

  const currentKey = keys.data?.[0];
  return {
    apiKeyId: currentKey?.id || "",
    apiKeyName: currentKey?.name || "unknown",
    domains: domains.data || [],
  };
}

/**
 * Add a domain to Resend for sending
 */
export async function addResendDomain(
  domain: string,
): Promise<{ domainId: string; name: string; status: string }> {
  const result = await resendApi<{
    id: string;
    name: string;
    status: string;
  }>("POST", "/domains", { name: domain });

  return {
    domainId: result.id,
    name: result.name,
    status: result.status,
  };
}

/**
 * Delete a domain from Resend
 */
export async function deleteResendDomain(domainId: string): Promise<void> {
  await resendApi("DELETE", `/domains/${domainId}`);
}

/**
 * List all Resend domains
 */
export async function listResendDomains(): Promise<unknown[]> {
  const result = await resendApi<{ data: unknown[] }>("GET", "/domains");
  return result.data || [];
}
