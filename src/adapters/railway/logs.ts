/**
 * Railway log fetching
 * Uses Railway's GraphQL API to fetch deployment logs for services
 */

import { railwayGql } from "./api.ts";

interface LogEntry {
  timestamp: string;
  message: string;
  severity: string;
}

interface DeploymentLog {
  node: {
    id: string;
    status: string;
    createdAt: string;
  };
}

/**
 * Get the latest deployment for a service in an environment
 */
export async function getLatestDeployment(
  serviceId: string,
  environmentId: string,
): Promise<{ id: string; status: string; createdAt: string } | null> {
  const result = await railwayGql<{
    deployments: { edges: DeploymentLog[] };
  }>(`
    query($serviceId: String!, $environmentId: String!) {
      deployments(
        first: 1
        input: { serviceId: $serviceId, environmentId: $environmentId }
      ) {
        edges {
          node {
            id
            status
            createdAt
          }
        }
      }
    }
  `, { serviceId, environmentId });

  const edge = result.deployments.edges[0];
  return edge ? edge.node : null;
}

/**
 * Fetch build/deploy logs for a deployment
 */
export async function getDeploymentLogs(
  deploymentId: string,
): Promise<LogEntry[]> {
  const result = await railwayGql<{
    deploymentLogs: LogEntry[];
  }>(`
    query($deploymentId: String!) {
      deploymentLogs(deploymentId: $deploymentId) {
        timestamp
        message
        severity
      }
    }
  `, { deploymentId });

  return result.deploymentLogs || [];
}

/**
 * Fetch environment logs (runtime logs) for a deployment
 */
export async function getEnvironmentLogs(
  deploymentId: string,
): Promise<LogEntry[]> {
  const result = await railwayGql<{
    environmentLogs: LogEntry[];
  }>(`
    query($deploymentId: String!) {
      environmentLogs(deploymentId: $deploymentId) {
        timestamp
        message
        severity
      }
    }
  `, { deploymentId });

  return result.environmentLogs || [];
}
