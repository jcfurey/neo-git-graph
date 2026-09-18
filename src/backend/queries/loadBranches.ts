import type { SimpleGit } from "simple-git";

import type { QueryResult } from "@/backend/types";
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
  const { showRemoteBranches, hard, repo } = input;
  const [summary, visibility] = await Promise.all([
    showRemoteBranches ? git.branch() : git.branchLocal(),
    remoteVisibility(git, input)
  ]);
  const head = summary.detached ? null : summary.current || null;
  const ordered = head ? [head, ...summary.all.filter((b) => b !== head)] : [...summary.all];
  const branches = ordered.filter(
    (branch) => !branch.startsWith("remotes/") || !visibility.excluded.has(branch.slice(8))
  );
  return { repo, branches, head, hard, isRepo: true };
}
