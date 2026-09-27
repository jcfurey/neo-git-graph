import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { selectWatchedRepo, watchGitRepo } from "@/extension/watchers/git-repo.watcher";
import { registerMessageHandlers } from "@/old-extension/messageHandler";
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
vi.mock("@/extension/util/logger", () => ({ logger: { debug: vi.fn() } }));

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
  selectWatchedRepo("/repo");
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
    postMessage: webview.postMessage,
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

  it("keeps the repository watcher running while a request runs and after it", async () => {
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

describe("registerMessageHandlers", () => {
  it("mutes the repository watcher for actions only", async () => {
    const { bridge, receive, postMessage } = createBridge();
    const git = { raw: vi.fn(), tag: vi.fn() };
    registerMessageHandlers(bridge, {
      config: { dateType: () => "Author Date" },
      gitClient: { getInstance: () => git }
    } as unknown as Parameters<typeof registerMessageHandlers>[1]);

    const read = Promise.withResolvers<string>();
    git.raw.mockReturnValue(read.promise);
    const query = receive({ command: "commitDetails", repo: "/repo", commitHash: "abc" });
    expectRefresh();
    read.reject(new Error("no commit"));
    await query;

    const write = Promise.withResolvers<void>();
    git.tag.mockReturnValue(write.promise);
    const action = receive({
      command: "addTag",
      repo: "/repo",
      tagName: "v1",
      commitHash: "abc",
      lightweight: true,
      message: ""
    });
    expectNoRefresh();
    write.resolve();
    await action;
    expect(postMessage).toHaveBeenLastCalledWith({ command: "addTag", status: null });

    // The action's trailing file events are ignored too.
    vi.advanceTimersByTime(1000);
    expectNoRefresh();
    vi.advanceTimersByTime(500);
    expectRefresh();
  });
});
