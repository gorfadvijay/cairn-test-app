/**
 * Sentry provisioner
 * Create/delete Sentry projects via the API
 */

import { getCredentials, sentryApi } from "./api.ts";

interface CreateProjectResult {
  projectId: string;
  slug: string;
  dsn: string;
}

/**
 * Create a new Sentry project under the configured organization
 */
export async function createSentryProject(
  name: string,
  platform: string = "node",
): Promise<CreateProjectResult> {
  const creds = getCredentials();
  // Sentry requires a team — use the first team in the org
  const teams = await sentryApi<{ slug: string }[]>(
    "GET",
    `/organizations/${creds.organization}/teams/`,
  );
  const teamSlug = teams[0]?.slug;
  if (!teamSlug) throw new Error("No teams found in Sentry organization");

  const result = await sentryApi<{
    id: string;
    slug: string;
  }>(
    "POST",
    `/teams/${creds.organization}/${teamSlug}/projects/`,
    { name, platform },
  );

  // Get the DSN for the newly created project
  const keys = await sentryApi<{ dsn: { public: string } }[]>(
    "GET",
    `/projects/${creds.organization}/${result.slug}/keys/`,
  );

  return {
    projectId: result.id,
    slug: result.slug,
    dsn: keys[0]?.dsn?.public || "",
  };
}

/**
 * Delete a Sentry project
 */
export async function deleteSentryProject(
  projectSlug: string,
): Promise<void> {
  const creds = getCredentials();
  await sentryApi("DELETE", `/projects/${creds.organization}/${projectSlug}/`);
}

/**
 * List all Sentry projects in the organization
 */
export async function listSentryProjects(): Promise<unknown[]> {
  const creds = getCredentials();
  return await sentryApi<unknown[]>(
    "GET",
    `/organizations/${creds.organization}/projects/`,
  );
}
