import * as vscode from "vscode";

import { rpcNotify } from "@/extension/rpc/rpc-notify";
import { createDebouncer, type FsWatcherEvent } from "@/extension/util/debounce";
import { logger } from "@/extension/util/logger";
import { invalidateWorkspaceScan } from "@/extension/workspace-scan";

/**
 * Rescan when a repository appears or vanishes, or the workspace folders change. The scan, not
 * the event, decides what the picker lists, so a `.git` below the search depth or inside a
 * listed repository adds nothing.
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
    rescan();
  });
  return vscode.Disposable.from(
    watcher,
    createListener,
    deleteListener,
    foldersListener,
    debouncer
  );
}

function rescan() {
  invalidateWorkspaceScan();
  void rpcNotify.notify("repo.rescan", null);
}

async function processGitDir(type: FsWatcherEvent, uri: vscode.Uri) {
  logger.info(`Git directory ${type}: ${uri.fsPath}`);
  rescan();
}
