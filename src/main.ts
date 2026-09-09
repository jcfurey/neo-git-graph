import * as vscode from "vscode";

import { EXTENSION_NAME } from "./extension/constants";
import { logger } from "./extension/util/logger";
import { createViewCommand } from "./extension/view-command";
import { registerFileHistoryCommand } from "./old-extension/fileHistoryCommand";
import { legacyLogger } from "./old-extension/utils/logger";

export function activate(ctx: vscode.ExtensionContext) {
  if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length <= 0) {
    return;
  }
  logger.init(ctx);
  legacyLogger.init(ctx);

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
