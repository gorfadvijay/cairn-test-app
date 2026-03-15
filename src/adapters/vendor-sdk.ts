/**
 * Vendor SDK — standardized interface for all vendor integrations.
 * Every vendor adapter implements this interface so that:
 * - `cairn login` knows what to prompt
 * - `cairn doctor` knows how to verify
 * - `cairn deploy` knows how to provision
 * - `cairn destroy` knows how to teardown
 */

export interface VendorLoginField {
  name: string;
  type: "text" | "password";
  message: string;
}

export interface VendorVerifyResult {
  ok: boolean;
  detail?: string;
}

export interface VendorAdapter {
  /** Unique vendor ID (used in cairn.hcl, credentials, CLI) */
  id: string;

  /** Human-readable name */
  name: string;

  /** Category: deploy, database, cache, jobs, email, analytics, auth, monitoring, logging */
  category: string;

  /** URL where user gets their API key/token */
  credentialsUrl: string;

  /** Fields to prompt during `cairn login {vendor}` */
  loginFields: VendorLoginField[];

  /** Verify credentials work — called during login + doctor */
  verify(creds: Record<string, string>): Promise<VendorVerifyResult>;
}

/**
 * Global vendor registry — all adapters register here
 */
const registry: Map<string, VendorAdapter> = new Map();

export function registerVendor(adapter: VendorAdapter): void {
  registry.set(adapter.id, adapter);
}

export function getVendor(id: string): VendorAdapter | undefined {
  return registry.get(id);
}

export function listVendors(): VendorAdapter[] {
  return Array.from(registry.values());
}

export function listVendorsByCategory(category: string): VendorAdapter[] {
  return listVendors().filter((v) => v.category === category);
}

export function getVendorCategories(): string[] {
  const cats = new Set(listVendors().map((v) => v.category));
  return Array.from(cats);
}
