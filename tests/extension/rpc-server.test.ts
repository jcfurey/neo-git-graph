import { beforeEach, expect, it, vi } from "vitest";

import { createRpcServer } from "@/extension/rpc/rpc-server";

const mocks = vi.hoisted(() => ({
  scan: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
}));

vi.mock("vscode", () => ({}));
vi.mock("@/extension/rpc/handlers", () => ({ rpcHandlers: { "repo.scan": mocks.scan } }));
vi.mock("@/extension/util/logger", () => ({
  logger: { debug: vi.fn(), warn: mocks.warn, error: mocks.error }
}));

let receive: (message: unknown) => Promise<void>;
const postMessage = vi.fn(async () => true);

beforeEach(() => {
  vi.clearAllMocks();
  createRpcServer().attach({
    onDidReceiveMessage: (listener: (message: unknown) => Promise<void>) => {
      receive = listener;
      return { dispose: () => {} };
    },
    postMessage
  } as unknown as import("vscode").Webview);
});

const request = (method: string) => ({ kind: "rpc.request", id: "1", method, params: null });

it("answers a known method with its result", async () => {
  mocks.scan.mockResolvedValue({ repos: [] });
  await receive(request("repo.scan"));
  expect(postMessage).toHaveBeenCalledExactlyOnceWith({
    kind: "rpc.response",
    id: "1",
    success: true,
    result: { repos: [] }
  });
});

it.each(["repo.missing", "toString", "__proto__"])(
  "refuses the unknown method %s without calling a handler",
  async (method) => {
    await receive(request(method));
    expect(postMessage).toHaveBeenCalledExactlyOnceWith({
      kind: "rpc.response",
      id: "1",
      success: false,
      error: `Unknown RPC method: ${method}`
    });
    expect(mocks.scan).not.toHaveBeenCalled();
    expect(mocks.warn).toHaveBeenCalledOnce();
  }
);

it.each([
  ["an Error", new Error("scan failed"), "scan failed"],
  ["another value", "plain failure", "plain failure"]
])("reports a handler that throws %s", async (_name, thrown, message) => {
  mocks.scan.mockRejectedValue(thrown);
  await receive(request("repo.scan"));
  expect(postMessage).toHaveBeenCalledExactlyOnceWith({
    kind: "rpc.response",
    id: "1",
    success: false,
    error: message
  });
  expect(mocks.error).toHaveBeenCalledOnce();
});

it("ignores messages that are not RPC requests", async () => {
  await Promise.all(
    [null, "text", { command: "loadCommits" }, { kind: "rpc.request" }].map((message) =>
      receive(message)
    )
  );
  expect(postMessage).not.toHaveBeenCalled();
});
