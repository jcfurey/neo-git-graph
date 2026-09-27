// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RpcRequest } from "@/types";
import { rpcClient } from "@/webview/lib/rpc/rpc-client";

import { vscodeApi } from "@tests/webview/setup";

// Only the test of the API object calls `init`. The others rely on a request to start listening
// for its own answer.

/** Exceptions that escaped the message listener, reported as window `error` events. */
const listenerErrors: unknown[] = [];

function recordListenerError(event: ErrorEvent) {
  listenerErrors.push(event.error);
  event.preventDefault();
}

beforeEach(() => {
  vscodeApi.postMessage.mockClear();
  listenerErrors.length = 0;
  window.addEventListener("error", recordListenerError);
});

afterEach(() => {
  window.removeEventListener("error", recordListenerError);
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

function send(data: unknown) {
  window.dispatchEvent(new MessageEvent("message", { data }));
}

function respond(id: string, fields: Record<string, unknown>) {
  send({ kind: "rpc.response", id, ...fields });
}

function lastPosted(): RpcRequest {
  const call = vscodeApi.postMessage.mock.calls.at(-1);
  if (call === undefined) {
    throw new Error("Nothing was posted");
  }
  return call[0] as RpcRequest;
}

/** Follow a promise without letting its rejection go unhandled. */
function track(promise: Promise<unknown>) {
  const outcome: { settled?: "fulfilled" | "rejected"; value?: unknown } = {};
  promise.then(
    (value) => Object.assign(outcome, { settled: "fulfilled", value }),
    (reason: unknown) => Object.assign(outcome, { settled: "rejected", value: reason })
  );
  return outcome;
}

describe("sending", () => {
  it("posts one message and starts the deadline before it returns", () => {
    vi.useFakeTimers();
    const params = "abc";

    const result = rpcClient.request("clipboard.copy", params);

    expect(result).toBeInstanceOf(Promise);
    expect(vscodeApi.postMessage).toHaveBeenCalledTimes(1);
    expect(vscodeApi.postMessage.mock.calls[0]).toHaveLength(1);
    const message = lastPosted();
    expect(message).toEqual({
      kind: "rpc.request",
      id: expect.any(String),
      method: "clipboard.copy",
      params
    });
    expect(message.params).toBe(params);
    expect(vi.getTimerCount()).toBe(1);

    respond(message.id, { success: true, result: true });
  });

  it("posts the parameters it is given, unchecked and uncopied", () => {
    vi.useFakeTimers();
    const params = { forced: ["through", "the", "types"] };

    track(rpcClient.request("clipboard.copy", params as never));
    const withObject = lastPosted();
    track(rpcClient.request("no.such" as never, undefined as never));
    const withUndefined = lastPosted();

    expect(withObject.params).toBe(params);
    expect(withUndefined.method).toBe("no.such");
    expect(Object.hasOwn(withUndefined, "params")).toBe(true);
    expect(withUndefined.params).toBeUndefined();
  });

  it("keeps identical requests apart, each with its own id and deadline", async () => {
    vi.useFakeTimers();
    const answer = { repos: [] };

    const first = track(rpcClient.request("repo.scan", null));
    const firstId = lastPosted().id;
    const second = rpcClient.request("repo.scan", null);
    const secondId = lastPosted().id;

    expect(vscodeApi.postMessage).toHaveBeenCalledTimes(2);
    expect(secondId).not.toBe(firstId);
    expect(vi.getTimerCount()).toBe(2);

    respond(secondId, { success: true, result: answer });

    expect(vi.getTimerCount()).toBe(1);
    await expect(second).resolves.toBe(answer);
    expect(first.settled).toBeUndefined();

    respond(firstId, { success: true, result: answer });
  });

  it("posts through the page's one VS Code API object", () => {
    vi.useFakeTimers();
    const acquired = vi.mocked(acquireVsCodeApi).mock.calls.length;

    rpcClient.init();
    track(rpcClient.request("docs.open", null));
    track(rpcClient.request("settings.open", null));

    expect(vi.mocked(acquireVsCodeApi).mock.calls).toHaveLength(acquired);
    expect(vscodeApi.postMessage).toHaveBeenCalledTimes(2);
  });
});

describe("answers", () => {
  it("settles a request that is answered while its message is being posted", async () => {
    vi.useFakeTimers();
    vscodeApi.postMessage.mockImplementationOnce((message: RpcRequest) => {
      respond(message.id, { success: true, result: "sync" });
    });

    const result = rpcClient.request("docs.open", null);

    expect(vi.getTimerCount()).toBe(0);
    await expect(result).resolves.toBe("sync");
  });

  it("receives the answer to a request made before init on a freshly loaded page", async () => {
    vi.useFakeTimers();
    vi.resetModules();
    const fresh = await import("@/webview/lib/rpc/rpc-client");

    const result = fresh.rpcClient.request("docs.open", null);
    respond(lastPosted().id, { success: true, result: true });

    expect(vi.getTimerCount()).toBe(0);
    await expect(result).resolves.toBe(true);
  });
});

describe("deadline", () => {
  beforeEach(() => {
    document.documentElement.dataset["rpcTimeout"] = "No response: {0}";
    vi.useFakeTimers();
  });

  it("rejects exactly 30 seconds after the request, and ignores a later answer", async () => {
    const outcome = track(rpcClient.request("docs.open", null));
    const id = lastPosted().id;

    await vi.advanceTimersByTimeAsync(29_999);
    expect(outcome.settled).toBeUndefined();

    await vi.advanceTimersByTimeAsync(1);
    expect(outcome.settled).toBe("rejected");
    expect(vi.getTimerCount()).toBe(0);

    respond(id, { success: true, result: true });
    await Promise.resolve();
    expect(outcome.value).toBeInstanceOf(Error);
    expect(listenerErrors).toEqual([]);
  });

  it("rejects with an Error that names the method", async () => {
    const outcome = track(rpcClient.request("docs.open", null));

    await vi.advanceTimersByTimeAsync(30_000);

    expect(outcome.value).toBeInstanceOf(Error);
    expect(outcome.value).toMatchObject({ name: "Error", message: "No response: docs.open" });
  });

  it("rejects with an empty message when the shell carries no text", async () => {
    delete document.documentElement.dataset["rpcTimeout"];
    const outcome = track(rpcClient.request("clipboard.copy", "x"));

    await vi.advanceTimersByTimeAsync(30_000);

    expect(outcome.value).toBeInstanceOf(Error);
    expect((outcome.value as Error).message).toBe("");
  });

  it.each([
    ["{0} and {0}", "docs.open", "docs.open and docs.open"],
    ["no placeholder", "docs.open", "no placeholder"],
    ["x {1} {0} $& {0}", "settings.open", "x {1} settings.open $& settings.open"],
    ["m=$&", "a$&b", "m=$&"],
    ["m={0}", "a$&b", "m=a$&b"],
    ["{0}", "$`$'$$", "$`$'$$"]
  ])("fills %j with the method %j as written", async (template, method, message) => {
    document.documentElement.dataset["rpcTimeout"] = template;
    const outcome = track(rpcClient.request(method as never, null as never));

    await vi.advanceTimersByTimeAsync(30_000);

    expect((outcome.value as Error).message).toBe(message);
  });

  it("reads the shell's text when the deadline passes", async () => {
    document.documentElement.dataset["rpcTimeout"] = "BEFORE {0}";
    const outcome = track(rpcClient.request("docs.open", null));
    document.documentElement.dataset["rpcTimeout"] = "AFTER {0}";

    await vi.advanceTimersByTimeAsync(30_000);

    expect((outcome.value as Error).message).toBe("AFTER docs.open");
  });

  it("counts each request's deadline from its own start", async () => {
    const docs = track(rpcClient.request("docs.open", null));
    await vi.advanceTimersByTimeAsync(10_000);
    const settings = track(rpcClient.request("settings.open", null));

    await vi.advanceTimersByTimeAsync(20_000);
    expect(docs.settled).toBe("rejected");
    expect(settings.settled).toBeUndefined();
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(10_000);
    expect((settings.value as Error).message).toBe("No response: settings.open");
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("a message that cannot be posted", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("rejects with the Error that posting threw, and leaves nothing behind", async () => {
    const error = new Error("clone failed");
    vscodeApi.postMessage.mockImplementationOnce(() => {
      throw error;
    });

    let result: Promise<unknown> = Promise.resolve();
    expect(() => {
      result = rpcClient.request("clipboard.copy", "x");
    }).not.toThrow();
    const outcome = track(result);
    await Promise.resolve();

    expect(outcome).toEqual({ settled: "rejected", value: error });
    expect(outcome.value).toBe(error);
    expect(vi.getTimerCount()).toBe(0);

    respond(lastPosted().id, { success: true, result: true });
    await Promise.resolve();
    expect(outcome.value).toBe(error);
    expect(listenerErrors).toEqual([]);
  });

  it("turns anything else that posting threw into an Error", async () => {
    vscodeApi.postMessage.mockImplementationOnce(() => {
      throw "a string";
    });

    const result = rpcClient.request("clipboard.copy", "x");

    const error: unknown = await result.catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ message: "a string", cause: "a string" });
    expect(vi.getTimerCount()).toBe(0);
  });
});
