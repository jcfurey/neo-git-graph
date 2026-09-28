// @vitest-environment jsdom

import { beforeAll, beforeEach, expect, it, vi } from "vitest";

import type { GitCommitNode, GitRef } from "@/backend/types";
import type { RpcRequest, RpcResponse } from "@/types";
import { commitMenu, refMenu } from "@/webview/lib/menus";
import * as stores from "@/webview/lib/stores";

import { vscodeApi } from "@tests/webview/setup";
import { setupWebviewTest } from "@tests/webview/test-utils";

type Refusal = RpcResponse<"clipboard.copy">;

const commit: GitCommitNode = {
  hash: "commit",
  parentHashes: [],
  author: "Author",
  email: "author@example.com",
  date: 0,
  message: "Message",
  refs: []
};

beforeAll(() => {
  setupWebviewTest({ dispatchMessages: true });
});

beforeEach(() => {
  vscodeApi.postMessage.mockClear();
  stores.dialog.value = null;
});

it("copies a commit hash through RPC", async () => {
  const entry = commitMenu(commit, new Map()).find((item) => item?.title === "copyCommitHash");

  expect(entry).toBeDefined();
  entry!.onClick();

  const message = vscodeApi.postMessage.mock.calls[0]?.[0];
  expect(message).toBeDefined();
  const request = message as RpcRequest<"clipboard.copy">;
  expect(request).toEqual({
    kind: "rpc.request",
    id: expect.any(String),
    method: "clipboard.copy",
    params: "commit"
  });

  const response = {
    kind: "rpc.response",
    id: request.id,
    success: true,
    result: false
  } satisfies RpcResponse<"clipboard.copy">;
  window.dispatchEvent(new MessageEvent("message", { data: response }));

  await vi.waitFor(() => {
    expect(stores.dialog.value).toMatchObject({
      kind: "error",
      message: "unableToCopyToClipboard",
      reason: null
    });
  });
});

it.each<[GitRef, string, string]>([
  [{ type: "head", name: "topic", hash: "tip" }, "copyBranchName", "topic"],
  [{ type: "remote", name: "origin/topic", hash: "tip" }, "copyBranchName", "origin/topic"],
  [{ type: "tag", name: "v1", hash: "tip" }, "copyTagName", "v1"]
])("copies the full name of %o with %s", async (gitRef, title, name) => {
  refMenu(gitRef, false)
    .find((item) => item?.title === title)!
    .onClick();

  expect(vscodeApi.postMessage).toHaveBeenCalledOnce();
  const [request] = vscodeApi.postMessage.mock.lastCall as [RpcRequest<"clipboard.copy">];
  expect(request).toMatchObject({ kind: "rpc.request", method: "clipboard.copy", params: name });
  expect(typeof request.id).toBe("string");

  // The host answers false when the clipboard refuses the text.
  const refusal: Refusal = { kind: "rpc.response", id: request.id, success: true, result: false };
  window.dispatchEvent(new MessageEvent("message", { data: refusal }));

  await vi.waitFor(() => expect(stores.dialog.value?.kind).toBe("error"));
  expect(stores.dialog.value).toMatchObject({ message: "unableToCopyToClipboard" });
});
