import * as vscode from "vscode";

import { gitClientFactory } from "@/backend/gitClient";
import { extConfig } from "@/extension/config";
import { AvatarManager } from "@/old-extension/avatarManager";
import { DiffDocProvider } from "@/old-extension/diffDocProvider";
import { ExtensionState } from "@/old-extension/extensionState";
import { registerMessageHandlers } from "@/old-extension/messageHandler";
import { createRepoManager } from "@/old-extension/repoManager";
import { webviewBridgeFactory } from "@/old-extension/webviewBridge";
import type { WebviewBridge } from "@/old-extension/webviewBridge";

export function createMessageProtocol(ctx: vscode.ExtensionContext) {
  const extensionState = new ExtensionState(ctx);
  const avatarManager = new AvatarManager(extConfig.gitPath, extensionState);
  const repoManager = createRepoManager(extensionState);

  ctx.subscriptions.push(
    vscode.commands.registerCommand("neo-git-graph.clearAvatarCache", () => {
      avatarManager.clearCache();
    }),
    vscode.workspace.registerTextDocumentContentProvider(
      DiffDocProvider.scheme,
      new DiffDocProvider(
        (repo) => gitClientFactory(repo, extConfig.gitPath()).getInstance(),
        (repo) => repoManager.getRepos()[repo] !== undefined
      )
    )
  );

  return {
    attach(panel: vscode.WebviewPanel) {
      let isPanelVisible = panel.visible;
      let disposed = false;
      const bridge: WebviewBridge = webviewBridgeFactory(panel.webview);
      avatarManager.registerBridge(bridge.post);

      const { onPanelShown, dispose: disposeQueries } = registerMessageHandlers(bridge, {
        config: extConfig,
        repoManager,
        avatarManager
      });
      const viewStateListener = panel.onDidChangeViewState(() => {
        if (panel.visible === isPanelVisible) {
          return;
        }
        if (panel.visible) {
          onPanelShown();
          bridge.post({ command: "refresh" });
        }
        isPanelVisible = panel.visible;
      });

      return {
        dispose() {
          if (disposed) {
            return;
          }
          disposed = true;
          disposeQueries();
          bridge.dispose();
          viewStateListener.dispose();
          avatarManager.deregisterBridge();
        }
      };
    }
  };
}
