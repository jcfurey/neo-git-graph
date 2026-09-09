import type { SimpleGit } from "simple-git";

import type { ActionPayload } from "@/backend/types";
import { requireBranchName, splitRemoteRef } from "@/backend/utils/validation";

export async function createBranch(
  git: SimpleGit,
  input: ActionPayload<"createBranch">
): Promise<void> {
  await git.raw(["branch", input.branchName, input.commitHash]);
}

export async function deleteBranch(
  git: SimpleGit,
  input: ActionPayload<"deleteBranch">
): Promise<void> {
  await git.deleteLocalBranch(input.branchName, input.forceDelete);
}

export async function renameBranch(
  git: SimpleGit,
  input: ActionPayload<"renameBranch">
): Promise<void> {
  await git.raw(["branch", "-m", input.oldName, input.newName]);
}

export async function checkoutBranch(
  git: SimpleGit,
  input: ActionPayload<"checkoutBranch">
): Promise<void> {
  await requireBranchName(git, input.branchName);
  if (input.remoteBranch === null) {
    await git.checkout(input.branchName);
    return;
  }

  const { remote, branch } = await splitRemoteRef(git, input.remoteBranch);
  if (input.fetch) {
    await git.raw([
      "fetch",
      "--no-tags",
      "--",
      remote,
      `+refs/heads/${branch}:refs/remotes/${input.remoteBranch}`
    ]);
  }
  const branches = await git.branchLocal();
  if (!branches.all.includes(input.branchName)) {
    await git.raw([
      "checkout",
      "--track",
      "-b",
      input.branchName,
      `refs/remotes/${input.remoteBranch}`
    ]);
    return;
  }

  await git.checkout(input.branchName);
  await git.merge(["--ff-only", `refs/remotes/${input.remoteBranch}`]);
}
