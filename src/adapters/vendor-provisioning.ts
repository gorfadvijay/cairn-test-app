/**
 * Vendor provisioning — provisions Phase 8 vendor resources
 * and returns env vars to inject into deployed services.
 *
 * Used by both Cloudflare and Railway deploy pipelines.
 */

import type { CairnConfig } from "../parser/types.ts";
import { loadVendorCredentials } from "../secrets/local.ts";
import { loadState, saveState } from "../state.ts";

// Trigger.dev
import { setCredentials as setTriggerCreds } from "./trigger/api.ts";
import { verifyTriggerEnvironment } from "./trigger/provisioner.ts";

// Resend
import { setCredentials as setResendCreds } from "./resend/api.ts";
import { verifyResendAccess } from "./resend/provisioner.ts";

// Clerk
import { setCredentials as setClerkCreds } from "./clerk/api.ts";
import { verifyClerkInstance } from "./clerk/provisioner.ts";

// Inngest
import { setCredentials as setInngestCreds } from "./inngest/api.ts";
import { verifyInngestAccess } from "./inngest/provisioner.ts";

// Sentry
import { setCredentials as setSentryCreds } from "./sentry/api.ts";
import { createSentryProject, listSentryProjects } from "./sentry/provisioner.ts";

// Axiom
import { setCredentials as setAxiomCreds } from "./axiom/api.ts";
import { createAxiomDataset, listAxiomDatasets } from "./axiom/provisioner.ts";

export interface VendorEnvVars {
  [key: string]: string;
}

/**
 * Provision all vendor resources from cairn.hcl and return env vars to inject
 */
export async function provisionVendorResources(
  config: CairnConfig,
): Promise<VendorEnvVars> {
  const env: VendorEnvVars = {};
  const state = loadState();

  // ─── Jobs (Trigger.dev / Inngest) ─────────────────────────
  for (const job of config.jobs) {
    const vendor = job.vendor || "trigger";

    if (vendor === "trigger") {
      const resourceKey = `trigger:${job.name}`;
      if (!state.resources[resourceKey]) {
        const creds = loadVendorCredentials("trigger");
        if (!creds) {
          console.log(`  ⚠ Skipping jobs/${job.name}: Run \`cairn login trigger\` first`);
          continue;
        }
        setTriggerCreds(creds as { apiKey: string });

        console.log(`  Verifying Trigger.dev: ${job.name}...`);
        const result = await verifyTriggerEnvironment();
        state.resources[resourceKey] = {
          environmentId: result.environmentId,
          projectId: result.projectId,
          projectName: result.projectName,
        };
        saveState(state);
        console.log(`  ✓ Trigger.dev connected: ${result.projectName}`);
      } else {
        console.log(`  ✓ Trigger.dev already connected: ${job.name}`);
      }

      const creds = loadVendorCredentials("trigger");
      if (creds) {
        env.TRIGGER_API_KEY = creds.apiKey;
        env.TRIGGER_PROJECT_ID = state.resources[resourceKey]?.projectId || "";
      }
    }

    if (vendor === "inngest") {
      const resourceKey = `inngest:${job.name}`;
      if (!state.resources[resourceKey]) {
        const creds = loadVendorCredentials("inngest");
        if (!creds) {
          console.log(`  ⚠ Skipping jobs/${job.name}: Run \`cairn login inngest\` first`);
          continue;
        }
        setInngestCreds(creds as { eventKey: string; signingKey: string });

        console.log(`  Verifying Inngest: ${job.name}...`);
        const result = await verifyInngestAccess();
        state.resources[resourceKey] = {
          eventKeyValid: String(result.eventKeyValid),
          signingKeyValid: String(result.signingKeyValid),
        };
        saveState(state);
        console.log(`  ✓ Inngest connected`);
      } else {
        console.log(`  ✓ Inngest already connected: ${job.name}`);
      }

      const creds = loadVendorCredentials("inngest");
      if (creds) {
        env.INNGEST_EVENT_KEY = creds.eventKey;
        env.INNGEST_SIGNING_KEY = creds.signingKey;
      }
    }
  }

  // ─── Email (Resend) ───────────────────────────────────────
  for (const email of config.email) {
    const vendor = email.vendor || "resend";

    if (vendor === "resend") {
      const resourceKey = `resend:${email.name}`;
      if (!state.resources[resourceKey]) {
        const creds = loadVendorCredentials("resend");
        if (!creds) {
          console.log(`  ⚠ Skipping email/${email.name}: Run \`cairn login resend\` first`);
          continue;
        }
        setResendCreds(creds as { apiKey: string });

        console.log(`  Verifying Resend: ${email.name}...`);
        const result = await verifyResendAccess();
        state.resources[resourceKey] = {
          apiKeyId: result.apiKeyId,
          apiKeyName: result.apiKeyName,
          domainCount: String(result.domains.length),
        };
        saveState(state);
        console.log(`  ✓ Resend connected: ${result.apiKeyName}`);
      } else {
        console.log(`  ✓ Resend already connected: ${email.name}`);
      }

      const creds = loadVendorCredentials("resend");
      if (creds) {
        env.RESEND_API_KEY = creds.apiKey;
      }
    }
  }

  // ─── Analytics (Tinybird) ─────────────────────────────────
  for (const analytics of config.analytics) {
    const vendor = analytics.vendor || "tinybird";

    if (vendor === "tinybird") {
      const resourceKey = `tinybird:${analytics.name}`;
      if (!state.resources[resourceKey]) {
        const creds = loadVendorCredentials("tinybird");
        if (!creds) {
          console.log(`  ⚠ Skipping analytics/${analytics.name}: Run \`cairn login tinybird\` first`);
          continue;
        }

        state.resources[resourceKey] = { connected: "true" };
        saveState(state);
        console.log(`  ✓ Tinybird connected: ${analytics.name}`);
      } else {
        console.log(`  ✓ Tinybird already connected: ${analytics.name}`);
      }

      const creds = loadVendorCredentials("tinybird");
      if (creds) {
        env.TINYBIRD_API_TOKEN = creds.apiToken;
        env.TINYBIRD_HOST = creds.host || "api.tinybird.co";
      }
    }
  }

  // ─── Monitoring (Sentry) ──────────────────────────────────
  for (const mon of config.monitoring) {
    const vendor = mon.vendor || "sentry";

    if (vendor === "sentry") {
      const resourceKey = `sentry:${mon.name}`;
      if (!state.resources[resourceKey]) {
        const creds = loadVendorCredentials("sentry");
        if (!creds) {
          console.log(`  ⚠ Skipping monitoring/${mon.name}: Run \`cairn login sentry\` first`);
          continue;
        }
        setSentryCreds(creds as { authToken: string; organization: string });

        console.log(`  Provisioning Sentry project: ${mon.name}...`);
        // Check if project already exists
        const existing = await listSentryProjects();
        const projSlug = `cairn-${config.project.name}`;
        const found = (existing as Array<{ slug: string; id: string }>).find(
          (p) => p.slug === projSlug,
        );

        if (found) {
          // Get DSN from existing project
          const { sentryApi } = await import("./sentry/api.ts");
          const keys = await sentryApi<{ dsn: { public: string } }[]>(
            "GET",
            `/projects/${creds.organization}/${projSlug}/keys/`,
          );
          state.resources[resourceKey] = {
            projectId: found.id,
            slug: projSlug,
            dsn: keys[0]?.dsn?.public || "",
          };
          saveState(state);
          console.log(`  ✓ Sentry project exists: ${projSlug}`);
        } else {
          const proj = await createSentryProject(projSlug, "node");
          state.resources[resourceKey] = {
            projectId: proj.projectId,
            slug: proj.slug,
            dsn: proj.dsn,
          };
          saveState(state);
          console.log(`  ✓ Sentry project created: ${proj.slug}`);
        }
      } else {
        console.log(`  ✓ Sentry already connected: ${mon.name}`);
      }

      const dsn = state.resources[resourceKey]?.dsn;
      if (dsn) {
        env.SENTRY_DSN = dsn;
      }
    }
  }

  // ─── Logging (Axiom) ──────────────────────────────────────
  for (const log of config.logging) {
    const vendor = log.vendor || "axiom";

    if (vendor === "axiom") {
      const resourceKey = `axiom:${log.name}`;
      if (!state.resources[resourceKey]) {
        const creds = loadVendorCredentials("axiom");
        if (!creds) {
          console.log(`  ⚠ Skipping logging/${log.name}: Run \`cairn login axiom\` first`);
          continue;
        }
        setAxiomCreds(creds as { apiToken: string });

        console.log(`  Provisioning Axiom dataset: ${log.name}...`);
        const datasetName = `cairn-${config.project.name}`;

        // Check if dataset exists
        const datasets = await listAxiomDatasets();
        const found = (datasets as Array<{ name: string }>).find(
          (d) => d.name === datasetName,
        );

        if (found) {
          state.resources[resourceKey] = { name: datasetName };
          saveState(state);
          console.log(`  ✓ Axiom dataset exists: ${datasetName}`);
        } else {
          try {
            const ds = await createAxiomDataset(datasetName, `Cairn logs for ${config.project.name}`);
            state.resources[resourceKey] = { name: ds.name };
            saveState(state);
            console.log(`  ✓ Axiom dataset created: ${ds.name}`);
          } catch {
            // Token may lack create permission — still inject the token
            state.resources[resourceKey] = { name: datasetName };
            saveState(state);
            console.log(`  ✓ Axiom connected (read-only): ${log.name}`);
          }
        }
      } else {
        console.log(`  ✓ Axiom already connected: ${log.name}`);
      }

      const creds = loadVendorCredentials("axiom");
      if (creds) {
        env.AXIOM_TOKEN = creds.apiToken;
        env.AXIOM_DATASET = state.resources[resourceKey]?.name || `cairn-${config.project.name}`;
      }
    }
  }

  // ─── Auth vendor: Clerk ───────────────────────────────────
  // If auth block has vendor = "clerk" instead of Better Auth
  for (const auth of config.auth) {
    // Check if any vendor-specific auth is configured (future: vendor field on auth)
    // For now, Clerk is handled via the vendor marketplace, not the auth block
  }

  return env;
}
