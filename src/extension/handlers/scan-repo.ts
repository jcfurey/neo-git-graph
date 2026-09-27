import fs from "node:fs/promises";
import path from "node:path";

import * as vscode from "vscode";

import { getSubmodulePaths, workTreeRoot } from "@/backend/utils/git";
import { extConfig } from "@/extension/config";
import { logger } from "@/extension/util/logger";
import type { GitRepo, ScanRepoResult } from "@/types";

export async function scanRepos(): Promise<ScanRepoResult> {
  const workspaceDirs = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
  const gitBinary = extConfig.gitBinary();
  const repos = await startScan(gitBinary, workspaceDirs, extConfig.maxDepth());
  logger.info(`Repository scan completed: ${repos.length} found; Git binary: ${gitBinary}`);

  return {
    repos
  };
}

async function startScan(gitBinary: string, paths: string[], maxDepth: number): Promise<GitRepo[]> {
  const repos = await Promise.all(
    paths.map((directory) => scanDirectory(gitBinary, directory, maxDepth))
  );
  // Workspace folders inside one repository, and submodules opened as folders, repeat entries.
  const uniqueRepos = new Map(repos.flat().map((repo) => [repo.path, repo]));
  return [...uniqueRepos.values()].toSorted((a, b) => a.path.localeCompare(b.path));
}

async function scanDirectory(
  gitBinary: string,
  directory: string,
  depth: number
): Promise<GitRepo[]> {
  const repoPath = await workTreeRoot(directory, gitBinary).catch((error: unknown) => {
    logger.warn(`Failed to check Git repository: ${directory}; Git binary: ${gitBinary}`, error);
    return null;
  });

  if (repoPath !== null) {
    const submodules = await getSubmodulePaths(repoPath, gitBinary);
    return [repoPath, ...submodules].map((repo) => ({ name: path.basename(repo), path: repo }));
  }

  if (depth <= 0) {
    return [];
  }

  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  const repos = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && entry.name !== ".git")
      .map((entry) => scanDirectory(gitBinary, path.join(directory, entry.name), depth - 1))
  );

  return repos.flat();
}
