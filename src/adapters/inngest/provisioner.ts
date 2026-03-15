/**
 * Inngest provisioner
 * Inngest apps are registered by syncing your serve endpoint.
 * Provisioning here verifies access by sending a test event and listing events.
 */

import { getCredentials } from "./api.ts";

interface InngestVerifyResult {
  eventKeyValid: boolean;
  signingKeyValid: boolean;
  eventIds: string[];
}

/**
 * Verify Inngest access by sending a test event via the event key
 * and checking the signing key against the API.
 */
export async function verifyInngestAccess(): Promise<InngestVerifyResult> {
  const creds = getCredentials();

  // Verify event key by sending a test event to inn.gs
  const eventRes = await fetch("https://inn.gs/e/" + creds.eventKey, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "cairn/verify",
      data: { test: true, timestamp: Date.now() },
    }),
  });
  const eventKeyValid = eventRes.ok;

  // Verify signing key by listing events
  const eventsRes = await fetch("https://api.inngest.com/v1/events", {
    headers: {
      Authorization: `Bearer ${creds.signingKey}`,
      "Content-Type": "application/json",
    },
  });
  const signingKeyValid = eventsRes.ok;
  let eventIds: string[] = [];
  if (eventsRes.ok) {
    const eventsData = (await eventsRes.json()) as {
      data?: Array<{ name: string }>;
    };
    eventIds = (eventsData.data || []).map((e) => e.name);
  }

  return { eventKeyValid, signingKeyValid, eventIds };
}

/**
 * Send an event to Inngest
 */
export async function sendInngestEvent(
  name: string,
  data: Record<string, unknown>,
): Promise<boolean> {
  const creds = getCredentials();
  const res = await fetch("https://inn.gs/e/" + creds.eventKey, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, data }),
  });
  return res.ok;
}

/**
 * Destroy is a no-op — Inngest apps are unregistered by removing the serve endpoint
 */
export async function destroyInngestApp(): Promise<void> {
  // No-op: apps are deregistered when you stop serving the endpoint
}
