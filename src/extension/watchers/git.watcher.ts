import * as vscode from "vscode";

import { rpcNotify } from "@/extension/rpc/rpc-notify";
import { createDebouncer, type FsWatcherEvent } from "@/extension/util/debounce";
import { logger } from "@/extension/util/logger";

/**
 * Rescan when a repository appears or disappears, or the workspace folders change. The scan, not
 * the event, decides what the picker lists, so the search depth and each repository's top level
 * still apply.
 */
export function watchGitDir(): vscode.Disposable {
  const debouncer = createDebouncer();
  const watcher = vscode.workspace.createFileSystemWatcher("**/.git", false, true, false);
  const createListener = watcher.onDidCreate((uri) =>
    debouncer.debounce("created", uri, processGitDir)
  );
  const deleteListener = watcher.onDidDelete((uri) =>
    debouncer.debounce("deleted", uri, processGitDir)
  );
  const foldersListener = vscode.workspace.onDidChangeWorkspaceFolders(() => {
    logger.info("Workspace folders changed");
    void rpcNotify.notify("repo.rescan", null);
  });
  return vscode.Disposable.from(
    watcher,
    createListener,
    deleteListener,
    foldersListener,
    debouncer
  );
}

async function processGitDir(type: FsWatcherEvent, uri: vscode.Uri) {
  logger.info(`Git directory ${type}: ${uri.fsPath}`);
  await rpcNotify.notify("repo.rescan", null);
}
