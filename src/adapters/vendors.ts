/**
 * Vendor registration — imports and registers all vendor adapters
 * This file is imported at CLI startup to populate the vendor registry
 */

import { registerVendor } from "./vendor-sdk.ts";
import type { VendorAdapter } from "./vendor-sdk.ts";

// ─── Cloudflare ──────────────────────────────────────────────

const cloudflare: VendorAdapter = {
  id: "cloudflare",
  name: "Cloudflare",
  category: "deploy",
  credentialsUrl: "https://dash.cloudflare.com/profile/api-tokens",
  loginFields: [
    { name: "apiToken", type: "password", message: "API Token:" },
    { name: "accountId", type: "text", message: "Account ID:" },
  ],
  async verify(creds) {
    // Support both API Token (Bearer) and Global API Key (X-Auth-Key) auth
    const headers: Record<string, string> = creds.apiToken
      ? { Authorization: `Bearer ${creds.apiToken}` }
      : { "X-Auth-Email": creds.email, "X-Auth-Key": creds.apiKey };
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${creds.accountId}`,
      { headers },
    );
    if (!res.ok) return { ok: false };
    const data = await res.json() as { result?: { name?: string } };
    return { ok: true, detail: data.result?.name || "connected" };
  },
};

// ─── Railway ─────────────────────────────────────────────────

const railway: VendorAdapter = {
  id: "railway",
  name: "Railway",
  category: "deploy",
  credentialsUrl: "https://railway.app/account/tokens",
  loginFields: [
    { name: "apiToken", type: "password", message: "API Token:" },
  ],
  async verify(creds) {
    const res = await fetch("https://backboard.railway.app/graphql/v2", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "{ me { name email } }" }),
    });
    if (!res.ok) return { ok: false };
    const data = await res.json() as { data?: { me?: { name?: string; email?: string } } };
    const me = data.data?.me;
    return { ok: !!me, detail: me?.name || me?.email || "connected" };
  },
};

// ─── Neon ────────────────────────────────────────────────────

const neon: VendorAdapter = {
  id: "neon",
  name: "Neon",
  category: "database",
  credentialsUrl: "https://console.neon.tech/app/settings/api-keys",
  loginFields: [
    { name: "apiKey", type: "password", message: "API Key:" },
  ],
  async verify(creds) {
    const res = await fetch("https://console.neon.tech/api/v2/users/me", {
      headers: { Authorization: `Bearer ${creds.apiKey}` },
    });
    if (!res.ok) return { ok: false };
    const data = await res.json() as { name?: string; email?: string };
    return { ok: true, detail: data.name || data.email || "connected" };
  },
};

// ─── Upstash ─────────────────────────────────────────────────

const upstash: VendorAdapter = {
  id: "upstash",
  name: "Upstash",
  category: "cache",
  credentialsUrl: "https://console.upstash.com/account/api",
  loginFields: [
    { name: "email", type: "text", message: "Email:" },
    { name: "apiKey", type: "password", message: "API Key:" },
  ],
  async verify(creds) {
    const encoded = btoa(`${creds.email}:${creds.apiKey}`);
    const res = await fetch("https://api.upstash.com/v2/redis/databases", {
      headers: { Authorization: `Basic ${encoded}` },
    });
    if (!res.ok) return { ok: false };
    const data = await res.json() as unknown[];
    return { ok: true, detail: `${data.length} databases` };
  },
};

// ─── Vercel ──────────────────────────────────────────────────

const vercel: VendorAdapter = {
  id: "vercel",
  name: "Vercel",
  category: "deploy",
  credentialsUrl: "https://vercel.com/account/tokens",
  loginFields: [
    { name: "apiToken", type: "password", message: "API Token:" },
  ],
  async verify(creds) {
    const res = await fetch("https://api.vercel.com/v2/user", {
      headers: { Authorization: `Bearer ${creds.apiToken}` },
    });
    if (!res.ok) return { ok: false };
    const data = await res.json() as { user?: { name?: string; username?: string } };
    return { ok: true, detail: data.user?.username || data.user?.name || "connected" };
  },
};

// ─── Turso ───────────────────────────────────────────────────

const turso: VendorAdapter = {
  id: "turso",
  name: "Turso",
  category: "database",
  credentialsUrl: "https://turso.tech/app/settings/api-tokens",
  loginFields: [
    { name: "apiToken", type: "password", message: "API Token:" },
    { name: "organization", type: "text", message: "Organization slug:" },
  ],
  async verify(creds) {
    const res = await fetch(
      `https://api.turso.tech/v1/organizations/${creds.organization}/databases`,
      { headers: { Authorization: `Bearer ${creds.apiToken}` } },
    );
    if (!res.ok) return { ok: false };
    const data = await res.json() as { databases?: unknown[] };
    return { ok: true, detail: `${data.databases?.length || 0} databases` };
  },
};

// ─── TinyBird ────────────────────────────────────────────────

const tinybird: VendorAdapter = {
  id: "tinybird",
  name: "Tinybird",
  category: "analytics",
  credentialsUrl: "https://app.tinybird.co/tokens",
  loginFields: [
    { name: "apiToken", type: "password", message: "Admin Token:" },
    { name: "host", type: "text", message: "API Host (e.g. api.tinybird.co):" },
  ],
  async verify(creds) {
    const host = creds.host || "api.tinybird.co";
    const res = await fetch(`https://${host}/v0/datasources`, {
      headers: { Authorization: `Bearer ${creds.apiToken}` },
    });
    if (!res.ok) return { ok: false };
    const data = await res.json() as { datasources?: unknown[] };
    return { ok: true, detail: `${data.datasources?.length || 0} data sources` };
  },
};

// ─── PlanetScale ─────────────────────────────────────────────

const planetscale: VendorAdapter = {
  id: "planetscale",
  name: "PlanetScale",
  category: "database",
  credentialsUrl: "https://app.planetscale.com/settings/service-tokens",
  loginFields: [
    { name: "serviceTokenId", type: "text", message: "Service Token ID:" },
    { name: "serviceToken", type: "password", message: "Service Token:" },
    { name: "organization", type: "text", message: "Organization:" },
  ],
  async verify(creds) {
    // Use /organizations list endpoint — always accessible with a valid service token
    const res = await fetch(
      `https://api.planetscale.com/v1/organizations`,
      {
        headers: {
          Authorization: `${creds.serviceTokenId}:${creds.serviceToken}`,
        },
      },
    );
    if (!res.ok) return { ok: false };
    const data = await res.json() as { data?: Array<{ name?: string }> };
    const org = data.data?.find((o) => o.name === creds.organization);
    return { ok: true, detail: org?.name || "connected" };
  },
};

// ─── Supabase ────────────────────────────────────────────────

const supabase: VendorAdapter = {
  id: "supabase",
  name: "Supabase",
  category: "database",
  credentialsUrl: "https://supabase.com/dashboard/account/tokens",
  loginFields: [
    { name: "accessToken", type: "password", message: "Access Token:" },
  ],
  async verify(creds) {
    const res = await fetch("https://api.supabase.com/v1/projects", {
      headers: { Authorization: `Bearer ${creds.accessToken}` },
    });
    if (!res.ok) return { ok: false };
    const data = await res.json() as unknown[];
    return { ok: true, detail: `${Array.isArray(data) ? data.length : 0} projects` };
  },
};

// ─── Trigger.dev ────────────────────────────────────────────

const trigger: VendorAdapter = {
  id: "trigger",
  name: "Trigger.dev",
  category: "jobs",
  credentialsUrl: "https://cloud.trigger.dev/account/tokens",
  loginFields: [
    { name: "apiKey", type: "password", message: "API Key:" },
  ],
  async verify(creds) {
    const res = await fetch("https://api.trigger.dev/api/v1/whoami", {
      headers: { Authorization: `Bearer ${creds.apiKey}` },
    });
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as { project?: { name?: string } };
    return { ok: true, detail: data.project?.name || "connected" };
  },
};

// ─── Resend ─────────────────────────────────────────────────

const resend: VendorAdapter = {
  id: "resend",
  name: "Resend",
  category: "email",
  credentialsUrl: "https://resend.com/api-keys",
  loginFields: [
    { name: "apiKey", type: "password", message: "API Key:" },
  ],
  async verify(creds) {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${creds.apiKey}` },
    });
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as { data?: unknown[] };
    return { ok: true, detail: `${data.data?.length || 0} domains` };
  },
};

// ─── Clerk ──────────────────────────────────────────────────

const clerk: VendorAdapter = {
  id: "clerk",
  name: "Clerk",
  category: "auth",
  credentialsUrl: "https://dashboard.clerk.com/last-active?path=api-keys",
  loginFields: [
    { name: "secretKey", type: "password", message: "Secret Key (sk_live_...):" },
  ],
  async verify(creds) {
    const res = await fetch("https://api.clerk.com/v1/users?limit=1", {
      headers: { Authorization: `Bearer ${creds.secretKey}` },
    });
    if (!res.ok) return { ok: false };
    return { ok: true, detail: "connected" };
  },
};

// ─── Inngest ────────────────────────────────────────────────

const inngest: VendorAdapter = {
  id: "inngest",
  name: "Inngest",
  category: "jobs",
  credentialsUrl: "https://app.inngest.com/settings/keys",
  loginFields: [
    { name: "eventKey", type: "password", message: "Event Key:" },
    { name: "signingKey", type: "password", message: "Signing Key:" },
  ],
  async verify(creds) {
    const res = await fetch("https://inn.gs/e/" + creds.eventKey, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "cairn/test", data: { test: true } }),
    });
    if (!res.ok) return { ok: false };
    return { ok: true, detail: "connected" };
  },
};

// ─── Sentry ─────────────────────────────────────────────────

const sentry: VendorAdapter = {
  id: "sentry",
  name: "Sentry",
  category: "monitoring",
  credentialsUrl: "https://sentry.io/settings/account/api/auth-tokens/",
  loginFields: [
    { name: "authToken", type: "password", message: "Auth Token:" },
    { name: "organization", type: "text", message: "Organization slug:" },
  ],
  async verify(creds) {
    const res = await fetch(
      `https://sentry.io/api/0/organizations/${creds.organization}/projects/`,
      { headers: { Authorization: `Bearer ${creds.authToken}` } },
    );
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as unknown[];
    return { ok: true, detail: `${Array.isArray(data) ? data.length : 0} projects` };
  },
};

// ─── Axiom ──────────────────────────────────────────────────

const axiom: VendorAdapter = {
  id: "axiom",
  name: "Axiom",
  category: "logging",
  credentialsUrl: "https://app.axiom.co/settings/api-tokens",
  loginFields: [
    { name: "apiToken", type: "password", message: "API Token:" },
  ],
  async verify(creds) {
    const res = await fetch("https://api.axiom.co/v1/datasets", {
      headers: { Authorization: `Bearer ${creds.apiToken}` },
    });
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as unknown[];
    return { ok: true, detail: `${Array.isArray(data) ? data.length : 0} datasets` };
  },
};

// ─── Register All ────────────────────────────────────────────

registerVendor(cloudflare);
registerVendor(railway);
registerVendor(neon);
registerVendor(upstash);
registerVendor(vercel);
registerVendor(turso);
registerVendor(tinybird);
registerVendor(planetscale);
registerVendor(supabase);
registerVendor(trigger);
registerVendor(resend);
registerVendor(clerk);
registerVendor(inngest);
registerVendor(sentry);
registerVendor(axiom);
