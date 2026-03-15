/**
 * Clerk provisioner
 * Clerk instances are managed via the dashboard — provisioning here
 * wires up the API keys and verifies the instance is accessible.
 */

import { clerkApi } from "./api.ts";

interface ClerkInstanceResult {
  instanceId: string;
  environmentType: string;
}

/**
 * Verify Clerk instance is accessible and return instance details.
 * Clerk doesn't support creating instances via API — they're created in the dashboard.
 * This "provisions" by verifying access and returning connection env vars.
 */
export async function verifyClerkInstance(): Promise<ClerkInstanceResult> {
  const result = await clerkApi<{
    id: string;
    object: string;
    environment_type: string;
  }>("GET", "/instance");

  return {
    instanceId: result.id,
    environmentType: result.environment_type,
  };
}

/**
 * List all users in the Clerk instance (for verification)
 */
export async function listClerkUsers(): Promise<unknown[]> {
  const result = await clerkApi<unknown[]>("GET", "/users?limit=10");
  return result || [];
}

/**
 * Destroy is a no-op for Clerk — instances are managed via dashboard
 */
export async function destroyClerkInstance(): Promise<void> {
  // No-op: Clerk instances are managed through the Clerk dashboard
}
