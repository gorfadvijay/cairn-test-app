import chalk from "chalk";
import { setSecret, listSecrets } from "../secrets/local.ts";

export function secretCommand(action: string, key?: string, value?: string) {
  switch (action) {
    case "set":
      if (!key || !value) {
        console.log(chalk.red("Usage: cairn secret set <key> <value>"));
        return;
      }
      setSecret(key, value);
      console.log(chalk.green(`✓ Secret '${key}' saved`));
      break;

    case "list": {
      const secrets = listSecrets();
      const keys = Object.keys(secrets);
      if (keys.length === 0) {
        console.log(
          chalk.dim("No secrets set. Run: cairn secret set <key> <value>"),
        );
      } else {
        console.log(chalk.bold("\nSecrets:"));
        keys.forEach((k) => console.log(`  ${k} = ${"•".repeat(8)}`));
      }
      break;
    }
  }
}
