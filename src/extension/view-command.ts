import path from "node:path";

import * as vscode from "vscode";

import { workTreeRoot } from "@/backend/utils/git";
import { addSessionRepo } from "@/extension/workspace-scan";
import type { SidebarPane } from "@/types";

import { extConfig } from "./config";
import { EXTENSION_NAME } from "./constants";
import { createWevbviewHtml } from "./html";
import { createMessageProtocol } from "./legacy";
import { createRepoSelection, getSourceControlRepo } from "./repoSelection";
import { initRpcNotify, rpcNotify } from "./rpc/rpc-notify";
import { createRpcServer } from "./rpc/rpc-server";
import { initConfigWatcher } from "./watchers/config.watcher";
import { watchGitRepo } from "./watchers/git-repo.watcher";
import { watchGitDir } from "./watchers/git.watcher";

export function createViewCommand(ctx: vscode.ExtensionContext) {
  let currentPanel: vscode.WebviewPanel | undefined = undefined;
  let repoSelection: ReturnType<typeof createRepoSelection> | undefined;
  let pendingFile: { repo: string; path: string } | undefined;
  /** A pane to open once the webview listens for notifications. */
  let pendingPane: SidebarPane | undefined;
  let ready = false;
  let selectionRequest = 0;
  const messageProtocol = createMessageProtocol(ctx);
  const rpcServer = createRpcServer();

  const flushPane = () => {
    if (!ready || pendingPane === undefined) {
      return;
    }
    const pane = pendingPane;
    pendingPane = undefined;
    void rpcNotify.notify("view.showPane", { pane });
  };

  /** Select the repository that contains a clicked folder, once Git names its top level. */
  const selectClicked = (folder: string, file: string | undefined) => {
    const request = ++selectionRequest;
    void workTreeRoot(folder, extConfig.gitPath()).then((root) => {
      // A later click wins over one whose top level took longer to find.
      if (request !== selectionRequest) {
        return;
      }
      const repo = root ?? folder;
      addSessionRepo(repo);
      pendingFile = file === undefined ? undefined : { repo, path: file };
      repoSelection?.select(repo);
    });
  };

  const view = (sourceControl?: Pick<vscode.SourceControl, "rootUri">, file?: string) => {
    const clicked = getSourceControlRepo(sourceControl);
    if (clicked === undefined) {
      pendingFile = undefined;
    } else {
      selectClicked(clicked, file);
    }
    if (currentPanel) {
      currentPanel.reveal(vscode.window.activeTextEditor?.viewColumn);
      return;
    }

    const webPanel = vscode.window.createWebviewPanel(
      "neo-git-graph",
      EXTENSION_NAME,
      vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(ctx.extensionUri, "media"),
          vscode.Uri.joinPath(ctx.extensionUri, "out")
        ]
      }
    );
    webPanel.iconPath =
      extConfig.tabIconColourTheme() === "colour"
        ? vscode.Uri.joinPath(ctx.extensionUri, "resources", "webview-icon.svg")
        : {
            light: vscode.Uri.joinPath(ctx.extensionUri, "resources", "webview-icon-light.svg"),
            dark: vscode.Uri.joinPath(ctx.extensionUri, "resources", "webview-icon-dark.svg")
          };

    const messageProtocolAttachment = messageProtocol.attach(webPanel);
    const rpcListener = rpcServer.attach(webPanel.webview);
    const rpcNotifier = initRpcNotify(webPanel.webview);
    const configWatcher = initConfigWatcher();
    const gitDirWatcher = watchGitDir();
    const gitRepoWatcher = watchGitRepo();
    ready = false;
    const selection = createRepoSelection(
      webPanel.webview,
      (repoPath) => {
        void rpcNotify.notify("repo.select", { name: path.basename(repoPath), path: repoPath });
        if (pendingFile?.repo === repoPath) {
          void webPanel.webview.postMessage({ command: "fileHistory", ...pendingFile });
          pendingFile = undefined;
        }
      },
      () => {
        ready = true;
        flushPane();
      }
    );
    repoSelection = selection;

    webPanel.webview.html = createWevbviewHtml(ctx, webPanel.webview);

    webPanel.onDidDispose(() => {
      messageProtocolAttachment.dispose();
      rpcListener.dispose();
      rpcNotifier.dispose();
      configWatcher.dispose();
      gitDirWatcher.dispose();
      gitRepoWatcher.dispose();
      selection.dispose();
      repoSelection = undefined;
      pendingFile = undefined;
      pendingPane = undefined;
      ready = false;
      currentPanel = undefined;
    });
    currentPanel = webPanel;
  };

  return Object.assign(view, {
    /** Reveal the graph and open one of the panes beside it. */
    showPane(pane: SidebarPane) {
      pendingPane = pane;
      view();
      flushPane();
    }
  });
}
