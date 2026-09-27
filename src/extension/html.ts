import crypto from "node:crypto";

import * as vscode from "vscode";

import { EXTENSION_NAME } from "./constants";

export function createWevbviewHtml(ctx: vscode.ExtensionContext, webview: vscode.Webview) {
  const toOutputUri = (file: string) => {
    const uri = vscode.Uri.joinPath(ctx.extensionUri, "out", file);
    return webview.asWebviewUri(uri);
  };

  const nonce = crypto.randomBytes(32).toString("base64url");
  // The page shows these before it receives its localized strings from the extension.
  const shell = {
    lang: vscode.env.language,
    "data-loading": vscode.l10n.t("Loading…"),
    "data-init-failed": vscode.l10n.t("Unable to open the graph: {0}"),
    "data-rpc-timeout": vscode.l10n.t("The extension did not answer in time: {0}")
  };
  const attributes = Object.entries(shell)
    .map(([name, value]) => `${name}="${escapeAttribute(value)}"`)
    .join(" ");

  const html = `<!DOCTYPE html>
  <html ${attributes}>
    <head>
      <meta charset="UTF-8">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline';
      script-src ${webview.cspSource} 'nonce-${nonce}'; img-src data:; connect-src ${webview.cspSource};">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link rel="stylesheet" href="${toOutputUri("web.min.css")}">
      <title>${EXTENSION_NAME}</title>
    </head>
    <body>
      <div id="app"></div>
      <script nonce="${nonce}" src="${toOutputUri("web.min.js")}"></script>
      </body>
  </html>`;

  return html;
}

/** Text for a double-quoted HTML attribute. */
export function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
