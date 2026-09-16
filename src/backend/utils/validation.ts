import * as l10n from "@vscode/l10n";
import type { SimpleGit } from "simple-git";

export async function requireRemote(git: SimpleGit, remote: string) {
  if (!(await git.getRemotes()).some((entry) => entry.name === remote)) {
    throw new Error(l10n.t("Remote '{0}' is not configured for this repository.", remote));
  }
}

export async function requireBranchName(git: SimpleGit, branch: string) {
  if (!branch || branch.startsWith("-")) {
    throw new Error(l10n.t("Enter a valid branch name."));
  }
  await git.raw(["check-ref-format", `refs/heads/${branch}`]);
}

export async function resolveCommit(git: SimpleGit, ref: string) {
  return (await git.raw(["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`])).trim();
}

export async function requireCurrentBranch(git: SimpleGit, branch: string, expectedHead?: string) {
  await requireBranchName(git, branch);
  const head = (await git.raw(["symbolic-ref", "--quiet", "HEAD"])).trim();
  if (head !== `refs/heads/${branch}`) {
    throw new Error(l10n.t("Check out branch '{0}' before running this operation.", branch));
  }
  if (expectedHead !== undefined && (await resolveCommit(git, "HEAD")) !== expectedHead) {
    throw new Error(l10n.t("The branch changed. Refresh the graph and try again."));
  }
}

export async function splitRemoteRef(git: SimpleGit, ref: string) {
  const remote = (await git.getRemotes())
    .map((item) => item.name)
    .filter((name) => ref.startsWith(name + "/"))
    .toSorted((a, b) => b.length - a.length)[0];
  if (remote === undefined) {
    throw new Error(l10n.t("The remote for '{0}' is no longer configured.", ref));
  }
  const branch = ref.slice(remote.length + 1);
  await requireBranchName(git, branch);
  return { remote, branch };
}
