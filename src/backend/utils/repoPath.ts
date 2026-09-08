import * as path from "node:path";

/** Use the same repository key for Git paths and VS Code's native filesystem paths. */
export function normalizeRepoPath(repoPath: string): string {
  const normalized = path.normalize(repoPath).split(path.sep).join("/");
  // VS Code's Uri.fsPath lowercases Windows drive letters.
  return path.sep === "\\"
    ? normalized.replace(/^[A-Z]:/, (drive) => drive.toLowerCase())
    : normalized;
}
