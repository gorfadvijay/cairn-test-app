/**
 * Usage metrics API
 * Fetches analytics from Cloudflare and Railway APIs
 */

import { requireAuth } from "./auth.ts";
import * as db from "./db.ts";

interface MetricPoint {
  date: string;
  requests: number;
  bandwidth: number;
  errors: number;
}

interface UsageMetrics {
  target: string;
  period: string;
  totalRequests: number;
  totalBandwidth: number;
  totalErrors: number;
  dataPoints: MetricPoint[];
}

/**
 * GET /api/projects/:id/metrics
 * Returns usage metrics for a project
 */
export async function getMetrics(req: Request, id: string): Promise<Response> {
  const user = requireAuth(req);
  if (user instanceof Response) return user;

  const project = db.getProjectById.get(id);
  if (!project || project.user_id !== user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const state = JSON.parse(project.state);
  const target = state.target || project.target;

  const url = new URL(req.url);
  const period = url.searchParams.get("period") || "7d";

  let metrics: UsageMetrics;

  switch (target) {
    case "cloudflare":
      metrics = await getCloudflareMetrics(state, period);
      break;
    case "railway":
      metrics = await getRailwayMetrics(state, period);
      break;
    default:
      metrics = getEmptyMetrics(target, period);
  }

  return Response.json({ metrics });
}

async function getCloudflareMetrics(
  state: Record<string, any>,
  period: string,
): Promise<UsageMetrics> {
  // Cloudflare Analytics API requires:
  // - Account ID from credentials
  // - Worker script name from state
  // For MVP, return mock structure — real integration requires stored CF credentials
  const days = period === "30d" ? 30 : period === "24h" ? 1 : 7;
  const dataPoints = generateDateRange(days);

  return {
    target: "cloudflare",
    period,
    totalRequests: 0,
    totalBandwidth: 0,
    totalErrors: 0,
    dataPoints,
  };
}

async function getRailwayMetrics(
  state: Record<string, any>,
  period: string,
): Promise<UsageMetrics> {
  // Railway metrics via GraphQL — requires stored Railway credentials
  // For MVP, return structure — real integration when Console has stored credentials
  const days = period === "30d" ? 30 : period === "24h" ? 1 : 7;
  const dataPoints = generateDateRange(days);

  return {
    target: "railway",
    period,
    totalRequests: 0,
    totalBandwidth: 0,
    totalErrors: 0,
    dataPoints,
  };
}

function getEmptyMetrics(target: string, period: string): UsageMetrics {
  return {
    target,
    period,
    totalRequests: 0,
    totalBandwidth: 0,
    totalErrors: 0,
    dataPoints: [],
  };
}

function generateDateRange(days: number): MetricPoint[] {
  const points: MetricPoint[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    points.push({
      date: d.toISOString().split("T")[0]!,
      requests: 0,
      bandwidth: 0,
      errors: 0,
    });
  }
  return points;
}
