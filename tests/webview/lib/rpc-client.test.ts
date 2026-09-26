// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { rpcClient } from "@/webview/lib/rpc/rpc-client";

import { vscodeApi } from "@tests/webview/setup";

beforeEach(() => {
  vscodeApi.postMessage.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

it("rejects a request that times out, in the display language the page shell carries", async () => {
  document.documentElement.dataset["rpcTimeout"] = "Keine Antwort der Erweiterung: {0}";
  vi.useFakeTimers();
  const result = rpcClient.request("clipboard.copy", "commit");
  const rejection = expect(result).rejects.toThrow("Keine Antwort der Erweiterung: clipboard.copy");
  await vi.runAllTimersAsync();

  await rejection;
});
