import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { selectWatchedRepo, watchGitRepo } from "@/extension/watchers/git-repo.watcher";
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

function expectWatcherResumed() {
  vi.advanceTimersByTime(1500);
  changeFile();
  vi.advanceTimersByTime(250);
  expect(mocks.notify).toHaveBeenCalledExactlyOnceWith("repo.updated", { path: "/repo" });
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
    expectWatcherResumed();
  });

  it("keeps the watcher muted until all overlapping handlers have settled", async () => {
    const { bridge, receive } = createBridge();
    const first = Promise.withResolvers<void>();
    const second = Promise.withResolvers<void>();
    bridge.onMessage("selectRepo", (message) =>
      message.repo === "/first" ? first.promise : second.promise
    );
    const firstRequest = receive({ command: "selectRepo", repo: "/first" });
    const secondRequest = receive({ command: "selectRepo", repo: "/second" });
    first.resolve();
    await firstRequest;
    vi.advanceTimersByTime(2000);
    changeFile();
    vi.advanceTimersByTime(250);
    expect(mocks.notify).not.toHaveBeenCalled();
    const failure = new Error("second handler failed");
    second.reject(failure);
    await expect(secondRequest).rejects.toBe(failure);
    changeFile();
    vi.advanceTimersByTime(250);
    expect(mocks.notify).not.toHaveBeenCalled();
    expectWatcherResumed();
  });
});
