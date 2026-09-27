# Clean-room specification: `src/webview/lib/rpc/rpc-handler.ts`

This document describes what the webview's inbound RPC module has to do, as seen from outside it. It is for an engineer who will write a replacement without seeing the current source. Everything here comes from the module's callers, its tests, the RPC types, the extension code that produces the messages, and behaviour observed by running the current code.

In one sentence: the module listens for messages from the extension host. When a message answers a request the webview made earlier, the module settles that request. When a message announces something the extension noticed, the module passes it to the right webview action or store.

---

## 0. How the examples were observed

- Repository at commit `1cea67d` ("Open the graph when a setting changes while it loads"). That commit changed `applyWebviewConfig` in `src/webview/lib/actions.ts` and `updateWebviewConfig` in `src/webview/lib/webview-config.ts`. It did not touch this module.
- Node v22.22.2, Vitest 4.1.11, `jsdom` environment, and the repository's `tests/webview/setup.ts`, which replaces `acquireVsCodeApi` with a mock whose `postMessage`, `getState` and `setState` are spies (`getState` returns `undefined`).
- Messages were delivered with `window.dispatchEvent(new MessageEvent("message", { data }))`, which is synchronous. `window.postMessage(data, "*")` gives the same results, one task later.
- "Posted" below lists the messages the webview sent to the extension through the mocked `vscode.postMessage`. Only the fields that matter are shown.
- An exception thrown while a message is handled does not reach the code that called `dispatchEvent`. jsdom reports it as a window `error` event, and the examples list those errors under "listener error".

---

## 1. Interface

**Module path:** `src/webview/lib/rpc/rpc-handler.ts`, imported as `@/webview/lib/rpc/rpc-handler`.

Callers depend on exactly two exports. Their names and signatures must stay as shown. The module needs no other exports, and it must not have a default export that callers would need.

### 1.1 `export type PendingRpcRequest`

One request that the webview has sent and that is still waiting for its answer. The caller creates it, and this module settles it. It may be declared as a type alias or as an interface. It must have exactly these three fields, with these types:

| Field     | Type                            | Meaning                                                                                                                                                                                                                              |
| --------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `resolve` | `(value: unknown) => void`      | Settles the request as successful. This module calls it with the `result` value of a successful response.                                                                                                                            |
| `reject`  | `(value: unknown) => void`      | Settles the request as failed. This module always calls it with an `Error` instance (§3.3). The type stays `unknown` because the client also calls it with other values (a timeout `Error`, or whatever `vscode.postMessage` threw). |
| `timeout` | `ReturnType<typeof setTimeout>` | Handle of the timer the client started for this request's deadline. When the response arrives, this module cancels that timer with `clearTimeout`.                                                                                   |

The parameter names inside the function types do not matter.

### 1.2 `export function initRpcHandler(requests: Map<string, PendingRpcRequest>): void`

- Starts listening for RPC messages from the extension on the page's `window`, and keeps listening for the life of the page (§3.1).
- `requests` is the caller's table of requests that are still waiting, keyed by request id (the `id` string the webview put in its `rpc.request`). The caller owns the map, and both sides change it. The client adds entries and removes the ones that time out. This module removes each entry it settles. The module must use this map instance, and must look entries up when each message arrives, not only at call time: entries added after `initRpcHandler` returns must still be found.
- Returns `undefined`. There is no handle or disposer.
- Its parameter name does not matter.

### 1.3 Who uses what

| User                                          | Uses                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/webview/lib/rpc/rpc-client.ts`           | Both exports: `import { initRpcHandler, type PendingRpcRequest } from "@/webview/lib/rpc/rpc-handler"`. It keeps a single module-level map of pending requests and hands it to `initRpcHandler` from `rpcClient.init()`, which calls it at most once. For each `rpcClient.request(method, params)` the client makes an id with `crypto.randomUUID()`, stores a `PendingRpcRequest` whose timer fires after **30,000 ms**, and posts `{ kind: "rpc.request", id, method, params }`. When the timer fires, the client removes the entry, if it is still there, and rejects with the page shell's `rpcTimeout` text, whose `{0}` is replaced by the method name. If posting throws, the client cancels the timer, removes the entry and rejects with the thrown value. |
| `src/webview/main.tsx`                        | Indirect: `rpcClient.init()` runs at start-up, **before** `initDispatcher()` (the listener for legacy `command` messages), and before the `webview.initialize` request.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `tests/webview/lib/repo-selection.test.ts`    | `initRpcHandler`, imported statically. It is called once in `beforeAll` with `new Map()`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `tests/webview/lib/config-changed.test.ts`    | `initRpcHandler`, taken from a **dynamic** `await import("@/webview/lib/rpc/rpc-handler")` in `beforeAll`, after other modules were imported. It is called once with `new Map()`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `tests/webview/lib/actions/clipboard.test.ts` | Indirect: `setupWebviewTest({ dispatchMessages: true })` (in `tests/webview/test-utils.ts`) calls `rpcClient.init()`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

`scripts/provenance-baseline.json` records 50 inherited lines for this file. The rewrite lowers that number, as `docs/provenance.md` describes.

---

## 2. Dependencies the implementation must use

### 2.1 Repository imports

| Import path                            | Name(s)                                       | Use                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@/types`                              | `RpcResponse`, `RpcNotification` (type-only)  | The message shapes, defined in `src/types/rpc.types.ts`. `RpcNotificationMap` and `RpcNotificationName` from the same place may also be used. Because `verbatimModuleSyntax` is on, type-only imports must be written with `import type` or the `type` modifier.                                                        |
| `@/webview/lib/actions`                | `selectRepo`, `refresh`, `applyWebviewConfig` | This path resolves to the **file** `src/webview/lib/actions.ts`, not to the `src/webview/lib/actions/` directory. `selectRepo(repo: string)` switches the graph to a repository. `refresh()` reloads the selected repository's graph. `applyWebviewConfig(config: WebviewConfig)` applies changed settings and reloads. |
| `@/webview/lib/navigation`             | `showPane`                                    | `showPane(pane: SidebarPane)` opens one of the panes beside the graph and saves that choice in the webview state.                                                                                                                                                                                                       |
| `@/webview/lib/load-repos`             | `loadRepoList`                                | `loadRepoList(): Promise<void>` scans for repositories again. It never rejects: it stores a failure's message in its own `repoListError` signal.                                                                                                                                                                        |
| `@/webview/lib/stores`                 | `selectedRepo`                                | Resolves to the file `src/webview/lib/stores.ts`. A Preact signal holding the selected repository path, or `undefined`.                                                                                                                                                                                                 |
| `@/webview/lib/stores/repo-list.store` | `repoListStore`                               | `repoListStore.add(repo: GitRepo)` puts a repository into the picker list. It replaces an entry with the same `path` and keeps the list sorted by path.                                                                                                                                                                 |

No other repository module is needed. The module does **not** need the VS Code API (`@/webview/lib/vscode`), localized text, or any logger, because it never sends anything to the extension and never shows text.

### 2.2 Platform APIs

- `window.addEventListener("message", …)`. The listener must be on `window`: the extension's messages arrive there, and the tests dispatch there. The payload is the event's `data`, which is typed `unknown` and must be treated as untrusted.
- `clearTimeout`, to cancel a settled request's deadline timer.
- `Error`, to build the rejection value.

### 2.3 Message contracts

VS Code delivers each message the extension posts to the webview as the `data` of a `message` event, as plain structured data. Three kinds of message arrive on the same event:

1. **RPC responses** (this module).
2. **RPC notifications** (this module).
3. **Legacy protocol messages**, which are objects with a string `command` field. The separate dispatcher in `src/webview/lib/dispatcher.ts` handles them, and this module must leave them alone.

#### RPC response

Sent by `src/extension/rpc/rpc-server.ts`, exactly once for every `rpc.request` the webview posts. The `id` is copied from the request.

| Field     | Value on success                                           | Value on failure                                                                                                                                                                                        |
| --------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kind`    | `"rpc.response"`                                           | `"rpc.response"`                                                                                                                                                                                        |
| `id`      | the request's id (a UUID string)                           | the request's id                                                                                                                                                                                        |
| `success` | `true`                                                     | `false`                                                                                                                                                                                                 |
| `result`  | the method's result (see `RpcMethodMap` in `rpc.types.ts`) | absent                                                                                                                                                                                                  |
| `error`   | absent                                                     | a string: `"Unknown RPC method: <method>"` for a method the extension does not know, otherwise the thrown `Error`'s `message`, or `String(thrownValue)` when something other than an `Error` was thrown |

The methods today are `clipboard.copy`, `webview.initialize`, `git.init`, `repo.scan`, `settings.open`, `docs.open` and `walkthrough.open`. All of them return a defined value, either a boolean or an object.

#### RPC notification

Sent by `rpcNotify.notify(name, message)` in `src/extension/rpc/rpc-notify.ts`. It is dropped on the extension side when no webview is attached.

| Field     | Value                                                                             |
| --------- | --------------------------------------------------------------------------------- |
| `kind`    | `"rpc.notify"`                                                                    |
| `id`      | a fresh random UUID string. The webview has no use for it.                        |
| `name`    | one of the names below                                                            |
| `message` | the payload for that name. It is always present, and is `null` for `repo.rescan`. |

| `name`           | Payload type (from `RpcNotificationMap`)                                | Who sends it and when                                                                                                                                                                                                                                                                                                            |
| ---------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `view.showPane`  | `{ pane: SidebarPane }`, where `SidebarPane` is `"refs" \| "workspace"` | `src/extension/view-command.ts`, when the `branchwise.showBranches` command runs (always `"refs"` today). Sent only after the webview has posted `{ command: "viewReady" }`.                                                                                                                                                     |
| `repo.select`    | `GitRepo` = `{ name: string; path: string }`                            | `src/extension/view-command.ts`, when the user opens the graph from a Source Control repository. `path` is normalized by the extension, and `name` is its base name. Sent only after `viewReady`. It may be followed at once by a legacy `{ command: "fileHistory", repo, path }` message for the same repository.               |
| `repo.rescan`    | `null`                                                                  | `src/extension/watchers/config.watcher.ts` (the `git.path` or `branchwise.maxDepthOfRepoSearch` setting changed) and `src/extension/watchers/git.watcher.ts` (a `.git` directory appeared or disappeared, or workspace folders changed). It can arrive at any time after the panel exists, even before the page has initialized. |
| `config.changed` | `WebviewConfig` (from `src/types/config.ts`)                            | `src/extension/watchers/config.watcher.ts`, after any `branchwise.*` setting changes. It carries the whole current configuration. It can arrive at any time, even before the page has initialized.                                                                                                                               |
| `repo.updated`   | `RepoUpdate` = `{ path: string }`                                       | `src/extension/watchers/git-repo.watcher.ts`, after files in the watched repository change, debounced by **250 ms** on the extension side. The extension watches the path the webview last sent in `{ command: "selectRepo", repo }`, so `path` is the same string the webview holds in `selectedRepo`.                          |

---

## 3. Behaviour

### 3.1 Installing the listener, and how long it lives

- Importing the module must have **no side effects**. In particular it must not start listening on import. Tests import it first and call `initRpcHandler` later, and the client decides when to call it.
- Each call to `initRpcHandler` starts listening immediately, before it returns. Messages dispatched after the call are handled; messages dispatched before it are not.
- The listener stays for the life of the page. There is no way to stop it, and callers do not expect one.
- Each call adds **another, independent** listener. Observed with two calls: one `repo.rescan` notification caused **two** `repo.scan` requests. When two listeners share one map, a response is still settled only once, because the first listener removes the entry before the second one looks for it. Protection against a double call is the client's job (`rpcClient.init` guards itself). See Question Q4.
- An exception thrown while one message is handled must not stop the listener: later messages are handled normally (observed).

### 3.2 Telling message kinds apart

Every `message` event is either an RPC response, an RPC notification, or neither. The first two can never overlap, because their `kind` values differ.

**An RPC response** is accepted only when `data` is a non-null object and all of these hold:

| Requirement                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `kind` is exactly the string `"rpc.response"`.                                                                                                               |
| `id` is a string. The empty string counts.                                                                                                                   |
| `success` is a boolean. The strings `"true"`/`"false"`, `0`/`1`, or a missing field do not count.                                                            |
| If `success` is `true`: a `result` property exists. Its value can be anything, including `null` or `undefined`, but the property itself must be there.       |
| If `success` is `false`: an `error` property exists and its value is a string. The empty string counts. A number, an object or a missing field do not count. |

Other properties are ignored. A failure response that also has a `result` is still a failure, and a success response that also has an `error` is still a success. Whether `result` may also be found on the prototype chain does not matter: host messages are plain data. Today an inherited `result` is accepted.

**An RPC notification** is accepted only when `data` is a non-null object and all of these hold:

| Requirement                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------- |
| `kind` is exactly the string `"rpc.notify"`.                                                                                    |
| `id` is a string. The empty string counts. Its value is otherwise ignored.                                                      |
| `name` is a string.                                                                                                             |
| A `message` property exists. Its value is not checked, so `null` and `undefined` both count as long as the property is present. |

**Anything else** is ignored silently: no effect, no exception, no console output, and the pending-request table is untouched. This covers `null`, `undefined`, strings, numbers, arrays, legacy `{ command: … }` messages, the webview's own `rpc.request` shape, and objects that almost match (for example a `kind` of `"rpc.notification"`). An object that carries both a legacy `command` and a valid notification envelope is treated as a notification here, and the legacy dispatcher also sees it on its own listener. The extension never sends such a message.

### 3.3 Responses

When an accepted response arrives:

1. **Matching.** The response goes to the pending request whose key in `requests` equals its `id`, compared as an exact string. The key is looked up when the message arrives. A notification never settles a request, even when its `id` happens to equal a pending request's id.
2. **No match.** If `requests` has no entry for that `id`, the response is ignored silently: no exception and no change to other entries. This covers:
   - ids the webview never issued;
   - a **second or later response** for an id that was already settled;
   - a **late response**, for a request the client already rejected after its 30,000 ms deadline and removed.
3. **Settling.** If an entry exists:
   - The entry is **removed** from `requests`, and **only** that entry. Other pending requests stay untouched.
   - Its `timeout` timer is **cancelled**, so the client's deadline can no longer fire for this request.
   - Both of the above must have happened by the time `resolve` or `reject` is invoked. Observed: inside the callback, `requests.has(id)` is already `false`. So if the callback throws, the entry is still gone and the timer is still cancelled.
   - **Success** (`success: true`): `resolve` is called once, with the message's `result` value exactly as delivered. The value is not copied, validated or transformed. `null` and `undefined` are passed through unchanged.
   - **Failure** (`success: false`): `reject` is called once, with a **new plain `Error`** whose `message` is exactly the response's `error` string (the empty string included). Its `name` is `"Error"` and its constructor is `Error`. It has no extra own properties and no `cause`. The request's method name and id are not added.
   - `resolve` and `reject` are never both called, and neither is called twice for one entry.
4. **Malformed responses** (a `kind` of `"rpc.response"` that fails any rule in §3.2) are ignored entirely, **even when their `id` matches a pending request**. That request stays pending until a well-formed response arrives or the client's 30,000 ms deadline rejects it. See Question Q2.

The module has **no timeout of its own**. The deadline belongs to the client (30,000 ms). What the module adds is that a response arriving before the deadline cancels it. Observed: a response at 29,999 ms resolves the request, and no rejection follows even after another 60,000 ms. A response arriving after the deadline finds no entry and is ignored.

### 3.4 Notifications

Each accepted notification causes exactly one of the following, chosen by `name`. Names are compared exactly and are case-sensitive.

| `name`           | Effect                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `view.showPane`  | Calls `showPane` with the payload's `pane` value. Nothing else happens.                                                                                                                                                                                                                                                                                                                                                                                                              |
| `repo.select`    | Calls `repoListStore.add` with the **whole payload object** (`{ name, path }`), and **then** calls `selectRepo` with the payload's `path`. The repository must be in the picker list by the time the selection is made. `selectRepo` does nothing when that path is already selected, but the list update still happens. A repository missing from the last scan therefore becomes selectable, and an existing entry with the same path is replaced (for example with a new `name`). |
| `repo.rescan`    | Starts `loadRepoList()` and does **not** wait for it. The payload is ignored, whatever it is. The listener returns while the scan request is still out. The scan's own result or failure is handled inside `loadRepoList` and the repository-list store. Nothing about it comes back to this module, and there is no unhandled rejection. Nothing coalesces or cancels an earlier rescan: each notification starts a new `repo.scan` request.                                        |
| `config.changed` | Calls `applyWebviewConfig` with the **whole payload object**. Anything that follows is the action's own behaviour: it stores the new configuration, raises `maxCommits` to the new `initialLoadCommits` if that is larger, then reloads the selected repository. Since `1cea67d` it ignores a change that arrives before the page has its first configuration. This module passes the notification on whether or not the page has initialized.                                       |
| `repo.updated`   | Reads the **current** value of `selectedRepo` when the message is handled. If the payload's `path` is **strictly equal** to it, calls `refresh()` once. Otherwise, including when no repository is selected, nothing happens. There is no path normalization: `"/a/"` does not match `"/a"`.                                                                                                                                                                                         |
| anything else    | Ignored silently: no exception and no console output. The extension and webview may be built at different times during development, so an unknown name must never be an error.                                                                                                                                                                                                                                                                                                       |

**Payload validation.** Beyond the envelope rules in §3.2, the module does not check payloads today. When a payload has the wrong shape, the action it is passed to fails as that action happens to fail. The exception escapes the message listener: the browser reports it as an uncaught error, and it does not reach the dispatcher of the event. Side effects that happened before the failure stay in place. Observed cases are in §4.4. See Question Q1.

### 3.5 Ordering guarantees

- **Synchronous handling.** All the work for a message is done while its `message` event is being dispatched, apart from the asynchronous rest of a `repo.rescan` scan. A response's `resolve` or `reject` is **called** during the dispatch (observed order: "resolve", then "after dispatch"). A notification's store changes and outgoing messages have already happened when `dispatchEvent` returns. Tests depend on this. For example, `repo-selection.test.ts` checks `selectedRepo` straight after `dispatchEvent`, without awaiting. Code that awaits the client's promise still resumes in a later microtask, as promises always do.
- **Arrival order.** Messages are handled one at a time, in the order they arrive. Nothing is queued, batched, debounced or reordered. This matters when the extension sends `repo.select` and then a legacy `fileHistory` message for the same repository: the selection must be finished before the dispatcher handles `fileHistory`.
- **Responses can arrive in any order.** They are matched by id, not by request order. Observed: with requests A then B pending, a response for B settles B while A stays pending, and a later response for A settles A.
- **Listener order.** Because the listener is registered when `initRpcHandler` is called, it runs before any listener registered later, such as the legacy dispatcher's in `main.tsx`. No current behaviour relies on this, since a message is never both kinds.

### 3.6 Re-entrancy

A `resolve` or `reject` callback, or an action a notification triggers, can dispatch further `message` events synchronously. Each nested message must be handled completely and correctly. Observed: inside the `resolve` for request A, dispatching a second response for A was ignored (A was already removed), and dispatching a response for B settled B before A's callback went on.

### 3.7 What the module never does

- Never sends messages to the extension. Any outgoing traffic comes from the actions and stores it calls.
- Never adds entries to `requests`, and never removes any entry other than the one it is settling.
- Never logs, and never shows text.
- Never throws out of `initRpcHandler`.

---

## 4. Concrete examples (observed)

### 4.1 Responses (a hand-made map entry with spy callbacks; the timer is a real `setTimeout` of 30,000 ms)

| Pending ids | `data` dispatched                                                                                  | Observed effect                                                                                                                                                |
| ----------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `a`         | `{ kind: "rpc.response", id: "a", success: true, result: { x: 1 } }`                               | `resolve({ x: 1 })` once. Entry `a` removed. Pending fake-timer count went from 1 to 0. Advancing 60 s afterwards changed nothing.                             |
| `b`         | `{ kind: "rpc.response", id: "b", success: false, error: "boom" }`                                 | `reject(e)` once, where `e instanceof Error`, `e.name === "Error"`, `e.message === "boom"`, `Object.keys(e)` is empty, and there is no `cause`. Entry removed. |
| `b2`        | `{ kind: "rpc.response", id: "b2", success: false, error: "" }`                                    | `reject` with an `Error` whose message is `""`.                                                                                                                |
| `c`         | Three messages in a row for `c`: success `result: 1`, success `result: 2`, failure `error: "late"` | Only `resolve(1)`. The other two are ignored.                                                                                                                  |
| `d`         | `{ kind: "rpc.response", id: "zzz", success: true, result: 1 }`                                    | Nothing. No exception. `d` stays pending.                                                                                                                      |
| `m`         | `{ kind: "rpc.response", id: "m", success: true, result: undefined }`                              | `resolve(undefined)`. Entry removed.                                                                                                                           |
| `m`         | `{ kind: "rpc.response", id: "m", success: true, result: null }`                                   | `resolve(null)`.                                                                                                                                               |
| `m`         | `{ kind: "rpc.response", id: "m", success: false, result: 1, error: "e" }`                         | `reject(Error("e"))`.                                                                                                                                          |
| `m`         | `{ kind: "rpc.response", id: "m", success: true, result: 1, error: "e" }`                          | `resolve(1)`.                                                                                                                                                  |
| `x`, `y`    | success response for `y`                                                                           | Only `y` resolved. Afterwards the map holds only `x`.                                                                                                          |

Each of the following left `m` pending, called nothing, and threw nothing:

- `{ kind: "rpc.response", id: "m", success: true }` (no `result`)
- `{ …, success: false, error: 42 }`
- `{ …, success: false }`
- `{ …, success: false, error: { message: "x" } }`
- `{ …, success: false, result: 1 }`
- `{ …, success: "true", result: 1 }`
- `{ kind: "rpc.response", id: "m", result: 1 }` (no `success`)
- `{ kind: "rpc.response", id: 5, success: true, result: 1 }`
- a response with no `id`
- `{ kind: "rpc.request", id: "m", success: true, result: 1 }`
- a response with no `kind`
- `"rpc.response"`, `null`, `3`, `[]`, `undefined`
- `{ command: "loadBranches", id: "m" }`
- the notification `{ kind: "rpc.notify", id: "m", name: "something.unknown", message: null }`, even though its id equals the pending id

### 4.2 Responses through the real client (`rpcClient.init()`, with `document.documentElement.dataset.rpcTimeout = "No response: {0}"`)

| Scenario                                                                                                         | Observed                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `request("clipboard.copy", "x")`, fake timers advanced by 29,999 ms, then a success response with `result: true` | Resolves with `true`. Pending timer count is 0. Advancing another 60,000 ms causes no rejection.                                   |
| `request("clipboard.copy", "x")`, fake timers advanced by 30,000 ms, then a success response for that id         | Rejected with `"No response: clipboard.copy"` at 30,000 ms. The later response is ignored, with no error and no second settlement. |
| `request("repo.scan", null)`, then `{ success: false, error: "Unknown RPC method: repo.scan" }` for its id       | Rejects with an `Error` whose message is `"Unknown RPC method: repo.scan"`.                                                        |
| `request("settings.open")` (A), then `request("docs.open")` (B). Respond to B, then to A.                        | B settles first and A stays pending. Then A settles. Final order: B, A.                                                            |

### 4.3 Notifications (configuration initialized with `initialLoadCommits: 300`; each row starts with posted messages cleared)

| State before                                   | `data` dispatched                                                                                  | Observed effect                                                                                                                                                                                                                              |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| refs pane visible, workspace pane hidden       | `{ kind: "rpc.notify", id: "n", name: "view.showPane", message: { pane: "refs" } }`                | No change. `vscode.setState` not called. Nothing posted.                                                                                                                                                                                     |
| same                                           | `… name: "view.showPane", message: { pane: "workspace" }`                                          | Workspace pane becomes visible. `vscode.setState` called once, with navigation state `{ repos: {}, workspace: true }`. Nothing posted. Repeating the message: no further `setState`.                                                         |
| no repo selected, picker list `undefined`      | `… name: "repo.select", message: { name: "b", path: "/b" }`                                        | Picker list `[{ name: "b", path: "/b" }]`. `selectedRepo` is `"/b"`. Posted, in order: `selectRepo /b`, `loadBranches /b`, `repositoryQuery /b`.                                                                                             |
| `/b` selected                                  | `… name: "repo.select", message: { name: "a", path: "/a" }`                                        | List `[{a,/a}, {b,/b}]` (sorted by path). `selectedRepo` is `"/a"`. Posted: `cancelRepositoryQuery /b`, `selectRepo /a`, `loadBranches /a`, `repositoryQuery /a`.                                                                            |
| `/a` selected                                  | `… name: "repo.select", message: { name: "a-renamed", path: "/a" }`                                | List `[{a-renamed,/a}, {b,/b}]`. Selection unchanged. **Nothing posted.**                                                                                                                                                                    |
| `/a` selected, branch `main`                   | `… name: "repo.updated", message: { path: "/a" }`                                                  | Posted: `loadBranches /a`, `cancelRepositoryQuery /a`, `repositoryQuery /a`, `loadCommits /a` (branch `main`, `maxCommits` 300).                                                                                                             |
| `/a` selected, no branch selected              | same                                                                                               | Posted: `loadBranches /a`, `cancelRepositoryQuery /a`, `repositoryQuery /a`. No `loadCommits`.                                                                                                                                               |
| `/a` selected                                  | `… name: "repo.updated", message: { path: "/b" }`, and also `{ path: "/a/" }`                      | Nothing posted in either case.                                                                                                                                                                                                               |
| nothing selected                               | `… name: "repo.updated", message: { path: "/a" }`                                                  | Nothing posted.                                                                                                                                                                                                                              |
| `/a` selected, branch `main`, `maxCommits` 300 | `… name: "config.changed", message: { …config, initialLoadCommits: 500, dateFormat: "Date Only" }` | `getWebviewConfig()` returns the payload object. `maxCommits` is 500. Posted: `loadBranches /a`, `cancelRepositoryQuery /a`, `repositoryQuery /a`, `loadCommits /a` with `maxCommits` 500.                                                   |
| same, `maxCommits` 500                         | `… name: "config.changed", message: { …config, initialLoadCommits: 50 }`                           | `maxCommits` stays 500. The same four messages are posted (with `maxCommits` 500).                                                                                                                                                           |
| nothing selected, `maxCommits` 500             | `… name: "config.changed", message: { …config, initialLoadCommits: 900 }`                          | Configuration updated (900). `maxCommits` is 900. Nothing posted.                                                                                                                                                                            |
| configuration **not** initialized              | `… name: "config.changed", message: { …config, initialLoadCommits: 777 }`                          | No error. `getWebviewConfig()` still throws "Webview configuration is not initialized". A later `initializeWebviewConfig` succeeds. Nothing posted. (This is the action's behaviour since `1cea67d`.)                                        |
| `repoListError` is `"old error"`               | `… name: "repo.rescan", message: null`                                                             | `repoListError` is `undefined` at once. Posted: `{ kind: "rpc.request", method: "repo.scan", params: null }` with a new id. A success response `{ repos: [{ name: "z", path: "/z" }] }` for that id then makes the picker list exactly that. |
| list `[{z,/z}]`                                | `repo.rescan`, then a failure response `error: "scan failed"` for the new request                  | `repoListError` is `"scan failed"`. The list stays `[{z,/z}]`.                                                                                                                                                                               |
| any                                            | `repo.rescan` with `message: undefined` present, or with `message: { anything: true }`             | One `repo.scan` request is posted, as with `null`.                                                                                                                                                                                           |
| any                                            | `repo.rescan` envelope with **no** `message` property                                              | Ignored. Nothing posted.                                                                                                                                                                                                                     |

Envelope checks. With `/a` selected and branch `main`, each of the following posted **nothing**:

- a `repo.updated` notification with no `id`;
- one with `id: 1`;
- one with no `name`;
- one with `name: 3`;
- one with `kind: "rpc.notification"`;
- `name: "repo.deleted"`;
- `name: "Repo.Updated"`.

These were handled like a normal `repo.updated` (the four refresh messages were posted):

- `id: ""`;
- extra `success`/`result` fields on an `rpc.notify` message;
- an additional `command: "refresh"` field.

### 4.4 Malformed notification payloads (current behaviour; see Q1)

| `data` dispatched                                                            | Observed                                                                                                                                                                      |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `view.showPane` with `message: null`                                         | Listener error `TypeError: Cannot read properties of null (reading 'pane')`. No state change.                                                                                 |
| `view.showPane` with `message: { pane: "bogus" }` or `message: {}`           | **The workspace pane opens**, because the navigation module treats any pane other than `"refs"` as the workspace pane. No error.                                              |
| `repo.select` with `message: null` while the picker list is non-empty        | Listener error (`reading 'path'`). List and selection unchanged.                                                                                                              |
| `repo.select` with `message: { name: "nopath" }` while the list is non-empty | Listener error (`reading 'localeCompare'`). List and selection unchanged. Nothing posted.                                                                                     |
| `repo.updated` with `message: null`                                          | Listener error (`reading 'path'`).                                                                                                                                            |
| `config.changed` with `message: null` after initialization                   | Listener error (`reading 'initialLoadCommits'`). **The stored configuration is now `null`**: `getWebviewConfig()` returns `null` instead of throwing. `maxCommits` unchanged. |
| Any of the above, followed by a valid response for a pending request         | The response is handled normally. The listener survives.                                                                                                                      |

### 4.5 Two listeners

`rpcClient.init()`, plus one more `initRpcHandler(new Map())`, then one `repo.rescan` notification: **two** `{ kind: "rpc.request", method: "repo.scan", params: null }` messages are posted. With two listeners sharing one map, a success response calls `resolve` once.

---

## 5. Non-functional requirements

1. **No import-time side effects, and no top-level use of imports.** The module is part of an import cycle: `rpc-client` imports this module, this module imports `load-repos` and `repo-list.store`, and `repo-list.store` imports `rpc-client`. Imported bindings may therefore still be uninitialized while this module is being evaluated. Use them only inside `initRpcHandler` and in code that runs when a message arrives. Do not register the listener, read a signal, or call an action when the module loads.
2. **Resource cleanup.** For every request it settles, the module must remove the table entry and cancel its timer, so no settled request keeps a timer or a map entry alive. It must hold no reference of its own to settled entries, payloads or results after the message has been handled. The one lasting resource is the `window` listener, which is expected to live as long as the page.
3. **Synchronous and in order.** See §3.5. Do not defer handling with microtasks, timers, `requestAnimationFrame` or signal batching of your own. The tests and the `repo.select` then `fileHistory` sequence rely on the effects being complete when the event dispatch returns.
4. **Re-entrancy.** See §3.6. Settling must leave the table consistent before any caller-supplied callback runs.
5. **Robustness at the boundary.** Event data is untrusted. Classifying a message must never throw, whatever `data` holds, including `null`, primitives, arrays and objects with odd property types. Messages that do not match must be ignored without logging.
6. **Coexistence.** Do not call `stopPropagation`, `stopImmediatePropagation` or `preventDefault` on the event. The legacy dispatcher listens to the same event and must receive every message.
7. **Constant cost per message.** Handling one message looks up one table entry, whatever the number of pending requests. The module sets no limit on how many requests may be pending.
8. **Toolchain.** The file must pass `tsc -p src/webview` under the repository's strict settings (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`, `isolatedModules`) and `pnpm run lint` (oxlint). It holds no user-visible text, so there is nothing to localize.

---

## 6. Test coverage

### 6.1 What existing tests already check

| Test file                                                                                                                                  | What it establishes about this module                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/webview/lib/repo-selection.test.ts`                                                                                                 | `repo.select` switches the selected repository **synchronously**: `selectedRepo` is the new path, `selectedBranch` and `commitList` are cleared, and exactly the expected `loadBranches` message is posted. Sending the same `repo.select` twice leaves exactly one picker entry `{ name: "child", path: "/workspace/child" }`. |
| `tests/webview/lib/config-changed.test.ts`                                                                                                 | `config.changed` passes the payload to the settings-application action. An open commit row re-renders with the new date format, `loadCommits` is posted with `maxCommits` 500 and `loadBranches` for `/repo`, and a later smaller `initialLoadCommits` keeps 500.                                                               |
| `tests/webview/lib/actions/clipboard.test.ts`                                                                                              | A success response with `result: false`, sent to the id of a real client request, resolves that request with `false` (the caller then opens its error dialog). The module is installed through `rpcClient.init()`.                                                                                                              |
| `tests/webview/lib/rpc-client.test.ts`                                                                                                     | Only the client's 30,000 ms timeout and its localized message. It never installs this module.                                                                                                                                                                                                                                   |
| `tests/webview/lib/webview-config.test.ts`                                                                                                 | That `applyWebviewConfig` ignores a change arriving before initialization. It calls the action directly, not through this module.                                                                                                                                                                                               |
| `tests/extension/rpc-server.test.ts`, `config-watcher.test.ts`, `git-watcher.test.ts`, `git-repo-watcher.test.ts`, `webviewBridge.test.ts` | The extension side of the contract: the response shapes, the failure texts, and which notifications are sent when. None of them run this module.                                                                                                                                                                                |
| `tests-ext/ui/history.test.cjs` (VS Code UI harness, not part of `pnpm test`)                                                              | End to end, `openRepo` opens the graph through a Source Control root and waits for the header to show that repository, so every UI scenario depends on `repo.select` working in a real webview.                                                                                                                                 |

### 6.2 Gaps, and tests to add

Suggested home: a new `tests/webview/lib/rpc-handler.test.ts` with `// @vitest-environment jsdom`. Tests that reach actions need `initializeWebviewConfig(…)` first (see `tests/webview/test-utils.ts`). "Send X" means `window.dispatchEvent(new MessageEvent("message", { data: X }))`. "A pending entry" means an entry added to the map given to `initRpcHandler`, with spy `resolve`/`reject` and a real or fake `setTimeout` handle.

| #   | Behaviour (spec section)                       | Input                                                                                                                                                                                           | Expected                                                                                                                                                                                                                                                      |
| --- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | Success settles, removes, cancels (§3.3)       | Fake timers. Pending entry `a` whose timer is a 30,000 ms spy. Send `{ kind: "rpc.response", id: "a", success: true, result: { x: 1 } }`, then advance 60,000 ms.                               | `resolve` called once with an object equal to `{ x: 1 }`. `reject` never called. `map.has("a")` is false. The timer spy never fires.                                                                                                                          |
| G2  | Failure becomes an `Error` (§3.3)              | Pending `b`. Send `{ kind: "rpc.response", id: "b", success: false, error: "boom" }`.                                                                                                           | `reject` called once with an `Error` whose `message` is `"boom"`. `resolve` never called. Entry removed.                                                                                                                                                      |
| G3  | Unknown id is ignored (§3.3)                   | Pending `d`. Send a success response for `"zzz"`.                                                                                                                                               | No callback called. No exception. `map.has("d")` is still true.                                                                                                                                                                                               |
| G4  | Duplicate or late response is ignored (§3.3)   | Pending `c`. Send success `result: 1`, then success `result: 2`, then failure `error: "late"`, all for `c`.                                                                                     | `resolve` called exactly once, with 1. `reject` never called.                                                                                                                                                                                                 |
| G5  | Response after the client deadline (§3.3)      | Fake timers. `rpcClient.init()`. `rpcClient.request("clipboard.copy", "x")`. Advance 30,000 ms. Then send a success response for the posted id.                                                 | The promise rejects with the timeout text. The later response causes no error and no second settlement.                                                                                                                                                       |
| G6  | Response just before the deadline (§3.3)       | As G5, but advance only 29,999 ms before responding with `result: true`, then advance another 60,000 ms.                                                                                        | Resolves with `true`. No rejection. `vi.getTimerCount()` is 0 after settling.                                                                                                                                                                                 |
| G7  | Malformed responses are ignored (§3.2, §3.3)   | Pending `m`. For each of: no `result` with `success: true`; `error: 42`; no `error` with `success: false`; `success: "true"`; `id: 5`; no `kind`; `kind: "rpc.request"`.                        | For each: no callback, no exception, `m` still pending.                                                                                                                                                                                                       |
| G8  | `null` and `undefined` results (§3.3)          | Pending `m`. Send success with `result: null`. Separately, success with the `result` property set to `undefined`.                                                                               | `resolve(null)` and `resolve(undefined)` respectively. Entry removed.                                                                                                                                                                                         |
| G9  | Non-RPC data is ignored (§3.2)                 | With `vscode.postMessage` cleared, send each of `null`, `undefined`, `"text"`, `3`, `[]`, `{ command: "loadBranches" }`.                                                                        | `dispatchEvent` does not throw. No `error` event on window. Nothing posted. The map is unchanged.                                                                                                                                                             |
| G10 | Notification id never settles a request (§3.3) | Pending `n1`. Send `{ kind: "rpc.notify", id: "n1", name: "repo.rescan", message: null }`.                                                                                                      | `n1` still pending. Neither callback called.                                                                                                                                                                                                                  |
| G11 | `view.showPane` (§3.4)                         | Fresh module state (refs visible, workspace hidden). Send `view.showPane` with `{ pane: "workspace" }`.                                                                                         | `workspaceVisible.value` is true. `vscodeApi.setState` called with `navigation.workspace === true`. Sending `{ pane: "refs" }` changes nothing and calls `setState` no more.                                                                                  |
| G12 | `repo.rescan` (§3.4)                           | `rpcClient.init()`. Set `repoListError.value = "old"`. Send `repo.rescan` with `message: null`. Answer the posted `repo.scan` id with `{ repos: [{ name: "z", path: "/z" }] }` and wait a tick. | Exactly one `{ kind: "rpc.request", method: "repo.scan", params: null }` posted. `repoListError.value` is `undefined` right after dispatch. `repoListStore.get()` equals `[{ name: "z", path: "/z" }]`.                                                       |
| G13 | `repo.updated` matching (§3.4)                 | `selectedRepo = "/a"`, `selectedBranch = "main"`. Send `repo.updated` `{ path: "/a" }`.                                                                                                         | Before `dispatchEvent` returns, the posted messages include `loadBranches` for `/a`, `repositoryQuery` for `/a`, and `loadCommits` for `/a` with `branchName` `main`. A `cancelRepositoryQuery` also appears if an earlier state query was still outstanding. |
| G14 | `repo.updated` not matching (§3.4)             | `selectedRepo = "/a"`. Send `{ path: "/b" }`, then `{ path: "/a/" }`. Then set `selectedRepo = undefined` and send `{ path: "/a" }`.                                                            | Nothing posted in any of the three cases.                                                                                                                                                                                                                     |
| G15 | `repo.select` for the selected repo (§3.4)     | `selectedRepo = "/a"`, picker list contains `{ name: "a", path: "/a" }`. Send `repo.select` `{ name: "a-renamed", path: "/a" }`.                                                                | Picker entry for `/a` now has `name` `"a-renamed"`. `selectedRepo` unchanged. Nothing posted.                                                                                                                                                                 |
| G16 | Unknown notification name (§3.4)               | Send `{ kind: "rpc.notify", id: "x", name: "repo.deleted", message: { path: "/a" } }` with `/a` selected.                                                                                       | No exception. No window `error` event. Nothing posted.                                                                                                                                                                                                        |
| G17 | Notification envelope checks (§3.2)            | With `/a` selected, send `repo.updated` `{ path: "/a" }` variants: no `id`; `id: 1`; no `name`; `name: 3`; no `message` property; `kind: "rpc.notification"`.                                   | Nothing posted for any variant. A control message with `id: ""` does post the refresh messages.                                                                                                                                                               |
| G18 | Responses out of order (§3.5)                  | `rpcClient.init()`. Request A (`settings.open`), then B (`docs.open`). Respond to B, then to A.                                                                                                 | B resolves while A is still pending. Then A resolves.                                                                                                                                                                                                         |
| G19 | Entry removed before the callback runs (§3.6)  | Pending `r` whose `resolve` records `map.has("r")` and then sends a second success response for `r` and a response for another pending entry `s`.                                               | The recorded value is false. `r`'s `resolve` runs once. `s` is settled during `r`'s callback.                                                                                                                                                                 |
| G20 | Listener survives a failing payload (§3.1)     | Add a window `error` listener that calls `preventDefault()` so the test does not fail on it. Send `repo.updated` with `message: null`, then a success response for pending `c`.                 | `dispatchEvent` does not throw. `c` is resolved.                                                                                                                                                                                                              |
| G21 | Listener installed only by the call (§3.1)     | Import the module but do not call `initRpcHandler`. With `rpcClient` **not** initialized, send `repo.rescan`.                                                                                   | Nothing posted. (Call `initRpcHandler` afterwards and send it again: one `repo.scan` request.)                                                                                                                                                                |

A test that pins the current number of listeners after a double call (§4.5) is deliberately left out until Q4 is answered.

---

## 7. Questions

Each question states the current behaviour and what might be intended. None of them is decided here.

**Q1. Notification payloads are not validated.** _Today:_ only the envelope is checked. A `config.changed` whose payload is `null` makes the stored configuration `null`, after which `getWebviewConfig()` returns `null` instead of throwing, and it also throws from the listener. A `repo.select` whose payload is `null` or has no `path` throws. A `view.showPane` with an unknown or missing `pane` opens the workspace pane. _Maybe intended:_ the extension is built together with the webview, so trusting it may be deliberate. Alternatively, a payload that does not match its name could be ignored, as unknown names are, so a bad message cannot corrupt state.

**Q2. A malformed response leaves its request hanging.** _Today:_ a message with `kind: "rpc.response"` and a matching `id`, but with a missing `result`, a non-boolean `success` or a non-string `error`, is ignored. The caller waits the full 30,000 ms and then gets the misleading "no response" timeout. A success whose result is `undefined` is one realistic case: if the webview transport drops properties whose value is `undefined`, the `result` key disappears. All current methods return a defined value, so it does not happen today, but a future method returning nothing would time out. _Maybe intended:_ reject at once when the id matches but the shape is wrong, or treat a missing `result` on a success as `undefined`.

**Q3. Unknown notifications are silent.** _Today:_ unknown names and unrecognised messages are dropped without any trace. The legacy dispatcher, by contrast, calls `console.warn` for an unknown `command`. _Maybe intended:_ silence avoids noise when versions are mismatched. On the other hand, a warning would make a misspelled or newly added notification easier to diagnose.

**Q4. Calling `initRpcHandler` twice doubles every notification.** _Today:_ each call adds a listener that can never be removed. Notifications then run once per listener (two `repo.scan` requests for one `repo.rescan`, two refreshes for one `repo.updated`). Responses settle once only when the listeners share a map. Only `rpcClient.init`'s own guard prevents this in production. _Maybe intended:_ make the module idempotent, return a disposer, or keep leaving it to the client.

**Q5. The message source is not checked.** _Today:_ any `message` event with the right shape is acted on, whatever its `origin` or `source`, including one posted by script inside the page or by an embedded frame. The legacy dispatcher does not check either. _Maybe intended:_ VS Code isolates the webview, so a check may be unnecessary. Still, a check on the source (for example ignoring events whose `source` is a child frame) would stop injected content from settling requests or switching repositories.

**Q6. `repo.updated` compares paths exactly.** _Today:_ the match is strict string equality with `selectedRepo`. Trailing separators, letter case on case-insensitive file systems, and symlinked paths all make it miss, silently. This works because the extension echoes the exact string the webview sent in `selectRepo`. _Maybe intended:_ keep it exact (cheap, and correct given the echo), or compare normalized paths the way `normalizeRepoPath` does on the extension side.

**Q7. Rescans are neither coalesced nor ordered.** _Today:_ every `repo.rescan` starts a new `repo.scan` request without cancelling the one already out. Whichever answer arrives last sets the picker list, even when it answers the older request. _Maybe intended:_ the extension already debounces the Git-directory watcher, so overlaps should be rare. Should only the latest rescan's result be applied?

**Q8. Error responses lose context.** _Today:_ the rejection is a plain `Error` carrying only the extension's text. The method name and the request id are not attached, and "unknown method" cannot be told apart from "the handler threw" except by parsing the text. _Maybe intended:_ plain is enough for current callers, which only show the message or ignore it. A richer error (for example with `cause` or a code) would need a matching change on the extension side.

**Q9. A throwing settle callback escapes as an uncaught listener error.** _Today:_ if a pending entry's `resolve` or `reject` throws, the exception leaves the message listener and the browser reports it. The entry is already removed and its timer already cancelled, so nothing leaks. The client's callbacks never throw, so this cannot happen in production today. _Maybe intended:_ leave it as is, or guard it so that one faulty callback cannot surface as a page error.

---

## 8. Decisions on §7 (from the project maintainer's side)

These decisions replace the "current behaviour" wherever they differ. Build to these, and test the decided behaviour.

- **Q1: ignore unusable notification payloads.** A notification whose payload lacks what its action needs is ignored, with no action called and no error: `config.changed` without an object payload, `repo.select` without a string `path`, `repo.updated` without a string `path`, and `view.showPane` with a pane name the webview does not know.
- **Q2: settle instead of hanging.** A response whose `id` matches a pending request always settles it, even when the rest of the response is not well formed:
  - `success: true` with no `result` resolves with `undefined`. (The extension now sends `null` for a handler that produces nothing, but the webview must not depend on that.)
  - `success: false` with a string `error` rejects with an `Error` carrying that text; without one, it rejects with an `Error` whose text is `Malformed response to an RPC request`.
  - A response whose `success` is not a boolean rejects the same way as a failure without an error string.
  - A message whose `id` matches nothing, or is not a string, is still ignored.
- **Q3: keep.** Unknown notification names are ignored silently.
- **Q4: keep.** `initRpcHandler` is called once per page; calling it twice is outside the contract.
- **Q5: keep.** No origin or source check.
- **Q6: keep.** `repo.updated` compares paths exactly.
- **Q7: keep.** Overlapping rescans are not coordinated here.
- **Q8: keep.** Rejections carry the error text only.
- **Q9: keep isolation.** Each message is handled on its own: an exception from one action must not stop later messages from being handled.
