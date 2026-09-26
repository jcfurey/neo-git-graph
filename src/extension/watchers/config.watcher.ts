import * as vscode from "vscode";

import { webviewConfig } from "@/extension/handlers/initialize";
import { rpcNotify } from "@/extension/rpc/rpc-notify";
import { logger } from "@/extension/util/logger";

export function initConfigWatcher(): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (
      e.affectsConfiguration("git.path") ||
      e.affectsConfiguration("neo-git-graph.maxDepthOfRepoSearch")
    ) {
      logger.info("Configuration changed");
      void rpcNotify.notify("repo.rescan", null);
    }
    // An open graph applies display settings at once instead of on its next start.
    if (e.affectsConfiguration("neo-git-graph")) {
      void rpcNotify.notify("config.changed", webviewConfig());
    }
  });
}
