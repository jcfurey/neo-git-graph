import type { SimpleGit } from "simple-git";

import type { ActionPayload } from "@/backend/types";

/**
 * Git names the merge commit after the argument, so keep the short name unless Git would resolve
 * it to another ref first: a root ref such as `HEAD`, `refs/<name>`, or a same-named tag.
 */
async function branchArgument(git: SimpleGit, branch: string) {
  const ref = `refs/heads/${branch}`;
  const earlier = [`refs/${branch}`, `refs/tags/${branch}`];
  const shadowed =
    /^[A-Z_]+$/.test(branch) ||
    (await git.raw(["for-each-ref", "--format=%(refname)", ...earlier]))
      .split("\n")
      .some((name) => earlier.includes(name));
  return shadowed ? ref : branch;
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
