import fs from "node:fs/promises";
import path from "node:path";

import { getSubmodulePaths, isGitRepository } from "@/backend/utils/git";
import { normalizeRepoPath } from "@/backend/utils/repoPath";
import { extConfig } from "@/extension/config";
import { logger } from "@/extension/util/logger";
import { workspaceFolderPaths } from "@/extension/workspace-folders";
import type { GitRepo, ScanRepoResult } from "@/types";

export async function scanRepos(): Promise<ScanRepoResult> {
  const workspaceDirs = workspaceFolderPaths();
  const gitBinary = extConfig.gitPath();
  const repos = await startScan(gitBinary, workspaceDirs, extConfig.maxDepthOfRepoSearch());
  logger.info(`Repository scan completed: ${repos.length} found; Git binary: ${gitBinary}`);

  return {
    repos
  };
}

async function startScan(gitBinary: string, paths: string[], maxDepth: number): Promise<GitRepo[]> {
  const repos = await Promise.all(
    paths.map(async (directory) => {
      // One missing or unreadable folder must not hide the repositories of the others.
      if (
        !(await fs.stat(directory).then(
          (stat) => stat.isDirectory(),
          () => false
        ))
      ) {
        logger.warn(`Skipping workspace folder that is not a readable directory: ${directory}`);
        return [];
      }
      return scanDirectory(gitBinary, normalizeRepoPath(directory), maxDepth).catch(
        (error: unknown) => {
          logger.warn(`Unable to scan workspace folder: ${directory}`, error);
          return [];
        }
      );
    })
  );
  const uniqueRepos = new Map(repos.flat().map((repo) => [repo.path, repo]));
  return [...uniqueRepos.values()].toSorted((a, b) => a.path.localeCompare(b.path));
}

async function scanDirectory(
  gitBinary: string,
  directory: string,
  depth: number
): Promise<GitRepo[]> {
  const isRepo = await isGitRepository(directory, gitBinary);

  if (isRepo) {
    const submodules = await getSubmodulePaths(directory, gitBinary);
    return [directory, ...submodules].map(normalizeRepoPath).map((repoPath) => ({
      name: path.basename(repoPath),
      path: repoPath
    }));
  }

  if (depth <= 0) {
    return [];
  }

  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  const repos = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && entry.name !== ".git")
      .map((entry) =>
        scanDirectory(gitBinary, normalizeRepoPath(path.join(directory, entry.name)), depth - 1)
      )
  );

  return repos.flat();
}
