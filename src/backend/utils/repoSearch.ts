import * as fs from "node:fs/promises";

import { getSubmodulePaths, isGitRepository } from "@/backend/utils/git";
import { evalPromises } from "@/backend/utils/promise";
import { normalizeRepoPath } from "@/backend/utils/repoPath";

async function isDirectory(path: string): Promise<boolean> {
  return fs
    .stat(path)
    .then((s) => s.isDirectory())
    .catch(() => false);
}

export async function searchDirectoryForRepos(
  directory: string,
  maxDepth: number,
  gitPath: string,
  knownRepoPaths: string[]
): Promise<string[]> {
  const repoPath = normalizeRepoPath(directory);
  const knownRepos = knownRepoPaths.map(normalizeRepoPath);
  if (
    knownRepos.some((r) => repoPath === r || repoPath.startsWith(r.endsWith("/") ? r : r + "/"))
  ) {
    return [];
  }

  const isRepo = await isGitRepository(repoPath, gitPath);
  if (isRepo) {
    const submodules = (await getSubmodulePaths(repoPath, gitPath)).map(normalizeRepoPath);
    return [repoPath, ...submodules.filter((repo) => !knownRepos.includes(repo))];
  }

  if (maxDepth <= 0) {
    return [];
  }

  const dirContents = await fs.readdir(repoPath).catch(() => null);
  if (dirContents === null) {
    return [];
  }

  const dirs: string[] = [];
  for (let i = 0; i < dirContents.length; i++) {
    if (dirContents[i] !== ".git" && (await isDirectory(repoPath + "/" + dirContents[i]))) {
      dirs.push(repoPath + "/" + dirContents[i]);
    }
  }

  const results = await evalPromises(dirs, 2, (dir) =>
    searchDirectoryForRepos(dir, maxDepth - 1, gitPath, knownRepos)
  );
  return results.flat();
}
