# Clean-room specification: `src/extension/rpc/rpc-notify.ts`

This document says what the extension-side notification sender must do, as seen from outside it. It is written for an engineer who will build a replacement without seeing the current source. It is based on the module's callers, the tests that mock or load it, the shared RPC types, the webview code that receives what it sends, the VS Code API documentation, and behaviour observed by running the current code.

In one sentence: the module lets any part of the extension push a one-way, fire-and-forget message ("notification") to the Branchwise graph webview. The view command attaches the current webview panel once, and other modules then send named notifications without holding a reference to the webview. When no webview is attached, notifications are dropped.

---

## 0. How the behaviour was observed

- Node v22.22.2, Vitest 4.1.11, run from the repository's `node_modules` with a scratch config outside the repository. The `@/` alias pointed at `src/`.
- `vscode` was mocked with only a `Disposable` class. Its constructor stores the callback, and its `dispose()` runs the callback every time it is called. This matches the mock style used in `tests/extension/git-repo-watcher.test.ts`.
- `@/extension/util/logger` was mocked so that every call was recorded with its level and arguments.
- The fake webview was an object with only a `postMessage` method. Unless a case says otherwise, it recorded each message and resolved `true`. The wire-form examples (§4.2) used a fake `postMessage` that turned the message into JSON, which is what VS Code does with it.
- V8 coverage runs of the repository's own `extension` test project were used to find which test files load the real module and whether any of them run it (§1.5, §6.1).

---

## 1. Interface

### 1.1 Module path

`src/extension/rpc/rpc-notify.ts`. The view command imports it by the relative path `./rpc/rpc-notify`. Everything else, including every test, uses `@/extension/rpc/rpc-notify`. Both spellings resolve to the same file, and Vitest's `vi.mock` applies to either one.

The module has exactly **two** runtime exports and **no** type exports. Their names and signatures must not change.

### 1.2 `export const rpcNotify`

```ts
export const rpcNotify: {
  notify<N extends RpcNotificationName>(name: N, message: RpcNotificationMap[N]): Promise<void>;
};
```

- It is a plain object with one own enumerable property, `notify`, which is a function of two declared parameters. It has no other properties.
- `notify(name, message)` sends the notification `name` with the payload `message` to the attached webview, if there is one (see §3).
- The generic ties the payload type to the name. For example, `notify("repo.rescan", null)` compiles, and `notify("repo.rescan", {})` or `notify("repo.updated", null)` does not. This compile-time check is part of the contract, because it is the only thing that keeps payloads well formed (§3.9).
- The return type is `Promise<void>` (see §3.6).

### 1.3 `export function initRpcNotify(webview: vscode.Webview): vscode.Disposable`

- Makes `webview` the destination for every later `rpcNotify.notify` call, replacing any webview attached earlier (§3.2, §3.3).
- Returns a disposable. Disposing it detaches `webview`, but only if `webview` is still the attached one (§3.4).
- One declared parameter.

### 1.4 Types used by the signatures (all from `@/types`, defined in `src/types/rpc.types.ts`)

`RpcNotificationMap` maps every notification name to the type of its payload. These are today's five entries:

| Name             | Payload type                                                            | Meaning of the payload                                                                                                                                                                                                     |
| ---------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `view.showPane`  | `{ pane: SidebarPane }`, where `SidebarPane` is `"refs" \| "workspace"` | `pane` names the side pane next to the graph that the webview should open.                                                                                                                                                 |
| `repo.select`    | `GitRepo` = `{ name: string; path: string }`                            | The repository the webview should add to its picker and select. `path` is the normalized repository path, and `name` is its display name (today, the last path segment).                                                   |
| `repo.rescan`    | `null`                                                                  | There is no payload. The set of repositories may have changed, so the webview should scan for repositories again.                                                                                                          |
| `config.changed` | `WebviewConfig` (from `src/types/config.ts`)                            | The complete current display configuration, with eight fields: `autoCenterCommitDetailsView`, `dateFormat`, `graphColours`, `graphStyle`, `initialLoadCommits`, `loadMoreCommits`, `locale`, `showCurrentBranchByDefault`. |
| `repo.updated`   | `RepoUpdate` = `{ path: string }`                                       | Files of the repository at `path` changed. The webview reloads if that is the repository it has selected.                                                                                                                  |

- `RpcNotificationName` is `keyof RpcNotificationMap`, the union of the five names.
- `RpcNotification<N>` is the envelope type of a posted notification: `{ kind: "rpc.notify"; id: string; name: N; message: RpcNotificationMap[N] }`. It distributes over a union `N`. The field meanings are given in §2.4.

A replacement must not declare its own copy of these types. When a name is added to `RpcNotificationMap`, `notify` must accept it with no change to this module.

### 1.5 Who uses what

**Production callers.** Every caller ignores the promise that `notify` returns: each one calls it with a `void` prefix from inside an event listener, a timer, or a callback. No caller awaits it, reads its result, or catches its rejection.

| Caller                                       | Exports used                 | How                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/extension/view-command.ts`              | `initRpcNotify`, `rpcNotify` | Each time it creates a new graph panel, it calls `initRpcNotify(panel.webview)`. This happens after the RPC server is attached and before the watchers are created and the page's HTML is set. It keeps the returned disposable and disposes it in the panel's `onDidDispose` handler, before it disposes the watchers. At most one panel exists at a time. It sends `view.showPane` (`{ pane }`, today always `"refs"`, from the `branchwise.showBranches` command) and `repo.select` (`{ name, path }`). It sends both only after the page has reported `{ command: "viewReady" }`. Right after a `repo.select` for a clicked file, it posts a legacy `{ command: "fileHistory", repo, path }` message **directly** through `webview.postMessage`, so the relative order of the two matters (§5). |
| `src/extension/repoSelection.ts`             | none                         | It does not import the module. It holds the latest Source Control click until the page is ready, then calls a callback that the view command supplies. That callback sends `repo.select`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/extension/watchers/config.watcher.ts`   | `rpcNotify` only             | On a configuration change, it sends `repo.rescan` with `null` when `git.path` or `branchwise.maxDepthOfRepoSearch` is affected. It then sends `config.changed` with the full `WebviewConfig` when any `branchwise` setting is affected. One event can produce both, in that order.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `src/extension/watchers/git.watcher.ts`      | `rpcNotify` only             | It sends `repo.rescan` with `null` when a `.git` entry is created or deleted (after its own 100 ms debounce) and when the workspace folders change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `src/extension/watchers/git-repo.watcher.ts` | `rpcNotify` only             | It sends `repo.updated` with `{ path }` 250 ms after the last relevant file event in the watched repository. This can happen often while Git is busy.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

The watchers never see a webview. They depend on this module to know where to send.

**Tests that replace the module** (all with `vi.mock("@/extension/rpc/rpc-notify", factory)`):

| Test file                                  | Mock                                                                              | What it checks through the mock                                                                                                                                                                                  |
| ------------------------------------------ | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/extension/view-command.test.ts`     | `{ initRpcNotify: () => ({ dispose: vi.fn() }), rpcNotify: { notify: vi.fn() } }` | The view command calls `notify("repo.select", { name, path })` only after `viewReady`, with the latest click winning, and the call counts. It relies only on `initRpcNotify` returning something with `dispose`. |
| `tests/extension/git-watcher.test.ts`      | `{ rpcNotify: { notify: vi.fn() } }`                                              | `notify("repo.rescan", null)` is called exactly once per folder change or `.git` event.                                                                                                                          |
| `tests/extension/config-watcher.test.ts`   | `{ rpcNotify: { notify: vi.fn() } }`                                              | `notify("config.changed", <config>)` and `notify("repo.rescan", null)` are called for the right settings.                                                                                                        |
| `tests/extension/git-repo-watcher.test.ts` | `{ rpcNotify: { notify: vi.fn() } }`                                              | `notify("repo.updated", { path })` is called, or not called, for various file events.                                                                                                                            |
| `tests/extension/webviewBridge.test.ts`    | `{ rpcNotify: { notify: vi.fn() } }`                                              | `notify("repo.updated", { path: "/repo" })` is called, or suppressed while an action mutes the watcher.                                                                                                          |

These mocks return `undefined` from `notify`, not a promise. This works only because no caller uses the return value. Four of the mocks have no `initRpcNotify` at all, so the watchers must never import it.

**Tests that load the real module but never call it.** They load it transitively through `@/main` or through `@/old-extension/messageHandler`, which imports `git-repo.watcher`:

- `tests/extension/activation.test.ts`: `vscode` is replaced with a `vi.mock` factory that has **no** `Disposable`. Reading a missing export from such a mock throws.
- `tests/extension/workspace-rows.test.ts`: `vscode` is replaced with `{ l10n: { t } }` only.
- `tests/extension/graph-queries.test.ts`, `query-cancellation.test.ts`, `remote-preferences.test.ts` and `view-preferences.test.ts` use the shared alias mock `tests/extension/__mocks__/vscode.ts`, which has no `Disposable` and a `window` with only `showErrorMessage`.

These tests set the import-time constraints in §5 (N1).

---

## 2. Dependencies the implementation must use

### 2.1 Repository imports

| Import path               | Name(s)                                                                     | Use                                                                                                                                                                                                                                |
| ------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@/extension/util/logger` | `logger`                                                                    | Diagnostic output. Use **`logger.debug(message: string)` only** (see §3.8). The logger writes to the extension's log output channel and does nothing until `logger.init` has run during activation. It never throws in production. |
| `@/types`                 | `RpcNotification`, `RpcNotificationMap`, `RpcNotificationName` (types only) | Signatures and the posted envelope. Import them with `import type`.                                                                                                                                                                |

Nothing else from the repository is needed.

### 2.2 VS Code API

- `vscode.Webview`, as a type. The only member ever used is `postMessage(message: any): Thenable<boolean>`. Test fakes may provide only that member.
- `vscode.Disposable`, as the declared return type of `initRpcNotify`. Every caller only calls `.dispose()` on it. An instance of VS Code's `Disposable` class is fine, and so is any object with a working `dispose()` method. If the replacement constructs `vscode.Disposable`, it must do so only when `initRpcNotify` runs, never at import time (see N1).
- Relevant documented behaviour of `Webview.postMessage`:
  - The message must be a string or a JSON-serializable value. The host serializes it. Keys whose value is `undefined` disappear, `Date` values become ISO strings, and values that JSON cannot represent (a `BigInt`, a circular structure) make the post fail.
  - It resolves `true` when the message was posted, and `false` when it was dropped because the webview was not live. A `true` result does not prove that the page handled the message.
  - Messages are delivered only to live webviews. The graph panel is created with `retainContextWhenHidden: true`, so a hidden graph still receives them.
- VS Code's own `Disposable` runs its callback at most once. A second `dispose()` does nothing.

### 2.3 Platform

- The module needs a source of random UUIDs for the envelope `id`. The global Web Crypto `crypto.randomUUID()` is available in the VS Code extension host (the bundle targets Node) and in the Node version the tests run on. `randomUUID` from `node:crypto` is equivalent.

### 2.4 The posted message (notification envelope)

Every delivered notification is posted with a single `webview.postMessage(envelope)` call. The envelope is an object with exactly these four keys:

| Key       | Value                                                                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `kind`    | The literal string `"rpc.notify"`.                                                                                                                           |
| `id`      | A new, random, lowercase RFC 4122 version-4 UUID string (36 characters, for example `9f0f5586-4005-4a49-8b39-ce72109bb2fe`). Each call gets a different one. |
| `name`    | The `name` argument, unchanged.                                                                                                                              |
| `message` | The `message` argument itself, the same object reference, neither copied nor altered. The key is always present, even when its value is `null`.              |

Observed key order is `kind`, `id`, `name`, `message`. Nothing depends on that order.

The envelope shares the webview channel with RPC responses (`{ kind: "rpc.response", id, success, ... }`) from `rpc-server.ts` and with legacy `{ command, ... }` messages. It must not carry a `command` key, and it must not carry `success`, `result` or `error`.

**What the webview accepts** (`src/webview/lib/rpc/rpc-handler.ts`, pinned by `tests/webview/lib/rpc-handler.test.ts`). The page handles a message as a notification only when all of these hold:

- the data is a non-null, non-array object;
- `id` is a string (an empty string is accepted; a missing or numeric id is ignored);
- `kind` is exactly `"rpc.notify"`;
- `name` is a string;
- the `message` key is present.

It then looks the name up among its own handlers. An unknown name is ignored silently, and each handler checks its own payload and ignores one it cannot use. The page never reads the `id`, but the `id` must still be a string or the page drops the notification. The page sends nothing back for a notification.

---

## 3. Behaviour

### 3.1 Loading the module

- Importing the module does nothing observable. It posts nothing, logs nothing, reads no VS Code runtime value and generates no id.
- Right after import, no webview is attached.
- There is one attachment slot for the whole extension host. Every importer shares it: the view command attaches, and the watchers send.

### 3.2 `initRpcNotify(webview)`: attaching

- After the call returns, every `rpcNotify.notify` call sends to `webview`, until that attachment is replaced (§3.3) or detached (§3.4).
- Calling it posts nothing to any webview and logs nothing. Calling it does not replay or flush anything sent earlier: notifications dropped while nothing was attached are gone for good.
- It returns a disposable (§3.4). It does not throw for any `vscode.Webview` it receives.

### 3.3 Attaching again, with another webview or the same one

- A second call replaces the first attachment. From then on, notifications go **only** to the newest webview. Observed: after attaching A and then B, one notification produced one post on B and none on A.
- There is no stack. The module remembers only the newest webview. Detaching the newest one does **not** fall back to an earlier one, even if the earlier one's disposable was never disposed. Observed: attach A, attach B, dispose B's handle, notify → nothing posted on A or B, and the notification was dropped. See Q4.
- Attaching the same webview twice works. Notifications go to it once each, not twice.

### 3.4 Disposing the returned handle: detaching

- If the webview the handle was created for is still the attached one, disposing the handle detaches it. From then on, notifications are dropped (§3.5).
- If a **different** webview has been attached since, disposing the old handle changes nothing, and notifications keep going to the newer webview. Observed: attach A (handle hA), attach B, dispose hA, notify → one post on B, none on A.
- Webviews are compared by identity, not by handle. If the same webview is attached twice (handles h1 and h2), disposing **either** handle detaches it. Observed: dispose h1, notify → nothing posted. See Q5.
- Disposing a handle several times does not throw. With VS Code's real `Disposable`, only the first `dispose()` has any effect. With a disposable that runs its callback on every call (as in the tests' mocks), a stale handle disposed again after the **same** webview was re-attached detaches it again. Observed with such a mock: attach W (h1), dispose h1, attach W (h2), dispose h1 again, notify → nothing posted. See Q5.
- Disposing posts nothing and logs nothing.
- Disposing does not cancel or affect a post that is already in flight. That post's promise still settles when VS Code settles it.
- After the attached webview is detached, the module must hold no reference to it.

### 3.5 `notify` while no webview is attached

This covers the time before the first `initRpcNotify`, and the time after the attached webview's handle is disposed.

- Nothing is posted anywhere, and nothing is queued for later.
- Exactly one debug-level log entry is written (§3.8).
- The call returns a native `Promise` that is already resolved, with the value `undefined`. It never rejects in this state (with a working logger).

### 3.6 `notify` while a webview is attached

- The attached webview's `postMessage` is called **exactly once**, with **exactly one** argument, the envelope from §2.4. The call happens **synchronously, before `notify` returns** (see N3).
- The webview used is the one attached at the moment `notify` is called.
- Exactly one debug-level log entry is written. It is written whether or not the post succeeds.
- The name and payload are not validated, copied, cloned or serialized by the module.
- **Return value:** a native `Promise<void>`. It settles only after the value returned by `postMessage` settles:
  - If `postMessage` resolves with any value (`true` or `false`), `notify` resolves with `undefined`. The delivery flag is discarded (see Q2).
  - If `postMessage` returns a non-thenable (possible only with fakes), `notify` resolves with `undefined`.
  - If `postMessage` never settles, `notify` never settles.

### 3.7 Delivery failures

- **Asynchronous failure:** when the value `postMessage` returns rejects with a value `E`, the promise from `notify` rejects with that same `E` (the same object). The module logs nothing extra and does not retry.
- **Synchronous failure:** when `postMessage` throws `E` synchronously, `notify` still **returns normally** and does not throw. The promise it returns rejects with `E`.
- **Serialization failure:** an unserializable payload fails inside VS Code's `postMessage`. That is one of the two cases above. Observed with a serializing fake: a `BigInt` in the payload rejected with `TypeError: Do not know how to serialize a BigInt`.
- **Not deliverable:** VS Code resolves `false` when the webview is not live. This is not a failure for this module: `notify` resolves `undefined`, and nothing is logged.
- **Effect on callers:** every caller uses `void`, so a rejection becomes an unhandled promise rejection in the extension host. Observed in Node: firing `void rpcNotify.notify(...)` at a `postMessage` that rejects produced exactly one `unhandledRejection` event carrying the error. See Q1.
- A failure affects only its own call. Later calls behave normally, and the attachment is unchanged.

### 3.8 Logging

- Each `notify` call writes **exactly one** entry, at **debug** level. It is a single string argument that includes the notification's name and says whether the notification was posted or dropped because nothing is attached. The payload is not included.
- `initRpcNotify`, disposing, and delivery failures write nothing.
- No other logger level (`info`, `warn`, `error`) is used.
- No test or caller checks the wording. The implementer should write their own text.

### 3.9 Type-invalid input at runtime

TypeScript prevents all of these today. They are listed only to pin current behaviour.

- An unknown name is posted like any other. The page ignores it.
- An `undefined` payload produces an envelope whose `message` key holds `undefined`. After VS Code's JSON serialization, the key is gone, so the page ignores the notification. See Q6.
- `initRpcNotify(undefined)` leaves nothing attached, and later notifications are dropped.

### 3.10 What the module never does

- It never listens for messages from the webview.
- It never waits for, buffers, retries, deduplicates, throttles or debounces anything. Debouncing belongs to the watchers.
- It never uses timers.
- It never sends anything except the envelope in §2.4.
- It never touches the webview's `html`, its options or its panel.

---

## 4. Concrete examples (observed on the current code)

Ids are random. Where an example shows `<uuid>`, a fresh v4 UUID was observed.

### 4.1 Attachment lifecycle

Each step runs in order within one module instance. A and B are fake webviews whose `postMessage` records the message and resolves `true`.

| #   | Call                                                                                                                                   | Posts                                                                                                                                                                              | Result / log                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | `rpcNotify.notify("repo.rescan", null)` (nothing attached)                                                                             | none                                                                                                                                                                               | resolves `undefined`; one debug entry naming `repo.rescan` (dropped) |
| 2   | `hA = initRpcNotify(A)`                                                                                                                | none                                                                                                                                                                               | returns a disposable; no log                                         |
| 3   | `rpcNotify.notify("repo.updated", P)` with `P = { path: "/repo" }`                                                                     | A: `{ kind: "rpc.notify", id: "<uuid>", name: "repo.updated", message: P }`, where `message` is `P` itself. A's `postMessage` had already been called once when `notify` returned. | resolves `undefined`; one debug entry naming `repo.updated` (posted) |
| 4   | Two more `notify("repo.rescan", null)`                                                                                                 | A: two envelopes, three distinct ids in total so far                                                                                                                               | each resolves `undefined`                                            |
| 5   | `hB = initRpcNotify(B)`, then `notify("view.showPane", { pane: "refs" })`                                                              | B: `{ kind: "rpc.notify", id: "<uuid>", name: "view.showPane", message: { pane: "refs" } }`; A: none                                                                               | resolves `undefined`                                                 |
| 6   | `hA.dispose()`, then `notify("repo.select", { name: "x", path: "/x" })`                                                                | B receives it; A: none                                                                                                                                                             | resolves `undefined`                                                 |
| 7   | `hB.dispose()`, then `notify("repo.rescan", null)`                                                                                     | none on A or B                                                                                                                                                                     | resolves `undefined`; one debug entry (dropped)                      |
| 8   | `hB.dispose()` and `hA.dispose()` again                                                                                                | none                                                                                                                                                                               | no throw                                                             |
| 9   | `h1 = initRpcNotify(C)`, `h2 = initRpcNotify(C)`, `h1.dispose()`, `notify("repo.rescan", null)`                                        | none on C                                                                                                                                                                          | resolves `undefined` (see Q5)                                        |
| 10  | Three calls without awaiting: `notify("repo.rescan", null)`, `notify("config.changed", cfg)`, `notify("repo.updated", { path: "/p" })` | posts in call order: `repo.rescan`, `config.changed`, `repo.updated`                                                                                                               | all resolve `undefined`                                              |
| 11  | `void notify("repo.select", { name: "r", path: "/r" })`, then immediately `void W.postMessage({ command: "fileHistory" })`             | order on W: the `rpc.notify` envelope first, then the `fileHistory` message                                                                                                        | —                                                                    |
| 12  | `const f = rpcNotify.notify; f("repo.rescan", null)` (unbound call)                                                                    | posted normally                                                                                                                                                                    | resolves `undefined`                                                 |

### 4.2 Wire form of each notification (after JSON serialization)

| Call                                                                                        | JSON as the webview receives it                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `notify("view.showPane", { pane: "workspace" })`                                            | `{"kind":"rpc.notify","id":"9f0f5586-4005-4a49-8b39-ce72109bb2fe","name":"view.showPane","message":{"pane":"workspace"}}`                                                                                                                                                                                               |
| `notify("repo.select", { name: "app", path: "/work/app" })`                                 | `{"kind":"rpc.notify","id":"aa8b4f23-3248-4097-bafc-167005463f12","name":"repo.select","message":{"name":"app","path":"/work/app"}}`                                                                                                                                                                                    |
| `notify("repo.rescan", null)`                                                               | `{"kind":"rpc.notify","id":"3b70d245-8f4e-4e02-85ee-be85b1e4a19a","name":"repo.rescan","message":null}`                                                                                                                                                                                                                 |
| `notify("config.changed", cfg)`, where `cfg` is the object shown in the `message` field     | `{"kind":"rpc.notify","id":"f96df243-c8e2-4889-83b3-834b6bf91e35","name":"config.changed","message":{"autoCenterCommitDetailsView":true,"dateFormat":"Date & Time","graphColours":["#0085d9"],"graphStyle":"rounded","initialLoadCommits":300,"loadMoreCommits":100,"locale":"en","showCurrentBranchByDefault":false}}` |
| `notify("repo.updated", { path: "/work/app" })`                                             | `{"kind":"rpc.notify","id":"21f13fda-cdae-46ea-a1ab-c2d38447b65e","name":"repo.updated","message":{"path":"/work/app"}}`                                                                                                                                                                                                |
| (type-invalid) `notify("repo.rescan", undefined)`                                           | `{"kind":"rpc.notify","id":"61bed0b4-9803-4225-a9d8-1679d197a8ca","name":"repo.rescan"}`. The `message` key is gone, so the page ignores it.                                                                                                                                                                            |
| (type-invalid) `notify("repo.updated", { path: "/p", when: new Date(0), skip: undefined })` | `{"kind":"rpc.notify","id":"6a4d7fda-a761-45fa-a029-be316bb54c5a","name":"repo.updated","message":{"path":"/p","when":"1970-01-01T00:00:00.000Z"}}`                                                                                                                                                                     |

Every call above resolved `undefined` and wrote exactly one debug entry with one string argument.

### 4.3 Delivery outcomes (a webview is attached)

| Fake `postMessage` behaviour                | `notify("repo.rescan", null)`                                                                                        |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| resolves `true`                             | resolves `undefined`                                                                                                 |
| resolves `false`                            | resolves `undefined`; one debug entry (the "posted" kind); nothing else logged                                       |
| rejects `E = new Error("boom")`             | rejects with `E` itself; one debug entry; nothing else logged                                                        |
| throws `new Error("sync")` synchronously    | `notify` returns without throwing; its promise rejects with that error                                               |
| returns `undefined` (not a thenable)        | resolves `undefined`                                                                                                 |
| returns a promise that stays pending        | still pending 20 ms later, and still pending after the handle is disposed; resolves once the post's promise resolves |
| JSON-serializes, and the payload holds `1n` | rejects with `TypeError: Do not know how to serialize a BigInt`                                                      |
| rejects, and the caller used `void`         | Node reports one `unhandledRejection` carrying the error                                                             |

### 4.4 Test-environment observations

- Import with `vi.mock("vscode", () => ({}))` succeeds. `notify` with nothing attached then resolves.
- With that empty `vscode` mock, the current `initRpcNotify` throws Vitest's "No `Disposable` export is defined on the `vscode` mock" error. A test of the replacement should therefore mock `vscode` with a `Disposable` class, or the replacement should not need one.
- With a logger mock that has no `debug`, `notify` does not throw synchronously. Its promise rejects with a `TypeError`.

---

## 5. Non-functional requirements

- **N1: No work at import.** Importing must not read any runtime value from `vscode`, call the logger, generate ids or touch the webview. The real module is imported under `vscode` mocks that lack `Disposable` (and, in `workspace-rows.test.ts`, lack everything except `l10n`), where reading a missing export throws. See the list in §1.5.
- **N2: Never throw synchronously from `notify`.** It is called with `void` inside VS Code event listeners (`onDidChangeConfiguration`, file-system watchers, `onDidChangeWorkspaceFolders`), inside a `setTimeout` callback, and inside the view command's ready callback. A synchronous throw would abort the caller's remaining work. For example, the configuration watcher would skip its second notification. Every failure must surface only through the returned promise.
- **N3: The post happens within the call, in call order.** `postMessage` must be called before `notify` returns, with nothing awaited first. As a result:
  - notifications reach `postMessage` in the order `notify` was called;
  - a message the caller posts directly right after `notify` (the view command's legacy `fileHistory` message after `repo.select`) follows the notification rather than overtaking it.
- **N4: Constant, small cost per call; no retained state.** The module keeps no queue, buffer, timer, id registry or retry. The only state it keeps is the one attached webview. `repo.updated` and `config.changed` can be frequent, and a dropped notification must cost no more than one debug log call.
- **N5: The payload passes through untouched.** No copying, freezing, validation or serialization. VS Code serializes the payload, and callers are responsible for making it JSON-serializable.
- **N6: `notify` does not depend on `this`.** It must work when detached from `rpcNotify` (§4.1 row 12).
- **N7: One process-wide destination.** The attachment is shared by every importer. The replacement must not require the watchers to pass or know a webview.
- **N8: Debug-only, low-volume logging.** Exactly one debug entry per `notify` call, without payload contents (configuration objects and paths would bloat the log at high frequency). No logging from `initRpcNotify` or dispose. Using only `logger.debug` also keeps the module compatible with narrow logger mocks.
- **N9: Types stay tight.** The generic `notify` signature must keep rejecting mismatched name/payload pairs at compile time (`pnpm run typecheck` runs `tsc` over `src`, the tests and `tests-ext`).
- **N10: No leaks.** After the attached webview is detached, the module must not keep it reachable.

---

## 6. Test coverage

### 6.1 What existing tests already check

- **No test calls the real module.** V8 coverage over the whole `extension` test project shows none of its functions executed. Only the module's top-level evaluation ran, in the six test files that import it transitively (§1.5).
- **Caller contracts, through mocks.** `tests/extension/view-command.test.ts`, `git-watcher.test.ts`, `config-watcher.test.ts`, `git-repo-watcher.test.ts` and `webviewBridge.test.ts` check the exact `(name, payload)` arguments that each caller passes to `rpcNotify.notify`, and when it passes them. These pin the export names `rpcNotify.notify` and `initRpcNotify`, and the fact that callers need nothing from `notify`'s return value or from `initRpcNotify`'s result except `dispose`.
- **Import safety, implicitly.** `activation.test.ts`, `workspace-rows.test.ts`, `graph-queries.test.ts`, `query-cancellation.test.ts`, `remote-preferences.test.ts` and `view-preferences.test.ts` fail if importing the module touches a `vscode` value that their mock lacks.
- **The receiving side.** `tests/webview/lib/rpc-handler.test.ts` pins what the page accepts as a notification (§2.4) and how it handles each of the five names. It does not exercise this module.
- **End to end, indirectly.** `tests-ext/extension.test.ts` (VS Code integration) opens the panel, which attaches the real module, and runs `branchwise.showBranches`, which sends `view.showPane` after `viewReady`. It asserts only that the panel opens, not that notifications arrive.

### 6.2 Gaps, and tests to add

Suggested file: `tests/extension/rpc-notify.test.ts`.

Setup for every case:

- `vi.mock("vscode", () => ({ Disposable: class { constructor(public dispose: () => void) {} } }))`. This is the same style as `git-repo-watcher.test.ts`: `dispose` is the callback itself, so it runs on every call.
- `vi.mock("@/extension/util/logger", () => ({ logger: { debug: vi.fn() } }))`. The mock deliberately has only `debug`.
- A fake webview `{ postMessage: vi.fn(async () => true) }`.
- The attachment is module-wide state, so each test must start detached: either dispose every handle in `afterEach`, or call `vi.resetModules()` and import the module afresh in each test.

A UUID-v4 check means the id matches `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/`.

| #   | Behaviour                             | Input                                                                                                                                                 | Expected                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | Drop before any attachment            | Fresh module; `await notify("repo.rescan", null)`                                                                                                     | Resolves `undefined`; no fake's `postMessage` called; `logger.debug` called once with one string argument containing `repo.rescan`.                                                                                                                                           |
| T2  | Envelope shape                        | `initRpcNotify(W)`; `P = { path: "/repo" }`; `await notify("repo.updated", P)`                                                                        | `W.postMessage` called exactly once with exactly one argument `M`; `Object.keys(M).sort()` equals `["id","kind","message","name"]`; `M.kind === "rpc.notify"`; `M.name === "repo.updated"`; `M.message` is `P` (`toBe`); `M.id` passes the UUID-v4 check; result `undefined`. |
| T3  | `null` payload is kept                | Attached; `notify("repo.rescan", null)`                                                                                                               | Posted envelope has `message: null`, and `"message" in M` is `true`.                                                                                                                                                                                                          |
| T4  | Fresh id per call                     | Attached; three `notify` calls                                                                                                                        | Three envelopes with three distinct ids.                                                                                                                                                                                                                                      |
| T5  | Post is synchronous                   | Attached; call `notify("repo.rescan", null)` without awaiting                                                                                         | Immediately afterwards, `W.postMessage` has been called once.                                                                                                                                                                                                                 |
| T6  | Order is preserved                    | Attached; without awaiting: `notify("repo.rescan", null)`, `notify("repo.updated", { path: "/p" })`, then `W.postMessage({ command: "fileHistory" })` | Recorded order: `repo.rescan` envelope, `repo.updated` envelope, `fileHistory` message.                                                                                                                                                                                       |
| T7  | Replacement                           | `initRpcNotify(A)`; `initRpcNotify(B)`; `notify("repo.rescan", null)`                                                                                 | `B.postMessage` once; `A.postMessage` never.                                                                                                                                                                                                                                  |
| T8  | Stale handle is inert                 | `hA = initRpcNotify(A)`; `initRpcNotify(B)`; `hA.dispose()`; `notify(...)`                                                                            | `B.postMessage` once; `A.postMessage` never.                                                                                                                                                                                                                                  |
| T9  | Detach                                | `hA = initRpcNotify(A)`; `hA.dispose()`; `await notify("repo.rescan", null)`                                                                          | `A.postMessage` never; resolves `undefined`; one debug entry.                                                                                                                                                                                                                 |
| T10 | No fallback to an earlier webview     | `initRpcNotify(A)`; `hB = initRpcNotify(B)`; `hB.dispose()`; `notify(...)`                                                                            | Neither `A` nor `B` posts. This pins current behaviour; see Q4.                                                                                                                                                                                                               |
| T11 | Repeated dispose is harmless          | `h = initRpcNotify(A)`; `h.dispose()` twice                                                                                                           | No throw; `notify` afterwards posts nothing.                                                                                                                                                                                                                                  |
| T12 | Attach and dispose are silent         | `initRpcNotify(A)`, then dispose it                                                                                                                   | `A.postMessage` and `logger.debug` not called.                                                                                                                                                                                                                                |
| T13 | Undeliverable is not a failure        | `A.postMessage` resolves `false`; `await notify("repo.rescan", null)`                                                                                 | Resolves `undefined`; `logger.debug` called once. The mock has only `debug`, so a call to any other level would fail the test.                                                                                                                                                |
| T14 | Async post failure propagates         | `A.postMessage` rejects `E`                                                                                                                           | `notify(...)` rejects with `E` (`toBe`).                                                                                                                                                                                                                                      |
| T15 | Sync post failure becomes a rejection | `A.postMessage` throws `E` synchronously                                                                                                              | Calling `notify(...)` does not throw; the returned promise rejects with `E`.                                                                                                                                                                                                  |
| T16 | Settles only after the post           | `A.postMessage` returns a promise the test resolves later                                                                                             | `notify`'s promise is unsettled after a macrotask; it resolves `undefined` after the test resolves the post.                                                                                                                                                                  |
| T17 | In-flight post survives dispose       | As T16, but dispose the handle before resolving the post                                                                                              | `notify`'s promise still resolves `undefined` after the post resolves.                                                                                                                                                                                                        |
| T18 | Returns a real promise in both states | `notify` detached and attached                                                                                                                        | Both results are `instanceof Promise`.                                                                                                                                                                                                                                        |
| T19 | Unbound call                          | Attached; `const f = rpcNotify.notify; await f("repo.rescan", null)`                                                                                  | One post.                                                                                                                                                                                                                                                                     |
| T20 | Import has no side effects            | In a separate file, `vi.mock("vscode", () => ({}))` and a logger mock whose methods are spies; import the module                                      | Import succeeds; no logger method called; `await notify("repo.rescan", null)` resolves `undefined`.                                                                                                                                                                           |
| T21 | Log carries the name, not the payload | Attached; `notify("repo.updated", { path: "/secret/path" })`                                                                                          | The single debug entry's text contains `repo.updated` and does not contain `/secret/path`.                                                                                                                                                                                    |
| T22 | Same webview attached twice           | `h1 = initRpcNotify(A)`; `h2 = initRpcNotify(A)`; `notify(...)`; then `h1.dispose()`; `notify(...)`                                                   | First notify: exactly one post on A. After `h1.dispose()`: no post. This pins current behaviour; see Q5.                                                                                                                                                                      |
| T23 | Every current name round-trips        | Attached; one call per name with the payloads from §4.2; the fake returns `JSON.parse(JSON.stringify(m))` for inspection                              | Each parsed message equals `{ kind: "rpc.notify", id: <uuid>, name, message: payload }`.                                                                                                                                                                                      |

---

## 7. Questions (current behaviour stated, no decision made)

**Q1. Failed posts become unhandled rejections.** Today, `notify` rejects when `postMessage` rejects or throws. Every caller discards the promise with `void`, so in the extension host this becomes an unhandled promise rejection, and the module itself logs nothing about it. The intent may be for the sender to absorb delivery errors itself (for example, log a warning and resolve), so that fire-and-forget callers are safe. Or the propagation may be deliberate and callers are expected to add handling.

**Q2. The delivery result is discarded.** Today, when VS Code reports `false` (message not delivered), `notify` still resolves `undefined`, and the only log entry, written before the outcome is known, says the notification was sent. The intent may be to return the boolean (the signature would become `Promise<boolean>`), or to log undelivered notifications. No caller consumes a result today.

**Q3. "Attached" does not mean "the page is listening".** The view command attaches the webview before it sets the page's HTML. `repo.rescan`, `config.changed` and `repo.updated` can therefore be posted before the page has installed its message listener. VS Code may accept such a message while the page never handles it. The view command gates only `view.showPane` and `repo.select` on the page's `viewReady` message. Should this module drop or queue until the page is ready, or is early loss acceptable, given that the page reads the configuration and scans for repositories when it starts anyway?

**Q4. No fallback after the newest attachment is removed.** Today: attach A, attach B, detach B → nothing is attached, even though A's handle was never disposed. With one panel at a time this cannot happen in production. Is "newest wins, nothing remembered" intended, or should detaching restore the previous still-live webview?

**Q5. Identity-based detach.** Today, detaching compares webviews rather than handles:

- (a) When the same webview is attached twice, disposing either handle detaches it, although the other registration never ended.
- (b) With a disposable whose callback can run more than once (the tests' mocks, unlike VS Code's `Disposable`), disposing an old handle again after the same webview was re-attached detaches the new attachment.

Should each handle end only its own registration?

**Q6. No runtime check of name or payload.** Today, an unknown name is posted and silently ignored by the page. An `undefined` payload produces an envelope that loses its `message` key in serialization, so the page ignores it. TypeScript blocks both for current callers. Should `notify` guard against them at runtime (reject, drop or log), or is the type system considered sufficient?

**Q7. Purpose of the notification id.** Today, every notification carries a new random UUID. The page requires the id to be a string but never reads it, and nothing records it. Is it reserved for a future purpose (acknowledgement, deduplication, tracing in logs), in which case uniqueness matters? Or is it present only so that the envelope matches the request/response shape, in which case any string would do? The current log entries do not include it.

---

## 8. Decisions on §7 (from the project maintainer's side)

These decisions replace the "current behaviour" wherever they differ. Build to these, and test the decided behaviour.

- **Q1: absorb delivery failures.** When the post throws or rejects, `notify` logs one **error** entry naming the notification and resolves; it never rejects. No unhandled rejection may reach the extension host.
- **Q2: log undelivered notifications.** When VS Code reports that a post was not delivered (`false`), log one **debug** entry naming the notification. `notify` still resolves `undefined`.
- **Q3: keep.** No waiting or queueing before the page listens. The page reads the current repository list and configuration when it starts, so notifications it misses while loading carry nothing it lacks.
- **Q4: keep.** Detaching the newest webview does not fall back to an earlier one.
- **Q5: each handle ends only its own attachment.** Disposing a handle detaches only if that same attachment is still the current one; disposing it again, or disposing a handle from an earlier attachment of the same webview, changes nothing.
- **Q6: keep the type system, but never lose the payload key.** An `undefined` payload is sent as `null`, so the envelope always carries `message`.
- **Q7: ids only need to be unique strings.** Each notification's id must be a string that no other notification in the session uses; a UUID is not required.
