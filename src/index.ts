#!/usr/bin/env bun

import { Command } from "commander";
import { initCommand } from "./commands/init.ts";
import { devCommand } from "./commands/dev.ts";
import { deployCommand } from "./commands/deploy.ts";
import { destroyCommand } from "./commands/destroy.ts";
import { statusCommand } from "./commands/status.ts";
import { logsCommand } from "./commands/logs.ts";
import { loginCommand } from "./commands/login.ts";
import { secretCommand } from "./commands/secret.ts";

const program = new Command();

program
  .name("cairn")
  .description(
    "The infrastructure app store. One file, every service, any cloud.",
  )
  .version("0.1.0");

program
  .command("init")
  .description("Create a new Cairn project")
  .action(initCommand);

program
  .command("dev")
  .description("Start local development environment")
  .action(devCommand);

program
  .command("deploy")
  .description("Deploy to Cloudflare")
  .option("--target <target>", "Deploy target", "cloudflare")
  .action(deployCommand);

program
  .command("destroy")
  .description("Tear down all deployed resources")
  .action(destroyCommand);

program
  .command("status")
  .description("Show project status")
  .action(statusCommand);

program
  .command("logs <service>")
  .description("Tail logs for a service")
  .action(logsCommand);

program
  .command("login <vendor>")
  .description("Login to a cloud provider")
  .action(loginCommand);

program
  .command("secret")
  .description("Manage secrets")
  .addCommand(
    new Command("set")
      .argument("<key>")
      .argument("<value>")
      .description("Set a secret")
      .action((key: string, value: string) => secretCommand("set", key, value)),
  )
  .addCommand(
    new Command("list")
      .description("List all secrets")
      .action(() => secretCommand("list")),
  );

program.parse();
