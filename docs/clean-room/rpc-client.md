# Clean-room specification: `src/webview/lib/rpc/rpc-client.ts`

This document says what the webview's outbound RPC module must do, as seen from outside it. It is written for an engineer who will build a replacement without ever seeing the current file. Every statement comes from the module's callers, its tests, the RPC types, the extension code that answers it, the inbound handler it installs, and behaviour observed by running the current code.

In short: webview code calls this module to ask the extension host to do something. The module sends the question over the VS Code message channel and hands back a promise. The promise settles when the extension answers, or fails once a fixed deadline has passed without an answer. The module also switches on, exactly once, the listener that delivers the extension's answers.

---

## 0. How the observations were made

- Repository at commit `7fb4f01` (after the inbound handler `rpc-handler.ts` was rewritten in `8983b4e`).
- Node v22.22.2 and Vitest 4.1.11 in the `jsdom` environment, with the repository's `tests/webview/setup.ts`. That setup replaces the global `acquireVsCodeApi` with a function that returns one shared mock object, `vscodeApi`, whose `postMessage`, `getState` and `setState` are spies.
- Time was controlled with `vi.useFakeTimers()`, which the tests call **after** the module has been imported. "Timer count" below is `vi.getTimerCount()`.
- Messages from the extension were simulated with `window.dispatchEvent(new MessageEvent("message", { data }))`, which runs listeners synchronously.
- "Posted" means the arguments that the mocked `vscodeApi.postMessage` received.
- To see what the existing tests catch, the whole `webview` Vitest project was also run against deliberately altered copies of the module (§6.2). All scratch files lived under `/tmp` and have been deleted.

---

## 1. Interface

### 1.1 Module path

`src/webview/lib/rpc/rpc-client.ts`. Most importers use the alias `@/webview/lib/rpc/rpc-client`. `src/webview/main.tsx` imports it by the relative path `./lib/rpc/rpc-client`. The file name and location must not change.

### 1.2 Exports

The module has exactly **one** export, a value named `rpcClient`. It has no default export, and no exported types. (Observed: the module namespace has the single key `rpcClient`.) The replacement must not remove or rename it, and needs nothing else.

`rpcClient` is an object with two methods, `init` and `request` (observed: these are its only own keys). Their signatures must stay as shown, because callers depend on the type inference they give:

| Member    | Signature                                                                                                        |
| --------- | ---------------------------------------------------------------------------------------------------------------- |
| `init`    | `init(): void`                                                                                                   |
| `request` | `request<M extends RpcMethod>(method: M, params: RpcMethodMap[M]["params"]): Promise<RpcMethodMap[M]["result"]>` |

`RpcMethod` and `RpcMethodMap` come from `@/types` (defined in `src/types/rpc.types.ts`). What the signature of `request` means in practice:

- `M` is inferred from the method name literal. No caller writes the type argument.
- `params` is a **required** second argument whose type depends on the method. Methods that take nothing are called with an explicit `null`. For example, `rpcClient.request("repo.scan")` and `rpcClient.request("clipboard.copy", 5)` must both be compile errors.
- The promise's value type is the method's result type, so for example `(await rpcClient.request("repo.scan", null)).repos` type-checks.
- The set of methods is whatever `RpcMethodMap` contains. The module must not keep its own list of methods: adding an entry to `RpcMethodMap` (and a handler on the extension side) must make the new method callable with no change here.

The methods at present, from `RpcMethodMap`:

| Method               | `params` type | Result type                                                                      |
| -------------------- | ------------- | -------------------------------------------------------------------------------- |
| `clipboard.copy`     | `string`      | `boolean`                                                                        |
| `webview.initialize` | `null`        | `WebviewInitialize`, that is `{ l10n: LocalizedStrings; config: WebviewConfig }` |
| `git.init`           | `null`        | `boolean`                                                                        |
| `repo.scan`          | `null`        | `ScanRepoResult`, that is `{ repos: GitRepo[] }`                                 |
| `settings.open`      | `null`        | `boolean`                                                                        |
| `docs.open`          | `null`        | `boolean`                                                                        |
| `walkthrough.open`   | `null`        | `boolean`                                                                        |

Every caller invokes the two members as methods of `rpcClient` (`rpcClient.init()`, `rpcClient.request(...)`). No caller takes them off the object. (Observed: today a detached `request` also works, and the object is not frozen. Nothing relies on either.)

### 1.3 Who uses what

| User                                           | Uses                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/webview/main.tsx`                         | `init` and `request`. At page start-up, at module top level, it calls `rpcClient.init()` first, then `initDispatcher()` (the listener for legacy `{ command }` messages), then renders the loading page. It then awaits `rpcClient.request("webview.initialize", null)` and destructures `{ l10n, config }`. If that promise rejects, it shows the shell's `initFailed` text with `{0}` replaced by the rejection's `message` when it is an `Error`, otherwise by `String(reason)`. |
| `src/webview/lib/stores/repo-list.store.ts`    | `request("repo.scan", null)`, awaited; it reads `.repos`. A rejection propagates to `loadRepoList` in `src/webview/lib/load-repos.ts`, which stores the `Error`'s `message` (or `String(reason)`) in its `repoListError` signal, and the page shows it with a Retry button.                                                                                                                                                                                                         |
| `src/webview/lib/actions/clipboard.ts`         | `request("clipboard.copy", data)`, awaited. A result of `false` and any rejection both open the same "unable to copy" error dialog.                                                                                                                                                                                                                                                                                                                                                 |
| `src/webview/pages/NoRepoPage.tsx`             | `request("git.init", null)`, awaited. A rejection's `message` (or `String(reason)`) is shown inside the localized "unable to initialize repository" text.                                                                                                                                                                                                                                                                                                                           |
| `src/webview/layout/MainHeader.tsx`            | `request("walkthrough.open", null)`, `request("docs.open", null)` and `request("settings.open", null)` from the gear menu. Each promise is discarded with `void`, so nothing handles a rejection.                                                                                                                                                                                                                                                                                   |
| `tests/webview/test-utils.ts`                  | `init`, called by `setupWebviewTest({ dispatchMessages: true })`.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `tests/webview/lib/rpc-client.test.ts`         | `request` only. It **never** calls `init`.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `tests/webview/lib/rpc-handler-client.test.ts` | `init` (many times in one file) and `request`.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `tests/webview/lib/actions/clipboard.test.ts`  | Indirect: `init` through `setupWebviewTest({ dispatchMessages: true })`, and `request` through `copyToClipboard`.                                                                                                                                                                                                                                                                                                                                                                   |

Many other webview test files load the module indirectly, because the stores and actions they import lead to it. They must still load cleanly (see §5.3).

`scripts/provenance-baseline.json` records 30 inherited lines for this file and 8 for `tests/webview/lib/rpc-client.test.ts`. The rewrite lowers the first number. The inherited test file may be replaced as well, using §6.1 as its specification.

---

## 2. Dependencies the implementation must use

### 2.1 Repository imports

| Import path                     | Name(s)                                              | Why                                                                                                                                                                                                                                                         |
| ------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@/types`                       | `RpcMethod`, `RpcMethodMap`, `RpcRequest` (types)    | The method table, and the shape of the posted message. `verbatimModuleSyntax` is on, so type-only imports must be marked with `import type` or the `type` modifier.                                                                                         |
| `@/webview/lib/rpc/rpc-handler` | `initRpcHandler` (value), `PendingRpcRequest` (type) | The inbound side. `initRpcHandler(table)` starts listening for the extension's messages on `window` and settles entries of the table it is given (§2.4). It adds a new, permanent listener on every call.                                                   |
| `@/webview/lib/shell-text`      | `shellText`                                          | `shellText("rpcTimeout")` returns the text the HTML shell put in the `data-rpc-timeout` attribute of `<html>` (that is, `document.documentElement.dataset.rpcTimeout`), or `""` when the attribute is missing. It reads the attribute afresh on every call. |
| `@/webview/lib/vscode`          | `vscode`                                             | The page's one VS Code API object. Every request is sent with `vscode.postMessage(message)`. The module must **not** call `acquireVsCodeApi()` itself: VS Code allows that only once per page, and the tests' spy is the object this import provides.       |

No other repository module is needed. Lint rules that apply: `import/no-relative-parent-imports` (so use the `@/` aliases), the alphabetized `import-js/order` grouping, and `eslint/no-console`.

### 2.2 Platform facilities

- `setTimeout` and `clearTimeout` for the deadline. They must be the global functions as they are **at the time of each call**. Tests switch to fake timers after importing the module, and the deadline must follow them.
- A source of unique ids (§3.3). The platform's `crypto.randomUUID()` gives ids of the observed form, and both VS Code webviews (a secure context) and jsdom provide it.
- `Promise` and `Error`.

### 2.3 The message the module posts

For each call of `request`, exactly one message is posted, as the only argument of `vscode.postMessage`. It is a plain object with exactly these four own keys (observed in this order, although no reader depends on the order):

| Key      | Value                                                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kind`   | The string `"rpc.request"`.                                                                                                                                               |
| `id`     | A fresh string that identifies this request (§3.3).                                                                                                                       |
| `method` | The `method` argument, unchanged.                                                                                                                                         |
| `params` | The `params` argument, unchanged: the same value, not a copy. The key is always present as an own key, even when its value is `null` (or, forced by a cast, `undefined`). |

It is a value of the `RpcRequest` type from `@/types`. Two tests compare posted messages with `toEqual`, so an extra key with a defined value fails them.

Why `params` must be an own key: the extension's server (`src/extension/rpc/rpc-server.ts`) ignores, without any answer, a message that lacks an own `params` key, and VS Code's documentation requires messages to be JSON-serializable, which drops keys whose value is `undefined`. That is also why methods without parameters are called with `null`. The server answers every request it accepts exactly once, with `{ kind: "rpc.response", id, success: true, result }` or `{ kind: "rpc.response", id, success: false, error }`, where `id` is copied from the request. For a method it does not know, it answers with the failure `"Unknown RPC method: <method>"`. It knows nothing about the webview's deadline.

### 2.4 The contract with the inbound handler

The module and `rpc-handler.ts` cooperate through one shared table of requests that are still waiting for an answer.

- The table is a `Map<string, PendingRpcRequest>` keyed by request id. There is one table for the life of the module (one per page; in Vitest, one per test file), created when the module loads. The same instance must be the one handed to `initRpcHandler` and the one requests are added to.
- `PendingRpcRequest` (exported by the handler) has three fields, and the module must fill each one:

  | Field     | Type                            | What the module puts there                                                                              |
  | --------- | ------------------------------- | ------------------------------------------------------------------------------------------------------- |
  | `resolve` | `(result: unknown) => void`     | A function that fulfils this request's promise with the value it is given.                              |
  | `reject`  | `(reason: unknown) => void`     | A function that rejects this request's promise with the value it is given.                              |
  | `timeout` | `ReturnType<typeof setTimeout>` | The handle of this request's own deadline timer, so that the handler can cancel it with `clearTimeout`. |

- What the handler does, for context: when a message `{ kind: "rpc.response", id: <string>, ... }` arrives and the table holds that id, the handler removes the entry, cancels its `timeout`, and then calls `resolve(result)` for a success, `reject(new Error(error))` for a failure with a string `error`, or `reject(new Error("Malformed response to an RPC request"))` for anything else. It ignores a response whose id is not in the table. It looks the id up when the message arrives, so entries added at any time are found.
- What is therefore left to this module: adding an entry for every request, under the id it posts; removing the entry when the deadline passes, so that a late answer is ignored; and removing the entry and cancelling its timer when posting fails. The module must never leave an entry behind (§5.1).
- The entry must be in the table no later than the moment the message is handed to `postMessage`. A response that arrives during that call must settle the request (observed; §4, example 11).

---

## 3. Behaviour

### 3.1 Loading the module

Importing the module has no observable effect: no listener on `window`, nothing posted, no timer started, and the shell text is not read. The listener only comes into being through `init` (tested: "does not listen until the client initializes it").

The module is part of an import cycle: this module imports `rpc-handler.ts`, which imports `load-repos.ts` and `stores/repo-list.store.ts`, and the store imports this module. Depending on which module a test imports first, this module may be evaluated while the handler module is only partly evaluated. So, at load time, the module may only create its own state. Imported bindings may be used only inside `init` and `request`.

The module is also loaded where there is no DOM. `tests/webview/lib/webview-config.test.ts` runs in Vitest's Node environment, without jsdom, and loads this module indirectly when it imports `@/webview/lib/actions`. At load time, therefore, the module must not touch `window` or `document`. (Observed: a copy that started listening at load failed that test with `ReferenceError: window is not defined`.)

### 3.2 `init()`

- The **first** call starts the inbound handler, by calling `initRpcHandler` with the shared table. From then on, answers to pending requests settle them, and the extension's notifications reach their actions. The call returns `undefined`, synchronously.
- **Every later call does nothing.** In particular it must not add a second listener. Observed: after three `init()` calls, one `repo.rescan` notification caused exactly one `repo.scan` request. (A second listener would double every notification, although a response would still settle only once.)
- There is no way to undo `init` or to reset the module. Its effect lasts for the life of the page.
- Pending requests are unaffected by `init`, except that their answers can now be delivered (§3.5).
- If starting the handler throws (it does not in practice), the exception comes out of that first `init()` call, and later calls still do nothing: they do not try again. This was observed with the handler mocked to throw. See Question Q5.

### 3.3 `request(method, params)`

When `request` returns, all of the following are already true:

- Exactly one message (§2.3) has been posted. Callers and tests read its id from the spy right after the call.
- A deadline of **30,000 ms** (30 seconds) is running for this request, on a timer of its own. The fake-timer count has gone up by one.
- The request is in the shared table, so a response with its id settles it.
- The return value is a native `Promise`.

`request` never throws synchronously, not even when posting fails (§3.4 e).

**Ids.** Every call gets a new id. Ids are strings and must never repeat for the life of the page. They should also not repeat across reloads of the page. The extension's end of the channel belongs to the panel, not to the page, so when the page is reloaded while the panel stays open (for example with VS Code's "Developer: Reload Webviews" command), an answer meant for the previous page can reach the new one. Today each id is a random version-4 UUID, 36 characters of lower-case hex and hyphens, such as `4036c2f5-2778-482b-869f-03bd067e52e1`. Tests only require a string, different for each request. A random UUID meets all of these requirements.

**No checking, no merging, no retrying.** The module does not check `method` or `params` at run time. Values forced past the types are posted as given. Two identical calls made together post two messages with two ids and two timers. A request is posted once and never sent again. Nothing is queued until `init`.

### 3.4 How a request ends

Each request settles **exactly once**, by whichever of these happens first. After that, nothing else about it has any effect.

**a. A success answer arrives.** The promise is fulfilled with the answer's `result` value itself: the same object, not a copy, and not checked against the method's result type. A `result` of `null` gives `null`, and a success without `result` gives `undefined`. The deadline timer is cancelled.

**b. A failure answer arrives.** The promise is rejected with an `Error` whose `message` is the answer's `error` text, for example `"Unknown RPC method: repo.scan"`. The timer is cancelled.

**c. A malformed answer arrives for its id** (for example `success` missing or not a boolean, or a failure without a string `error`). The promise is rejected at once, not at the deadline, with `Error("Malformed response to an RPC request")`. The timer is cancelled.

(a, b and c are carried out by the handler through the entry's `resolve` and `reject`. The client's part is that its entry passes the values through unchanged.)

**d. The deadline passes first.** Exactly 30,000 ms after the call, the request fails:

- At 29,999 ms it is still pending. At 30,000 ms it is rejected.
- The rejection value is an `Error` (a plain `Error`, `name` `"Error"`). Its `message` is the shell's `rpcTimeout` text with the first `{0}` replaced by the method name. Example: with `data-rpc-timeout="No response: {0}"`, a timed-out `walkthrough.open` rejects with `"No response: walkthrough.open"`.
- The text is read when the deadline passes, not when the request is made. Observed: changing the attribute between the call and the deadline gave the new text.
- If the attribute is missing, the message is the empty string `""`.
- Only the first `{0}` is replaced. Other text, including further `{0}`s, `{1}` and `$&`, is kept literally. A template without `{0}` is used as it stands. See Q1 for a quirk with `$` in the method name.
- The request's entry is removed, so an answer that arrives later is ignored, without errors and without a second settlement.
- Where the text comes from: `src/extension/html.ts` writes `data-rpc-timeout` on the page's `<html>` element, set to `vscode.l10n.t("The extension did not answer in time: {0}")`. The bundles in `l10n/` translate it (`zh-cn`: "扩展未及时响应：{0}", `zh-tw`: "擴充功能未及時回應：{0}"). The module must take the text from the shell, not from `window.l10n` and not from a hard-coded string, because `webview.initialize`, the request that delivers `window.l10n`, can itself time out.

**e. Posting throws.** If `vscode.postMessage` throws (for example because the message cannot be cloned):

- `request` still returns a promise, and does not throw.
- That promise is already rejected: a `.catch` handler attached right away runs on the next microtask.
- The rejection value is **exactly what was thrown**: the same object, not wrapped or converted. A thrown string rejects with that string.
- No timer is left running for it, and it is not left in the table. An answer that later arrives with its id is ignored.

### 3.5 Requests made before `init`

`request` works before `init` has ever been called. The message is posted and the deadline starts as usual. While no listener exists, an answer from the extension is simply lost: nothing buffers it. Such a request therefore ends in one of two ways. If `init()` runs and an answer with its id arrives afterwards, before the deadline, that answer settles it normally. Otherwise it times out after 30,000 ms. `tests/webview/lib/rpc-client.test.ts` relies on this: it never calls `init`, and it expects the timeout. In production, `main.tsx` calls `init()` before any request.

### 3.6 Several requests at once

Any number of requests may be pending together, for the same method or for different ones. Each has its own id, its own entry and its own 30,000 ms deadline, counted from its own call. Answers are matched by id, in whatever order they arrive. Settling one request, or its timing out, has no effect on the others. Observed: request A at t = 0 and request B at t = 10,000 ms timed out at 30,000 ms and 40,000 ms. The number of running timers always equals the number of pending requests.

### 3.7 Promises nobody handles

The module attaches nothing to the promise it returns. When a caller throws the promise away (`MainHeader.tsx` does, with `void`), a failure or timeout surfaces as an unhandled rejection in the page. Tests that expect a rejection attach their expectation before advancing time, for the same reason. See Q4.

---

## 4. Concrete examples (observed)

Unless a row says otherwise, fake timers were on and the `postMessage` spy had been cleared. Rows 1, 8, 9 and 10 and most of the timeout texts in row 7 were observed without `init()`. `init` makes no difference to them. The other rows, except 12, 14 and 15, were observed after `init()`. Ids are random, and `<id>` stands for the id that was posted.

| #   | Setup and call                                                                                                                                                                | Posted                                                                                                                                    | Result                                                                                                                                                                                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `rpcClient.request("clipboard.copy", "abc")`                                                                                                                                  | One call with one argument: `{"kind":"rpc.request","id":"4036c2f5-2778-482b-869f-03bd067e52e1","method":"clipboard.copy","params":"abc"}` | The spy has been called when `request` returns. It returns a pending `Promise`. The timer count goes up by 1.                                                                                                                                             |
| 2   | Two calls of `request("repo.scan", null)`                                                                                                                                     | Two messages, `params: null`, with two different ids                                                                                      | Timer count 2. Answering the second with `{ success: true, result: obj }` fulfils it with `obj` itself, and the timer count drops to 1. The first is still pending.                                                                                       |
| 3   | Pending `repo.scan`. Dispatch `{ kind: "rpc.response", id: <id>, success: false, error: "scan failed" }`                                                                      | —                                                                                                                                         | Rejects with an `Error` whose message is `"scan failed"`. Timer count 0.                                                                                                                                                                                  |
| 4   | `request("git.init", null)`. Dispatch `{ kind: "rpc.response", id: <id>, success: "yes" }`                                                                                    | —                                                                                                                                         | Rejects at once with `Error("Malformed response to an RPC request")`.                                                                                                                                                                                     |
| 5   | `request("git.init", null)`. Dispatch a success with `result: null`, or with no `result`                                                                                      | —                                                                                                                                         | Fulfils with `null`, or with `undefined`.                                                                                                                                                                                                                 |
| 6   | `data-rpc-timeout` = `"No response: {0}"`. `request("walkthrough.open", null)`. Advance 29,999 ms, then 1 ms. Then dispatch a success for `<id>`.                             | `{ kind: "rpc.request", id, method: "walkthrough.open", params: null }`                                                                   | Pending at 29,999 ms. At 30,000 ms: rejects with `Error("No response: walkthrough.open")`, timer count 0. The late success is ignored, and no listener error occurs.                                                                                      |
| 7   | Different `data-rpc-timeout` values, each followed by a request that times out                                                                                                | —                                                                                                                                         | See the table below.                                                                                                                                                                                                                                      |
| 8   | `data-rpc-timeout` = `"BEFORE {0}"`. `request("docs.open", null)`. Set it to `"AFTER {0}"`. Advance 30,000 ms.                                                                | —                                                                                                                                         | Rejects with `"AFTER docs.open"`.                                                                                                                                                                                                                         |
| 9   | `request("docs.open", null)` at t = 0. `request("settings.open", null)` at t = 10,000 ms.                                                                                     | Two messages                                                                                                                              | `docs.open` rejects at t = 30,000 ms, `settings.open` at t = 40,000 ms.                                                                                                                                                                                   |
| 10  | `postMessage` made to throw `err = new Error("clone failed")` once. `request("clipboard.copy", "x")`.                                                                         | The spy saw the message (it then threw)                                                                                                   | `request` does not throw. The promise rejects with `err` itself, already rejected on the next microtask. Timer count 0. A later success for that id is ignored. If the spy throws the string `"a string"` instead, the promise rejects with `"a string"`. |
| 11  | `postMessage` made to dispatch `{ kind: "rpc.response", id: <its id>, success: true, result: "sync" }` from inside the call. `request("docs.open", null)`.                    | One message                                                                                                                               | Fulfils with `"sync"`.                                                                                                                                                                                                                                    |
| 12  | Fresh module, **no** `init`. `request("clipboard.copy", "x")`. Dispatch a success with `result: "early"` for `<id>`. Then `init()`. Dispatch a success with `result: "late"`. | One message                                                                                                                               | The first answer is ignored (timer count stays 1). `init()` returns `undefined`. The second answer fulfils with `"late"`, timer count 0.                                                                                                                  |
| 13  | `init()` three times. Dispatch one `{ kind: "rpc.notify", id: "n", name: "repo.rescan", message: null }`.                                                                     | Exactly one `{ kind: "rpc.request", method: "repo.scan", params: null }`                                                                  | —                                                                                                                                                                                                                                                         |
| 14  | Without `init`, `rpcClient.request("no.such" as never, undefined as never)` (forced past the types)                                                                           | `{ kind: "rpc.request", id, method: "no.such", params: undefined }`, with `params` an own key                                             | No check is made. The request then times out like any other.                                                                                                                                                                                              |
| 15  | Handler mocked so that its first call throws `Error("install failed")`. `init()`, then `init()` again.                                                                        | —                                                                                                                                         | The first call throws `"install failed"`. The second returns normally, and the handler was called only once, with a `Map` that was empty at the time.                                                                                                     |

Timeout text (example 7):

| `data-rpc-timeout`                          | Method (forced by a cast where not a real one) | Rejection `message`                                        |
| ------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------- |
| `Keine Antwort der Erweiterung: {0}`        | `clipboard.copy`                               | `Keine Antwort der Erweiterung: clipboard.copy`            |
| `The extension did not answer in time: {0}` | `webview.initialize`                           | `The extension did not answer in time: webview.initialize` |
| (attribute absent)                          | `clipboard.copy`                               | `""` (empty)                                               |
| `no placeholder`                            | `docs.open`                                    | `no placeholder`                                           |
| `{0} and {0}`                               | `docs.open`                                    | `docs.open and {0}`                                        |
| `x {1} {0} $& {0}`                          | `settings.open`                                | `x {1} settings.open $& {0}`                               |
| `m=$&`                                      | `a$&b`                                         | `m=$&`                                                     |
| `m={0}`                                     | `a$&b`                                         | `m=a{0}b` (see Q1)                                         |

When `webview.initialize` times out in production, `main.tsx` would put the second row's message into its own `initFailed` text ("Unable to open the graph: {0}" in English). That composition is `main.tsx`'s doing and was not run here.

---

## 5. Non-functional requirements

### 5.1 Timers and the table

- Exactly one timer per pending request, and no other timers or intervals. Tests check that the timer count is `0` right after a request is answered.
- No timer may outlive its request. An answer cancels it (through the handler, using the `timeout` handle in the entry). A failed post cancels it. A timeout has, by definition, already used it.
- No entry may outlive its request. Answered, timed-out and failed-to-post requests must all be gone from the table. A leftover entry cannot be seen through the public interface; it is a memory leak.
- Timers must be created through the global `setTimeout` as it is at call time (§2.2). If a timer function were captured when the module loads, the tests' fake timers would not control it and several tests would hang.

### 5.2 Timing

- Everything in §3.3 happens synchronously inside `request`. Nothing may be deferred to a later microtask or task: callers read the posted id right after the call, and an answer can arrive during the post.
- `init` is synchronous too. After it returns, the next dispatched message is already handled.

### 5.3 Loading and state

- No work at import time (§3.1): because of the import cycle, because tests decide when listening starts, and because one test file loads the module without a DOM.
- The module's state (the table, and whether `init` has run) lasts for the life of the module instance. Vitest gives each test file a fresh instance, but the tests in one file share it. `rpc-handler-client.test.ts` depends on this: it calls `init()` once per test, and it needs only one listener.

### 5.4 Other

- No logging (`eslint/no-console` is an error), and no user-visible text except the shell's timeout text.
- The rewrite must pass `pnpm run typecheck` (which checks `src/webview` and `tests/webview` with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and `verbatimModuleSyntax`), `pnpm run lint`, `pnpm run format` and the `webview` Vitest project. Afterwards, lower this file's entry in `scripts/provenance-baseline.json` with `pnpm run provenance --update`.

---

## 6. Test coverage

### 6.1 What the existing tests check

**`tests/webview/lib/rpc-client.test.ts`** (one test; it never calls `init`):

- A request that is never answered rejects with the shell's `rpcTimeout` text, with `{0}` replaced by the method name. The test uses `data-rpc-timeout = "Keine Antwort der Erweiterung: {0}"` and `request("clipboard.copy", "commit")`, and expects the message `"Keine Antwort der Erweiterung: clipboard.copy"`. It runs all timers, so it does not pin the 30,000 ms.

**`tests/webview/lib/rpc-handler-client.test.ts`** (client and handler together, with `data-rpc-timeout = "No response: {0}"`):

- Nothing is handled before `init()`, and everything is handled after it.
- An answer at 29,999 ms fulfils the request, and the timer count is 0 right afterwards. This proves the deadline is later than 29,999 ms and that the entry carries the real timer handle.
- After 30,000 ms, the request has rejected with `"No response: clipboard.copy"`, and a later answer is ignored without a listener error. This proves the deadline is no later than 30,000 ms.
- A failure answer rejects with its `error` text.
- A malformed answer rejects at once with `"Malformed response to an RPC request"`, and the timer count is 0.
- A success without `result` fulfils with `undefined`.
- Two requests are matched by id when answered in reverse order. This fails if ids repeat.
- The `repo.rescan` tests expect the exact message `{ kind: "rpc.request", id: <any string>, method: "repo.scan", params: null }`, and exactly one scan per notification, even though `init()` ran in several earlier tests. That indirectly checks that repeated `init()` calls add no listener.

**`tests/webview/lib/actions/clipboard.test.ts`** (initialized through `setupWebviewTest({ dispatchMessages: true })`):

- Copying a commit hash posts exactly `{ kind: "rpc.request", id: <any string>, method: "clipboard.copy", params: "commit" }`. A success answer with `result: false` fulfils with `false`, and the caller opens its error dialog.

### 6.2 What altered copies of the module showed

The whole `webview` project (530 tests) was run against copies of the module, each with one deliberate change:

| Change in behaviour                                                  | Caught by                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every `init()` call installs another listener                        | `rpc-handler-client.test.ts`: four `repo.rescan` tests                                                                                                                                                                                                                                                                                                                                                                       |
| Deadline of 29,999 ms                                                | `rpc-handler-client.test.ts`: "resolves a response that arrives just before the deadline…"                                                                                                                                                                                                                                                                                                                                   |
| Deadline of 30,001 ms                                                | `rpc-handler-client.test.ts`: "ignores a response that arrives after the deadline"                                                                                                                                                                                                                                                                                                                                           |
| Timeout text without the method name                                 | `rpc-client.test.ts`, and `rpc-handler-client.test.ts` "ignores a response that arrives after the deadline"                                                                                                                                                                                                                                                                                                                  |
| The same id for every request                                        | `rpc-handler-client.test.ts`: "matches responses by id…"                                                                                                                                                                                                                                                                                                                                                                     |
| The entry's `timeout` is not the deadline timer                      | `rpc-handler-client.test.ts`: "resolves a response that arrives just before the deadline…" and "rejects a malformed response at once…"                                                                                                                                                                                                                                                                                       |
| An extra key in the posted message                                   | `clipboard.test.ts`, and `rpc-handler-client.test.ts` "scans again without waiting…"                                                                                                                                                                                                                                                                                                                                         |
| The handler is given a different map from the one requests go into   | Eight tests in `rpc-handler-client.test.ts` and `clipboard.test.ts`                                                                                                                                                                                                                                                                                                                                                          |
| The handler is installed when the module loads                       | `rpc-handler-client.test.ts` "does not listen until the client initializes it", and `tests/webview/lib/webview-config.test.ts` "opens the graph when a config.changed notification beats the initialize response". That file runs in the Node environment, without jsdom, and loads this module through `@/webview/lib/actions`. There, any use of `window` at load time fails with `ReferenceError: window is not defined`. |
| A failed post leaves its timer running                               | **Nothing**                                                                                                                                                                                                                                                                                                                                                                                                                  |
| A failed post rejects with a new `Error` instead of the thrown value | **Nothing**                                                                                                                                                                                                                                                                                                                                                                                                                  |
| A failed post leaves its entry in the table                          | **Nothing**                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `request` initializes the client itself                              | **Nothing**                                                                                                                                                                                                                                                                                                                                                                                                                  |
| A timeout leaves its entry in the table                              | **Nothing**                                                                                                                                                                                                                                                                                                                                                                                                                  |
| A timeout rejects with the text as a string, not an `Error`          | **Nothing**. Vitest's `rejects.toThrow("text")` also accepts a rejected string.                                                                                                                                                                                                                                                                                                                                              |
| Every `{0}` in the timeout text is replaced                          | **Nothing**                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Ids come from a counter that starts at 1 for each page               | **Nothing**                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Messages are posted through a second `acquireVsCodeApi()` call       | **Nothing**. The test mock returns the same object every time, whereas real VS Code throws on a second call.                                                                                                                                                                                                                                                                                                                 |
| The timeout text is read when the request is made                    | **Nothing**                                                                                                                                                                                                                                                                                                                                                                                                                  |
| The request joins the table only after `postMessage` returns         | **Nothing**                                                                                                                                                                                                                                                                                                                                                                                                                  |

### 6.3 Gaps, with the test to add

Each gap is written as a setup and input, then the expected result. Use fake timers where time matters. When a test needs to see the table, mock `@/webview/lib/rpc/rpc-handler` with `vi.mock` so that `initRpcHandler` records the map it receives.

| #   | Behaviour (section)                        | Setup and input                                                                                                                                                                                                       | Expected result                                                                                                                                                                                                           |
| --- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | Failed post, thrown `Error` (§3.4 e)       | `init()`. Fake timers. Make the `vscodeApi.postMessage` spy throw `err = new Error("clone failed")` on its next call. Call `request("clipboard.copy", "x")`. Then dispatch a success for the id the spy saw.          | The call does not throw. The promise rejects with a value that is identical (`toBe`) to `err`. `vi.getTimerCount()` is 0. The later success causes no listener error.                                                     |
| G2  | Failed post, thrown non-`Error` (§3.4 e)   | As G1, but the spy throws the string `"a string"`.                                                                                                                                                                    | The promise rejects with `"a string"` (`toBe`). Timer count 0.                                                                                                                                                            |
| G3  | Nothing left in the table (§5.1)           | Mock the handler module so that `initRpcHandler` records its map, then `init()`. Separately: (a) a request that is answered; (b) a request that times out after 30,000 ms; (c) a request whose post throws.           | The recorded map is the same instance every time, and its `size` is 0 after each of (a), (b) and (c). While a request is pending, `size` is 1, and the entry has functions `resolve` and `reject` and a `timeout` handle. |
| G4  | Answer during the post (§2.4)              | `init()`. The spy, when called, dispatches `{ kind: "rpc.response", id: message.id, success: true, result: "sync" }`. Call `request("docs.open", null)`.                                                              | Fulfils with `"sync"`.                                                                                                                                                                                                    |
| G5  | Requests before `init` (§3.5)              | Fresh module, for example after `vi.resetModules()`. Fake timers. `request("clipboard.copy", "x")`. Dispatch a success with result `"early"`. Then `init()`. Dispatch a success with result `"late"` for the same id. | After the first answer, the promise is still pending and the timer count is 1. It then fulfils with `"late"`, and the timer count is 0.                                                                                   |
| G6  | Before `init`, never initialized (§3.5)    | Fresh module. Fake timers. `request("docs.open", null)`. Dispatch a success for its id. Advance 30,000 ms.                                                                                                            | Rejects with the timeout text for `docs.open`. The answer had no effect.                                                                                                                                                  |
| G7  | `init` is idempotent (§3.2)                | Fresh module, with the handler mocked. Call `init()` twice.                                                                                                                                                           | `initRpcHandler` was called exactly once, with a `Map`. Both calls return `undefined`.                                                                                                                                    |
| G8  | Nothing happens on import (§3.1)           | Fresh module, with the handler mocked. Import it, and nothing else.                                                                                                                                                   | `initRpcHandler` was not called, `postMessage` was not called, and the timer count is 0.                                                                                                                                  |
| G9  | Timeout value is an `Error` (§3.4 d)       | Fake timers. `data-rpc-timeout = "No response: {0}"`. `request("docs.open", null)`. Advance 30,000 ms.                                                                                                                | The rejection is `instanceof Error`, and its `message` is exactly `"No response: docs.open"`.                                                                                                                             |
| G10 | Exact deadline without `init` (§3.4 d)     | Fake timers, no `init`. `request("docs.open", null)`. Advance 29,999 ms, then 1 ms.                                                                                                                                   | Pending after 29,999 ms. Rejected after 30,000 ms. Timer count 0 at the end. (Today the exact deadline is pinned only in `rpc-handler-client.test.ts`.)                                                                   |
| G11 | Missing shell text (§3.4 d)                | Delete `document.documentElement.dataset.rpcTimeout`. Let a request time out.                                                                                                                                         | Rejects with an `Error` whose `message` is `""`.                                                                                                                                                                          |
| G12 | Only the first `{0}` (§3.4 d)              | `data-rpc-timeout = "{0} and {0}"`, then `"no placeholder"`. Let a `docs.open` request time out for each.                                                                                                             | `"docs.open and {0}"`, then `"no placeholder"`.                                                                                                                                                                           |
| G13 | Text read at the deadline (§3.4 d)         | `data-rpc-timeout = "BEFORE {0}"`. `request("docs.open", null)`. Set it to `"AFTER {0}"`. Advance 30,000 ms.                                                                                                          | Rejects with `"AFTER docs.open"`.                                                                                                                                                                                         |
| G14 | Deadlines are independent (§3.6)           | Fake timers. `request("docs.open", null)` at t = 0. Advance 10,000 ms. `request("settings.open", null)`. Advance 20,000 ms, then 10,000 ms more.                                                                      | After 30,000 ms, only `docs.open` has rejected, and the timer count is 1. After 40,000 ms, `settings.open` has rejected too, and the timer count is 0.                                                                    |
| G15 | Identical requests stay separate (§3.3)    | `init()`. Fake timers. Two calls of `request("repo.scan", null)`. Answer the second with `result: obj`.                                                                                                               | Two messages are posted, with different ids. The timer count is 2, and then 1. The second promise fulfils with `obj` (`toBe`). The first is still pending.                                                                |
| G16 | Ids do not repeat across page loads (§3.3) | Import the module, make one request and note its id. `vi.resetModules()`, import it again, make one request and note its id.                                                                                          | The two ids differ.                                                                                                                                                                                                       |
| G17 | Posts through the shared API object (§2.1) | Record how many times the global `acquireVsCodeApi` mock has been called. Call `init()` and make two requests.                                                                                                        | The count has not changed, and both messages reached `vscodeApi.postMessage`.                                                                                                                                             |
| G18 | `params` passed unchanged (§2.3)           | `request("clipboard.copy", s)` with a string `s`. Also force an object through the types.                                                                                                                             | The posted `params` is identical (`toBe`) to what was passed, and is an own key of the message.                                                                                                                           |

---

## 7. Questions

These are behaviours that look like bugs, or whose intent is unclear. Each one gives today's behaviour, which the replacement should keep unless someone decides otherwise, and what may have been intended. None of them is decided here.

**Q1. How the method name goes into the timeout text.** _Today:_ only the first `{0}` is replaced. Also, character sequences in the method name that start with `$` and have a special meaning in JavaScript string replacement (such as `$&`) are expanded rather than inserted literally: the template `m={0}` with the name `a$&b` gives `m=a{0}b`. Every real method name is free of `$`, and every translation of the text contains exactly one `{0}`, so users never see a difference. _Maybe intended:_ the name inserted literally, at every `{0}`, which is how a translator would read the placeholder.

**Q2. An empty timeout message.** _Today:_ if the shell lacks `data-rpc-timeout`, a timed-out request rejects with an `Error` whose message is `""`. `main.tsx`, the repository picker and the "no repository" page would then show their own text with nothing after the colon, and nothing would say which method timed out. The extension always sets the attribute, so this only happens in tests or in a broken shell. _Maybe intended:_ a fallback that at least names the method.

**Q3. Rejections that are not `Error`s.** _Today:_ every failure rejects with an `Error` except a failed post, which rejects with whatever `postMessage` threw, unchanged, and that need not be an `Error`. The callers that show a message cope, because they fall back to `String(reason)`. _Maybe intended:_ always an `Error`, perhaps with the thrown value as its `cause`.

**Q4. Promises that nobody handles.** _Today:_ the gear-menu items in `MainHeader.tsx` discard their promises. A failure answer or a timeout 30 seconds later then becomes an unhandled rejection in the page. The client neither prevents nor reports it. _Maybe intended:_ those callers catch, or a request that does not need an answer is sent some other way. This is probably not this module's to fix, but its behaviour decides whether the rejection happens.

**Q5. A failed `init` is not retried.** _Today:_ if starting the handler throws, the first `init()` throws, and every later `init()` silently does nothing, so the page never listens. It cannot happen with the current handler. _Maybe intended:_ a later `init()` tries again.

**Q6. Answers to requests made before `init` are lost.** _Today:_ a request made before `init` is posted normally, but its answer is dropped if it arrives before `init`, and the caller learns of it only 30 seconds later, through a misleading timeout. Nothing warns about this. `main.tsx` avoids it by calling `init()` first. Making `request` initialize the client itself would break none of the current tests (§6.2). _Maybe intended:_ keep this, initialize on first request, or refuse requests before `init`.

**Q7. One 30-second deadline for every method.** _Today:_ every method gets the same 30,000 ms, and an answer after it is thrown away. `git.init` runs VS Code's own `git.init` command, which can wait for the user to choose a folder. `repo.scan` walks the workspace to a configurable depth. Either can exceed 30 seconds, and the webview then reports a failure although the extension may go on to succeed (the repository is created, but the page shows "unable to initialize repository"). More generally, for any method a timeout does not mean the work was not done. _Maybe intended:_ deadlines per method, no deadline for requests that wait for the user, or a late answer that is still used.

**Q8. When the timeout text is read.** _Today:_ at the moment the deadline passes, not when the request is made. The attribute never changes in production, so the two are equivalent there. Tests could tell them apart. _Maybe intended:_ either one. It is recorded here only so that the choice is deliberate.

**Q9. Results are not checked.** _Today:_ a success answer's `result` reaches the caller as it is, whatever the method's declared result type. For example, the server turns an `undefined` result into `null`, so a method typed `boolean` can fulfil with `null`, and a `repo.scan` answer of `null` would make the repository store fail with a `TypeError` instead of a clear message. The extension and the page ship together, so this is trusted today. _Maybe intended:_ keep trusting it. A check would belong with the handler or the callers rather than here.

**Q10. No way to cancel or reset.** _Today:_ a pending request cannot be cancelled, and the module's state cannot be reset. Tests in one file therefore share the table and whether `init` has run, and they use `vi.resetModules()` when they need a fresh module. Nothing in the product needs cancellation now. _Maybe intended:_ nothing more. This is recorded so that the replacement does not add a reset or cancel API that nobody asked for.

---

## 8. Decisions on §7 (from the project maintainer's side)

These decisions replace the "current behaviour" wherever they differ. Build to these, and test the decided behaviour.

- **Q1: literal method names.** Every `{0}` in the timeout text is replaced by the method name exactly as given; no `$`-sequences are expanded.
- **Q2: keep.** A missing shell attribute gives an empty template, as today; production always sets it.
- **Q3: always an `Error`.** A failed post rejects with the thrown value when it is an `Error`, and otherwise with an `Error` whose message is the value converted to text. No timer or entry is left behind.
- **Q4: out of scope.** Callers that discard the promise are their own concern.
- **Q5: retry a failed `init`.** If installing the handler throws, `init` rethrows and a later call tries again. Once it has succeeded, further calls do nothing.
- **Q6: initialize on first use.** `request` makes sure the handler is installed before it posts, so an answer to a request made before `init` is no longer lost. Calling `init` afterwards does nothing more.
- **Q7: keep.** One 30,000 ms deadline for every method.
- **Q8: keep.** The timeout text is read when the deadline passes.
- **Q9: keep.** Results are not validated here.
- **Q10: keep.** No cancel or reset.
