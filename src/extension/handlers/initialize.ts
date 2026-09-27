import * as vscode from "vscode";

import { extConfig } from "@/extension/config";
import { getWebviewLocalizedStrings } from "@/old-extension/l10n/webviewL10n";
import type { WebviewConfig, WebviewInitialize } from "@/types";

export function webviewConfig(): WebviewConfig {
  return {
    autoCenterCommitDetailsView: extConfig.autoCenterCommitDetailsView(),
    dateFormat: extConfig.dateFormat(),
    fetchAvatars: extConfig.fetchAvatars(),
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
