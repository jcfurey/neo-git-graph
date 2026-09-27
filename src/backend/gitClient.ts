import type { SimpleGit } from "simple-git";
import { simpleGit } from "simple-git";

export type GitClient = ReturnType<typeof gitClientFactory>;
export type GitInstance = GitClient["getInstance"];

// Without optional locks, reads such as `git status` never rewrite the index or hold
// `index.lock` while the user runs Git.
export function gitClientFactory(repoPath: string, gitPath: string) {
  let git: SimpleGit = simpleGit({
    baseDir: repoPath,
    binary: [gitPath, "--no-optional-locks"],
    maxConcurrentProcesses: 6,
    trimmed: false
  });

  return {
    getInstance: (): SimpleGit => git,
    setRepo(newRepoPath: string) {
      repoPath = newRepoPath;
      git = simpleGit({
        baseDir: repoPath,
        binary: [gitPath, "--no-optional-locks"],
        maxConcurrentProcesses: 6,
        trimmed: false
      });
    },
    setGitPath(newGitPath: string) {
      gitPath = newGitPath;
      git = simpleGit({
        baseDir: repoPath,
        binary: [gitPath, "--no-optional-locks"],
        maxConcurrentProcesses: 6,
        trimmed: false
      });
    }
  };
}
