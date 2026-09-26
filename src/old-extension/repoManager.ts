import { access } from "node:fs/promises";

import { ExtensionState } from "@/old-extension/extensionState";
import type { GitRepoSet, GitRepoState } from "@/types";

function sortRepos(repos: GitRepoSet) {
  const repoPaths = Object.keys(repos).toSorted();
  const sorted: GitRepoSet = {};
  for (const repoPath of repoPaths) {
    const repo = repos[repoPath];
    if (repo !== undefined) {
      sorted[repoPath] = repo;
    }
  }
  return sorted;
}

/** The state the editor keeps for each repository this workspace has shown. */
export function createRepoManager(extensionState: ExtensionState) {
  let repos = extensionState.getRepos();

  function getRepos() {
    return sortRepos(repos);
  }

  /** Forget saved state for repositories whose folders no longer exist. */
  async function pruneMissing() {
    const missing = await Promise.all(
      Object.keys(repos).map((repo) =>
        access(repo).then(
          () => null,
          () => repo
        )
      )
    );
    const stale = missing.filter((repo): repo is string => repo !== null);
    if (stale.length > 0) {
      for (const repo of stale) {
        delete repos[repo];
      }
      extensionState.saveRepos(repos);
    }
    return stale;
  }

  function setRepoState(repo: string, state: GitRepoState) {
    repos[repo] = state;
    extensionState.saveRepos(repos);
  }

  function updateHiddenRemotes(repo: string, names: string[]): GitRepoState | undefined {
    const state = repos[repo] ?? { columnWidths: null };
    const hiddenRemotes = [...new Set(names)].toSorted();
    if (JSON.stringify(state.hiddenRemotes ?? []) === JSON.stringify(hiddenRemotes)) {
      return undefined;
    }
    const next = { ...state, hiddenRemotes };
    setRepoState(repo, next);
    return next;
  }

  return {
    getRepos,
    pruneMissing,
    setRepoState,
    updateHiddenRemotes
  };
}

export type RepoManager = ReturnType<typeof createRepoManager>;
