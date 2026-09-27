import * as path from "node:path";

import { simpleGit } from "simple-git";

export async function getGitVersion(gitPath: string): Promise<string | null> {
  try {
    const result = await simpleGit({ binary: gitPath }).version();
    return `${result.major}.${result.minor}.${result.patch}`;
  } catch {
    return null;
  }
}

export async function isGitRepository(repoPath: string, gitPath: string): Promise<boolean> {
  try {
    return await simpleGit({ baseDir: repoPath, binary: gitPath }).checkIsRepo();
  } catch {
    return false;
  }
}

/**
 * The top level of the work tree that contains `repoPath`, or null outside a work tree. It is
 * resolved from `repoPath`, so a symlinked repository keeps the path that VS Code shows.
 */
export async function getRepoRoot(repoPath: string, gitPath: string): Promise<string | null> {
  try {
    const cdup = await simpleGit({ baseDir: repoPath, binary: gitPath }).raw([
      "rev-parse",
      "--show-cdup"
    ]);
    return path.resolve(repoPath, cdup.trim());
  } catch {
    return null;
  }
}

export async function getRemoteUrl(repoPath: string, gitPath: string): Promise<string | null> {
  try {
    const url = await simpleGit({ baseDir: repoPath, binary: gitPath }).raw([
      "config",
      "--get",
      "remote.origin.url"
    ]);
    return url.trim() || null;
  } catch {
    return null;
  }
}
