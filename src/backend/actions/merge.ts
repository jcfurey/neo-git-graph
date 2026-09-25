import * as l10n from "@vscode/l10n";
import type { SimpleGit } from "simple-git";

import type { ActionPayload } from "@/backend/types";
import { runGit } from "@/backend/utils/runGit";

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

/**
 * Git reports merge conflicts on standard output, in the user's language, and exits with status
 * 1. Judge the result by the exit status and the merge state instead of the text.
 */
async function merge(git: SimpleGit, args: string[], binary: string) {
  try {
    await runGit(git, ["merge", ...args], binary);
  } catch (error) {
    const merging = await git
      .raw(["rev-parse", "--verify", "--quiet", "MERGE_HEAD"])
      .then((head) => head.trim() !== "")
      .catch(() => false);
    if (merging) {
      throw new Error(
        l10n.t(
          "The merge stopped on conflicts. Resolve and stage the conflicted files, then continue or abort the merge from the status strip."
        ),
        { cause: error }
      );
    }
    throw error;
  }
}

export async function mergeBranch(
  git: SimpleGit,
  input: ActionPayload<"mergeBranch">,
  binary: string
): Promise<void> {
  await merge(
    git,
    [
      ...(input.createNewCommit ? ["--no-ff"] : []),
      "--no-edit",
      "--end-of-options",
      await branchArgument(git, input.branchName)
    ],
    binary
  );
}

export async function mergeCommit(
  git: SimpleGit,
  input: ActionPayload<"mergeCommit">,
  binary: string
): Promise<void> {
  await merge(
    git,
    [
      ...(input.createNewCommit ? ["--no-ff"] : []),
      "--no-edit",
      "--end-of-options",
      input.commitHash
    ],
    binary
  );
}
