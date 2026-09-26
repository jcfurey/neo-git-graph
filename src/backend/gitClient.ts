import type { SimpleGit } from "simple-git";
import { simpleGit } from "simple-git";

export type GitClient = ReturnType<typeof gitClientFactory>;
export type GitInstance = GitClient["getInstance"];

/**
 * User settings that would change output the backend parses, such as signature verification
 * lines in logs and ANSI color codes, or hide untracked files from the clean-worktree checks of
 * Git commands like `worktree remove`. Git passes them on to its own child processes. Every other
 * setting still applies.
 */
export const PARSED_OUTPUT_CONFIG = [
  "log.showSignature=false",
  "status.showUntrackedFiles=all",
  "color.ui=never",
  "color.branch=never",
  "color.diff=never",
  "color.status=never",
  "color.showBranch=never",
  "color.grep=never"
];

/**
 * Arguments for Git processes started without simple-git: the same settings, and no optional
 * locks, so reads such as `git status` never rewrite the index or hold `index.lock` while the
 * user commits.
 */
export const PARSED_OUTPUT_ARGS = [
  "--no-optional-locks",
  ...PARSED_OUTPUT_CONFIG.flatMap((setting) => ["-c", setting])
];

/** The executable and cancellation of each client, for Git processes started without it. */
const processes = new WeakMap<SimpleGit, { gitPath: string; abort?: AbortSignal }>();

export function gitProcessOf(git: SimpleGit) {
  return processes.get(git);
}

export function createGit(repoPath: string, gitPath: string, abort?: AbortSignal): SimpleGit {
  // The executable comes from VS Code's Git extension or the user's `git.path`, and can contain
  // spaces or parentheses, as in `C:\Program Files\Git\cmd\git.exe`. simple-git rejects such
  // paths unless allowed, and then warns on every client it creates.
  // eslint-disable-next-line no-console
  const warn = console.warn;
  // eslint-disable-next-line no-console
  console.warn = () => {};
  try {
    const git = simpleGit({
      baseDir: repoPath,
      // The prefix argument follows the binary, before any command.
      binary: [gitPath, "--no-optional-locks"],
      unsafe: { allowUnsafeCustomBinary: true },
      maxConcurrentProcesses: 6,
      trimmed: false,
      config: PARSED_OUTPUT_CONFIG,
      ...(abort ? { abort } : {})
    });
    processes.set(git, { gitPath, ...(abort ? { abort } : {}) });
    return git;
  } finally {
    // eslint-disable-next-line no-console
    console.warn = warn;
  }
}

export function gitClientFactory(repoPath: string, gitPath: string, abort?: AbortSignal) {
  let git = createGit(repoPath, gitPath, abort);

  return {
    getInstance: (): SimpleGit => git,
    setRepo(newRepoPath: string) {
      repoPath = newRepoPath;
      git = createGit(repoPath, gitPath, abort);
    },
    setGitPath(newGitPath: string) {
      gitPath = newGitPath;
      git = createGit(repoPath, gitPath, abort);
    }
  };
}
