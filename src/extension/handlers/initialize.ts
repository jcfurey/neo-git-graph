import * as vscode from "vscode";

import { extConfig } from "@/extension/config";
import { getWebviewLocalizedStrings } from "@/old-extension/l10n/webviewL10n";
import type { WebviewConfig, WebviewInitialize } from "@/types";

/** The settings the webview reads, sent at startup and again whenever one changes. */
export function webviewConfig(): WebviewConfig {
  return {
    autoCenterCommitDetailsView: extConfig.autoCenterCommitDetailsView(),
    dateFormat: extConfig.dateFormat(),
    graphColours: extConfig.graphColours(),
    graphStyle: extConfig.graphStyle(),
    initialLoadCommits: extConfig.initialLoadCommits(),
    loadMoreCommits: extConfig.loadMoreCommits(),
    locale: vscode.env.language,
    showCurrentBranchByDefault: extConfig.showCurrentBranchByDefault()
  };
}

export async function webviewInitialize(): Promise<WebviewInitialize> {
  return {
    l10n: getWebviewLocalizedStrings(),
    config: webviewConfig()
  };
}
