import { vi } from "vitest";

// The released webview receives this snapshot before any modules initialize.
vi.stubGlobal("viewState", {
  autoCenterCommitDetailsView: true,
  dateFormat: "Date & Time",
  fetchAvatars: false,
  graphColours: [],
  graphStyle: "rounded",
  initialLoadCommits: 300,
  lastActiveRepo: null,
  loadMoreCommits: 100,
  locale: "en",
  repos: {},
  showCurrentBranchByDefault: false
});

export const vscodeApi = {
  getState: vi.fn(() => undefined),
  setState: vi.fn(),
  postMessage: vi.fn()
};

Object.defineProperty(globalThis, "acquireVsCodeApi", {
  value: vi.fn(() => vscodeApi),
  configurable: true
});

if (typeof window !== "undefined") {
  Object.defineProperty(window, "l10n", {
    value: new Proxy({}, { get: (_target, key) => String(key) }),
    configurable: true
  });
}
