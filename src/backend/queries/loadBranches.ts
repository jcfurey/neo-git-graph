import type { SimpleGit } from "simple-git";

import type { QueryResult } from "@/backend/types";
import { currentBranch, refNames } from "@/backend/utils/refs";
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
  const [local, remote, visibility] = await Promise.all([
    refNames(git, "refs/heads/"),
    showRemoteBranches ? refNames(git, "refs/remotes/") : [],
    remoteVisibility(git, input)
  ]);
  const head = await currentBranch(git, local);
  const branches = [
    ...(head === null ? [] : [head]),
    ...local.filter((branch) => branch !== head),
    ...remote.filter((name) => !visibility.excluded.has(name)).map((name) => "remotes/" + name)
  ];
  return { repo, branches, head, hard, isRepo: true };
}
