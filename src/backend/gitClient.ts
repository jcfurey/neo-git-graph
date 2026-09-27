import type { SimpleGit } from "simple-git";
import { simpleGit } from "simple-git";

export type GitClient = ReturnType<typeof gitClientFactory>;
export type GitInstance = GitClient["getInstance"];

/** Overrides for user settings that change output the backend parses. */
const PARSED_OUTPUT_CONFIG = [
  // Signature lines before each signed commit in `git log` and `git show`.
  "log.showSignature=false",
  // ANSI color codes, such as around branch names in `git branch`.
  "color.ui=never",
  "color.branch=never"
];

export function createGit(repoPath: string, gitPath: string): SimpleGit {
  return simpleGit({
    baseDir: repoPath,
    binary: gitPath,
    maxConcurrentProcesses: 6,
    trimmed: false,
    config: PARSED_OUTPUT_CONFIG
  });
}

export function gitClientFactory(repoPath: string, gitPath: string) {
  let git = createGit(repoPath, gitPath);

  return {
    getInstance: (): SimpleGit => git,
    setRepo(newRepoPath: string) {
      repoPath = newRepoPath;
      git = createGit(repoPath, gitPath);
    },
    setGitPath(newGitPath: string) {
      gitPath = newGitPath;
      git = createGit(repoPath, gitPath);
    }
  };
}
