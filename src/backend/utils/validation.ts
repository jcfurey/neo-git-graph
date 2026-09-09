import type { SimpleGit } from "simple-git";

export async function requireRemote(git: SimpleGit, remote: string) {
  if (!(await git.getRemotes()).some((entry) => entry.name === remote)) {
    throw new Error(`Remote '${remote}' is not configured for this repository.`);
  }
}

export async function requireBranchName(git: SimpleGit, branch: string) {
  if (!branch || branch.startsWith("-")) {
    throw new Error("Enter a valid branch name.");
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
    throw new Error(`Check out branch '${branch}' before running this operation.`);
  }
  if (expectedHead !== undefined && (await resolveCommit(git, "HEAD")) !== expectedHead) {
    throw new Error("The branch changed. Refresh the graph and try again.");
  }
}

export async function splitRemoteRef(git: SimpleGit, ref: string) {
  const remote = (await git.getRemotes())
    .map((item) => item.name)
    .filter((name) => ref.startsWith(name + "/"))
    .toSorted((a, b) => b.length - a.length)[0];
  if (remote === undefined) {
    throw new Error(`The remote for '${ref}' is no longer configured.`);
  }
  const branch = ref.slice(remote.length + 1);
  await requireBranchName(git, branch);
  return { remote, branch };
}
