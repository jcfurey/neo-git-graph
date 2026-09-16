import * as vscode from "vscode";

import { findGitRepos } from "@/backend/queries/repoSearch";

let cache: { key: string; repos: Promise<string[]> } | undefined;

/**
 * Repositories under the workspace folders. Walking the folders is expensive,
 * so the result is reused until the folders, Git path or search depth change,
 * or `invalidateWorkspaceScan` reports a repository that appeared or vanished.
 */
export function scanWorkspaceRepos(gitPath: string, maxDepth: number): Promise<string[]> {
  const folders = (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);
  const key = JSON.stringify([folders, gitPath, maxDepth]);
  if (cache?.key !== key) {
    const entry = { key, repos: findGitRepos(folders, gitPath, maxDepth) };
    entry.repos.catch(() => {
      if (cache === entry) {
        cache = undefined;
      }
    });
    cache = entry;
  }
  return cache.repos;
}

export function invalidateWorkspaceScan(): void {
  cache = undefined;
}
