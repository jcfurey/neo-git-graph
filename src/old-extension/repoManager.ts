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

/** The repositories this workspace has seen, with the state the editor keeps for each. */
export function createRepoManager(extensionState: ExtensionState) {
  let repos = extensionState.getRepos();

  function setRepos(repoDirs: string[]) {
    const next: GitRepoSet = {};
    for (const repo of repoDirs) {
      next[repo] = repos[repo] ?? { columnWidths: null };
    }
    repos = next;
    extensionState.saveRepos(repos);
  }

  function getRepos() {
    return sortRepos(repos);
  }

  function removeRepo(repo: string) {
    delete repos[repo];
    extensionState.saveRepos(repos);
  }

  function addRepo(repo: string) {
    if (repos[repo]) {
      return false;
    }
    repos[repo] = { columnWidths: null };
    extensionState.saveRepos(repos);
    return true;
  }

  function removeReposWithinFolder(path: string) {
    const pathFolder = path + "/";
    const repoPaths = Object.keys(repos);
    let changes = false;
    for (const repoPath of repoPaths) {
      if (repoPath === path || repoPath.startsWith(pathFolder)) {
        removeRepo(repoPath);
        changes = true;
      }
    }
    return changes;
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
    setRepos,
    addRepo,
    removeRepo,
    removeReposWithinFolder,
    setRepoState,
    updateHiddenRemotes
  };
}

export type RepoManager = ReturnType<typeof createRepoManager>;
