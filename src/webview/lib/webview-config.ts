import { signal } from "@preact/signals";

import type { WebviewConfig } from "@/types";

/** Components that read the configuration while rendering render again when it changes. */
const config = signal<WebviewConfig | undefined>(undefined);

export function initializeWebviewConfig(value: WebviewConfig): void {
  if (config.peek() !== undefined) {
    throw new Error("Webview configuration is already initialized");
  }

  config.value = value;
}

/** Apply settings that changed while the graph is open. */
export function updateWebviewConfig(value: WebviewConfig): void {
  config.value = value;
}

export function getWebviewConfig(): WebviewConfig {
  const value = config.value;
  if (value === undefined) {
    throw new Error("Webview configuration is not initialized");
  }

  return value;
}
