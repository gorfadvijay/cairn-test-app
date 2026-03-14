/**
 * Railway project and service management
 */

import { railwayGql, getWorkspaceId } from "./api.ts";

export interface RailwayProject {
  id: string;
  name: string;
  environments: { edges: { node: { id: string; name: string } }[] };
}

export interface RailwayService {
  id: string;
  name: string;
}

/**
 * Create a new Railway project
 */
export async function createProject(name: string): Promise<RailwayProject> {
  const workspaceId = await getWorkspaceId();

  const result = await railwayGql<{ projectCreate: RailwayProject }>(`
    mutation($input: ProjectCreateInput!) {
      projectCreate(input: $input) {
        id
        name
        environments { edges { node { id name } } }
      }
    }
  `, {
    input: { name, workspaceId },
  });
  return result.projectCreate;
}

/**
 * Delete a Railway project
 */
export async function deleteProject(projectId: string): Promise<void> {
  await railwayGql(`
    mutation($id: String!) {
      projectDelete(id: $id)
    }
  `, { id: projectId });
}

/**
 * Get a project by ID
 */
export async function getProject(projectId: string): Promise<RailwayProject> {
  const result = await railwayGql<{ project: RailwayProject }>(`
    query($id: String!) {
      project(id: $id) {
        id
        name
        environments { edges { node { id name } } }
      }
    }
  `, { id: projectId });
  return result.project;
}

/**
 * Create a service within a project
 */
export async function createService(
  projectId: string,
  name: string,
): Promise<RailwayService> {
  const result = await railwayGql<{ serviceCreate: RailwayService }>(`
    mutation($input: ServiceCreateInput!) {
      serviceCreate(input: $input) {
        id
        name
      }
    }
  `, {
    input: { projectId, name },
  });
  return result.serviceCreate;
}

/**
 * Delete a service
 */
export async function deleteService(serviceId: string): Promise<void> {
  await railwayGql(`
    mutation($id: String!) {
      serviceDelete(id: $id)
    }
  `, { id: serviceId });
}

/**
 * Get the production environment ID from a project
 */
export function getProductionEnvId(project: RailwayProject): string {
  const prodEnv = project.environments.edges.find(
    (e) => e.node.name === "production",
  );
  if (!prodEnv) throw new Error("No production environment found");
  return prodEnv.node.id;
}

/**
 * Set an environment variable on a service
 */
export async function setServiceVariable(
  projectId: string,
  environmentId: string,
  serviceId: string,
  name: string,
  value: string,
): Promise<void> {
  await railwayGql(`
    mutation($input: VariableUpsertInput!) {
      variableUpsert(input: $input)
    }
  `, {
    input: { projectId, environmentId, serviceId, name, value },
  });
}

/**
 * Get a service's deployed URL (domain)
 */
export async function getServiceDomain(
  serviceId: string,
  environmentId: string,
): Promise<string | null> {
  const result = await railwayGql<{
    domains: { serviceDomains: { domain: string }[] };
  }>(`
    query($serviceId: String!, $environmentId: String!) {
      domains(serviceId: $serviceId, environmentId: $environmentId) {
        serviceDomains { domain }
      }
    }
  `, { serviceId, environmentId });

  return result.domains.serviceDomains[0]?.domain || null;
}

/**
 * Generate a Railway-managed domain for a service
 */
export async function createServiceDomain(
  serviceId: string,
  environmentId: string,
): Promise<string> {
  const result = await railwayGql<{
    serviceDomainCreate: { domain: string };
  }>(`
    mutation($input: ServiceDomainCreateInput!) {
      serviceDomainCreate(input: $input) {
        domain
      }
    }
  `, {
    input: { serviceId, environmentId },
  });
  return result.serviceDomainCreate.domain;
}
