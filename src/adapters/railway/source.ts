/**
 * Railway source deployment
 *
 * Handles the full deploy lifecycle:
 * 1. Ensures the project has a GitHub repo (creates one if needed)
 * 2. Commits and pushes latest changes
 * 3. Deploys to Railway via githubRepoDeploy (first deploy) or serviceInstanceDeployV2 (redeploy)
 *
 * Railway requires GitHub-connected repos for source-based deploys.
 * Cairn handles this automatically so the user just runs `cairn deploy --target railway`.
 */

import { execSync } from "child_process";
import { railwayGql } from "./api.ts";

interface DeployResponse {
  deploymentId?: string;
  serviceId?: string;
  staticUrl?: string;
}

/**
 * Ensure the current directory is a git repo with a GitHub remote.
 * Creates and pushes to GitHub automatically if needed.
 * Returns { repo: "owner/repo", branch: "main" }
 */
export function ensureGitHubRepo(projectName: string): { repo: string; branch: string } {
  const run = (cmd: string) =>
    execSync(cmd, { stdio: "pipe", cwd: process.cwd() }).toString().trim();

  // 1. Ensure git repo exists
  try {
    run("git rev-parse --git-dir");
  } catch {
    console.log("  Initializing git repo...");
    run("git init");
  }

  // 2. Ensure there's at least one commit
  try {
    run("git rev-parse HEAD");
  } catch {
    console.log("  Creating initial commit...");
    run("git add -A");
    run('git commit -m "cairn: initial deploy"');
  }

  // 3. Get current branch
  const branch = run("git rev-parse --abbrev-ref HEAD");

  // 4. Ensure GitHub remote exists
  let repo = detectGitHubRepo();
  if (!repo) {
    const repoName = `cairn-${projectName}`;
    // Try to get the GitHub username
    const ghUser = run("gh api user --jq .login");

    try {
      // Try creating a new repo
      console.log("  Creating GitHub repo...");
      run(`gh repo create ${repoName} --public --source=. --push`);
    } catch {
      // Repo may already exist — just add remote and push
      console.log("  Connecting to existing GitHub repo...");
      try {
        run(`git remote add origin git@github.com:${ghUser}/${repoName}.git`);
      } catch {
        run(`git remote set-url origin git@github.com:${ghUser}/${repoName}.git`);
      }
      run(`git push -u origin ${branch} --force`);
    }

    repo = detectGitHubRepo();
    if (!repo) {
      throw new Error(
        "Could not create GitHub repo. Make sure `gh` CLI is installed and authenticated.",
      );
    }
  }

  // 5. Stage, commit, and push any pending changes
  try {
    const status = run("git status --porcelain");
    if (status) {
      console.log("  Committing latest changes...");
      run("git add -A");
      run('git commit -m "cairn: deploy update"');
    }
  } catch {
    // Nothing to commit
  }

  try {
    console.log("  Pushing to GitHub...");
    run(`git push -u origin ${branch}`);
  } catch {
    // May fail if already up to date
  }

  return { repo, branch };
}

/**
 * Deploy a service from a GitHub repo.
 * Creates a new Railway service connected to the repo and triggers a build.
 */
export async function deployFromRepo(
  projectId: string,
  environmentId: string,
  repo: string,
  branch: string = "master",
): Promise<DeployResponse> {
  const result = await railwayGql<{ githubRepoDeploy: string }>(
    `mutation($input: GitHubRepoDeployInput!) {
      githubRepoDeploy(input: $input)
    }`,
    {
      input: {
        projectId,
        environmentId,
        repo,
        branch,
      },
    },
  );

  const newServiceId = result.githubRepoDeploy;

  // Get the latest deployment for this service
  let deploymentId: string | undefined;
  try {
    const deployments = await railwayGql<{
      deployments: {
        edges: { node: { id: string; status: string; staticUrl: string } }[];
      };
    }>(
      `query($serviceId: String!, $environmentId: String!) {
        deployments(first: 1, input: { serviceId: $serviceId, environmentId: $environmentId }) {
          edges { node { id status staticUrl } }
        }
      }`,
      { serviceId: newServiceId, environmentId },
    );
    deploymentId = deployments.deployments.edges[0]?.node.id;
  } catch {
    // Deployment may not be ready yet
  }

  return { serviceId: newServiceId, deploymentId };
}

/**
 * Redeploy an existing service (triggers a new build from the connected repo)
 */
export async function redeployService(
  serviceId: string,
  environmentId: string,
): Promise<DeployResponse> {
  const result = await railwayGql<{ serviceInstanceDeployV2: string }>(
    `mutation($serviceId: String!, $environmentId: String!) {
      serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId)
    }`,
    { serviceId, environmentId },
  );

  return { deploymentId: result.serviceInstanceDeployV2 };
}

/**
 * Wait for a deployment to reach a terminal status
 */
export async function waitForDeployment(
  deploymentId: string,
  timeoutMs: number = 120_000,
): Promise<{ status: string; staticUrl?: string }> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const result = await railwayGql<{
      deployment: { status: string; staticUrl: string };
    }>(
      `query($id: String!) { deployment(id: $id) { status staticUrl } }`,
      { id: deploymentId },
    );

    const { status, staticUrl } = result.deployment;

    if (["SUCCESS", "FAILED", "CRASHED", "REMOVED"].includes(status)) {
      return { status, staticUrl };
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  return { status: "TIMEOUT" };
}

/**
 * Detect the GitHub repo for the current project directory.
 * Returns "owner/repo" format or null if not a git repo with a GitHub remote.
 */
function detectGitHubRepo(): string | null {
  try {
    const remote = execSync("git remote get-url origin", { stdio: "pipe" })
      .toString()
      .trim();

    // Parse SSH format: git@github.com:owner/repo.git
    const sshMatch = remote.match(/github\.com[:/](.+?)(?:\.git)?$/);
    if (sshMatch) return sshMatch[1]!;

    // Parse HTTPS format: https://github.com/owner/repo.git
    const httpsMatch = remote.match(/github\.com\/(.+?)(?:\.git)?$/);
    if (httpsMatch) return httpsMatch[1]!;

    return null;
  } catch {
    return null;
  }
}
