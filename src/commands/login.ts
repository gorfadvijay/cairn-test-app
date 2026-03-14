import prompts from "prompts";
import chalk from "chalk";
import { saveVendorCredentials } from "../secrets/local.ts";
import { setCredentials, cf, accountPath } from "../adapters/cloudflare/api.ts";
import {
  setCredentials as setRailwayCredentials,
  verifyToken as verifyRailwayToken,
} from "../adapters/railway/api.ts";
import {
  setCredentials as setNeonCredentials,
  verifyToken as verifyNeonToken,
} from "../adapters/neon/api.ts";
import {
  setCredentials as setUpstashCredentials,
  verifyToken as verifyUpstashToken,
} from "../adapters/upstash/api.ts";

export async function loginCommand(vendor: string) {
  switch (vendor) {
    case "cloudflare":
    case "cf":
      await loginCloudflare();
      break;
    case "railway":
      await loginRailway();
      break;
    case "neon":
      await loginNeon();
      break;
    case "upstash":
      await loginUpstash();
      break;
    default:
      console.log(chalk.red(`Unknown vendor: ${vendor}`));
      console.log(`Available: cloudflare, railway, neon, upstash`);
  }
}

async function loginCloudflare() {
  console.log(chalk.bold("\nCloudflare Login\n"));

  const { authType } = await prompts({
    type: "select",
    name: "authType",
    message: "Authentication method:",
    choices: [
      {
        title: "API Token (recommended)",
        value: "token",
        description: "Scoped permissions, more secure",
      },
      {
        title: "Global API Key (legacy)",
        value: "global",
        description: "Full account access",
      },
    ],
  });

  if (!authType) return;

  if (authType === "token") {
    await loginWithToken();
  } else {
    await loginWithGlobalKey();
  }
}

async function loginWithToken() {
  console.log(
    chalk.dim(
      "\nCreate a token at: https://dash.cloudflare.com/profile/api-tokens",
    ),
  );
  console.log(
    chalk.dim(
      'Use the "Edit Cloudflare Workers" template for the right permissions.\n',
    ),
  );

  const response = await prompts([
    {
      type: "password",
      name: "apiToken",
      message: "API Token:",
    },
    {
      type: "text",
      name: "accountId",
      message: "Account ID:",
    },
  ]);

  if (!response.apiToken || !response.accountId) {
    console.log(chalk.red("Cancelled."));
    return;
  }

  // Verify token works
  setCredentials(response);
  try {
    await cf("GET", accountPath(""));
    saveVendorCredentials("cloudflare", response);
    console.log(chalk.green("\n✓ Connected to Cloudflare"));
    console.log(
      chalk.green(
        "✓ Credentials saved to ~/.cairn/credentials/cloudflare.json",
      ),
    );
  } catch {
    console.log(
      chalk.red("\n✗ Failed to connect. Check your token and account ID."),
    );
  }
}

async function loginWithGlobalKey() {
  console.log(
    chalk.dim(
      "\nGet your key at: https://dash.cloudflare.com/profile/api-tokens → Global API Key\n",
    ),
  );

  const response = await prompts([
    {
      type: "text",
      name: "email",
      message: "Email:",
    },
    {
      type: "password",
      name: "apiKey",
      message: "Global API Key:",
    },
    {
      type: "text",
      name: "accountId",
      message: "Account ID:",
    },
  ]);

  if (!response.email || !response.apiKey || !response.accountId) {
    console.log(chalk.red("Cancelled."));
    return;
  }

  setCredentials(response);
  try {
    await cf("GET", accountPath(""));
    saveVendorCredentials("cloudflare", response);
    console.log(chalk.green("\n✓ Connected to Cloudflare"));
    console.log(
      chalk.green(
        "✓ Credentials saved to ~/.cairn/credentials/cloudflare.json",
      ),
    );
  } catch {
    console.log(
      chalk.red("\n✗ Failed to connect. Check your credentials."),
    );
  }
}

async function loginRailway() {
  console.log(chalk.bold("\nRailway Login\n"));
  console.log(
    chalk.dim(
      "Get your token at: https://railway.app/account/tokens\n",
    ),
  );

  const response = await prompts([
    {
      type: "password",
      name: "apiToken",
      message: "API Token:",
    },
  ]);

  if (!response.apiToken) {
    console.log(chalk.red("Cancelled."));
    return;
  }

  setRailwayCredentials(response);
  try {
    const user = await verifyRailwayToken();
    saveVendorCredentials("railway", response);
    console.log(chalk.green(`\n✓ Connected to Railway as ${user.name || user.email}`));
    console.log(
      chalk.green(
        "✓ Credentials saved to ~/.cairn/credentials/railway.json",
      ),
    );
  } catch {
    console.log(
      chalk.red("\n✗ Failed to connect. Check your token."),
    );
  }
}

async function loginNeon() {
  console.log(chalk.bold("\nNeon Login\n"));
  console.log(
    chalk.dim(
      "Get your API key at: https://console.neon.tech/app/settings/api-keys\n",
    ),
  );

  const response = await prompts([
    {
      type: "password",
      name: "apiKey",
      message: "API Key:",
    },
  ]);

  if (!response.apiKey) {
    console.log(chalk.red("Cancelled."));
    return;
  }

  setNeonCredentials(response);
  try {
    await verifyNeonToken();
    saveVendorCredentials("neon", response);
    console.log(chalk.green("\n✓ Connected to Neon"));
    console.log(
      chalk.green(
        "✓ Credentials saved to ~/.cairn/credentials/neon.json",
      ),
    );
  } catch {
    console.log(
      chalk.red("\n✗ Failed to connect. Check your API key."),
    );
  }
}

async function loginUpstash() {
  console.log(chalk.bold("\nUpstash Login\n"));
  console.log(
    chalk.dim(
      "Get your credentials at: https://console.upstash.com/account/api\n",
    ),
  );

  const response = await prompts([
    {
      type: "text",
      name: "email",
      message: "Email:",
    },
    {
      type: "password",
      name: "apiKey",
      message: "API Key:",
    },
  ]);

  if (!response.email || !response.apiKey) {
    console.log(chalk.red("Cancelled."));
    return;
  }

  setUpstashCredentials(response);
  try {
    await verifyUpstashToken();
    saveVendorCredentials("upstash", response);
    console.log(chalk.green("\n✓ Connected to Upstash"));
    console.log(
      chalk.green(
        "✓ Credentials saved to ~/.cairn/credentials/upstash.json",
      ),
    );
  } catch {
    console.log(
      chalk.red("\n✗ Failed to connect. Check your credentials."),
    );
  }
}
