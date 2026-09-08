import type { SimpleGit } from "simple-git";

import type { ActionPayload } from "@/backend/types";

async function requireRemote(git: SimpleGit, remote: string) {
  const remotes = await git.getRemotes();
  if (!remotes.some((entry) => entry.name === remote)) {
    throw new Error(`Remote '${remote}' is not configured for this repository.`);
  }
}

async function requireBranchName(git: SimpleGit, branch: string) {
  await git.raw(["check-ref-format", `refs/heads/${branch}`]);
}

export async function pushBranch(git: SimpleGit, input: ActionPayload<"pushBranch">) {
  await requireRemote(git, input.remote);
  await requireBranchName(git, input.branchName);
  await requireBranchName(git, input.remoteBranch);
  await git.raw([
    "push",
    ...(input.setUpstream ? ["--set-upstream"] : []),
    "--",
    input.remote,
    `refs/heads/${input.branchName}:refs/heads/${input.remoteBranch}`
  ]);
}

export async function fetchRemote(git: SimpleGit, input: ActionPayload<"fetchRemote">) {
  const prune = input.prune ? "--prune" : "--no-prune";
  if (input.remote === null) {
    await git.fetch(["--all", prune]);
    return;
  }
  await requireRemote(git, input.remote);
  await git.fetch([prune, "--", input.remote]);
}

export async function pullBranch(git: SimpleGit, input: ActionPayload<"pullBranch">) {
  await requireRemote(git, input.remote);
  await requireBranchName(git, input.branchName);
  await requireBranchName(git, input.remoteBranch);
  const head = (await git.raw(["symbolic-ref", "--quiet", "HEAD"])).trim();
  if (head !== `refs/heads/${input.branchName}`) {
    throw new Error(`Check out branch '${input.branchName}' before pulling it.`);
  }
  await git.raw([
    "pull",
    "--ff-only",
    "--no-rebase",
    "--",
    input.remote,
    `refs/heads/${input.remoteBranch}`
  ]);
}
