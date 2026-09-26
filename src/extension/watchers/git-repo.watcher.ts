import { realpath } from "node:fs/promises";
import path from "node:path";

import * as vscode from "vscode";

import { createGit } from "@/backend/gitClient";
import { isRepoWithinPath } from "@/backend/utils/repoPath";
import { rpcNotify } from "@/extension/rpc/rpc-notify";
import { logger } from "@/extension/util/logger";

const REFRESH_DELAY = 250;
/** Per-worktree state in the Git directory: HEAD, the index, and interrupted operations. */
const WORKTREE_DATA =
  /^(HEAD|index|MERGE_HEAD|CHERRY_PICK_HEAD|REVERT_HEAD|BISECT_[A-Z_]+|(rebase-merge|rebase-apply|sequencer)(\/.*)?)$/;
/** State that worktrees share in the common directory. */
const SHARED_DATA = /^(config|packed-refs|refs(\/.*)?)$/;

const RESUME_DELAY = 1500;

let selectRepo: ((repo: string, gitPath: string) => void) | undefined;
/** Repositories that an action is changing, and when their trailing file events end. */
const mutes = new Map<string, number>();
const resumeAt = new Map<string, number>();

/** An action in the watched repository, or in a parent or submodule of it, changes its files. */
function isMuted(repo: string) {
  const overlaps = (other: string) =>
    isRepoWithinPath(repo, other) || isRepoWithinPath(other, repo);
  const now = Date.now();
  for (const [other, until] of resumeAt) {
    if (until <= now) {
      resumeAt.delete(other);
    } else if (overlaps(other)) {
      return true;
    }
  }
  return [...mutes.keys()].some(overlaps);
}

/**
 * The Git directory, which holds HEAD and the index, and the common directory, which holds refs.
 * Linked worktrees and submodules keep both outside their work tree.
 */
async function gitDirectories(repo: string, gitPath: string) {
  try {
    const git = createGit(repo, gitPath);
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

  /** Watch `base`, refreshing for changes whose path below it `relevant` accepts. */
  const watch = (repo: string, base: string, relevant: (relativePath: string) => boolean) => {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(base, "**/*")
    );
    const refresh = (event: "created" | "changed" | "deleted", uri: vscode.Uri) => {
      const relativePath = path.relative(base, uri.fsPath).split(path.sep).join("/");
      if (relativePath.startsWith("../") || !relevant(relativePath) || isMuted(repo)) {
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
    mutes.clear();
    resumeAt.clear();
    stop();
  });
}

export function selectWatchedRepo(repo: string, gitPath: string): void {
  selectRepo?.(repo, gitPath);
}

/** Ignore file events that an action in `repo` causes; the view refreshes after the action. */
export function muteGitRepoWatcher(repo: string): void {
  mutes.set(repo, (mutes.get(repo) ?? 0) + 1);
}

export function unmuteGitRepoWatcher(repo: string): void {
  const depth = mutes.get(repo);
  if (depth === undefined) {
    return;
  }
  if (depth > 1) {
    mutes.set(repo, depth - 1);
    return;
  }
  mutes.delete(repo);
  resumeAt.set(repo, Date.now() + RESUME_DELAY);
}
