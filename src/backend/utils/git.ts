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

export async function getSubmodulePaths(repoPath: string, gitPath: string): Promise<string[]> {
  try {
    const output = await simpleGit({ baseDir: repoPath, binary: gitPath }).raw([
      "submodule",
      "foreach",
      "--quiet",
      "--recursive",
      // Git visits initialized submodules only. NUL separators preserve spaces and newlines.
      'printf "%s\\0" "$toplevel/$sm_path"'
    ]);
    return output.split("\0").filter((submodule) => submodule.length > 0);
  } catch {
    return [];
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
