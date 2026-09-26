import { searchDirectoryForRepos } from "@/backend/utils/repoSearch";

/** Every repository in the workspace folders, once each, sorted by path. */
export async function findGitRepos(
  paths: string[],
  gitPath: string,
  maxDepth: number
): Promise<string[]> {
  const results = await Promise.all(
    paths.map((p) => searchDirectoryForRepos(p, maxDepth, gitPath, []))
  );
  return [...new Set(results.flat())].toSorted((a, b) => a.localeCompare(b));
}
