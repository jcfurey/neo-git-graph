import path from "node:path";

import * as vscode from "vscode";

import { gitClientFactory } from "@/backend/gitClient";
import { normalizeRepoPath } from "@/backend/utils/repoPath";
import { config } from "@/old-extension/config";

export function registerFileHistoryCommand(
  ctx: vscode.ExtensionContext,
  open: (repo: string, file: string) => void
) {
  ctx.subscriptions.push(
    vscode.commands.registerCommand("neo-git-graph.fileHistory", async (uri?: vscode.Uri) => {
      try {
        const file = uri ?? vscode.window.activeTextEditor?.document.uri;
        if (!file || !["file", "vscode-remote"].includes(file.scheme)) {
          throw new Error(vscode.l10n.t("Select a workspace file to view its history."));
        }
        const git = gitClientFactory(path.dirname(file.fsPath), config.gitPath()).getInstance();
        const repo = normalizeRepoPath(
          (await git.raw(["rev-parse", "--show-toplevel"])).replace(/\n$/, "")
        );
        open(repo, path.relative(repo, file.fsPath).split(path.sep).join("/"));
      } catch (error) {
        void vscode.window.showErrorMessage(
          vscode.l10n.t(
            "Unable to open file history: {0}",
            error instanceof Error ? error.message : String(error)
          )
        );
      }
    })
  );
}
