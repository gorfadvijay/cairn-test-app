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
  jobs: JobsConfig[];
  email: EmailConfig[];
  analytics: AnalyticsConfig[];
  sqlite: SqliteConfig[];
  monitoring: MonitoringConfig[];
  logging: LoggingConfig[];
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
  image?: string;
  port?: number;
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

export interface JobsConfig {
  name: string;
  vendor?: "trigger" | "inngest";
}

export interface EmailConfig {
  name: string;
  vendor?: "resend";
}

export interface AnalyticsConfig {
  name: string;
  vendor?: "tinybird";
}

export interface SqliteConfig {
  name: string;
  vendor?: "turso" | "cloudflare";
}

export interface MonitoringConfig {
  name: string;
  vendor?: "sentry";
}

export interface LoggingConfig {
  name: string;
  vendor?: "axiom";
}
