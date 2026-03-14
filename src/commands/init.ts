import prompts from "prompts";
import chalk from "chalk";
import { mkdirSync, writeFileSync, existsSync } from "fs";

export async function initCommand() {
  console.log(chalk.bold("\n⛰  Create a new Cairn project\n"));

  const response = await prompts([
    {
      type: "text",
      name: "name",
      message: "Project name:",
      initial: "my-app",
    },
    {
      type: "select",
      name: "template",
      message: "Template:",
      choices: [
        { title: "Hono API (recommended)", value: "hono-api" },
        { title: "Bare bones (just a Worker)", value: "bare" },
      ],
    },
    {
      type: "confirm",
      name: "auth",
      message: "Add authentication (Better Auth)?",
      initial: true,
    },
  ]);

  if (!response.name) return;

  const dir = response.name;

  if (existsSync(dir)) {
    console.log(chalk.red(`Directory ${dir} already exists`));
    return;
  }

  mkdirSync(`${dir}/src`, { recursive: true });

  // Write cairn.hcl
  writeFileSync(
    `${dir}/cairn.hcl`,
    `# ${response.name} — powered by Cairn

project "${response.name}" {
  runtime = "bun"
}

service "api" {
  build   = "bun install"
  command = "bun run src/index.ts"
  expose  = true

  dev {
    command = "bun run --watch src/index.ts"
  }
}

postgres "main" {
  version = "16"
}

redis "cache" {
  version = "7"
}

storage "uploads" {}
${response.auth ? `\nauth "main" {\n  providers = ["email"]\n  session   = "database"\n}\n` : ""}`,
  );

  // Write app code based on template
  if (response.template === "hono-api") {
    writeFileSync(
      `${dir}/src/index.ts`,
      `import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => c.json({ message: "Hello from Cairn!" }));

app.get("/health", (c) => c.json({ status: "ok" }));

export default app;
`,
    );

    writeFileSync(
      `${dir}/package.json`,
      JSON.stringify(
        {
          name: response.name,
          version: "0.1.0",
          scripts: {
            dev: "cairn dev",
            deploy: "cairn deploy",
          },
          dependencies: {
            hono: "latest",
          },
        },
        null,
        2,
      ),
    );
  } else {
    writeFileSync(
      `${dir}/src/index.ts`,
      `export default {
  async fetch(request: Request): Promise<Response> {
    return new Response(JSON.stringify({ message: "Hello from Cairn!" }), {
      headers: { "Content-Type": "application/json" },
    });
  },
};
`,
    );

    writeFileSync(
      `${dir}/package.json`,
      JSON.stringify(
        {
          name: response.name,
          version: "0.1.0",
          scripts: {
            dev: "cairn dev",
            deploy: "cairn deploy",
          },
        },
        null,
        2,
      ),
    );
  }

  // Write .gitignore
  writeFileSync(
    `${dir}/.gitignore`,
    `.cairn/
node_modules/
dist/
.env
`,
  );

  console.log(chalk.green(`\n✓ Created ${dir}/`));
  console.log(`\nNext steps:`);
  console.log(chalk.cyan(`  cd ${dir}`));
  console.log(chalk.cyan(`  bun install`));
  console.log(chalk.cyan(`  cairn dev        # run locally`));
  console.log(chalk.cyan(`  cairn login cloudflare`));
  console.log(chalk.cyan(`  cairn deploy     # deploy to Cloudflare`));
}
