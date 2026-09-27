import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { watchGitDir } from "@/extension/watchers/git.watcher";

const mock = vi.hoisted(() => {
  const listeners: Record<string, (value: unknown) => void> = {};
  const listen = (name: string) => (listener: (value: unknown) => void) => {
    listeners[name] = listener;
    return { dispose: () => {} };
  };

  return {
    listeners,
    notify: vi.fn(),
    vscode: {
      workspace: {
        createFileSystemWatcher: () => ({
          onDidCreate: listen("create"),
          onDidDelete: listen("delete"),
          dispose: () => {}
        }),
        onDidChangeWorkspaceFolders: listen("folders")
      },
      Disposable: { from: () => ({ dispose: () => {} }) }
    }
  };
});

vi.mock("vscode", () => mock.vscode);
vi.mock("@/extension/rpc/rpc-notify", () => ({ rpcNotify: { notify: mock.notify } }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  watchGitDir();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("watchGitDir", () => {
  it("rescans when the workspace folders change", () => {
    mock.listeners.folders!({ added: [], removed: [] });
    expect(mock.notify.mock.calls).toEqual([["repo.rescan", null]]);
  });

  it.each(["create", "delete"])("rescans instead of trusting a .git %s event", async (event) => {
    const uri = { fsPath: "/ws/a/b/c/.git", toString: () => "file:///ws/a/b/c/.git" };
    mock.listeners[event]!(uri);
    await vi.runAllTimersAsync();
    expect(mock.notify.mock.calls).toEqual([["repo.rescan", null]]);
  });
});
