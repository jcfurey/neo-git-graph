import type { SimpleGit } from "simple-git";

import type { ActionPayload } from "@/backend/types";
import { refNames } from "@/backend/utils/refs";
import { requireBranchName, splitRemoteRef } from "@/backend/utils/validation";

export async function createBranch(
  git: SimpleGit,
  input: ActionPayload<"createBranch">
): Promise<void> {
  await git.raw(["branch", "--", input.branchName, input.commitHash]);
}

export async function deleteBranch(
  git: SimpleGit,
  input: ActionPayload<"deleteBranch">
): Promise<void> {
  await git.raw(["branch", input.forceDelete ? "-D" : "-d", "--", input.branchName]);
}

export async function renameBranch(
  git: SimpleGit,
  input: ActionPayload<"renameBranch">
): Promise<void> {
  await git.raw(["branch", "-m", "--", input.oldName, input.newName]);
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

  // A ref left behind by a removed remote can still be checked out, but not fetched or tracked.
  const source = input.fetch
    ? await splitRemoteRef(git, input.remoteBranch)
    : await splitRemoteRef(git, input.remoteBranch).catch(() => null);
  if (input.fetch && source !== null) {
    await git.raw([
      "fetch",
      "--no-tags",
      "--",
      source.remote,
      `+refs/heads/${source.branch}:refs/remotes/${input.remoteBranch}`
    ]);
  }
  if (!(await refNames(git, "refs/heads/")).includes(input.branchName)) {
    await git.raw([
      "checkout",
      source === null ? "--no-track" : "--track",
      "-b",
      input.branchName,
      `refs/remotes/${input.remoteBranch}`
    ]);
    return;
  }

  await git.checkout(input.branchName);
  await git.merge(["--ff-only", `refs/remotes/${input.remoteBranch}`]);
}
