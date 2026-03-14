// The typed output of parsing cairn.hcl

export interface CairnConfig {
  project: {
    name: string;
    runtime: "bun" | "node" | "deno";
  };
  services: ServiceConfig[];
  postgres: PostgresConfig[];
  redis: RedisConfig[];
  storage: StorageConfig[];
  secrets: SecretConfig[];
  auth: AuthConfig[];
}

export interface AuthConfig {
  name: string;
  providers: string[];
  session: "jwt" | "database";
}

export interface ServiceConfig {
  name: string;
  build?: string;
  command: string;
  expose?: boolean;
  dev?: {
    command: string;
  };
  env?: Record<string, string>;
}

export interface PostgresConfig {
  name: string;
  version: string;
  vendor?: "neon" | "cloudflare" | "railway";
}

export interface RedisConfig {
  name: string;
  version: string;
  vendor?: "upstash" | "cloudflare" | "railway";
}

export interface StorageConfig {
  name: string;
}

export interface SecretConfig {
  name: string;
}
