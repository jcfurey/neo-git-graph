import { createGit } from "@/backend/gitClient";
import { normalizeRepoPath } from "@/backend/utils/repoPath";

export async function isGitRepository(repoPath: string, gitPath: string): Promise<boolean> {
  try {
    return await createGit(repoPath, gitPath).checkIsRepo();
  } catch {
    return false;
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
