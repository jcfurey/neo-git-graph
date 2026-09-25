import type { SimpleGit } from "simple-git";

import type { ActionPayload } from "@/backend/types";

/**
 * Git names the merge commit after the argument, so keep the short name only when Git resolves it
 * to the branch. A same-named tag, `refs/<name>`, or on a case-insensitive filesystem a tag that
 * differs only in case, would take precedence over the branch.
 */
async function branchArgument(git: SimpleGit, branch: string) {
  const ref = `refs/heads/${branch}`;
  const resolved = await git
    .raw(["rev-parse", "--verify", "--quiet", "--symbolic-full-name", "--end-of-options", branch])
    .catch(() => "");
  return resolved.trim() === ref ? branch : ref;
}

export async function mergeBranch(
  git: SimpleGit,
  input: ActionPayload<"mergeBranch">
): Promise<void> {
  await git.merge([
    ...(input.createNewCommit ? ["--no-ff"] : []),
    "--end-of-options",
    await branchArgument(git, input.branchName)
  ]);
}

export async function mergeCommit(
  git: SimpleGit,
  input: ActionPayload<"mergeCommit">
): Promise<void> {
  await git.merge([
    ...(input.createNewCommit ? ["--no-ff"] : []),
    "--end-of-options",
    input.commitHash
  ]);
}
