import type { SimpleGit } from "simple-git";

import type { ActionPayload } from "@/backend/types";

/**
 * Git reports conflicts on stdout in the user's language and exits with an empty stderr, so check
 * for an unfinished merge instead of parsing the output.
 */
async function merge(git: SimpleGit, args: string[]): Promise<void> {
  const output = await git.raw(["merge", ...args]);
  const mergeHead = await git.raw(["rev-parse", "-q", "--verify", "MERGE_HEAD"]);
  if (mergeHead.trim() !== "") {
    throw new Error(output.trim());
  }
}

export async function mergeBranch(
  git: SimpleGit,
  input: ActionPayload<"mergeBranch">
): Promise<void> {
  const args = input.createNewCommit ? [input.branchName, "--no-ff"] : [input.branchName];
  await merge(git, args);
}

export async function mergeCommit(
  git: SimpleGit,
  input: ActionPayload<"mergeCommit">
): Promise<void> {
  const args = input.createNewCommit ? [input.commitHash, "--no-ff"] : [input.commitHash];
  await merge(git, args);
}
