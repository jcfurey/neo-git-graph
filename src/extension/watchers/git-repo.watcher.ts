import { realpath } from "node:fs/promises";
import path from "node:path";

import { simpleGit } from "simple-git";
import * as vscode from "vscode";

import { rpcNotify } from "@/extension/rpc/rpc-notify";
import { logger } from "@/extension/util/logger";

const REFRESH_DELAY = 250;
/** Per-worktree state in the Git directory: HEAD, the index, and interrupted operations. */
const WORKTREE_DATA =
  /^(HEAD|index|MERGE_HEAD|CHERRY_PICK_HEAD|REVERT_HEAD|BISECT_[A-Z_]+|(?:rebase-merge|rebase-apply|sequencer)(?:\/.*)?)$/;
/** State that worktrees share in the common directory. */
const SHARED_DATA = /^(config|packed-refs|refs(?:\/.*)?)$/;

let selectRepo: ((repo: string, gitPath: string) => void) | undefined;
let muteDepth = 0;
let resumeAt = 0;

/**
 * The Git directory, which holds HEAD and the index, and the common directory, which holds refs.
 * Linked worktrees and submodules keep both outside their work tree.
 */
async function gitDirectories(repo: string, gitPath: string) {
  try {
    const git = simpleGit({ baseDir: repo, binary: gitPath });
    const [gitDir, commonDir] = await Promise.all([
      git.raw(["rev-parse", "--absolute-git-dir"]),
      git.raw(["rev-parse", "--git-common-dir"])
    ]);
    const real = (dir: string) => realpath(path.resolve(repo, dir.replace(/\n$/, "")));
    return { gitDir: await real(gitDir), commonDir: await real(commonDir) };
  } catch (error) {
    logger.warn(`Unable to find the Git directory of ${repo}`, error);
    return null;
  }
}

export function watchGitRepo(): vscode.Disposable {
  let repoPath: string | undefined;
  /** Counts selections, so a slow Git directory lookup cannot add watchers for an old one. */
  let selection = 0;
  let watchers: vscode.FileSystemWatcher[] = [];
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;

  const stop = () => {
    watchers.forEach((watcher) => watcher.dispose());
    watchers = [];
    if (refreshTimer !== undefined) {
      clearTimeout(refreshTimer);
      refreshTimer = undefined;
    }
  };

  /** Watch `base`, refreshing `repo` for changes whose path below `base` is `relevant`. */
  const watch = (repo: string, base: string, relevant: (relativePath: string) => boolean) => {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(base, "**/*")
    );

    const refresh = (event: "created" | "changed" | "deleted", uri: vscode.Uri) => {
      if (muteDepth > 0 || Date.now() < resumeAt) {
        return;
      }

      const relativePath = path.relative(base, uri.fsPath).split(path.sep).join("/");
      if (relativePath.startsWith("../") || !relevant(relativePath)) {
        return;
      }

      logger.debug(`Repository file ${event}: ${uri.fsPath}`);
      if (refreshTimer !== undefined) {
        clearTimeout(refreshTimer);
      }
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        logger.debug(`Sending repo.updated notification: ${repo}`);
        void rpcNotify.notify("repo.updated", { path: repo });
      }, REFRESH_DELAY);
    };

    watcher.onDidCreate((uri) => refresh("created", uri));
    watcher.onDidChange((uri) => refresh("changed", uri));
    watcher.onDidDelete((uri) => refresh("deleted", uri));
    watchers.push(watcher);
  };

  selectRepo = (repo: string, gitPath: string) => {
    if (repo === repoPath && watchers.length > 0) {
      return;
    }

    stop();
    repoPath = repo;
    const current = ++selection;
    // Work tree files, leaving the Git directory of an ordinary repository to its own watcher.
    watch(repo, repo, (file) => file !== ".git" && !file.startsWith(".git/"));
    void gitDirectories(repo, gitPath).then((dirs) => {
      if (dirs === null || current !== selection) {
        return;
      }
      if (dirs.gitDir === dirs.commonDir) {
        watch(repo, dirs.gitDir, (file) => WORKTREE_DATA.test(file) || SHARED_DATA.test(file));
      } else {
        watch(repo, dirs.gitDir, (file) => WORKTREE_DATA.test(file));
        watch(repo, dirs.commonDir, (file) => SHARED_DATA.test(file));
      }
    });
  };

  return new vscode.Disposable(() => {
    selectRepo = undefined;
    repoPath = undefined;
    selection++;
    muteDepth = 0;
    resumeAt = 0;
    stop();
  });
}

export function selectWatchedRepo(repo: string, gitPath: string): void {
  if (selectRepo === undefined) {
    return;
  }

  selectRepo(repo, gitPath);
}

export function muteGitRepoWatcher(): void {
  muteDepth++;
}

export function unmuteGitRepoWatcher(): void {
  if (muteDepth === 0) {
    return;
  }

  muteDepth--;
  if (muteDepth === 0) {
    resumeAt = Date.now() + 1500;
  }
}
