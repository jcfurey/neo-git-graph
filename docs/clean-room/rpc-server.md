# Clean-room specification: `src/extension/rpc/rpc-server.ts`

This document says what the extension-side RPC server must do, as seen from outside it. It is written for an engineer who will build a replacement without seeing the current source. Everything here comes from the module's callers, the tests, the shared RPC types, the handler table it serves, the webview's RPC client, the VS Code API documentation, and behaviour observed by running the current code.

In one sentence: the module answers request messages that the graph webview sends to the extension. It looks up the named method in the extension's handler table, runs it with the request's parameters, and posts back exactly one response that carries either the method's result or an error string.

---

## 0. Environment used for the examples

- Node v22.22.2, Vitest 4.1.11, run from the repository's `node_modules`.
- `vscode` was mocked. The webview was a fake object with two members: `onDidReceiveMessage`, which captures the listener and returns a disposable, and `postMessage`, which records each message and resolves `true`.
- Section 4.3 used a fake `postMessage` that turns the message into JSON, as VS Code does (see §2.4). All other examples show the object that the module passed to `postMessage`.
- Section 4.1 used a stand-in handler table. Section 4.2 used the real table from `src/extension/rpc/handlers.ts`, with VS Code commands, the clipboard, configuration and the workspace scan mocked.

---

## 1. Interface

**Module path:** `src/extension/rpc/rpc-server.ts`. Production code imports it as `./rpc/rpc-server` from `src/extension/view-command.ts`. Tests import it as `@/extension/rpc/rpc-server`.

The module has exactly one export. Its name and signature must not change:

### `export function createRpcServer(): { attach: (webview: vscode.Webview) => vscode.Disposable }`

- Takes no arguments.
- Returns an object with exactly one property, `attach`. It has no other properties or methods.
- `attach(webview)` starts serving RPC requests that arrive from `webview`. It returns a `vscode.Disposable`, and disposing that value stops serving requests from that webview (see §3.11).
- The module exports no types. The return type above is the one TypeScript infers today. A replacement may write it out explicitly or leave it inferred, as long as the resulting declaration is the same.

### Callers

| Caller                          | What it uses                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/extension/view-command.ts` | Calls `createRpcServer()` once, when `createViewCommand(ctx)` runs during activation (`src/main.ts`). Each time it creates a new webview panel, it calls `attach(webPanel.webview)` and keeps the returned disposable. It calls `.dispose()` on that disposable from the panel's `onDidDispose` handler. It uses nothing else. The same server object is reused for every panel the user opens, one after another, during the session. |

### Tests

| Test file                              | What it uses                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/extension/rpc-server.test.ts`   | Imports `createRpcServer`. Calls `createRpcServer().attach(fakeWebview)`, where the fake webview has **only** `onDidReceiveMessage` and `postMessage`. Its `onDidReceiveMessage` captures the listener function and returns `{ dispose }`. The test then calls the captured listener directly with messages and `await`s the value the listener returns. It mocks `vscode` as an empty module, `@/extension/rpc/handlers` as a table with only `"repo.scan"`, and `@/extension/util/logger` as an object with only `debug`, `warn` and `error`. |
| `tests/extension/view-command.test.ts` | Replaces the whole module with `{ createRpcServer: () => ({ attach }) }`, where `attach` returns `{ dispose: vi.fn() }`. It depends only on the export's name and on the shape: a factory whose result has an `attach` that returns something disposable.                                                                                                                                                                                                                                                                                       |

---

## 2. Dependencies the implementation must use

### 2.1 The handler table: `rpcHandlers` from `@/extension/rpc/handlers`

The current source imports it by the relative path `./handlers`, which resolves to the same file. Vitest's module mock applies to either spelling.

Contract of the table:

- It is a plain object. Each own property name is a method name, and each value is a function that takes **one** argument, the request's `params` (typed `unknown`). The function returns the method's result, or a promise of it. It may throw or reject.
- The table is the **only** source of truth for which method names exist. The unit test swaps in a table that contains only `"repo.scan"`, and it expects every other name to be treated as unknown. The server must not keep its own list of method names, and it must not derive one from the `RpcMethod` type.
- The table is typed (in `handlers.ts`) so that its keys are exactly the `RpcMethod` union from `@/types` and each value's result matches `RpcMethodMap[method]["result"]`.

The production table today:

| Method               | `params` sent by the webview | Result                                                                          | Effect / failure                                                                   |
| -------------------- | ---------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `clipboard.copy`     | a string                     | `true` once the text is on the clipboard; `false` if the clipboard write failed | Throws `Error("Invalid copyToClipboard parameters")` when `params` is not a string |
| `webview.initialize` | `null`                       | `{ l10n, config }` (localized strings and the webview settings)                 | none expected                                                                      |
| `git.init`           | `null`                       | `true`                                                                          | Runs VS Code's `git.init` command. Rejects if that command rejects.                |
| `repo.scan`          | `null`                       | `{ repos: { name, path }[] }`                                                   | Scans the workspace for repositories                                               |
| `settings.open`      | `null`                       | `true`                                                                          | Opens the Settings editor filtered to this extension                               |
| `docs.open`          | `null`                       | `true`                                                                          | Runs `branchwise.openDocumentation`                                                |
| `walkthrough.open`   | `null`                       | `true`                                                                          | Runs `branchwise.openWalkthrough`                                                  |

No handler validates `params` except `clipboard.copy`. No current handler resolves to `undefined` (see §7, Q1).

### 2.2 The logger: `logger` from `@/extension/util/logger`

- Methods: `debug(message: string, ...args)`, `info(message: string, ...args)`, `warn(message: string, ...args)`, `error(message: string | Error, ...args)`. They write to the extension's log output channel. Before `logger.init` has run they do nothing.
- The server may use **only** `debug`, `warn` and `error`. The unit test's mock provides nothing else, so a call to `info` would throw.

### 2.3 Types from `@/types` (type-only)

- `RpcResponse` is the shape of every response the server posts (see §2.5). A replacement should type its responses with it, so the compiler checks the shape.
- `RpcMethod` (the union of method names), `RpcMethodMap` (per-method `params`/`result` types) and `RpcRequest` (the request shape) are also available.
- All of these come from `src/types/rpc.types.ts` and are re-exported from `@/types`.

### 2.4 VS Code API (types only at runtime)

- The server uses **only** two members of the webview: `webview.onDidReceiveMessage(listener)`, which registers a listener and returns a `vscode.Disposable`, and `webview.postMessage(message)`, which returns `Thenable<boolean>`. The unit test's fake webview has nothing else.
- The unit test mocks `vscode` as an **empty module**, and Vitest throws when code reads any value from it. So the module must use `vscode` for types only (`vscode.Webview`, `vscode.Disposable`) and must never touch a runtime value such as `vscode.Disposable`, `vscode.EventEmitter` or `vscode.window`.
- According to VS Code's API documentation, messages in both directions must be JSON-serializable. The extension host serializes what `postMessage` receives. Keys whose value is `undefined` therefore disappear, `Date` values become strings, and values JSON cannot represent (a `BigInt`, a circular structure) make `postMessage` reject. The documentation also says that `postMessage` resolves to `false` when the message could not be delivered, for example because the webview is not live.
- VS Code calls a message listener with the message as its only argument and ignores what the listener returns. If the listener returns a promise that rejects, VS Code does not handle the rejection, so it surfaces as an unhandled rejection in the extension host.

### 2.5 The message protocol

All messages to and from the webview travel over one channel: `webview.onDidReceiveMessage` in one direction and `webview.postMessage` in the other. Other modules share that channel, so the server must pick out its own messages and leave the rest alone.

**Request (webview → extension).** `src/webview/lib/rpc/rpc-client.ts` sends it:

| Field    | Meaning                                                                                                                       |
| -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `kind`   | Always the string `"rpc.request"`.                                                                                            |
| `id`     | A string that correlates the request with its response. The client generates a fresh `crypto.randomUUID()` for every request. |
| `method` | The method name, one of the table's keys.                                                                                     |
| `params` | The method's parameters. The client always includes this field. Methods that take no parameters send `null`.                  |

**Response (extension → webview).** This module sends it, and it comes in exactly one of two shapes (`RpcResponse` in `@/types`):

| Field     | Success                       | Failure                         |
| --------- | ----------------------------- | ------------------------------- |
| `kind`    | `"rpc.response"`              | `"rpc.response"`                |
| `id`      | the request's `id`, unchanged | the request's `id`, unchanged   |
| `success` | `true`                        | `false`                         |
| `result`  | the handler's result          | (absent)                        |
| `error`   | (absent)                      | a string describing the failure |

A response must have no other keys. The unit test compares posted messages by deep equality, so an extra key with a defined value would fail it.

**How the webview treats responses.** `src/webview/lib/rpc/rpc-handler.ts` does this, and it is useful context:

- A message counts as a response only if `kind` is `"rpc.response"`, `id` is a string and `success` is a boolean. In addition, a success message must contain the key `result`, and a failure message must have a string `error`. The client ignores any other message.
- A response whose `id` matches no pending request is ignored. This covers duplicates and late responses.
- On success, the pending request resolves with `result`. On failure, it rejects with `new Error(error)`. Webview code then shows that message to the user. For example, the "no repository" page inserts it into "unable to initialize repository: {0}", and a failed `webview.initialize` shows it on the startup-failure screen.
- The client rejects any request that has had no response for **30,000 ms** (30 seconds), using a localized timeout message. The server does not know about this timeout.

**Other traffic on the same channel.** The server must ignore these messages and must not answer them:

- `{ kind: "rpc.notify", id, name, message }`: notifications from the extension to the webview, sent by `src/extension/rpc/rpc-notify.ts`.
- Legacy messages shaped `{ command: ..., ... }`, in both directions. Other listeners on the same webview handle them: `src/extension/repoSelection.ts` handles `{ command: "viewReady" }`, and the legacy message protocol from `src/extension/legacy.ts` handles the rest.

---

## 3. Behaviour

### 3.1 `createRpcServer()`

- Every call returns a new server object.
- Creating a server has no side effects. It registers no listener, posts nothing and logs nothing.
- The server keeps no state that ties it to a particular webview. One server can be attached to several webviews, or to the same webview more than once, and each attachment works independently (§3.9).

### 3.2 `attach(webview)`

- Registers exactly one listener with `webview.onDidReceiveMessage`, passing only the listener function.
- Returns a disposable. Disposing it must remove that listener. Today the returned object is the very disposable that `onDidReceiveMessage` returned. Callers only need its `dispose()` to work.
- Posts nothing and logs nothing at attach time.

### 3.3 Which messages are requests

A received message is an RPC request exactly when it satisfies every condition in this table:

| Part of the message | Condition                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| the message itself  | A non-null value of type `"object"`. Primitives, `null`, `undefined` and functions never qualify. |
| `params`            | The property must exist. Its value can be anything, including `null` or `undefined`.              |
| `method`            | A string. Any string is accepted, including the empty string.                                     |
| `id`                | A string. Any string is accepted, including the empty string.                                     |
| `kind`              | The string `"rpc.request"`.                                                                       |

Other properties are ignored. Today a property found on the object's prototype also counts as present. This makes no difference for messages that arrive as JSON.

A message that fails any of these checks is **ignored entirely**. The handler is not called, nothing is posted, nothing is logged and nothing is thrown. This includes messages that look almost like requests, such as a request with a numeric `id` or a missing `params`. The webview would get no answer and would time out after 30 s (see §7, Q2).

### 3.4 Known and unknown methods

- A method name is **known** if and only if the handler table has an **own** property with exactly that name. Matching is case-sensitive, with no trimming or normalising: `"REPO.SCAN"` and `" repo.scan"` are unknown when `"repo.scan"` exists.
- Names that every object inherits are **unknown**, because the table does not own them. Examples are `toString`, `constructor`, `hasOwnProperty`, `valueOf` and `__proto__`. The handler is never looked up or called for them.
- The table is checked when each request arrives. A handler present in the table at that moment is served, even if it was added after `attach`. Production never changes the table, so this is not a requirement either way.

### 3.5 Outcomes for a known method

The rules below hold for every request whose method is known. The logging each outcome produces is listed in §3.12.

**The handler call.** The method's handler runs exactly **once** per request. Its only argument is the request's `params`, passed as the same reference: not copied, not validated, not defaulted. Checking parameters is the handler's job (for example, `clipboard.copy` throws for a non-string). A handler can return a plain value or a promise, and both must work.

**The handler succeeds.** The webview receives `{ kind: "rpc.response", id, success: true, result }`. `result` is exactly the value the handler produced, the same reference, whatever it is. Falsy values are ordinary results: `false`, `0`, `""` and `null` all produce success responses.

**The handler fails.** A handler fails when it throws synchronously or returns a promise that rejects. The webview then receives `{ kind: "rpc.response", id, success: false, error }`, where `error` is a string chosen by what was thrown:

| Thrown value                                                                     | `error` string                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| An `Error`, or an instance of a subclass such as `TypeError` or `AggregateError` | Its `message` alone, with no name, stack, method name or other prefix. It may be empty.                                                                                                                                                                                                                                                       |
| Anything else                                                                    | The value converted with JavaScript's standard string conversion. So `"plain"` gives `"plain"`, `42` gives `"42"`, `null` gives `"null"`, `undefined` gives `"undefined"`, `{ message: "x" }` gives `"[object Object]"` (not `"x"`), `Symbol("s")` gives `"Symbol(s)"`, and an object with a custom `toString()` gives whatever that returns. |

A failing handler never makes the listener throw or reject: the failure is always turned into a response. There is one exception. If the thrown value cannot be converted to a string at all (its `toString` throws), nothing is posted, the listener's promise rejects with the conversion error, and the webview eventually times out (see §7, Q8).

### 3.6 Outcome for an unknown method

- The webview receives `{ kind: "rpc.response", id, success: false, error }`. `error` is the fixed text `Unknown RPC method: ` (a colon, then one space) followed by the method string exactly as received, even when that string is empty. The unit test asserts this exact text.
- No handler is called.
- Unlike a handler failure, an unknown method is reported at **warn** level and writes no **error** entry (see §3.12).

### 3.7 When posting the response fails

In normal operation each accepted request leads to exactly one `postMessage` call. When `postMessage` itself fails (it throws synchronously or its promise rejects), the current behaviour is:

| Response being posted             | What happens                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Success response                  | Handled as if the handler had failed. The server logs one **error** entry naming the method, with the delivery error as the extra argument. It then posts a failure response for the **same id**, whose `error` is the delivery error's message. So the webview receives an error such as `Do not know how to serialize a BigInt` when a result cannot be serialized. If this second post also fails, the listener's promise rejects with the second error, and no further attempt or log follows. |
| Failure response (handler failed) | No retry. The listener's promise rejects with the delivery error.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Unknown-method response           | No retry. The listener's promise rejects with the delivery error. The warn entry has already been written.                                                                                                                                                                                                                                                                                                                                                                                         |

When `postMessage` resolves `false` (the message was dropped), the server ignores it. It does not retry, and it still writes whatever "posted" debug entry that outcome normally produces (§3.12), as if the message had been delivered.

### 3.8 The listener's return value

- For every message it receives, the listener returns a promise.
- For an accepted request, that promise settles only **after** the response's `postMessage` call has been made and its returned promise has settled. The unit test depends on this: it awaits the listener and then asserts that `postMessage` was called.
- The promise resolves to `undefined`. It rejects only in the cases described at the end of §3.5 and in §3.7.
- For an ignored message, the promise resolves to `undefined` without posting anything.

### 3.9 Concurrency, ordering and re-entrancy

- Requests are **not** queued or serialized. Each request is handled from the moment it arrives, whether or not earlier requests have finished. A slow handler never delays another request.
- Responses are posted in the order the handlers **finish**, not the order the requests arrived. The webview correlates responses only by `id`.
- The server sets no limit on the number of in-flight requests and has **no timeout** of its own. A handler that never settles never gets a response. The webview gives up after 30 s.
- Duplicate ids are not detected. Two requests with the same id each run their handler and each get their own response carrying that id.
- Handlers may do anything while they run, including posting notifications to the same webview. The server holds no lock.
- Each attachment is independent. If the same server, or two servers, are attached twice to one webview, both listeners answer every request, so the webview gets two responses per request. A caller must attach a webview only once. `view-command.ts` does this, because it creates a new webview for every panel.

### 3.10 Cancellation

The protocol has no cancellation message and the server supports no cancellation. When the webview's 30-second timeout fires, the server is not told. The handler runs to completion, its response is posted, and the webview ignores it because it no longer tracks that id.

### 3.11 Disposal

- Disposing the value returned by `attach` stops the server from handling any message delivered **after** that point.
- Requests already in progress are not cancelled. When their handler settles, their response is still posted to the same webview. If the panel has been disposed by then, the post cannot be delivered, and VS Code documents that undeliverable messages are dropped (`postMessage` resolves `false`). The server ignores the outcome and, in the success case, still logs the debug entry.
- Disposing one attachment has no effect on other attachments, whether of the same server or of others.
- The server object itself holds no resources and needs no disposal.

### 3.12 Logging summary

| Event                                                    | Level   | Content                                                                                         | How many  | When (observed)                       |
| -------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------- | --------- | ------------------------------------- |
| Request accepted (known or unknown method)               | debug   | method name and request id                                                                      | 1         | before the handler runs               |
| Unknown method                                           | warn    | method name                                                                                     | exactly 1 | before the response is posted         |
| Unknown-method response posted                           | debug   | method name, id, failure marker                                                                 | 1         | after the post settles                |
| Success response posted                                  | debug   | method name, id, success marker                                                                 | 1         | after the post settles                |
| Handler failed (or success response could not be posted) | error   | method name, plus the thrown value as an extra argument, so the output channel can show a stack | exactly 1 | before the failure response is posted |
| Failure response for a handler error posted              | nothing | none                                                                                            | 0         |                                       |
| Ignored message                                          | nothing | none                                                                                            | 0         |                                       |

- `info` is never used.
- `params` and results are never logged. Only method names and ids appear in log entries, and the thrown value appears only on error. `clipboard.copy` carries user data, so this should be kept.
- Only the levels and counts are covered by tests (warn once for an unknown method, error once for a handler failure). The timing column is not asserted. The exact wording of log entries is not part of the contract. The `Unknown RPC method: <method>` text of the **response** is part of the contract.

---

## 4. Concrete examples

### 4.1 Stand-in handler table (objects handed to `postMessage`)

| #   | Handler table / setup                                                                               | Incoming message                                                                                                                                                         | Posted message(s)                                                                                                                                                            | Log levels, in order                            |
| --- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 1   | `repo.scan` resolves `{ repos: [] }`                                                                | `{ kind: "rpc.request", id: "abc", method: "repo.scan", params: { x: 1 }, extra: true }`                                                                                 | `{ kind: "rpc.response", id: "abc", success: true, result: { repos: [] } }`; the handler received `{ x: 1 }` as its only argument                                            | debug, debug                                    |
| 2   | `b` returns `0` synchronously                                                                       | `{ kind: "rpc.request", id: "b", method: "b", params: null }`                                                                                                            | `{ kind: "rpc.response", id: "b", success: true, result: 0 }`                                                                                                                | debug, debug                                    |
| 3   | `c` returns `null`                                                                                  | `… id: "c", method: "c" …`                                                                                                                                               | `{ kind: "rpc.response", id: "c", success: true, result: null }`                                                                                                             | debug, debug                                    |
| 4   | only `repo.scan`                                                                                    | `{ kind: "rpc.request", id: "u", method: "constructor", params: null }`                                                                                                  | `{ kind: "rpc.response", id: "u", success: false, error: "Unknown RPC method: constructor" }`                                                                                | debug, warn, debug                              |
| 5   | only `repo.scan`                                                                                    | `… id: "u", method: "" …`                                                                                                                                                | `{ kind: "rpc.response", id: "u", success: false, error: "Unknown RPC method: " }`                                                                                           | debug, warn, debug                              |
| 6   | only `repo.scan`                                                                                    | `… id: "u", method: "REPO.SCAN" …`                                                                                                                                       | `{ …, success: false, error: "Unknown RPC method: REPO.SCAN" }`                                                                                                              | debug, warn, debug                              |
| 7   | handler rejects `new Error("boom")`                                                                 | `… id: "e" …`                                                                                                                                                            | `{ kind: "rpc.response", id: "e", success: false, error: "boom" }`                                                                                                           | debug, error (with the Error as extra argument) |
| 8   | handler rejects `new TypeError("tt")`                                                               | `… id: "e" …`                                                                                                                                                            | `{ …, success: false, error: "tt" }`                                                                                                                                         | debug, error                                    |
| 9   | handler rejects `new Error("")`                                                                     | `… id: "e" …`                                                                                                                                                            | `{ …, success: false, error: "" }`                                                                                                                                           | debug, error                                    |
| 10  | handler rejects `new AggregateError([…], "agg")`                                                    | `… id: "e" …`                                                                                                                                                            | `{ …, success: false, error: "agg" }`                                                                                                                                        | debug, error                                    |
| 11  | handler throws `new Error("sync")` synchronously                                                    | `… id: "e" …`                                                                                                                                                            | `{ …, success: false, error: "sync" }`                                                                                                                                       | debug, error                                    |
| 12  | handler rejects `"plain"` / `42` / `null` / `undefined`                                             | `… id: "e" …`                                                                                                                                                            | `error` is `"plain"` / `"42"` / `"null"` / `"undefined"`                                                                                                                     | debug, error                                    |
| 13  | handler rejects `{ message: "notanerror" }`                                                         | `… id: "e" …`                                                                                                                                                            | `{ …, success: false, error: "[object Object]" }`                                                                                                                            | debug, error                                    |
| 14  | handler rejects `Symbol("s")`                                                                       | `… id: "e" …`                                                                                                                                                            | `{ …, success: false, error: "Symbol(s)" }`                                                                                                                                  | debug, error                                    |
| 15  | handler rejects `{ toString: () => "custom" }`                                                      | `… id: "e" …`                                                                                                                                                            | `{ …, success: false, error: "custom" }`                                                                                                                                     | debug, error                                    |
| 16  | handler rejects an object whose `toString` throws `Error("no string")`                              | `… id: "x" …`                                                                                                                                                            | nothing posted; the listener's promise rejects with `no string`                                                                                                              | debug, error                                    |
| 17  | `m` resolves `"ok"`                                                                                 | `{ kind: "rpc.request", id: "", method: "m", params: null }`                                                                                                             | answered: `{ kind: "rpc.response", id: "", success: true, result: "ok" }`                                                                                                    | debug, debug                                    |
| 18  | `m` exists                                                                                          | `{ kind: "rpc.request", id: "1", method: "m", params: undefined }`                                                                                                       | answered (the `params` key exists)                                                                                                                                           | debug, debug                                    |
| 19  | `m` exists                                                                                          | `{ kind: "rpc.request", id: "1", method: "m" }` (no `params`)                                                                                                            | nothing                                                                                                                                                                      | nothing                                         |
| 20  | `m` exists                                                                                          | `{ kind: "rpc.request", id: 1, method: "m", params: null }`                                                                                                              | nothing                                                                                                                                                                      | nothing                                         |
| 21  | `m` exists                                                                                          | `{ kind: "rpc.request", id: "1", method: 5, params: null }`                                                                                                              | nothing                                                                                                                                                                      | nothing                                         |
| 22  | any                                                                                                 | `{ kind: "rpc.response", … }`, `{ kind: "rpc.notify", … }`, `{ command: "viewReady" }`, `["rpc.request"]`, `null`, `undefined`, `3`, `"text"`, `{ kind: "rpc.request" }` | nothing                                                                                                                                                                      | nothing                                         |
| 23  | `slow` resolves later, `fast` resolves at once                                                      | `slow` (id `"1"`) arrives, then `fast` (id `"2"`)                                                                                                                        | posted order: id `"2"` (`result: "fast"`), then id `"1"` (`result: "slow"`)                                                                                                  |                                                 |
| 24  | `fast` resolves `"fast"`                                                                            | two requests, both with id `"dup"`                                                                                                                                       | two identical success responses with id `"dup"`                                                                                                                              |                                                 |
| 25  | `ok` resolves `"value"`; the first `postMessage` rejects `Error("post failed")`, later ones succeed | `… id: "s", method: "ok" …`                                                                                                                                              | 1st attempt: `{ id: "s", success: true, result: "value" }` (rejected); 2nd: `{ kind: "rpc.response", id: "s", success: false, error: "post failed" }`; the listener resolves | debug, error                                    |
| 26  | `bad` rejects; every `postMessage` rejects `Error("post dead")`                                     | `… id: "b", method: "bad" …`                                                                                                                                             | one attempt; the listener rejects with `post dead`                                                                                                                           | debug, error                                    |
| 27  | only `repo.scan`; every `postMessage` rejects                                                       | `… id: "u", method: "nope" …`                                                                                                                                            | one attempt; the listener rejects                                                                                                                                            | debug, warn                                     |
| 28  | `ok` resolves; `postMessage` resolves `false`                                                       | `… id: "f", method: "ok" …`                                                                                                                                              | one post; no retry                                                                                                                                                           | debug, debug                                    |
| 29  | `slow` pending; `attach`'s disposable is disposed, then `slow` resolves `"late"`                    | `… id: "1", method: "slow" …` (sent before disposing)                                                                                                                    | `{ id: "1", success: true, result: "late" }` is still posted                                                                                                                 |                                                 |
| 30  | one server, `attach` called twice on the same webview; `x` resolves `1`                             | `… id: "z", method: "x" …` delivered to both listeners                                                                                                                   | two identical success responses                                                                                                                                              |                                                 |

### 4.2 Real handler table (VS Code mocked)

| Incoming                                                                                                  | Posted                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{ kind: "rpc.request", id: "7f3c", method: "clipboard.copy", params: "a1b2c3d" }`                        | `{ kind: "rpc.response", id: "7f3c", success: true, result: true }` (the clipboard received `"a1b2c3d"`)                                           |
| `{ kind: "rpc.request", id: "7f3d", method: "clipboard.copy", params: 42 }`                               | `{ kind: "rpc.response", id: "7f3d", success: false, error: "Invalid copyToClipboard parameters" }`                                                |
| same as the first row, but the clipboard write rejects                                                    | `{ kind: "rpc.response", id: "7f3e", success: true, result: false }`                                                                               |
| `{ kind: "rpc.request", id: "r1", method: "repo.scan", params: null }` (scan finds `/w/alpha`, `/w/beta`) | `{ kind: "rpc.response", id: "r1", success: true, result: { repos: [ { name: "alpha", path: "/w/alpha" }, { name: "beta", path: "/w/beta" } ] } }` |
| `{ kind: "rpc.request", id: "g1", method: "git.init", params: null }`                                     | `{ kind: "rpc.response", id: "g1", success: true, result: true }`                                                                                  |
| same, but the `git.init` command rejects `new Error("Git not found")`                                     | `{ kind: "rpc.response", id: "g2", success: false, error: "Git not found" }`                                                                       |
| `settings.open`, `docs.open`, `walkthrough.open` with `params: null`                                      | `{ …, success: true, result: true }` each                                                                                                          |
| `{ kind: "rpc.request", id: "x1", method: "commit.load", params: { hash: "abc" } }`                       | `{ kind: "rpc.response", id: "x1", success: false, error: "Unknown RPC method: commit.load" }`                                                     |

### 4.3 Wire form (JSON-serializing `postMessage`)

| Handler result                  | JSON the webview receives                                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `undefined`                     | `{"kind":"rpc.response","id":"undef","success":true}`. The `result` key is gone, so the webview ignores the message and times out (§7, Q1). |
| `new Date(0)`                   | `{"kind":"rpc.response","id":"date","success":true,"result":"1970-01-01T00:00:00.000Z"}`                                                    |
| `10n` (BigInt)                  | `{"kind":"rpc.response","id":"big","success":false,"error":"Do not know how to serialize a BigInt"}` (per §3.7; one error log entry)        |
| an object that refers to itself | a failure response whose `error` starts with `Converting circular structure to JSON`                                                        |

---

## 5. Non-functional requirements

1. **No runtime dependency on `vscode`.** Loading the module or calling its functions must not read any value from the `vscode` module (§2.4).
2. **No side effects at import time.** Importing the module registers nothing and logs nothing.
3. **Resource cleanup.** The only resource an attachment owns is its message listener, and disposing the returned value must release it. The server creates no timers, intervals, caches, maps of pending requests, global variables or other listeners. It therefore leaks nothing when a panel closes and a new one opens with the same server object.
4. **Coexistence.** Other listeners share the same webview (`repoSelection`, the legacy protocol). The server must not throw for, answer or log anything about messages that are not RPC requests.
5. **No mutation.** The server must not modify the incoming message, the `params` value or the handler's result.
6. **Robustness.** A failing handler must never escape as an exception or rejection. It always becomes a failure response. The only rejections the listener produces today come from failed delivery (§3.7) and from thrown values that cannot be converted to a string (§3.5).
7. **Independence of requests.** Handling one request must never wait for, block or change the handling of another (§3.9).
8. **Privacy.** Log entries carry method names and ids, but never `params` or results (§3.12).
9. **Performance.** Dispatch is a constant-time lookup. Results are handed to `postMessage` without copying or re-encoding. Serializing them is VS Code's job.

---

## 6. Test coverage

### 6.1 What the existing tests check

`tests/extension/rpc-server.test.ts`:

- A known method (`repo.scan`) resolving `{ repos: [] }` produces exactly one post: `{ kind: "rpc.response", id: "1", success: true, result: { repos: [] } }`.
- The unknown methods `repo.missing`, `toString` and `__proto__` each produce exactly one post, `{ kind: "rpc.response", id: "1", success: false, error: "Unknown RPC method: <name>" }`. The handler is not called and `logger.warn` is called exactly once.
- A handler rejecting `new Error("scan failed")` produces `error: "scan failed"`, and one rejecting the string `"plain failure"` produces `error: "plain failure"`. Each posts exactly once and calls `logger.error` exactly once.
- `null`, `"text"`, `{ command: "loadCommits" }` and `{ kind: "rpc.request" }` produce no post.
- Implicitly: the listener's promise settles after the post, because each test awaits it before asserting.

`tests/extension/view-command.test.ts` replaces the module with a mock. It checks only that the view command can call `createRpcServer().attach(...)` and gets something with a `dispose`.

Webview-side tests (`tests/webview/lib/actions/clipboard.test.ts`, `tests/webview/lib/rpc-client.test.ts`) check the client's request shape and its timeout. They do not exercise this module. The VS Code UI harness (`tests-ext/ui`, `pnpm run test:ext`) exercises the server end to end only indirectly: the graph cannot load unless `webview.initialize` and `repo.scan` are answered.

### 6.2 Gaps, with cases to add

Every case below uses the same fake webview and mocks as `tests/extension/rpc-server.test.ts`, unless it says otherwise. "Request(m, id, params)" means `{ kind: "rpc.request", id, method: m, params }`.

| #   | Behaviour                                   | Setup and input                                                                                                                                                                                                                                                                                                                           | Expected                                                                                                                                                                                                                               |
| --- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | `params` reaches the handler unchanged      | `repo.scan` mock resolves `true`; send Request("repo.scan", "1", P), where `P = { a: 1 }` is a fixed object                                                                                                                                                                                                                               | The handler is called once with exactly one argument, and that argument is `P` itself (`toBe`).                                                                                                                                        |
| G2  | Synchronous (non-promise) handler result    | `repo.scan` mock returns `{ repos: [] }` (not a promise)                                                                                                                                                                                                                                                                                  | Success response with `result: { repos: [] }`.                                                                                                                                                                                         |
| G3  | Falsy results are successes                 | The handler resolves, in turn, `false`, `0`, `""` and `null`                                                                                                                                                                                                                                                                              | Each posts `{ kind: "rpc.response", id: "1", success: true, result: <that value> }`.                                                                                                                                                   |
| G4  | Synchronous throw                           | The handler throws `new Error("sync")` without returning a promise                                                                                                                                                                                                                                                                        | Exactly one post, `{ …, success: false, error: "sync" }`; `logger.error` called once; the listener's promise resolves.                                                                                                                 |
| G5  | More thrown values                          | The handler rejects, in turn, `new TypeError("tt")`, `new Error("")`, `42`, `null`, `undefined`, `{ message: "x" }`                                                                                                                                                                                                                       | `error` is `"tt"`, `""`, `"42"`, `"null"`, `"undefined"`, `"[object Object]"` respectively.                                                                                                                                            |
| G6  | Unknown method writes no error log          | Request("repo.missing", "1", null)                                                                                                                                                                                                                                                                                                        | `logger.error` not called (in addition to the existing assertions).                                                                                                                                                                    |
| G7  | More unknown names                          | Methods `"constructor"`, `"hasOwnProperty"`, `""`, `"REPO.SCAN"`                                                                                                                                                                                                                                                                          | Each produces `error: "Unknown RPC method: <name>"` (for `""`, the text ends after the colon and space); the handler is not called.                                                                                                    |
| G8  | Success path logs no warn or error          | Known method resolves                                                                                                                                                                                                                                                                                                                     | `logger.warn` and `logger.error` not called.                                                                                                                                                                                           |
| G9  | Ignored messages log nothing                | The existing non-request messages, plus the ones in G10                                                                                                                                                                                                                                                                                   | `logger.debug`, `logger.warn` and `logger.error` not called; the handler not called.                                                                                                                                                   |
| G10 | Validation boundaries                       | a) `{ kind: "rpc.request", id: 1, method: "repo.scan", params: null }`; b) `{ kind: "rpc.request", id: "1", method: 5, params: null }`; c) `{ kind: "rpc.request", id: "1", method: "repo.scan" }` (no `params`); d) `{ kind: "rpc.response", id: "1", method: "repo.scan", params: null }`; e) `undefined`; f) `3`; g) `["rpc.request"]` | No post and no handler call for any of them.                                                                                                                                                                                           |
| G11 | Accepted edge requests                      | a) `{ kind: "rpc.request", id: "", method: "repo.scan", params: null }`; b) `{ kind: "rpc.request", id: "1", method: "repo.scan", params: undefined }`; c) Request("repo.scan", "1", null) with an extra property `extra: true`                                                                                                           | Each is answered with a success response carrying its own id (`""` for a).                                                                                                                                                             |
| G12 | Responses follow completion order           | The handler returns a promise that resolves when the test says so for id `"1"`, and resolves at once for id `"2"`. Send `"1"`, then `"2"`, await `"2"`'s listener promise, then release `"1"`.                                                                                                                                            | After `"2"` settles, only `"2"`'s response has been posted. After `"1"` resolves, the post order is `"2"`, `"1"`.                                                                                                                      |
| G13 | Duplicate ids                               | Two concurrent Request("repo.scan", "dup", null)                                                                                                                                                                                                                                                                                          | `postMessage` called twice, both times with id `"dup"`.                                                                                                                                                                                |
| G14 | `attach` returns a working disposable       | The fake's `onDidReceiveMessage` returns `{ dispose: spy }`                                                                                                                                                                                                                                                                               | `attach(...)` returns a value whose `dispose()` calls `spy` once.                                                                                                                                                                      |
| G15 | Nothing happens at creation or attach time  | `createRpcServer()`, then `attach(fake)`                                                                                                                                                                                                                                                                                                  | `onDidReceiveMessage` is called once, only by `attach`, with a single function argument; `postMessage` and the logger are not called.                                                                                                  |
| G16 | In-flight request after dispose             | Send a request whose handler resolves on command, dispose the attachment, then resolve with `"late"`                                                                                                                                                                                                                                      | One success response with `result: "late"` is posted. This pins current behaviour; see Q5.                                                                                                                                             |
| G17 | Independent attachments                     | One server, `attach` on two fake webviews A and B; deliver a request only to A's listener                                                                                                                                                                                                                                                 | Only A's `postMessage` is called.                                                                                                                                                                                                      |
| G18 | Success response cannot be delivered        | `postMessage` rejects `new Error("post failed")` once, then resolves `true`; handler resolves `"value"`                                                                                                                                                                                                                                   | Two posts: first the success response, then `{ kind: "rpc.response", id: "1", success: false, error: "post failed" }`; `logger.error` once; the listener resolves.                                                                     |
| G19 | Failure response cannot be delivered        | Handler rejects `new Error("x")`; `postMessage` always rejects `new Error("post dead")`                                                                                                                                                                                                                                                   | Exactly one post attempt; the listener's promise rejects with `post dead`.                                                                                                                                                             |
| G20 | Unknown-method response cannot be delivered | `postMessage` always rejects; unknown method                                                                                                                                                                                                                                                                                              | Exactly one post attempt; the listener rejects; `logger.warn` once.                                                                                                                                                                    |
| G21 | Responses carry no extra keys               | Any success and any failure                                                                                                                                                                                                                                                                                                               | `Object.keys` of the posted success response is exactly `kind`, `id`, `success`, `result`, and of the failure response exactly `kind`, `id`, `success`, `error`. `toEqual` alone would accept an extra key whose value is `undefined`. |
| G22 | Only allowed logger methods                 | Run G1 to G21 with a logger mock that has **only** `debug`, `warn` and `error` (as today)                                                                                                                                                                                                                                                 | No `TypeError` from calling a missing logger method. The existing mock already enforces this; keep it that way.                                                                                                                        |

---

## 7. Questions (current behaviour stated, no decision made)

- **Q1. A handler that resolves `undefined`.** Today the server posts a success response with a `result` key whose value is `undefined`. VS Code's JSON serialization drops that key. The webview then ignores the message as malformed, and the request fails only when the 30-second timeout fires. No current handler returns `undefined`, but the table's type would let a future `void` method do so. Should the server send `null` instead, treat `undefined` as an error, or leave it to handler authors?
- **Q2. Malformed requests are ignored silently.** A message with `kind: "rpc.request"` and a string `id` gets no answer and no log entry when `method` is not a string or `params` is missing. The client then waits 30 s. Should such a request get a failure response, or at least a warn entry, since its id is usable?
- **Q3. A delivery failure turns into a second response.** When the success response cannot be posted (for example, the result is not JSON-serializable), the server writes an error entry that reports the method as failed, and posts a failure response carrying the delivery error's message, for the same id. This reports serialization problems to the webview, which may be intended. But the log implies the handler failed when it did not, and two posts are attempted for one request. Should serialization or delivery failures be told apart from handler failures?
- **Q4. Delivery failures of failure responses escape.** When posting a failure response (handler error or unknown method) fails, or the second post in Q3 fails, the listener's promise rejects. That is an unhandled rejection in the extension host, and this module logs nothing about it. Should delivery errors be caught and logged instead?
- **Q5. Responses after dispose.** Requests that were already running when the attachment was disposed still post their responses, and the debug entry still reports them as sent. VS Code drops such posts, so this is harmless. Should the server stop posting once disposed?
- **Q6. No cancellation.** When the client times out after 30 s, the handler keeps running (for example, a long `repo.scan`) and its late response is thrown away. Is that acceptable, or should the protocol gain cancellation or a server-side timeout?
- **Q7. Error text for values that are not Errors.** A thrown plain object such as `{ message: "x" }` becomes `"[object Object]"`, which loses the message. An error created in another JavaScript realm does not count as an `Error` here, so it becomes `String(value)`, which includes the name prefix (for example `"Error: x"`). Handler messages go to the user unlocalized (for example, into "unable to initialize repository: {0}"). So does `Unknown RPC method: …`, although that one only appears when the webview and the extension disagree about the method list. Is any of this meant to change?
- **Q8. Thrown values that cannot be converted to strings.** If converting the thrown value to a string itself throws, nothing is posted, the listener rejects, and the client waits 30 s. Should there be a fallback message?
- **Q9. Unvalidated parameters.** `RpcMethodMap` declares a `params` type for each method, but the server passes whatever arrives straight through. Only `clipboard.copy` checks its input, and the others ignore theirs. Is per-method validation meant to be the server's job, or will it stay with the handlers?
- **Q10. Double attachment.** Attaching one webview twice, through one server or two, answers every request twice. Only the first answer takes effect. The caller avoids this today. Should `attach` guard against it?
- **Q11. Asymmetric debug logging.** A debug entry reporting that the response was posted is written after success responses and unknown-method responses, but not after handler-failure responses. Is that an oversight?
- **Q12. Inherited fields count as present.** Request recognition accepts `kind`, `id`, `method` and `params` found on the prototype chain. Messages from the webview are plain JSON objects, so this cannot happen in production. Should only own properties count?

---

## 8. Decisions on §7 (from the project maintainer's side)

These decisions replace the "current behaviour" wherever they differ. Build to these, and test the decided behaviour.

- **Q1: always send a result.** A handler that produces `undefined` gets a success response whose `result` is `null`, so the response survives JSON serialization and the webview resolves the request instead of timing out.
- **Q2: keep ignoring.** Messages that are not well-formed requests are ignored silently, with nothing posted or logged. Other message protocols share this webview's channel, so silence is required.
- **Q3: keep the second response, and say why.** When the success response cannot be posted, log one **error** entry that identifies it as a failure to deliver the response for that method, then post a failure response for the same id whose `error` is the delivery error's text. This lets the webview report a result that could not be sent instead of timing out.
- **Q4: never reject unhandled.** When a failure or unknown-method response cannot be posted, or the fallback failure response of Q3 cannot be posted, log one **error** entry and stop. The listener's promise always resolves; it never rejects.
- **Q5: nothing after disposal.** Once the attachment is disposed, responses to requests still in flight are not posted. Handlers still run to completion (no cancellation, per Q6).
- **Q6: keep.** No cancellation and no server-side timeout.
- **Q7: prefer a message.** The `error` text is: an `Error`'s `message`; otherwise, for any object whose `message` property is a string, that string (this also covers errors from another realm); otherwise JavaScript's standard string conversion of the value.
- **Q8: always answer.** If the thrown value cannot be converted to text, the `error` is the fixed text `Unknown error`. The request still gets its failure response.
- **Q9: out of scope.** Parameter validation stays the handlers' job.
- **Q10: keep.** Attaching a webview once is the caller's contract.
- **Q11: log every posted response.** Write one **debug** entry after each response is posted, including failure responses for handler errors.
- **Q12: own properties only.** A request's fields must be the message object's own properties.

With these, §3.8 changes: the listener's promise always resolves, after the response's post has settled (or immediately for an ignored message, or when disposal means nothing is posted).
