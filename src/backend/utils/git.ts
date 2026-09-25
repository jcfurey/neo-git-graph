import type { SimpleGit } from "simple-git";

import { createGit } from "@/backend/gitClient";
import { normalizeRepoPath } from "@/backend/utils/repoPath";

/**
 * Whether Git runs inside a work tree. Git reports "not a repository" in the user's language, so
 * the answer comes from the output and exit status alone, as Git recommends for scripts.
 */
export function isWorkTree(git: SimpleGit): Promise<boolean> {
  return git.raw(["rev-parse", "--is-inside-work-tree"]).then(
    (output) => output.trim() === "true",
    () => false
  );
}

export function isGitRepository(repoPath: string, gitPath: string): Promise<boolean> {
  try {
    return isWorkTree(createGit(repoPath, gitPath));
  } catch {
    // The client rejects a directory that does not exist.
    return Promise.resolve(false);
  }
}

export async function getSubmodulePaths(repoPath: string, gitPath: string): Promise<string[]> {
  try {
    const output = await createGit(repoPath, gitPath).raw([
      "submodule",
      "foreach",
      "--quiet",
      "--recursive",
      // Git visits initialized submodules only. NUL separators preserve spaces and newlines.
      'printf "%s\\0" "$toplevel/$sm_path"'
    ]);
    return output
      .split("\0")
      .filter((submodule) => submodule.length > 0)
      .map(normalizeRepoPath);
  } catch {
    return [];
  }
}

export async function getRemoteUrl(repoPath: string, gitPath: string): Promise<string | null> {
  try {
    const url = await createGit(repoPath, gitPath).raw(["config", "--get", "remote.origin.url"]);
    return url.trim() || null;
  } catch {
    return null;
  }
}
