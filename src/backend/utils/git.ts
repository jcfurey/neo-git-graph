import { realpath } from "node:fs/promises";

import { createGit } from "@/backend/gitClient";
import { normalizeRepoPath } from "@/backend/utils/repoPath";

/**
 * The real path of the work tree that contains `directory`, or null outside a work tree. A
 * subfolder or a symlink of a repository thus maps to the one entry for that repository.
 */
export async function workTreeRoot(directory: string, gitPath: string): Promise<string | null> {
  try {
    const top = (await createGit(directory, gitPath).raw(["rev-parse", "--show-toplevel"])).replace(
      /\n$/,
      ""
    );
    return top === "" ? null : normalizeRepoPath(await realpath(top));
  } catch {
    // Outside a work tree, Git fails, and the client rejects a directory that does not exist.
    return null;
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
