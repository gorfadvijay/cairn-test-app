/**
 * Billing integration
 * Stripe-based subscription management for Cairn Console
 */

import { requireAuth } from "./auth.ts";
import { db } from "./db.ts";

// Add billing tables
db.exec(`
  CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan TEXT DEFAULT 'free',
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    status TEXT DEFAULT 'active',
    current_period_end TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS usage_records (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    month TEXT NOT NULL,
    deploys INTEGER DEFAULT 0,
    projects INTEGER DEFAULT 0,
    bandwidth_mb INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, month)
  );
`);

const getSubscription = db.prepare<
  { id: string; plan: string; status: string; current_period_end: string },
  [string]
>("SELECT * FROM subscriptions WHERE user_id = ?");

const upsertSubscription = db.prepare(`
  INSERT INTO subscriptions (id, user_id, plan, stripe_customer_id, stripe_subscription_id, status, current_period_end)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(user_id) DO UPDATE SET
    plan = excluded.plan,
    stripe_customer_id = excluded.stripe_customer_id,
    stripe_subscription_id = excluded.stripe_subscription_id,
    status = excluded.status,
    current_period_end = excluded.current_period_end,
    updated_at = datetime('now')
`);

const getUsage = db.prepare<
  { deploys: number; projects: number; bandwidth_mb: number },
  [string, string]
>("SELECT deploys, projects, bandwidth_mb FROM usage_records WHERE user_id = ? AND month = ?");

const PLANS = {
  free: {
    name: "Free",
    price: 0,
    limits: { projects: 3, deploys_per_month: 50, team_members: 1 },
  },
  pro: {
    name: "Pro",
    price: 29,
    limits: { projects: 20, deploys_per_month: 500, team_members: 5 },
  },
  team: {
    name: "Team",
    price: 79,
    limits: { projects: -1, deploys_per_month: -1, team_members: 20 },
  },
} as const;

/** GET /api/billing */
export function getBilling(req: Request): Response {
  const user = requireAuth(req);
  if (user instanceof Response) return user;

  const sub = getSubscription.get(user.id);
  const plan = sub?.plan || "free";
  const planDetails = PLANS[plan as keyof typeof PLANS] || PLANS.free;

  const month = new Date().toISOString().slice(0, 7);
  const usage = getUsage.get(user.id, month);

  return Response.json({
    subscription: {
      plan,
      status: sub?.status || "active",
      currentPeriodEnd: sub?.current_period_end,
    },
    planDetails,
    plans: PLANS,
    usage: usage || { deploys: 0, projects: 0, bandwidth_mb: 0 },
  });
}

/** POST /api/billing/checkout — create Stripe checkout session */
export async function createCheckout(req: Request): Promise<Response> {
  const user = requireAuth(req);
  if (user instanceof Response) return user;

  const { plan } = await req.json();
  if (!plan || !PLANS[plan as keyof typeof PLANS]) {
    return Response.json({ error: "Invalid plan" }, { status: 400 });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    // Dev mode — just update the plan directly
    upsertSubscription.run(
      crypto.randomUUID(),
      user.id,
      plan,
      null,
      null,
      "active",
      new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
    );
    return Response.json({ ok: true, plan });
  }

  // Production — create Stripe checkout
  const priceMap: Record<string, string> = {
    pro: process.env.STRIPE_PRO_PRICE_ID || "",
    team: process.env.STRIPE_TEAM_PRICE_ID || "",
  };

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      mode: "subscription",
      "line_items[0][price]": priceMap[plan] || "",
      "line_items[0][quantity]": "1",
      success_url: `${process.env.CONSOLE_URL || "http://localhost:3100"}/billing?success=true`,
      cancel_url: `${process.env.CONSOLE_URL || "http://localhost:3100"}/billing?canceled=true`,
      client_reference_id: user.id,
      customer_email: user.email,
    }),
  });

  const session = await res.json();
  return Response.json({ url: session.url });
}

/** POST /api/billing/webhook — handle Stripe webhook events */
export async function handleWebhook(req: Request): Promise<Response> {
  const body = await req.text();

  // In production, verify Stripe signature here
  let event: any;
  try {
    event = JSON.parse(body);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      upsertSubscription.run(
        crypto.randomUUID(),
        session.client_reference_id,
        "pro", // Determine from price
        session.customer,
        session.subscription,
        "active",
        new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
      );
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const status = sub.status === "active" ? "active" : "canceled";
      // Find user by stripe_customer_id and update
      db.exec(
        `UPDATE subscriptions SET status = '${status}', updated_at = datetime('now')
         WHERE stripe_customer_id = '${sub.customer}'`,
      );
      break;
    }
  }

  return Response.json({ received: true });
}
