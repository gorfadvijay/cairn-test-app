/**
 * Trigger.dev provisioner
 * Verify access and retrieve environment info via the Trigger.dev API.
 * Trigger.dev projects are created in the dashboard — provisioning here
 * verifies the API key and returns the current environment details.
 */

import { triggerApi } from "./api.ts";

interface TriggerEnvironmentResult {
  environmentId: string;
  projectId: string;
  projectName: string;
  organizationName: string;
  apiKey: string;
}

/**
 * Verify Trigger.dev access and return environment details.
 * The /whoami endpoint returns the environment tied to the API key.
 */
export async function verifyTriggerEnvironment(): Promise<TriggerEnvironmentResult> {
  const result = await triggerApi<{
    id: string;
    slug: string;
    apiKey: string;
    projectId: string;
    project: { id: string; name: string };
    organization: { id: string; title: string };
  }>("GET", "/whoami");

  return {
    environmentId: result.id,
    projectId: result.project.id,
    projectName: result.project.name,
    organizationName: result.organization.title,
    apiKey: result.apiKey,
  };
}

/**
 * Destroy is a no-op — Trigger.dev projects are managed via the dashboard
 */
export async function destroyTriggerProject(): Promise<void> {
  // No-op: projects are managed through the Trigger.dev dashboard
}
