/**
 * Railway resource cleanup
 * Deletes the entire Railway project (which removes all services, databases, etc.)
 */

import { deleteProject } from "./project.ts";

export async function destroyRailwayProject(projectId: string): Promise<void> {
  await deleteProject(projectId);
}
