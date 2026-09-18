import type { GraphQueryCommand, QueryRequest } from "@/backend/types";
import type { LocalizedStrings } from "@/old-extension/l10n/webviewL10n";
import type { WebviewConfig } from "@/types";
import { initDispatcher } from "@/webview/lib/dispatcher";
import { rpcClient } from "@/webview/lib/rpc/rpc-client";
import { initializeWebviewConfig } from "@/webview/lib/webview-config";

import { vscodeApi } from "@tests/webview/setup";

export function latestGraphRequest<K extends GraphQueryCommand>(command: K) {
  const request = vscodeApi.postMessage.mock.calls
    .map(([message]) => message as QueryRequest)
    .findLast((message) => message.command === command);
  if (request === undefined) {
    throw new Error(`No ${command} request was sent`);
  }
  return request as Extract<QueryRequest, { command: K }>;
}

const config: WebviewConfig = {
  autoCenterCommitDetailsView: true,
  dateFormat: "Date & Time",
  fetchAvatars: false,
  graphColours: [],
  graphStyle: "rounded",
  initialLoadCommits: 300,
  loadMoreCommits: 100,
  locale: "en",
  showCurrentBranchByDefault: false
};

export function setupWebviewTest({ dispatchMessages = false } = {}) {
  initializeWebviewConfig(config);
  Object.defineProperty(window, "l10n", {
    value: new Proxy({}, { get: (_target, key) => String(key) }) as LocalizedStrings,
    configurable: true
  });

  if (dispatchMessages) {
    rpcClient.init();
    initDispatcher();
  }
}
