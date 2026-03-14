/**
 * GitHub webhook handler
 * Auto-creates branch environments on PR open
 * Auto-destroys branch environments on PR merge/close
 * Posts branch URL as PR comment
 */

import { execSync } from "child_process";
import crypto from "crypto";

interface GitHubPREvent {
  action: string;
  pull_request: {
    number: number;
    head: {
      ref: string;
      sha: string;
    };
    base: {
      ref: string;
    };
    title: string;
    html_url: string;
  };
  repository: {
    full_name: string;
  };
}

/** Verify GitHub webhook signature */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const hmac = crypto.createHmac("sha256", secret);
  const digest = `sha256=${hmac.update(payload).digest("hex")}`;
  if (digest.length !== signature.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(digest),
    Buffer.from(signature),
  );
}

/**
 * Handle a GitHub PR webhook event
 * Returns the action taken and branch URL if applicable
 */
export async function handlePRWebhook(
  event: GitHubPREvent,
  projectDir: string,
): Promise<{ action: string; branchName?: string; urls?: Record<string, string> }> {
  const branchName = event.pull_request.head.ref;
  const prNumber = event.pull_request.number;

  switch (event.action) {
    case "opened":
    case "reopened":
    case "synchronize": {
      // Create or update branch environment
      console.log(`PR #${prNumber}: Creating branch env for ${branchName}...`);

      try {
        // Run cairn branch create from the project directory
        const result = execSync(
          `cd "${projectDir}" && bun run src/index.ts branch create "${branchName}"`,
          { encoding: "utf-8", timeout: 300_000 },
        );
        console.log(result);

        // Parse URLs from output
        const urls: Record<string, string> = {};
        const urlMatches = result.matchAll(/(\S+)\s+→\s+(https:\/\/\S+)/g);
        for (const match of urlMatches) {
          urls[match[1]!] = match[2]!;
        }

        // Post PR comment with branch URLs
        if (Object.keys(urls).length > 0) {
          await postPRComment(
            event.repository.full_name,
            prNumber,
            branchName,
            urls,
          );
        }

        return { action: "created", branchName, urls };
      } catch (e: unknown) {
        console.error(`Failed to create branch env: ${(e as Error).message}`);
        return { action: "error", branchName };
      }
    }

    case "closed": {
      // Destroy branch environment
      console.log(`PR #${prNumber}: Destroying branch env for ${branchName}...`);

      try {
        execSync(
          `cd "${projectDir}" && bun run src/index.ts branch destroy "${branchName}"`,
          { encoding: "utf-8", timeout: 120_000 },
        );
        return { action: "destroyed", branchName };
      } catch (e: unknown) {
        console.error(`Failed to destroy branch env: ${(e as Error).message}`);
        return { action: "error", branchName };
      }
    }

    default:
      return { action: "ignored" };
  }
}

/**
 * Post a PR comment with branch environment URLs
 * Uses the `gh` CLI for authentication
 */
async function postPRComment(
  repoFullName: string,
  prNumber: number,
  branchName: string,
  urls: Record<string, string>,
): Promise<void> {
  const urlLines = Object.entries(urls)
    .map(([name, url]) => `| ${name} | [${url}](${url}) |`)
    .join("\n");

  const body = `## ⛰ Branch Environment Ready

| Service | URL |
|---------|-----|
${urlLines}

**Branch:** \`${branchName}\`
**Status:** Deployed

> This environment will be automatically destroyed when this PR is closed.

---
*Deployed by [Cairn](https://cairn.dev)*`;

  try {
    execSync(
      `gh pr comment ${prNumber} --repo "${repoFullName}" --body ${JSON.stringify(body)}`,
      { encoding: "utf-8", stdio: "pipe" },
    );
    console.log(`  ✓ Posted branch URL comment on PR #${prNumber}`);
  } catch (e: unknown) {
    // gh CLI might not be available, that's ok
    console.log(`  ⚠ Could not post PR comment (gh CLI not available)`);
  }
}
