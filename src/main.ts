import * as l10n from "@vscode/l10n";
import * as vscode from "vscode";

import { EXTENSION_NAME } from "./extension/constants";
import { logger } from "./extension/util/logger";
import { createViewCommand } from "./extension/view-command";
import { registerFileHistoryCommand } from "./old-extension/fileHistoryCommand";

export function activate(ctx: vscode.ExtensionContext) {
  if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length <= 0) {
    return;
  }
  logger.init(ctx);
  // Backend messages are marked with the standalone l10n package, which cannot
  // see VS Code's API. Hand it the bundle VS Code loaded for the display language.
  l10n.config({ contents: vscode.l10n.bundle ?? {} });

  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
  statusBarItem.name = EXTENSION_NAME;
  statusBarItem.command = "neo-git-graph.view";
  statusBarItem.text = `$(type-hierarchy) ${EXTENSION_NAME}`;
  statusBarItem.tooltip = vscode.l10n.t("View Git Graph");
  statusBarItem.show();

  ctx.subscriptions.push(statusBarItem);

  const view = createViewCommand(ctx);
  ctx.subscriptions.push(vscode.commands.registerCommand("neo-git-graph.view", view));
  registerFileHistoryCommand(ctx, (repo, file) => view({ rootUri: vscode.Uri.file(repo) }, file));

  logger.info("Extension activated");
}
