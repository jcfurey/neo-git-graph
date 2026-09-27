import { expect, it, vi } from "vitest";

import type { WebviewConfig } from "@/types";
import { getWebviewConfig, initializeWebviewConfig } from "@/webview/lib/webview-config";

const config: WebviewConfig = {
  autoCenterCommitDetailsView: true,
  dateFormat: "Date & Time",
  graphColours: [],
  graphStyle: "rounded",
  initialLoadCommits: 300,
  loadMoreCommits: 100,
  locale: "en",
  showCurrentBranchByDefault: false
};
const changed: WebviewConfig = { ...config, dateFormat: "Relative", initialLoadCommits: 500 };

it("initializes the webview configuration once", () => {
  expect(() => getWebviewConfig()).toThrow("Webview configuration is not initialized");

  initializeWebviewConfig(config);

  expect(getWebviewConfig()).toBe(config);
  expect(() => initializeWebviewConfig(config)).toThrow(
    "Webview configuration is already initialized"
  );
});

it("ignores a settings change that arrives before the page has its configuration", async () => {
  vi.resetModules();
  const fresh = await import("@/webview/lib/webview-config");

  expect(fresh.updateWebviewConfig(changed)).toBe(false);
  expect(() => fresh.getWebviewConfig()).toThrow("Webview configuration is not initialized");
  fresh.initializeWebviewConfig(config);
  expect(fresh.getWebviewConfig()).toBe(config);

  expect(fresh.updateWebviewConfig(changed)).toBe(true);
  expect(fresh.getWebviewConfig()).toBe(changed);
});

it("opens the graph when a config.changed notification beats the initialize response", async () => {
  vi.resetModules();
  const fresh = await import("@/webview/lib/webview-config");
  const { applyWebviewConfig } = await import("@/webview/lib/actions");
  const { maxCommits } = await import("@/webview/lib/stores");
  const before = maxCommits.peek();

  expect(() => applyWebviewConfig(changed)).not.toThrow();
  expect(maxCommits.peek()).toBe(before);
  expect(() => fresh.initializeWebviewConfig(config)).not.toThrow();
  expect(fresh.getWebviewConfig()).toBe(config);
});
