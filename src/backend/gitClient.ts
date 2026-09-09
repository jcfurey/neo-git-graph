import type { SimpleGit } from "simple-git";
import { simpleGit } from "simple-git";

export type GitClient = ReturnType<typeof gitClientFactory>;
export type GitInstance = GitClient["getInstance"];

export function gitClientFactory(repoPath: string, gitPath: string, abort?: AbortSignal) {
  let git: SimpleGit = simpleGit({
    baseDir: repoPath,
    binary: gitPath,
    maxConcurrentProcesses: 6,
    trimmed: false,
    ...(abort ? { abort } : {})
  });

  return {
    getInstance: (): SimpleGit => git,
    setRepo(newRepoPath: string) {
      repoPath = newRepoPath;
      git = simpleGit({
        baseDir: repoPath,
        binary: gitPath,
        maxConcurrentProcesses: 6,
        trimmed: false,
        ...(abort ? { abort } : {})
      });
    },
    setGitPath(newGitPath: string) {
      gitPath = newGitPath;
      git = simpleGit({
        baseDir: repoPath,
        binary: gitPath,
        maxConcurrentProcesses: 6,
        trimmed: false,
        ...(abort ? { abort } : {})
      });
    }
  };
}
