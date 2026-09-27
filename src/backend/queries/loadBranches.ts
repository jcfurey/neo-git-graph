import type { SimpleGit } from "simple-git";

import type { QueryResult } from "@/backend/types";
import { isGitRepository } from "@/backend/utils/git";

const eolRegex = /\r\n|\r|\n/g;

type LoadBranchesInput = {
  showRemoteBranches: boolean;
  hard: boolean;
  repo: string;
  gitPath: string;
};

/**
 * Unlike `git branch`, `for-each-ref` output is neither localized nor colored, and never lists a
 * detached HEAD or an operation in progress. Symbolic refs such as `origin/HEAD` are skipped.
 */
async function getBranches(git: SimpleGit, showRemoteBranches: boolean): Promise<string[]> {
  const args = [
    "for-each-ref",
    "--format=%(if)%(symref)%(then)%(else)%(refname)%(end)",
    "refs/heads/"
  ];
  if (showRemoteBranches) {
    args.push("refs/remotes/");
  }
  const stdout = await git.raw(args);
  const branches: string[] = [];
  for (const ref of stdout.split(eolRegex)) {
    if (ref.startsWith("refs/heads/")) {
      branches.push(ref.substring(11));
    } else if (ref.startsWith("refs/remotes/")) {
      branches.push(ref.substring(5));
    }
  }
  return branches;
}

async function getHead(git: SimpleGit): Promise<string | null> {
  const ref = (await git.raw(["symbolic-ref", "--quiet", "HEAD"]).catch(() => "")).trim();
  return ref.startsWith("refs/heads/") ? ref.substring(11) : null;
}

export async function loadBranches(
  git: SimpleGit,
  input: LoadBranchesInput
): Promise<QueryResult<"loadBranches">> {
  const { showRemoteBranches, hard, repo, gitPath } = input;

  let branches: string[];
  let head: string | null;
  let error: boolean;

  try {
    const [all, current] = await Promise.all([getBranches(git, showRemoteBranches), getHead(git)]);
    // HEAD may name an unborn branch, which has no ref to list yet.
    head = current !== null && all.includes(current) ? current : null;
    branches = head ? [head, ...all.filter((b) => b !== head)] : all;
    error = false;
  } catch {
    branches = [];
    head = null;
    error = true;
  }

  const isRepo = error ? await isGitRepository(repo, gitPath) : true;

  return { repo, branches, head, hard, isRepo };
}
