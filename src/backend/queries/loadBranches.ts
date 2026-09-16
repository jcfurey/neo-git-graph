import type { SimpleGit } from "simple-git";

import type { QueryResult } from "@/backend/types";
import { isGitRepository } from "@/backend/utils/git";
import { remoteVisibility } from "@/backend/utils/remoteVisibility";

type LoadBranchesInput = {
  showRemoteBranches: boolean;
  hiddenRemotes?: string[];
  hard: boolean;
  repo: string;
  gitPath: string;
};

export async function loadBranches(
  git: SimpleGit,
  input: LoadBranchesInput
): Promise<QueryResult<"loadBranches">> {
  const { showRemoteBranches, hard, repo, gitPath } = input;

  let branches: string[];
  let head: string | null;
  let error: boolean;

  try {
    const [summary, visibility] = await Promise.all([
      showRemoteBranches ? git.branch() : git.branchLocal(),
      remoteVisibility(git, input)
    ]);
    head = summary.detached ? null : summary.current || null;
    branches = head ? [head, ...summary.all.filter((b) => b !== head)] : [...summary.all];
    branches = branches.filter(
      (branch) => !branch.startsWith("remotes/") || !visibility.excluded.has(branch.slice(8))
    );
    error = false;
  } catch {
    branches = [];
    head = null;
    error = true;
  }

  const isRepo = error ? await isGitRepository(repo, gitPath) : true;

  return { repo, branches, head, hard, isRepo };
}
