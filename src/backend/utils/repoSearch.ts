import * as fs from "node:fs/promises";

import { getSubmodulePaths, workTreeRoot } from "@/backend/utils/git";
import { evalPromises } from "@/backend/utils/promise";
import { isRepoWithinPath, normalizeRepoPath } from "@/backend/utils/repoPath";

async function isDirectory(path: string): Promise<boolean> {
  return fs
    .stat(path)
    .then((s) => s.isDirectory())
    .catch(() => false);
}

/**
 * The repositories at or below `directory`, as the real top level of each work tree with its
 * initialized submodules. A directory inside a work tree yields that work tree, so the search
 * stops there.
 */
export async function searchDirectoryForRepos(
  directory: string,
  maxDepth: number,
  gitPath: string,
  knownRepoPaths: string[]
): Promise<string[]> {
  const dirPath = normalizeRepoPath(directory);
  const knownRepos = knownRepoPaths.map(normalizeRepoPath);
  if (knownRepos.some((known) => isRepoWithinPath(dirPath, known))) {
    return [];
  }

  const root = await workTreeRoot(dirPath, gitPath);
  if (root !== null) {
    const repoPath = normalizeRepoPath(root);
    const submodules = (await getSubmodulePaths(repoPath, gitPath)).map(normalizeRepoPath);
    return [repoPath, ...submodules].filter((repo) => !knownRepos.includes(repo));
  }

  if (maxDepth <= 0) {
    return [];
  }

  const dirContents = await fs.readdir(dirPath).catch(() => null);
  if (dirContents === null) {
    return [];
  }

  const dirs: string[] = [];
  for (const entry of dirContents) {
    if (entry !== ".git" && (await isDirectory(dirPath + "/" + entry))) {
      dirs.push(dirPath + "/" + entry);
    }
  }

  const results = await evalPromises(dirs, 2, (dir) =>
    searchDirectoryForRepos(dir, maxDepth - 1, gitPath, knownRepos)
  );
  return results.flat();
}
