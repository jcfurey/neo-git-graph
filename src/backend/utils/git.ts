import { realpath } from "node:fs/promises";

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
 * The real path of the work tree that contains `directory`, or null outside a work tree. A
 * subfolder of a repository, or a symlink to one, thus maps to the repository itself. Rejects
 * when Git cannot run in `directory`.
 */
export async function workTreeRoot(directory: string, gitPath: string): Promise<string | null> {
  const git = simpleGit({ baseDir: directory, binary: gitPath });
  if (!(await git.checkIsRepo())) {
    return null;
  }

  const topLevel = await git.raw(["rev-parse", "--show-toplevel"]);
  return realpath(topLevel.replace(/\n$/, ""));
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
