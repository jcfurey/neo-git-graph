import path from "node:path";

import * as vscode from "vscode";

import { isRepoWithinPath } from "@/backend/utils/repoPath";
import { rpcNotify } from "@/extension/rpc/rpc-notify";
import { logger } from "@/extension/util/logger";

const REFRESH_DELAY = 250;
const GIT_DATA = /^(HEAD|config|index|packed-refs|refs(?:\/.*)?)$/;

const RESUME_DELAY = 1500;

let selectRepo: ((repo: string) => void) | undefined;
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

export function watchGitRepo(): vscode.Disposable {
  let repoPath: string | undefined;
  let watcher: vscode.FileSystemWatcher | undefined;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;

  const stop = () => {
    watcher?.dispose();
    watcher = undefined;
    if (refreshTimer !== undefined) {
      clearTimeout(refreshTimer);
      refreshTimer = undefined;
    }
  };

  selectRepo = (repo: string) => {
    if (repo === repoPath && watcher !== undefined) {
      return;
    }

    stop();
    repoPath = repo;
    watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(repo, "**/*"));

    const refresh = (event: "created" | "changed" | "deleted", uri: vscode.Uri) => {
      if (isMuted(repo)) {
        return;
      }

      const relativePath = path.relative(repo, uri.fsPath).split(path.sep).join("/");
      if (
        relativePath.startsWith("../") ||
        (relativePath.startsWith(".git/") && !GIT_DATA.test(relativePath.slice(5)))
      ) {
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
  };

  return new vscode.Disposable(() => {
    selectRepo = undefined;
    mutes.clear();
    resumeAt.clear();
    stop();
  });
}

export function selectWatchedRepo(repo: string): void {
  if (selectRepo === undefined) {
    return;
  }

  selectRepo(repo);
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
