import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  muteGitRepoWatcher,
  selectWatchedRepo,
  unmuteGitRepoWatcher,
  watchGitRepo
} from "@/extension/watchers/git-repo.watcher";
import { webviewBridgeFactory } from "@/old-extension/webviewBridge";
import type { RequestMessage } from "@/types";

const mocks = vi.hoisted(() => ({ watcher: vi.fn(), notify: vi.fn() }));
vi.mock("vscode", () => ({
  workspace: { createFileSystemWatcher: mocks.watcher },
  RelativePattern: class {
    constructor(
      public base: string,
      public pattern: string
    ) {}
  },
  Disposable: class {
    constructor(public dispose: () => void) {}
  }
}));
vi.mock("@/extension/rpc/rpc-notify", () => ({ rpcNotify: { notify: mocks.notify } }));
vi.mock("@/extension/util/logger", () => ({ logger: { debug: vi.fn(), warn: vi.fn() } }));

let watcher: ReturnType<typeof watchGitRepo>;
let changeFile: () => void;
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.watcher.mockReturnValue({
    onDidCreate: vi.fn(),
    onDidDelete: vi.fn(),
    onDidChange: (handler: (uri: { fsPath: string }) => void) => {
      changeFile = () => handler({ fsPath: path.join("/repo", "file") });
    },
    dispose: vi.fn()
  });
  watcher = watchGitRepo();
  selectWatchedRepo("/repo", "git");
});
afterEach(() => {
  watcher.dispose();
  vi.useRealTimers();
});

function expectRefresh() {
  changeFile();
  vi.advanceTimersByTime(250);
  expect(mocks.notify).toHaveBeenCalledExactlyOnceWith("repo.updated", { path: "/repo" });
  mocks.notify.mockClear();
}

function expectNoRefresh() {
  changeFile();
  vi.advanceTimersByTime(250);
  expect(mocks.notify).not.toHaveBeenCalled();
}

function createBridge() {
  let receiveMessage: ((message: RequestMessage) => Promise<void>) | undefined;
  const dispose = vi.fn();
  const webview = {
    onDidReceiveMessage: vi.fn((handler: (message: RequestMessage) => Promise<void>) => {
      receiveMessage = handler;
      return { dispose };
    }),
    postMessage: vi.fn()
  };
  const bridge = webviewBridgeFactory(webview as unknown as import("vscode").Webview);

  return {
    bridge,
    dispose,
    receive: (message: RequestMessage) => receiveMessage!(message)
  };
}

describe("webviewBridgeFactory", () => {
  it("disposes its message listener", () => {
    const { bridge, dispose } = createBridge();

    bridge.dispose();

    expect(dispose).toHaveBeenCalledOnce();
  });

  it("propagates handler errors", async () => {
    const { bridge, receive } = createBridge();
    const failure = new Error("failed");
    bridge.onMessage("selectRepo", async () => {
      throw failure;
    });

    await expect(receive({ command: "selectRepo", repo: "/repo" })).rejects.toBe(failure);
  });

  it("keeps watching while requests run and after they finish", async () => {
    const { bridge, receive } = createBridge();
    const query = Promise.withResolvers<void>();
    bridge.onMessage("selectRepo", () => query.promise);
    const request = receive({ command: "selectRepo", repo: "/repo" });
    expectRefresh();
    query.resolve();
    await request;
    // A commit made just after a read still refreshes the graph.
    vi.advanceTimersByTime(1000);
    expectRefresh();
  });
});

describe("repository watcher mutes", () => {
  it("ignores an action's own changes until its trailing events settle", () => {
    muteGitRepoWatcher("/repo");
    expectNoRefresh();
    unmuteGitRepoWatcher("/repo");
    vi.advanceTimersByTime(1000);
    expectNoRefresh();
    vi.advanceTimersByTime(500);
    expectRefresh();
  });

  it("stays muted until overlapping actions in the repository finish", () => {
    muteGitRepoWatcher("/repo");
    muteGitRepoWatcher("/repo");
    unmuteGitRepoWatcher("/repo");
    vi.advanceTimersByTime(2000);
    expectNoRefresh();
    unmuteGitRepoWatcher("/repo");
    vi.advanceTimersByTime(1500);
    expectRefresh();
  });

  it("mutes for parent and submodule actions but not for other repositories", () => {
    muteGitRepoWatcher("/other");
    expectRefresh();
    unmuteGitRepoWatcher("/other");
    muteGitRepoWatcher("/repo/submodule");
    expectNoRefresh();
    unmuteGitRepoWatcher("/repo/submodule");
    vi.advanceTimersByTime(1500);
    muteGitRepoWatcher("/");
    expectNoRefresh();
    unmuteGitRepoWatcher("/");
    vi.advanceTimersByTime(1500);
    expectRefresh();
  });
});
