import { execSync, spawn, type ChildProcess } from "child_process";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { generateDockerCompose, generateDevEnvVars } from "./compose.ts";
import type { CairnConfig } from "../../parser/types.ts";
import { generateDevAuthServer, AUTH_DEV_PORT } from "../auth/generate.ts";
import { generateAuthClient } from "../auth/client.ts";

const COMPOSE_DIR = ".cairn";
const COMPOSE_FILE = `${COMPOSE_DIR}/docker-compose.yml`;

export async function startDevEnvironment(
  config: CairnConfig,
): Promise<ChildProcess[]> {
  if (!existsSync(COMPOSE_DIR)) {
    mkdirSync(COMPOSE_DIR, { recursive: true });
  }

  // Generate and write docker-compose.yml
  const composeYml = generateDockerCompose(config);
  writeFileSync(COMPOSE_FILE, composeYml);

  // Start infrastructure containers
  console.log("Starting infrastructure...");
  execSync(`docker compose -f ${COMPOSE_FILE} up -d`, { stdio: "inherit" });

  // Wait for health checks
  console.log("Waiting for services to be ready...");
  await waitForHealthy();

  // Get env vars for the app
  const envVars = generateDevEnvVars(config);

  // Start auth servers if auth blocks are defined
  const authProcesses = await startAuthServers(config, envVars);

  // Start each service's dev command
  const processes: ChildProcess[] = [...authProcesses];
  for (const service of config.services) {
    const cmd = service.dev?.command || service.command;
    if (!cmd) continue;

    const parts = cmd.split(" ");
    const bin = parts[0]!;
    const args = parts.slice(1);
    const proc = spawn(bin, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        ...envVars,
        PORT: String(3000 + processes.length),
      },
      cwd: process.cwd(),
    });

    proc.stdout.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n").filter(Boolean);
      lines.forEach((line) => console.log(`[${service.name}] ${line}`));
    });

    proc.stderr.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n").filter(Boolean);
      lines.forEach((line) => console.error(`[${service.name}] ${line}`));
    });

    processes.push(proc);
    console.log(
      `Started ${service.name} → http://localhost:${3000 + processes.length - 1}`,
    );
  }

  return processes;
}

export function stopDevEnvironment(): void {
  try {
    execSync(`docker compose -f ${COMPOSE_FILE} down`, { stdio: "inherit" });
  } catch {
    // Ignore errors if compose file doesn't exist
  }
}

async function startAuthServers(
  config: CairnConfig,
  envVars: Record<string, string>,
): Promise<ChildProcess[]> {
  const processes: ChildProcess[] = [];

  for (let i = 0; i < config.auth.length; i++) {
    const auth = config.auth[i]!;
    const port = AUTH_DEV_PORT + i;
    const dbUrl = envVars["DATABASE_URL"] || `postgres://cairn:cairn@localhost:5432/${config.postgres[0]?.name || "cairn"}`;

    // Generate auth server script (self-contained, uses Bun.sql)
    const serverCode = generateDevAuthServer(auth, dbUrl, port);
    const authScriptPath = `${COMPOSE_DIR}/auth-server-${auth.name}.ts`;
    writeFileSync(authScriptPath, serverCode);

    // Generate auth SDK client for the user's app (on first auth only)
    if (i === 0) {
      const clientCode = generateAuthClient(auth);
      writeFileSync(`${COMPOSE_DIR}/auth-client.ts`, clientCode);
      console.log(`  Generated auth client: .cairn/auth-client.ts`);
    }

    // Start the auth server
    const proc = spawn("bun", ["run", authScriptPath], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...envVars },
      cwd: process.cwd(),
    });

    proc.stdout.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n").filter(Boolean);
      lines.forEach((line) => console.log(`[auth:${auth.name}] ${line}`));
    });

    proc.stderr.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n").filter(Boolean);
      lines.forEach((line) => console.error(`[auth:${auth.name}] ${line}`));
    });

    processes.push(proc);
    console.log(`Started auth:${auth.name} → http://localhost:${port}`);
  }

  return processes;
}

async function waitForHealthy(maxWait = 30000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      const result = execSync(
        `docker compose -f ${COMPOSE_FILE} ps --format json`,
        { encoding: "utf-8" },
      );
      if (result.includes('"running"')) {
        await new Promise((r) => setTimeout(r, 2000));
        return;
      }
    } catch {
      // Containers not ready yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Timeout waiting for containers to be healthy");
}
