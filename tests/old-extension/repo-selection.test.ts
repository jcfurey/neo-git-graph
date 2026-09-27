import { beforeEach, describe, expect, it, vi } from "vitest";

import { createRepoSelection, getSourceControlRepo } from "@/extension/repo-selection";

const mocks = vi.hoisted(() => ({
  notify: vi.fn(),
  getRepoRoot: vi.fn(async (repoPath: string): Promise<string | null> => repoPath)
}));

vi.mock("@/backend/utils/git", () => ({ getRepoRoot: mocks.getRepoRoot }));
vi.mock("@/extension/rpc/rpc-notify", () => ({ rpcNotify: { notify: mocks.notify } }));

beforeEach(() => {
  vi.clearAllMocks();
});

/** Let pending top-level lookups finish. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function makeSelection() {
  let receive: ((message: unknown) => void) | undefined;
  const dispose = vi.fn();
  const webview = {
    onDidReceiveMessage: (handler: (message: unknown) => void) => {
      receive = handler;
      return { dispose };
    }
  };
  const selection = createRepoSelection(webview as unknown as import("vscode").Webview);
  return { selection, dispose, receive: (message: unknown) => receive?.(message) };
}

describe("Source Control repository selection", () => {
  it("uses the clicked Source Control root rather than the active editor", () => {
    const sourceControl = {
      rootUri: { fsPath: "/workspace/src/child module" } as import("vscode").Uri
    };
    expect(getSourceControlRepo(sourceControl)).toBe("/workspace/src/child module");
    expect(getSourceControlRepo()).toBeUndefined();
    expect(getSourceControlRepo({ rootUri: undefined })).toBeUndefined();
  });

  it("adds every click but selects only the latest while the graph is loading", async () => {
    const { selection, receive } = makeSelection();
    selection.select("/workspace/first");
    selection.select("/workspace/second");
    await settle();
    receive(null);
    receive({ command: "loadRepos" });
    expect(mocks.notify).not.toHaveBeenCalled();
    receive({ command: "viewReady" });
    expect(mocks.notify.mock.calls).toEqual([
      ["repo.changed", { type: "created", repo: { name: "first", path: "/workspace/first" } }],
      ["repo.select", { name: "second", path: "/workspace/second" }]
    ]);
  });

  it("switches an initialized graph and does not replay an old selection on another ready event", async () => {
    const { selection, receive } = makeSelection();
    receive({ command: "viewReady" });
    // Outside a work tree, the clicked folder is selected as it is.
    mocks.getRepoRoot.mockResolvedValueOnce(null);
    selection.select("/workspace/first");
    await settle();
    selection.select("/workspace/second");
    await settle();
    receive({ command: "viewReady" });
    expect(mocks.notify.mock.calls).toEqual([
      ["repo.select", { name: "first", path: "/workspace/first" }],
      ["repo.select", { name: "second", path: "/workspace/second" }]
    ]);
  });

  it("discards queued clicks when the panel closes", async () => {
    const { selection, receive, dispose } = makeSelection();
    selection.select("/workspace/first");
    await settle();
    selection.dispose();
    receive({ command: "viewReady" });
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
