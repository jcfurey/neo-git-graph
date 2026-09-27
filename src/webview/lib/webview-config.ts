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

/**
 * Apply settings that changed while the graph is open, and say whether they were applied. The
 * extension answers in order, so a change that arrives before the page has its configuration is
 * already part of the configuration it is about to receive, and is ignored.
 */
export function updateWebviewConfig(value: WebviewConfig): boolean {
  if (config.peek() === undefined) {
    return false;
  }

  config.value = value;
  return true;
}

export function getWebviewConfig(): WebviewConfig {
  const value = config.value;
  if (value === undefined) {
    throw new Error("Webview configuration is not initialized");
  }

  return value;
}
