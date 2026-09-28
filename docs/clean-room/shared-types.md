# Clean-room specification: shared types, constants and small webview helpers

Modules covered, one top-level section each:

- **A.** `src/types/rpc.types.ts`
- **B.** `src/types/legacy.ts`
- **C.** `src/types/config.ts`
- **D.** `src/types/git.types.ts`
- **E.** `src/webview/types.ts`
- **F.** `src/webview/constants.ts`
- **G.** `src/webview/global.d.ts`
- **H.** `src/webview/tsconfig.json`
- **I.** `src/webview/graph/types.ts`
- **J.** `src/webview/graph/constants.ts`
- **K.** `src/webview/graph/branchColours.ts`
- **L.** `src/webview/graph/palette.ts`
- **M.** `src/webview/utils/format.ts`
- **N.** `src/webview/utils/ref.ts`

This document is for an engineer who will write replacements for these files without seeing them. Nine of the fourteen hold only TypeScript types or plain constants (A to G, I, J), one is a compiler configuration (H), and four hold a little runtime code (K to N). None of them renders anything by itself. Several of their values do reach the DOM through other modules, and those values are spelt out where they matter.

For the type-only modules, every exported name, every field, every literal and every optionality form is part of the interface and is given in full. For the runtime modules, the exported signatures are given, and the behaviour is described in prose with observed examples.

---

## 0. How the behaviour was observed

- Repository at commit `71f1e92` (branch `claude/documented-backlog-lwou5x`), on Linux, with Git 2.43.0, Node 22.22.2, TypeScript 7.0.2 (the repository's own `tsc`), esbuild 0.28.2, Preact 10.29.8, jsdom 30.0.1 and Vitest 4.1.11.
- The four type-check projects that cover these files (`tsc -p .`, `tsc -p src/webview`, `tsc -p tests`, `tsc -p tests/webview`) were run on a scratch copy of the repository and all pass.
- A scratch type-check file, compiled against `src/webview/tsconfig.json`, checked each compile-time claim below, including every "is a compile error" claim (each such line was marked as an expected error and the compiler confirmed the error).
- `hasInvalidRefChars`, `format`, `createBranchColours`, `branchColour` and the graph layout were bundled with esbuild into scratch scripts and run on the inputs in the example tables. `format`'s output was also rendered with Preact into jsdom. Names were compared with `git check-ref-format --branch`.
- A scratch copy of the repository was used to observe what happens without parts of `src/webview/tsconfig.json` and `src/webview/global.d.ts`, and to render `CommitTable` with a probe test. All scratch files were deleted afterwards; no repository file was modified.
- These tests were run and pass: `tests/webview/utils/{format,ref}.test.ts`, all of `tests/webview/graph/**`, `tests/webview/components/commit/GraphScroll.test.ts`, all of `tests/webview/components/ui/**`, all of `tests/webview/lib/**`, and `tests/extension/{rpc-notify,rpc-handlers,rpc-server,rpc-wire,webview-initialize,view-preferences,remote-preferences,repo-manager,webviewBridge,view-diff}.test.ts`.

---

## S. Context shared by all modules

### S.1 How the modules are reached

- **The `@/types` barrel.** `src/types/index.ts` is not part of this rewrite. It re-exports everything from `./config`, `./legacy`, `./rpc.types` and `./git.types` with the plain `export *` form. Every importer outside `src/types/` names these types through `@/types`, never through a file path. Two consequences:
  - The four file names and locations must stay as they are.
  - No two of the four files may export the same name. A duplicate makes the barrel's re-export ambiguous, which is a compile error.
- **Webview modules** are imported by their full alias path: `@/webview/types`, `@/webview/constants`, `@/webview/graph/types`, `@/webview/graph/constants`, `@/webview/graph/branchColours`, `@/webview/graph/palette`, `@/webview/utils/format`, `@/webview/utils/ref`. Those paths must stay. `tests/webview/graph/utils.test.ts` also replaces `@/webview/graph/constants` by that exact module id with `vi.doMock`, spreading the real module's named exports and overriding one. The constants must therefore be plain named exports of that module.
- `@/` maps to `src/` in `tsconfig.base.json` (`paths`), in `vitest.config.ts` (alias) and in `esbuild.js` (alias plugin). `tests-ext` compiles with its own `paths` and `tsc-alias`.

### S.2 Compiler settings that shape the types

`tsconfig.base.json` sets, among others: `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `isolatedModules`, `noUnusedLocals`, `noUnusedParameters`, `noUncheckedSideEffectImports`, `moduleDetection: "force"`, `types: []`, `noEmit: true`, `target`/`module: esnext`, `moduleResolution: bundler`. What this means here:

- **`exactOptionalPropertyTypes`.** A field declared optional (`name?: T`) may be left out but may not be set to `undefined` unless `T` includes `undefined`. Every optional field below states its exact form. Callers depend on the difference: for example, `src/webview/lib/navigation.ts` leaves `focusBranch` out by spreading an empty object rather than writing `undefined`.
- **`noUncheckedIndexedAccess`.** Indexing a `GitRepoSet` yields `GitRepoState | undefined`; callers handle the `undefined`.
- **`verbatimModuleSyntax`.** An import used only as a type must be written as a type-only import.
- **`noUnusedLocals`.** A non-exported type alias that nothing uses is a compile error.
- **`moduleDetection: "force"`** makes every `.ts` file a module, but not a `.d.ts` file. `global.d.ts` relies on staying a global script (module G).

### S.3 Projects that compile these files

| Project                                  | Files it compiles                                                                                                                            | Libraries and types                              |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| root, `tsc -p .`                         | `src/**` except `src/webview`                                                                                                                | `lib: esnext`, types `node` and `vscode`, no DOM |
| webview, `tsc -p src/webview` (module H) | everything under `src/webview`, plus what it imports from `src/types`, `src/backend/types`, `src/backend/utils` and `src/old-extension/l10n` | `lib: esnext, dom`, no Node or VS Code globals   |
| `tsc -p tests`                           | `tests/backend/**`, `tests/extension/**` and what they import                                                                                | as root                                          |
| `tsc -p tests/webview`                   | `tests/webview/**` plus `src/webview/global.d.ts`, extending module H                                                                        | as webview                                       |
| `tests-ext` (`compile-tests`)            | `tests-ext/**` and what it imports; emits CommonJS to `tests-ext/out` with `verbatimModuleSyntax: false`                                     | Node, VS Code, Mocha                             |

So the four `src/types` files must not mention any DOM, Node or VS Code type (they are compiled both with and without the DOM library). The webview modules may use the DOM library and Preact types, but no Node or VS Code type.

### S.4 The wire between webview and extension

Messages travel through VS Code's `postMessage` in both directions and arrive as JSON-like copies. A property whose value is `undefined` is dropped in transit. Neither side validates shapes against these types at run time, apart from the small checks noted per message; the types are what keeps both sides in agreement. Both the RPC messages (module A) and the older `{ command }` messages (module B) share the same channel, and each receiver ignores the other family:

- the extension's RPC server answers only objects with an own `kind: "rpc.request"`, a string `id`, a string `method` and an own `params` key;
- the webview's RPC handler reads only objects with a string `id` and `kind` `"rpc.response"` or `"rpc.notify"`;
- the webview's legacy dispatcher reads only objects with a string `command`;
- the extension's legacy bridge routes by `command` to the handlers registered for it and ignores other commands.

### S.5 Provenance bookkeeping

`scripts/provenance-baseline.json` records these inherited line counts: `rpc.types.ts` 51, `legacy.ts` 36, `config.ts` 12, `git.types.ts` 5, `src/webview/types.ts` 43, `src/webview/constants.ts` 15, `global.d.ts` 7, `src/webview/tsconfig.json` 5, `graph/types.ts` 33, `graph/constants.ts` 8, `branchColours.ts` 15, `palette.ts` 7, `format.ts` 12, `ref.ts` 6. The tests `tests/webview/utils/format.test.ts` (18) and `tests/webview/utils/ref.test.ts` (27) are inherited as well.

Because every exported name, field name, literal value, constant value and configuration option below is fixed, many short lines of a faithful rewrite will match old lines word for word, and for `src/webview/tsconfig.json` the whole file will. Such coincidences are reviewed and listed in `scripts/provenance-reviewed.json` as `docs/provenance.md` describes.

---

## A. `src/types/rpc.types.ts`

### A.1 Interface

Module path `src/types/rpc.types.ts`, reached as `@/types`. Types only: no runtime value, no default export. Ten exports.

| Export                | Kind                                                           | Definition                                                          |
| --------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------- |
| `WebviewInitialize`   | object type                                                    | `{ l10n: LocalizedStrings; config: WebviewConfig }`, both required. |
| `ScanRepoResult`      | object type                                                    | `{ repos: GitRepo[] }`, required.                                   |
| `RpcMethodMap`        | object type keyed by method name                               | For each method, `{ params: P; result: R }` (A.1.1).                |
| `RpcMethod`           | union of string literals                                       | Exactly the keys of `RpcMethodMap`.                                 |
| `SidebarPane`         | union of string literals                                       | Exactly `"refs" \| "workspace"`.                                    |
| `RpcNotificationMap`  | object type keyed by notification name                         | For each notification, the type of its payload (A.1.2).             |
| `RpcNotificationName` | union of string literals                                       | Exactly the keys of `RpcNotificationMap`.                           |
| `RpcNotification<N>`  | generic, `N extends RpcNotificationName = RpcNotificationName` | The notification envelope (A.1.3).                                  |
| `RpcRequest<M>`       | generic, `M extends RpcMethod = RpcMethod`                     | The request envelope (A.1.3).                                       |
| `RpcResponse<M>`      | generic, `M extends RpcMethod = RpcMethod`                     | The response envelope (A.1.3).                                      |

#### A.1.1 Methods: `RpcMethodMap`

Exactly seven methods, no others:

| Method                 | `params` | `result`            | Called by (webview)                         | What the extension does, and what `result` means                                                                                                                                                                                                                           |
| ---------------------- | -------- | ------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"clipboard.copy"`     | `string` | `boolean`           | `src/webview/lib/actions/clipboard.ts`      | Writes the text to the system clipboard. `true` when written, `false` when VS Code's clipboard refused. A non-string `params` yields a failure response with error text `Invalid copyToClipboard parameters`. The page shows an error dialog on `false` or on any failure. |
| `"webview.initialize"` | `null`   | `WebviewInitialize` | `src/webview/main.tsx`, once at start-up    | Answers with the page's localized strings and its display settings. The page stores the strings as `window.l10n` and hands the settings to `initializeWebviewConfig`.                                                                                                      |
| `"git.init"`           | `null`   | `boolean`           | `src/webview/pages/NoRepoPage.tsx`          | Runs VS Code's `git.init` command and answers `true` when that command finishes, whether or not the user cancelled it. A thrown error becomes a failure response, which the page shows under its button.                                                                   |
| `"repo.scan"`          | `null`   | `ScanRepoResult`    | `src/webview/lib/stores/repo-list.store.ts` | Lists the repositories of the workspace (and those added this session), sorted by path with `localeCompare`, each named after its folder.                                                                                                                                  |
| `"settings.open"`      | `null`   | `boolean`           | `src/webview/layout/MainHeader.tsx`         | Opens the Settings editor filtered to `branchwise`; answers `true`.                                                                                                                                                                                                        |
| `"docs.open"`          | `null`   | `boolean`           | `src/webview/layout/MainHeader.tsx`         | Runs the command `branchwise.openDocumentation`; answers `true`.                                                                                                                                                                                                           |
| `"walkthrough.open"`   | `null`   | `boolean`           | `src/webview/layout/MainHeader.tsx`         | Runs the command `branchwise.openWalkthrough`; answers `true`.                                                                                                                                                                                                             |

The extension side is `src/extension/rpc/handlers.ts` (one handler per method), served by `src/extension/rpc/rpc-server.ts`.

#### A.1.2 Notifications: `RpcNotificationMap`

Exactly five notifications, extension to webview, no others:

| Name               | Payload type            | Sent by                                                                             | When                                                                                                                                         | What the webview does (`src/webview/lib/rpc/rpc-handler.ts`)                                                  |
| ------------------ | ----------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `"view.showPane"`  | `{ pane: SidebarPane }` | `src/extension/view-command.ts`                                                     | The `branchwise.showBranches` command asks for the refs pane (only `"refs"` is sent today), once the page is ready.                          | Opens that pane if it is closed and remembers it; ignores a payload whose `pane` is not one of the two names. |
| `"repo.select"`    | `GitRepo`               | `src/extension/view-command.ts`                                                     | A Source Control or File History click selected a repository.                                                                                | Adds the repository to the picker list, then selects it; ignores a payload without string `name` and `path`.  |
| `"repo.rescan"`    | `null`                  | `src/extension/watchers/git.watcher.ts`, `src/extension/watchers/config.watcher.ts` | A `.git` entry appeared or went away, the workspace folders changed, or the setting `git.path` or `branchwise.maxDepthOfRepoSearch` changed. | Reloads the repository list.                                                                                  |
| `"config.changed"` | `WebviewConfig`         | `src/extension/watchers/config.watcher.ts`                                          | Any `branchwise.*` setting changed. The payload is the whole current display configuration.                                                  | Applies it (if the page already has a configuration) and reloads the graph.                                   |
| `"repo.updated"`   | `RepoUpdate`            | `src/extension/watchers/git-repo.watcher.ts`                                        | Files of the watched repository changed.                                                                                                     | Refreshes when `path` equals the selected repository exactly.                                                 |

#### A.1.3 The envelopes

**`RpcRequest<M>`** distributes over `M`. For one method it is exactly:

| Field    | Type                        | Meaning                                                                                                                                                                            |
| -------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kind`   | `"rpc.request"`             | Marks the message as a request.                                                                                                                                                    |
| `id`     | `string`                    | Correlation id chosen by the page, unique per request. The page uses `crypto.randomUUID()`.                                                                                        |
| `method` | `M`                         | The method name.                                                                                                                                                                   |
| `params` | `RpcMethodMap[M]["params"]` | The method's parameters. For the six methods without parameters this is the value `null`, which must be present: the server ignores a request object that has no own `params` key. |

So `RpcRequest` without an argument is the union of seven object types, and narrowing on `method` gives that method's `params` type. `RpcRequest<never>` is `never`.

**`RpcResponse<M>`** is a union of two object types. It does **not** distribute over `M`:

| Member  | Fields                                                                                     |
| ------- | ------------------------------------------------------------------------------------------ |
| success | `kind: "rpc.response"`; `id: string`; `success: true`; `result: RpcMethodMap[M]["result"]` |
| failure | `kind: "rpc.response"`; `id: string`; `success: false`; `error: string`                    |

`id` repeats the request's id. For `RpcResponse<"clipboard.copy">` the success `result` is `boolean`. For the default argument (all methods), `result` is the union `boolean | WebviewInitialize | ScanRepoResult`. In practice the server answers every request exactly once; a handler result of `undefined` travels as `null`; the failure `error` is the thrown error's message, `Unknown RPC method: <method>` for an unknown method, or a delivery error's message.

**`RpcNotification<N>`** distributes over `N`. For one name it is exactly:

| Field     | Type                    | Meaning                                                                                                                                             |
| --------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kind`    | `"rpc.notify"`          | Marks the message as a notification.                                                                                                                |
| `id`      | `string`                | Unique within the extension session (`notify-1`, `notify-2`, ... today). The webview requires it to be a string and otherwise ignores it.           |
| `name`    | `N`                     | The notification name.                                                                                                                              |
| `message` | `RpcNotificationMap[N]` | The payload. The key must be present: the webview ignores a notification without an own `message` key, so the sender turns `undefined` into `null`. |

`RpcNotification` without an argument is the union of five object types; `RpcNotification<never>` is `never`.

#### A.1.4 Who uses what

| Export                                                         | Source files                                                                                                                                                                                                                                | Tests                                                                                                                                                               |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WebviewInitialize`                                            | `src/extension/handlers/initialize.ts`                                                                                                                                                                                                      | through `webviewInitialize` in `tests/extension/{webview-initialize,rpc-wire}.test.ts`                                                                              |
| `ScanRepoResult`                                               | `src/extension/handlers/scan-repo.ts`                                                                                                                                                                                                       | through `scanRepos` in `tests/extension/scan-repo*.test.ts`                                                                                                         |
| `RpcMethodMap`, `RpcMethod`                                    | `src/extension/rpc/handlers.ts` (handler table checked against every method and result), `src/extension/rpc/rpc-server.ts`, `src/webview/lib/rpc/rpc-client.ts` (`request<M>(method, params)` returns `Promise<RpcMethodMap[M]["result"]>`) | `tests/extension/rpc-handlers.test.ts` (compile-time: the handler table's keys equal `RpcMethod`; the `repo.scan` handler's awaited result equals its `result`)     |
| `SidebarPane`                                                  | `src/extension/view-command.ts`, `src/webview/lib/navigation.ts` (`showPane`), `src/webview/lib/rpc/rpc-handler.ts` (a record keyed by `SidebarPane` lists both panes)                                                                      | through `view.showPane` cases in `tests/webview/lib/rpc-handler.test.ts`                                                                                            |
| `RpcNotificationMap`, `RpcNotificationName`, `RpcNotification` | `src/extension/rpc/rpc-notify.ts` (`notify<N>(name, message: RpcNotificationMap[N])`), `src/webview/lib/rpc/rpc-handler.ts` (a record keyed by `RpcNotificationName`)                                                                       | `tests/extension/rpc-notify.test.ts` (a mapped object over every name; three `@ts-expect-error` calls)                                                              |
| `RpcRequest`                                                   | `src/webview/global.d.ts` (what `postMessage` accepts), `src/webview/lib/rpc/rpc-client.ts`                                                                                                                                                 | `tests/webview/lib/{rpc-client,rpc-client-state,rpc-handler-client,menu-text}.test.ts`, `tests/webview/lib/actions/clipboard.test.ts` (as casts of posted messages) |
| `RpcResponse`                                                  | `src/extension/rpc/rpc-server.ts`                                                                                                                                                                                                           | `tests/webview/lib/actions/clipboard.test.ts`, `tests/webview/lib/menu-text.test.ts` (`RpcResponse<"clipboard.copy">`)                                              |

### A.2 Dependencies the implementation must use

- `LocalizedStrings`, type-only, from `@/old-extension/l10n/webviewL10n`: the object of every localized webview string, keyed by string name.
- `GitRepo` and `RepoUpdate` (module D) and `WebviewConfig` (module C), type-only. Either path works: through the barrel `@/types` (a type-only cycle, which the compiler accepts) or from the sibling files `./git.types` and `./config`.

Nothing else.

### A.3 Behaviour

The module runs nothing. Its behaviour is what the compiler accepts, which callers rely on as follows.

1. Adding, removing or renaming a method changes `RpcMethod`. `src/extension/rpc/handlers.ts` checks its table against a mapped type over `RpcMethod`, so the handler table stops compiling until it matches, and `tests/extension/rpc-handlers.test.ts` asserts at compile time that its keys are exactly `RpcMethod`.
2. Adding, removing or renaming a notification changes `RpcNotificationName`. The webview's handler table is a `Record` over it and must list each name.
3. `rpcNotify.notify("repo.rescan", {})`, `rpcNotify.notify("repo.updated", null)` and `rpcNotify.notify("repo.unknown", null)` must each be compile errors (checked by `tests/extension/rpc-notify.test.ts`). So `"repo.rescan"`'s payload is exactly `null`, and `"repo.updated"`'s payload requires `path`.
4. `rpcClient.request("webview.initialize", null)` resolves to a `WebviewInitialize`, and `main.tsx` destructures `l10n` and `config` from it without casts.
5. `RpcRequest` is one of the two types `postMessage` accepts in the webview (module G), so a request built for one method with another method's params type does not compile.
6. `SidebarPane` must be exactly the two names: a record in `rpc-handler.ts` typed by it lists `refs` and `workspace`, and `navigation.ts` treats any pane other than `"refs"` as the workspace pane.

### A.4 Concrete examples

These are values that type-check and that were observed on the wire (ids shortened).

- Request: `{"kind":"rpc.request","id":"8f0c…","method":"clipboard.copy","params":"abc123"}`.
- Request without parameters: `{"kind":"rpc.request","id":"41d2…","method":"repo.scan","params":null}`.
- Success: `{"kind":"rpc.response","id":"41d2…","success":true,"result":{"repos":[{"name":"app","path":"/work/app"}]}}`.
- Failure: `{"kind":"rpc.response","id":"9e77…","success":false,"error":"Unknown RPC method: repo.missing"}`.
- Notifications: `{"kind":"rpc.notify","id":"notify-1","name":"view.showPane","message":{"pane":"refs"}}`; `{"kind":"rpc.notify","id":"notify-2","name":"repo.rescan","message":null}`; `{"kind":"rpc.notify","id":"notify-3","name":"repo.updated","message":{"path":"/work/app"}}`.
- Compile-time: `RpcRequest<"git.init">` with `params: undefined` is an error; with `params: null` it compiles. An object `{ kind: "rpc.notify", id: "x", name: "repo.rescan", message: { path: "/a" } }` is not an `RpcNotification`.

### A.5 Non-functional requirements

- Types only. Loading the compiled module has no effect (esbuild emits nothing for it; `tests-ext` emits an empty CommonJS module).
- Must compile in every project of S.3, so it may not refer to DOM, Node or VS Code types.
- Type-only imports (S.2).

### A.6 Test coverage

Covered today:

- The method set and the handler results match the map at compile time (`tests/extension/rpc-handlers.test.ts`, "matches the method map at compile time").
- Every notification name has a payload of the declared type, and the envelope reaches the webview as `{ kind, id, name, message }` (`tests/extension/rpc-notify.test.ts`, "delivers every notification in the form the webview accepts"). Wrong payloads and unknown names are compile errors ("rejects a payload that does not match its name at compile time").
- The wire behaviour of requests, responses and notifications on both sides: `tests/extension/{rpc-server,rpc-wire,rpc-notify}.test.ts`, `tests/webview/lib/{rpc-client,rpc-client-state,rpc-handler,rpc-handler-client}.test.ts`.

Gaps (compile-time checks; a file under `tests/webview/` is type-checked by `tsc -p tests/webview`, and `tests/backend/types/shapes.test.ts` shows the pattern of a runtime `it` that holds `@ts-expect-error` lines):

1. **Narrowing a request.** Setup: a variable of type `RpcRequest`. Call: read `params` inside a check that `method` is `"clipboard.copy"`, and once outside it. Expected: inside, assigning `params` to a `string` compiles; outside, the same assignment is an expected error.
2. **Parameterless methods carry `null`.** Setup: object literals typed `RpcRequest<"git.init">`. Expected: `params: null` compiles; `params: undefined` and a missing `params` are errors.
3. **Response members.** Setup: literals typed `RpcResponse<"clipboard.copy">`. Expected: `{ kind: "rpc.response", id: "1", success: true, result: true }` and `{ kind: "rpc.response", id: "1", success: false, error: "x" }` compile; a success with `result: "yes"` and a failure without `error` are errors.
4. **Exact name sets.** Expected: `RpcMethod` equals the seven names of A.1.1; `RpcNotificationName` equals the five names of A.1.2; `SidebarPane` equals `"refs" | "workspace"` (use `expectTypeOf<…>().toEqualTypeOf<…>()`).
5. **Notification union.** Expected: `{ kind: "rpc.notify", id: "x", name: "repo.rescan", message: { path: "/a" } }` typed `RpcNotification` is an error; with `message: null` it compiles.
6. **Record keys.** Expected: `keyof WebviewInitialize` is `"l10n" | "config"` and `keyof ScanRepoResult` is `"repos"`.

### A.7 Questions

- **rpc.types Q1.** `RpcRequest` and `RpcNotification` distribute over their type argument, but `RpcResponse` does not: for a union of methods, a success response may carry any of their results. Today only the server builds responses, with the default argument. Is the asymmetry intended?
- **rpc.types Q2.** `"git.init"`, `"settings.open"`, `"docs.open"` and `"walkthrough.open"` declare `boolean` results, yet their handlers only ever answer `true`; failures arrive as failure responses, and no caller reads the value. Should the result be `true`, `null`, or stay `boolean` for future use?
- **rpc.types Q3.** `SidebarPane` includes `"workspace"`, which the extension never sends today (only `branchwise.showBranches` exists, which sends `"refs"`). The webview handles both. Keep it for a future command?
- **rpc.types Q4.** `WebviewInitialize.l10n` takes its type from a module under `src/old-extension/`. Is that dependency meant to move with a later rewrite of the string table?

---

## B. `src/types/legacy.ts`

### B.1 Interface

Module path `src/types/legacy.ts`, reached as `@/types`. Types only. Twelve exports.

| Export                 | Definition                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `GitRepoSet`           | an object type with a string index signature: `{ [repo: string]: GitRepoState }`                                               |
| `BranchDisplay`        | `"filter" \| "focus" \| "ancestors"`                                                                                           |
| `FocusDimming`         | `"subtle" \| "strong"`                                                                                                         |
| `GraphPreferences`     | object type, B.1.1                                                                                                             |
| `GitRepoState`         | object type, B.1.2                                                                                                             |
| `RequestSelectRepo`    | `{ command: "selectRepo"; repo: string }`                                                                                      |
| `RequestSaveRepoState` | `{ command: "saveRepoState"; repo: string; state: Partial<GitRepoState> }`                                                     |
| `RequestViewDiff`      | `{ command: "viewDiff"; repo: string; commitHash: string; oldFilePath: string; newFilePath: string; type: GitFileChangeType }` |
| `ResponseViewDiff`     | `{ command: "viewDiff"; success: boolean }`                                                                                    |
| `ResponseRefresh`      | `{ command: "refresh" }`                                                                                                       |
| `RequestMessage`       | union, B.1.3                                                                                                                   |
| `ResponseMessage`      | union, B.1.4                                                                                                                   |

All fields are required unless stated otherwise.

#### B.1.1 `GraphPreferences`

Five display choices saved with a repository's record and put back when that repository is selected again.

| Field                | Type            | Presence                                             | Meaning                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------- | --------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `branchDisplay`      | `BranchDisplay` | required                                             | How the selected branch shapes the graph. `"filter"`: only that branch's history is loaded. `"focus"`: the whole graph is loaded and the branch's first-parent history is emphasised. `"ancestors"`: the whole graph is loaded and every ancestor of the branch, merged ones included, stays bright. The header's View control uses these three strings as its values.                                        |
| `focusBranch`        | `string`        | optional; may be left out but not set to `undefined` | The emphasis target to restore: a branch name as the branch list spells it (local names, remote ones as `remotes/<remote>/<branch>`), or `"*"` when the user chose all branches, which restores as no target. When left out, or when the saved branch no longer exists, restoring picks the checked-out branch (or all branches when there is none). Writers leave it out when `branchDisplay` is `"filter"`. |
| `focusPaused`        | `boolean`       | required                                             | The emphasis is switched off while its target is kept.                                                                                                                                                                                                                                                                                                                                                        |
| `focusDimming`       | `FocusDimming`  | required                                             | How strongly unrelated and merged history is dimmed. `"subtle"` and `"strong"` are also the option values of the Dimming select.                                                                                                                                                                                                                                                                              |
| `showRemoteBranches` | `boolean`       | required                                             | The global switch for remote-tracking branches in the graph.                                                                                                                                                                                                                                                                                                                                                  |

#### B.1.2 `GitRepoState`

The record the extension stores for one repository. `GitRepoSet` maps each repository's root path (the same string the webview selects) to its record. The whole set lives in VS Code's workspace state under the key `repoStates`.

| Field              | Type               | Presence                                             | Meaning                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------ | ------------------ | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `columnWidths`     | `number[] \| null` | required                                             | Either four widths in CSS pixels, cell padding counted, for the graph, date, author and commit-hash columns in that order, or `null` when the user has never resized the table, in which case automatic table layout applies. The description column has no entry. The webview uses the widths only when there are exactly four finite positive numbers. A record created by default is `{ columnWidths: null }`. |
| `hiddenRemotes`    | `string[]`         | optional; may be left out but not set to `undefined` | Remote names the user switched off for this repository: their remote-tracking branches are left out of the branch list and the graph. Every writer stores them sorted and without repeats. Left out means none.                                                                                                                                                                                                   |
| `graphPreferences` | `GraphPreferences` | optional; may be left out but not set to `undefined` | The choices of B.1.1. Left out until the page first saves them.                                                                                                                                                                                                                                                                                                                                                   |

#### B.1.3 `RequestMessage` (webview to extension)

A union whose `command` values are exactly these 28 names (checked with the compiler):

| Member                                                                                                            | Sent by                                                                                                           | What the extension does                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `{ command: "cancelAction"; repo: string; requestId: string }`                                                    | `src/webview/lib/remote-actions.tsx` (Cancel in a running dialog)                                                 | Aborts the Git processes of the action with that `requestId`, if it runs for that `repo`. No answer of its own.                                                                                                                                        |
| `{ command: "cancelRepositoryQuery"; repo: string; requestId: string }`                                           | `src/webview/lib/repository-actions.tsx`                                                                          | Aborts the repository query with that id, if it runs for that `repo`; the cancelled query then answers nothing.                                                                                                                                        |
| `{ command: "viewReady" }`                                                                                        | `src/webview/main.tsx`, once the first repository list has loaded                                                 | Read by `src/extension/repoSelection.ts`, not by the legacy bridge: the page counts as listening, and a pending pane request and repository selection are sent.                                                                                        |
| every member of `ActionRequest` (17 commands)                                                                     | action code in the webview                                                                                        | See `docs/clean-room/backend-types.md` (module A there).                                                                                                                                                                                               |
| every member of `QueryRequest` (`repositoryQuery`, `loadRemotes`, `commitDetails`, `loadBranches`, `loadCommits`) | query code in the webview                                                                                         | See `docs/clean-room/backend-types.md` (module C there).                                                                                                                                                                                               |
| `RequestSelectRepo`                                                                                               | `src/webview/lib/actions.ts` (`selectRepo`)                                                                       | Answers with `repoState` for that repository (its stored record, or `{ columnWidths: null }`), makes it the watched repository, and cancels graph queries of a previously selected one.                                                                |
| `RequestSaveRepoState`                                                                                            | `src/webview/lib/actions.ts` (hidden remotes, column widths), `src/webview/lib/navigation.ts` (graph preferences) | Overlays the fields present in `state` on the stored record (a missing record starts as `{ columnWidths: null }`) and persists it. The webview puts one field in each message, so saving one field never resets another. No answer.                    |
| `RequestViewDiff`                                                                                                 | `src/webview/lib/actions.ts` (`viewDiff`)                                                                         | Opens VS Code's diff editor between the file at `<commitHash>^` (`oldFilePath`) and at `commitHash` (`newFilePath`), then answers `ResponseViewDiff`. Paths are relative to the repository root with `/` separators; `type` is the change kind of B.2. |

#### B.1.4 `ResponseMessage` (extension to webview)

A union whose `command` values are exactly these 27 names (`viewDiff` and the action and query names occur in both unions):

| Member                                                                                                       | Sent when                                                                                                                        | What the webview does (`src/webview/lib/dispatcher.ts` routes by `command`)                                                                                      |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{ command: "repoState"; repo: string; state: GitRepoState }`                                                | After `selectRepo`; after a remote rename or removal changed the hidden remotes; after a repository-state query reconciled them. | `receiveRepoState` in `actions.ts`: stores the record; fields the page already holds for that repository win, except `hiddenRemotes`, which the message decides. |
| `{ command: "graphQueryError"; query: GraphQueryCommand; repo: string; requestId: string; message: string }` | A graph query (`loadBranches`, `loadCommits`, `commitDetails`) failed and was not superseded. `message` is the error's text.     | `handleGraphQueryError`: an error dialog for `commitDetails`, otherwise an inline error for that list.                                                           |
| `{ command: "fileHistory"; repo: string; path: string }`                                                     | After `repo.select` for a File History click. `path` is repository-relative with `/` separators.                                 | Selects `repo` and opens the history of `path`.                                                                                                                  |
| every member of `ActionResponse`                                                                             | an action finished                                                                                                               | action result handling                                                                                                                                           |
| every member of `QueryResponse`                                                                              | a query finished                                                                                                                 | per-query handlers                                                                                                                                               |
| `ResponseViewDiff`                                                                                           | after `viewDiff`; `success` says whether VS Code opened the diff                                                                 | shows the `unableToViewDiff` error dialog when `success` is `false`                                                                                              |
| `ResponseRefresh`                                                                                            | the panel became visible again after being hidden; after an undone file restore                                                  | reloads everything shown for the selected repository                                                                                                             |

#### B.1.5 Who uses what

| Export                                                                            | Source files                                                                                                                                                                                                                                                                                                                     | Tests                                                                                                                                         |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `GitRepoSet`                                                                      | `src/old-extension/{repoManager,extensionState}.ts`, `src/webview/lib/stores.ts` (`repoStates` signal)                                                                                                                                                                                                                           | `tests/extension/{remote-preferences,repo-manager}.test.ts`, `tests/webview/lib/preference-lifetime.test.ts`, `tests-ext/repoManager.test.ts` |
| `BranchDisplay`, `FocusDimming`                                                   | re-exported by `src/webview/types.ts` (module E); webview callers import them from there                                                                                                                                                                                                                                         | through module E                                                                                                                              |
| `GraphPreferences`                                                                | `src/webview/lib/navigation.ts`                                                                                                                                                                                                                                                                                                  | `tests/extension/view-preferences.test.ts`, `tests/webview/lib/{preference-lifetime,actions}.test.ts`                                         |
| `GitRepoState`                                                                    | `src/old-extension/repoManager.ts`, `src/webview/lib/actions.ts`                                                                                                                                                                                                                                                                 | `tests/webview/components/commit/ColumnResize.test.ts`                                                                                        |
| `RequestSelectRepo`, `RequestSaveRepoState`, `RequestViewDiff`, `ResponseRefresh` | only as members of the unions                                                                                                                                                                                                                                                                                                    | through the unions                                                                                                                            |
| `ResponseViewDiff`                                                                | `src/webview/lib/handler/view-diff.ts`                                                                                                                                                                                                                                                                                           | `tests/extension/view-diff.test.ts` (the posted objects)                                                                                      |
| `RequestMessage`                                                                  | `src/old-extension/{messageHandler,webviewBridge}.ts` (`onMessage<T extends RequestMessage["command"]>` and `Extract` by command), `src/webview/global.d.ts`                                                                                                                                                                     | `tests/extension/{webviewBridge,view-preferences}.test.ts`, `tests/webview/lib/{uncorrelated-replies,preference-lifetime,actions}.test.ts`    |
| `ResponseMessage`                                                                 | `src/old-extension/{messageHandler,webviewBridge}.ts`, `src/extension/view-command.ts`, `src/webview/lib/dispatcher.ts` (a handler table keyed by `ResponseMessage["command"]`), `src/webview/lib/actions.ts`, `src/webview/lib/handler/{commit-details,load-branches,graph-query-error,load-commits}.ts` (`Extract` by command) | through those modules                                                                                                                         |

### B.2 Dependencies the implementation must use

Type-only, from `@/backend/types`:

- `ActionRequest`, `ActionResponse`: members of the two unions.
- `QueryRequest`, `QueryResponse`: members of the two unions.
- `GraphQueryCommand`: the type of `graphQueryError.query` (`"loadBranches" | "loadCommits" | "commitDetails"`).
- `GitFileChangeType`: the type of `RequestViewDiff.type` (`"A" | "M" | "D" | "R"`).

Nothing else.

### B.3 Behaviour

The module runs nothing. Compile-time properties that callers rely on:

1. `Extract<RequestMessage, { command: K }>` and `Extract<ResponseMessage, { command: K }>` give exactly one member for every name except the shared ones. The legacy bridge's `onMessage(command, handler)` hands each handler that member; the dispatcher's handler table and the webview handlers pick theirs the same way. `Extract<ResponseMessage, { command: "viewDiff" }>` is exactly `ResponseViewDiff`, and `Extract<RequestMessage, { command: "viewDiff" }>` exactly `RequestViewDiff`.
2. The command sets are exactly those of B.1.3 and B.1.4. The webview's `postMessage` accepts only `RequestMessage` (or an `RpcRequest`), so posting a response-only command such as `refresh` does not compile.
3. `GitRepoState` without `columnWidths` does not compile; `{ columnWidths: null, hiddenRemotes: undefined }` does not compile; the minimal record is `{ columnWidths: null }`.
4. `RequestSaveRepoState.state` accepts any subset of the record's fields (including `{}`), each in its declared form; `{ columnWidths: undefined }` does not compile.
5. `GraphPreferences` without `focusBranch` compiles; with `focusBranch: undefined` it does not.
6. `GitRepoSet` lookups have the type `GitRepoState | undefined` (S.2).

What travels, in practice:

- The page saves hidden remotes, column widths and preferences in separate `saveRepoState` messages, each with one field. The extension merges them, so all three survive and come back together in the next `repoState` (`tests/extension/view-preferences.test.ts`).
- A repository never saved answers `selectRepo` with `{ command: "repoState", repo, state: { columnWidths: null } }`.
- The stored set is ordinary JSON in workspace state; nothing validates it on the way in or out, and the webview validates column widths itself before use.

### B.4 Concrete examples

- `{"command":"saveRepoState","repo":"/work/app","state":{"hiddenRemotes":["origin"]}}`
- `{"command":"saveRepoState","repo":"/work/app","state":{"graphPreferences":{"branchDisplay":"focus","focusBranch":"topic","focusPaused":true,"focusDimming":"strong","showRemoteBranches":false}}}`
- After those and `{"command":"saveRepoState","repo":"/work/app","state":{"columnWidths":[80,90,100,110]}}`, a `selectRepo` answers `{"command":"repoState","repo":"/work/app","state":{"columnWidths":[80,90,100,110],"hiddenRemotes":["origin"],"graphPreferences":{…the same…}}}`.
- `{"command":"graphQueryError","query":"loadCommits","repo":"/work/app","requestId":"graph-3","message":"Repository was removed"}` (the webview numbers its graph requests `graph-1`, `graph-2`, …).
- `{"command":"fileHistory","repo":"/work/app","path":"src/main.ts"}`, `{"command":"viewDiff","success":false}`, `{"command":"refresh"}`.
- A focus target the user cleared is saved as `"focusBranch":"*"` and restores as all branches with no target (`tests/webview/lib/preference-lifetime.test.ts`, "remembers an explicitly cleared target instead of focusing HEAD again on reopening").

### B.5 Non-functional requirements

As A.5: types only, no import-time effect, no DOM, Node or VS Code types, type-only imports. The record types must stay JSON-serialisable: they are stored in workspace state and cross the wire.

### B.6 Test coverage

Covered today (at run time, through the modules that produce and consume the messages): merging and persisting partial saves and the `repoState` answer (`tests/extension/view-preferences.test.ts`); hidden-remote bookkeeping (`tests/extension/remote-preferences.test.ts`); pruning records of missing folders (`tests/extension/repo-manager.test.ts`); sorted persistence (`tests-ext/repoManager.test.ts`); `graphQueryError` (`tests/extension/graph-queries.test.ts`); `refresh` (`tests/extension/{message-protocol,restore-undo}.test.ts`); `fileHistory` (`tests/extension/view-command-flow.test.ts`); `viewDiff` (`tests/extension/view-diff.test.ts`); preference restore and the `"*"` target (`tests/webview/lib/preference-lifetime.test.ts`); saved column widths (`tests/webview/components/commit/ColumnResize.test.ts`).

Gaps:

1. **Command sets.** Expected, at compile time: `RequestMessage["command"]` equals the 28 names of B.1.3 and `ResponseMessage["command"]` the 27 names of B.1.4.
2. **Record forms.** Expected: `{}` as `GitRepoState` is an error; `{ columnWidths: null, hiddenRemotes: undefined }` is an error; `{ columnWidths: [1, 2, 3, 4], hiddenRemotes: ["origin"], graphPreferences: { branchDisplay: "filter", focusPaused: false, focusDimming: "subtle", showRemoteBranches: true } }` compiles.
3. **Optional focus target.** Expected: `GraphPreferences` with `focusBranch: undefined` is an error; with `"*"` or without the field it compiles.
4. **Partial saves.** Expected: `RequestSaveRepoState` with `state: {}` compiles; with `state: { columnWidths: undefined }` it is an error.
5. **Shared names.** Expected: `Extract<ResponseMessage, { command: "viewDiff" }>` equals `ResponseViewDiff` and `Extract<RequestMessage, { command: "viewDiff" }>` equals `RequestViewDiff`; `graphQueryError` with `query: "repositoryQuery"` is an error.
6. **Default record.** Setup: the legacy message handlers with an empty repository manager. Call: receive `{ command: "selectRepo", repo: "/never" }`. Expected: exactly one post, `{ command: "repoState", repo: "/never", state: { columnWidths: null } }`.

### B.7 Questions

- **legacy Q1.** `ResponseViewDiff` carries neither `repo` nor a request id, so a late failure shows its error in whatever repository is current. Intended?
- **legacy Q2.** `graphQueryError` reports its failure text in `message`, while actions and repository queries use `status`. Keep the two spellings?
- **legacy Q3.** `columnWidths` claims `number[] | null`, but the stored value is whatever JSON the workspace holds; the extension merges patches without checking and only the webview validates. Should the type (or the extension) admit unknown data?
- **legacy Q4.** `hiddenRemotes` is declared as any list, although every writer keeps it sorted and without repeats and readers compare lists as JSON. Should the order be part of the contract?
- **legacy Q5.** `focusBranch` uses `"*"` as "the user chose no target", the same string as the webview's all-branches value, and absence as "use the checked-out branch". Neither sentinel is expressed in the type. Intended?
- **legacy Q6.** `BranchDisplay`, `FocusDimming` and `GraphPreferences` are current view preferences, yet live in a module named for the older protocol. Should they move?
- **legacy Q7.** `RequestMessage` includes `viewReady`, which the legacy bridge never handles (only the repository-selection listener reads it). Should it belong to the union?

---

## C. `src/types/config.ts`

### C.1 Interface

Module path `src/types/config.ts`, reached as `@/types`. Types only. Three exports.

| Export          | Definition                                                        |
| --------------- | ----------------------------------------------------------------- |
| `DateFormat`    | `"Date & Time" \| "Date Only" \| "Relative"`                      |
| `GraphStyle`    | `"rounded" \| "angular"`                                          |
| `WebviewConfig` | `Readonly<{ … }>` of exactly the eight fields below, all required |

`WebviewConfig` fields (every field is `readonly`; `graphColours` is additionally a read-only array):

| Field                         | Type                | Source (extension)                                                                                                                                                                          | Meaning and use (webview)                                                                                                                                 |
| ----------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `autoCenterCommitDetailsView` | `boolean`           | setting `branchwise.autoCenterCommitDetailsView`, default `true`                                                                                                                            | When the details view opens, `true` scrolls it to the middle of the window; `false` scrolls only as far as needed to show the commit row and the details. |
| `dateFormat`                  | `DateFormat`        | setting `branchwise.dateFormat`, default `"Date & Time"`, passed through unchecked                                                                                                          | What the date column shows: day and time, day only, or a relative time. Anything not recognised is shown as day and time.                                 |
| `graphColours`                | `readonly string[]` | setting `branchwise.graphColours`, default the twelve colours of `package.json`; entries that do not match the setting's colour pattern are dropped; a non-list setting yields the defaults | The branch palette, used by module L. May be empty. Entries are kept as written.                                                                          |
| `graphStyle`                  | `GraphStyle`        | setting `branchwise.graphStyle`, default `"rounded"`, passed through unchecked                                                                                                              | `"angular"` draws lane changes with straight corners; anything else draws curves.                                                                         |
| `initialLoadCommits`          | `number`            | setting `branchwise.initialLoadCommits`, default 300, made a whole number between 1 and 1 000 000                                                                                           | Rows asked for on a first load.                                                                                                                           |
| `loadMoreCommits`             | `number`            | setting `branchwise.loadMoreCommits`, default 100, same bounds                                                                                                                              | Rows added by each "load more".                                                                                                                           |
| `locale`                      | `string`            | `vscode.env.language` (for example `"en"`, `"fr"`, `"zh-cn"`)                                                                                                                               | Language tag for `Intl` date, number and collation formatting.                                                                                            |
| `showCurrentBranchByDefault`  | `boolean`           | setting `branchwise.showCurrentBranchByDefault`, default `false`                                                                                                                            | In filter mode, a repository opens on the checked-out branch instead of all branches.                                                                     |

#### C.1.1 Who uses what

| Export                     | Source files                                                                                                                                                                                                                                                             | Tests                                                                                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DateFormat`, `GraphStyle` | `src/extension/config.ts` (typed setting readers)                                                                                                                                                                                                                        | through `extConfig` in `tests/extension/config*.test.ts`                                                                                                                                                              |
| `WebviewConfig`            | `src/types/rpc.types.ts` (module A), `src/extension/handlers/initialize.ts` (`webviewConfig()` builds it), `src/webview/lib/webview-config.ts` (the page's copy, in a signal), `src/webview/lib/actions.ts` (`applyWebviewConfig`), `src/webview/lib/rpc/rpc-handler.ts` | `tests/extension/rpc-notify.test.ts`, `tests/webview/lib/{webview-config,config-changed,actions,rpc-handler}.test.ts`, `tests/webview/test-utils.ts`, `tests/webview/utils/fileTree.test.ts` (literal configurations) |

The page reads individual fields in `CommitGraph.tsx` (`graphStyle`), `CommitDetails.tsx` (`autoCenterCommitDetailsView`), `palette.ts` (`graphColours`), `actions.ts` (`initialLoadCommits`, `loadMoreCommits`), `handler/load-branches.ts` (`showCurrentBranchByDefault`), `utils/date.ts` (`locale`, `dateFormat`) and `utils/fileTree.ts` (`locale`).

### C.2 Dependencies the implementation must use

None.

### C.3 Behaviour

The module runs nothing. Compile-time properties callers rely on:

1. Assigning to any field of a `WebviewConfig` is a compile error, and so is changing `graphColours` in place (`push`, index assignment). A mutable `string[]` may still be assigned to `graphColours` when building the object.
2. The key set is exactly the eight names; `tests/extension/webview-initialize.test.ts` checks at run time that the built configuration has exactly these keys ("holds exactly the display settings, with their defaults and the display language").
3. The object is plain data: the extension sends it inside `webview.initialize` and whole in `config.changed`, and the page replaces its copy wholesale.

### C.4 Concrete examples

- Defaults with display language French: `{"autoCenterCommitDetailsView":true,"dateFormat":"Date & Time","graphColours":["#0085d9","#d9008f","#00d90a","#d98500","#a300d9","#ff0000","#00d9cc","#e138e8","#85d900","#dc5b23","#6f24d6","#ffcc00"],"graphStyle":"rounded","initialLoadCommits":300,"loadMoreCommits":100,"locale":"fr","showCurrentBranchByDefault":false}`.
- Stored `initialLoadCommits: 12.7` and `graphColours: ["bad", "#123456"]` arrive as `12` and `["#123456"]`.
- A hand-edited `dateFormat: "Nonsense"` or `graphStyle: 7` reaches the page unchanged (`tests/extension/config-settings.test.ts`), although the types say otherwise.

### C.5 Non-functional requirements

As A.5.

### C.6 Test coverage

Covered today: the built configuration's key set, defaults and sanitised values (`tests/extension/webview-initialize.test.ts`); unchecked pass-through of `dateFormat` and `graphStyle` (`tests/extension/config-settings.test.ts`); the page's use of a changed configuration (`tests/webview/lib/{config-changed,webview-config,rpc-handler}.test.ts`).

Gaps:

1. **Read-only.** Setup: a variable of type `WebviewConfig`. Expected: assigning `locale` is an error; calling `graphColours.push("#fff")` is an error; spreading it with a new mutable `graphColours` array compiles.
2. **Unions match the manifest.** Setup: read `contributes.configuration.properties["branchwise.dateFormat"].enum` and `["branchwise.graphStyle"].enum` from `package.json`; list the union members in an object keyed by the union so that a missing or extra member fails to compile. Expected: the sorted lists are equal (`["Date & Time", "Date Only", "Relative"]` and `["angular", "rounded"]`).
3. **Key set at compile time.** Expected: `keyof WebviewConfig` equals the eight names.

### C.7 Questions

- **types-config Q1.** `DateFormat` and `GraphStyle` are closed unions, yet the page can receive any value a user wrote in `settings.json`; consumers cope by treating unknown values as the defaults. Should the types admit that, or should the extension validate?
- **types-config Q2.** `graphColours` entries arrive exactly as written, including surrounding spaces (the setting's pattern allows them), and are used as SVG colour attributes. Should they be trimmed?

---

## D. `src/types/git.types.ts`

### D.1 Interface

Module path `src/types/git.types.ts`, reached as `@/types`. Types only. Two exports.

| Export       | Definition                                      | Meaning                                                                                                                                                                                                                                                                                                  |
| ------------ | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GitRepo`    | `{ name: string; path: string }`, both required | One repository the page can show. `path` is the repository's root folder as the extension normalises it (forward slashes; on Windows a lower-case drive letter), which is also the key of its stored state and the value the page selects. `name` is the last segment of that path, shown in the picker. |
| `RepoUpdate` | `{ path: string }`, required                    | The payload of `repo.updated`: the root path of the watched repository whose files changed.                                                                                                                                                                                                              |

| Export       | Source files                                                                                                                                                                                              | Tests                                |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `GitRepo`    | `src/types/rpc.types.ts` (`ScanRepoResult`, `repo.select`), `src/webview/App.tsx`, `src/webview/layout/MainHeader.tsx`, `src/webview/lib/stores/repo-list.store.ts`, `src/webview/lib/rpc/rpc-handler.ts` | `tests/extension/rpc-notify.test.ts` |
| `RepoUpdate` | `src/types/rpc.types.ts` (`repo.updated`)                                                                                                                                                                 | `tests/extension/rpc-notify.test.ts` |

### D.2 Dependencies the implementation must use

None.

### D.3 Behaviour

Types only. In practice: the extension builds `GitRepo` values as `{ name: <last path segment>, path: <root path> }` for `repo.scan` and `repo.select`. The page's picker keeps them sorted by `path` with `localeCompare` and replaces an entry with the same `path`. The page accepts a `repo.select` payload only when both fields are strings, and refreshes on `repo.updated` only when `path` equals the selected repository exactly (no normalisation).

### D.4 Concrete examples

`{"name":"app","path":"/work/app"}`; `{"path":"/work/app"}`.

### D.5 Non-functional requirements

As A.5.

### D.6 Test coverage

Covered today at run time: scan results (`tests/extension/scan-repo*.test.ts`), `repo.select` and `repo.updated` handling (`tests/webview/lib/rpc-handler.test.ts`), the envelope (`tests/extension/rpc-notify.test.ts`).

Gap: **Shapes.** Expected, at compile time: `{ name: "a" }` and `{ path: "/a" }` are not `GitRepo`; `{}` is not `RepoUpdate`; `RpcNotificationMap["repo.select"]` equals `GitRepo` and `RpcNotificationMap["repo.updated"]` equals `RepoUpdate`.

### D.7 Questions

- **types-git Q1.** `name` is only the folder name, so two repositories in folders of the same name look alike in the picker. Intended?

---

## E. `src/webview/types.ts`

### E.1 Interface

Module path `src/webview/types.ts`, reached as `@/webview/types`. Types only. Ten exports (two of them re-exports).

| Export                                               | Definition                                                                                                                                                                                           |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CommitBranchType`                                   | `"*"` united with any other string, written so that editors still suggest `"*"` (the literal `"*"` together with the string type intersected with an empty object type). Every string is assignable. |
| `BranchDisplay`                                      | type-only re-export of `BranchDisplay` from `@/types` (module B); the very same type                                                                                                                 |
| `FocusDimming`                                       | type-only re-export of `FocusDimming` from `@/types` (module B); the very same type                                                                                                                  |
| `ContextMenuEntry`                                   | `{ title: string; onClick: () => void } \| null`                                                                                                                                                     |
| `ContextMenuState`                                   | `{ x: number; y: number; entries: Array<ContextMenuEntry>; source: string }`                                                                                                                         |
| `DialogInput`                                        | union of five object types, E.1.2                                                                                                                                                                    |
| `DialogValues<T extends ReadonlyArray<DialogInput>>` | mapped type over `T`: each position becomes `boolean` when that input's `kind` is `"checkbox"`, otherwise `string`                                                                                   |
| `DialogBody`                                         | union of four object types, E.1.3                                                                                                                                                                    |
| `DialogState`                                        | `DialogBody` with `token: number` intersected into every member separately; narrowing on `kind` still works                                                                                          |
| `ActionCommand`                                      | every member of `ActionRequest` (from `@/backend/types`) without its `repo` field, taken member by member                                                                                            |

#### E.1.1 Context menus

- `ContextMenuEntry`: an item with its visible label `title` and the callback `onClick` invoked when the user picks it; `null` stands for a separator line. The menu drops separators at either end and draws a run of them as one.
- `ContextMenuState`: the open menu. `x` and `y` are viewport coordinates in CSS pixels of the point the menu hangs from: the pointer position for a pointer-opened menu, or the bottom-left corner of the owning element for one opened from the keyboard. `entries` are the rows in order. `source` is a key naming the element that owns the menu (for example `ref:head:main`); the owning element shows its selected styling while the store's active source (the open menu's `source`, else an open form dialog's `source`) equals its key.

#### E.1.2 `DialogInput`

Describes one input control of a form dialog. `value` seeds the control; edits are not written back into it. When `label` is missing or empty, the control's accessible name comes from the dialog's message (through `aria-labelledby`).

| `kind`       | Other fields                                                                          | Drawn as                                                                                                                                                                                                                                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"text"`     | `label?: string`; `value: string`; `placeholder?: string`                             | a single-line text field                                                                                                                                                                                                                                                                                                                  |
| `"ref"`      | `label?: string`; `value: string` (no placeholder)                                    | a single-line text field for a Git ref name. The form cannot be submitted while any ref field is empty or `hasInvalidRefChars` (module N) returns `true` for it; the submit button is then disabled, and for an invalid (non-empty) name a tooltip over it shows `window.l10n.invalidCharacters` with `{0}` replaced by the action label. |
| `"textarea"` | `label?: string`; `value: string`; `placeholder?: string`                             | a four-row text area                                                                                                                                                                                                                                                                                                                      |
| `"select"`   | `label?: string`; `value: string`; `options: Array<{ label: string; value: string }>` | a drop-down; `value` is the initially chosen option's `value`                                                                                                                                                                                                                                                                             |
| `"checkbox"` | `label: string` (required); `value: boolean`                                          | a checkbox carrying its own label                                                                                                                                                                                                                                                                                                         |

Every optional field above may be left out but not set to `undefined`.

#### E.1.3 `DialogBody` and `DialogState`

| `kind`      | Fields                                                                                                                                                                                  | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"content"` | `message: string`; `content: ComponentChildren`; `wide?: boolean`                                                                                                                       | A heading and arbitrary content, closed with a Close button. `wide: true` gives a wider panel (up to 960 px instead of 600 px).                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `"form"`    | `message: ComponentChildren`; `inputs: Array<DialogInput>`; `action: string`; `onSubmit: (values: Array<string \| boolean>) => void`; `source: string \| null`; `destructive?: boolean` | A question with optional fields. `action` is the text of the submit button (also inserted into the invalid-name tooltip). `onSubmit` receives one value per input, in input order: a string for each field, a boolean for each checkbox. `source` ties the dialog to the element whose menu started it (the same key as `ContextMenuState.source`), so that element stays highlighted; `null` when no element owns it. `destructive: true` puts the initial keyboard focus on the Cancel button instead of the first field or button. An empty `inputs` array makes a yes-or-no question. |
| `"running"` | `message: string`; `detail?: string`; `started?: number`; `onCancel?: () => void`                                                                                                       | An operation in progress. `detail` is extra text shown under the message. `started` is the start time in milliseconds since the epoch; when present, the dialog shows the elapsed whole seconds, updated every second. `onCancel`, when present, adds a button that calls it.                                                                                                                                                                                                                                                                                                             |
| `"error"`   | `message: string`; `reason: string \| null`                                                                                                                                             | A failure. `reason` holds details (often Git's text) shown below and offered for copying; `null` or `""` shows none.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

`DialogState` adds `token: number` to each member. Every opening gets a larger number than the one before; the dialog component remounts when the number changes, discarding the previous dialog's field values, focus and key listeners.

#### E.1.4 `ActionCommand`

The message a webview caller hands to `runAction`: for each of the 17 commands, the request's fields minus `repo`, which `runAction` supplies from the current selection. Fields the request requires stay required, including `requestId` for `repositoryAction`, `pushBranch`, `pullBranch` and `fetchRemote`. `runAction` in `src/webview/lib/actions.ts` adds `repo` and a `requestId` of the form `action-<n>`; `activity.ts` and `remote-actions.tsx` use `ActionCommand & { requestId: string }`.

#### E.1.5 `CommitBranchType`

The branch the graph shows or emphasises: `"*"` for all branches, otherwise a branch name as the branch list spells it (`main`, `feature/x`, `remotes/origin/main`).

#### E.1.6 Who uses what

| Export             | Source files                                                                                                                                                                                                        | Tests                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `CommitBranchType` | `src/webview/lib/actions.ts` (`selectBranch`), `src/webview/lib/stores.ts` (`selectedBranch`)                                                                                                                       | none directly                                                                                    |
| `BranchDisplay`    | `src/webview/layout/MainHeader.tsx`, `src/webview/lib/{actions,navigation,stores}.ts`                                                                                                                               | none directly                                                                                    |
| `FocusDimming`     | `src/webview/components/commit/{CommitGraph,CommitTable}.tsx`, `src/webview/graph/focus.ts`, `src/webview/layout/GraphView.tsx`, `src/webview/lib/{actions,navigation,stores}.ts`                                   | none directly                                                                                    |
| `ContextMenuEntry` | `src/webview/components/ui/ContextMenu.tsx`, `src/webview/components/history/file-menu.ts`, `src/webview/components/repository/{RefsPane,RemoteManager,StashManager}.tsx`, `src/webview/lib/{actions.ts,menus.tsx}` | `tests/webview/components/ui/ContextMenu.test.ts`, `tests/webview/lib/{menus,menu-text}.test.ts` |
| `ContextMenuState` | `src/webview/components/ui/ContextMenu.tsx`, `src/webview/lib/stores.ts`                                                                                                                                            | `tests/webview/components/ui/ContextMenu.test.ts`                                                |
| `DialogInput`      | `src/webview/components/ui/Dialog.tsx`, `src/webview/lib/actions.ts`                                                                                                                                                | `tests/webview/components/ui/Dialog.behaviour.test.ts`, `tests/webview/lib/actions.test.ts`      |
| `DialogValues`     | `src/webview/lib/actions.ts` (`openFormDialog` hands typed values to its caller)                                                                                                                                    | none directly                                                                                    |
| `DialogBody`       | `src/webview/lib/actions.ts`                                                                                                                                                                                        | none directly                                                                                    |
| `DialogState`      | `src/webview/components/ui/Dialog.tsx`, `src/webview/lib/{stores.ts,repository-actions.tsx,remote-actions.tsx}`                                                                                                     | `tests/webview/components/ui/Dialog.behaviour.test.ts`, `tests/webview/lib/menu-actions.test.ts` |
| `ActionCommand`    | `src/webview/lib/{actions.ts,activity.ts,remote-actions.tsx}`                                                                                                                                                       | none directly                                                                                    |

### E.2 Dependencies the implementation must use

- `ComponentChildren`, type-only, from `preact`: the type of dialog messages and content.
- `ActionRequest`, type-only, from `@/backend/types`: the source of `ActionCommand`.
- `BranchDisplay` and `FocusDimming`, re-exported type-only from `@/types`.

### E.3 Behaviour

The module runs nothing. Compile-time properties callers rely on:

1. `DialogValues` preserves tuple positions. `openFormDialog` takes its inputs as a `const` type parameter, so a caller passing `[{ kind: "text", … }, { kind: "checkbox", … }]` receives values typed `[string, boolean]` (read-only when the inputs are). For a plain `DialogInput[]` the result is `(string | boolean)[]`.
2. Narrowing a `DialogState` on `kind` gives that member's fields plus `token`; a `DialogState` without `token` does not compile.
3. `ActionCommand` rejects a `repo` field (an excess property in a literal) and keeps `requestId` required where the request requires it.
4. `BranchDisplay` and `FocusDimming` from this module and from `@/types` are the same types; `navigation.ts` mixes both imports in one object.
5. A `"checkbox"` input without `label`, a `"ref"` input with `placeholder`, and a `"select"` input without `options` do not compile.

### E.4 Concrete examples

- Form with fields: `{ kind: "form", message: "Create branch", inputs: [{ kind: "ref", label: "Name", value: "" }, { kind: "checkbox", label: "Check out", value: true }], action: "Create", onSubmit, source: "commit:abc123", token: 7 }`; submitting after typing `topic` calls `onSubmit(["topic", true])`.
- Confirmation: `{ kind: "form", message: …, inputs: [], action: "Delete", onSubmit, source: null, destructive: true, token: 8 }`.
- Running: `{ kind: "running", message: "Pushing", detail: "git push origin main", started: 1767225600000, onCancel, token: 9 }`.
- Error: `{ kind: "error", message: "Unable to load commit details", reason: "fatal: bad object", token: 10 }`.
- Menu: `{ x: 120, y: 48, entries: [{ title: "Checkout", onClick }, null, { title: "Delete", onClick }], source: "ref:head:main" }`.
- `ActionCommand`: `{ command: "deleteTag", tagName: "v1" }`.

### E.5 Non-functional requirements

Types only; no import-time effect. Type-only imports and re-exports (S.2). Helper types used to build `DialogValues`, `DialogState` and `ActionCommand` must be used or not exist (`noUnusedLocals`), and are not part of the interface.

### E.6 Test coverage

Covered today at run time: how the dialog component treats every input kind and body kind (`tests/webview/components/ui/{Dialog,Dialog.behaviour}.test.ts`), how menus treat entries, separators and `source` (`tests/webview/components/ui/ContextMenu.test.ts`, `tests/webview/lib/{menus,menu-text,menu-anchor,menu-actions}.test.ts`), and the requests `runAction` sends (`tests/webview/lib/{actions,remote-actions,cancel-action}.test.ts`). The backend's equivalent of `ActionCommand` is checked in `tests/backend/types/shapes.test.ts`, but with its own local helper, not with `ActionCommand`.

Gaps (compile-time):

1. **Tuple values.** Setup: `const inputs = [text, checkbox, select, ref, textarea] as const` (with an explicitly typed `options` array). Expected: `DialogValues<typeof inputs>` equals `readonly [string, boolean, string, string, string]`; `DialogValues<DialogInput[]>` equals `(string | boolean)[]`.
2. **Input forms.** Expected errors: a checkbox without `label`; a ref with `placeholder`; a select without `options`.
3. **Token.** Expected: `{ kind: "error", message: "m", reason: null }` is not a `DialogState`; with `token: 1` it is; inside `if (state.kind === "form")`, `state.source` has the type `string | null`.
4. **Action commands.** Expected: `{ command: "deleteTag", tagName: "v1" }` compiles; adding `repo: "/r"` is an error; a `pushBranch` command without `requestId` is an error.
5. **Branch values.** Expected: `"*"` and `"remotes/origin/main"` are both `CommitBranchType`.
6. **Same re-exported types.** Expected: `BranchDisplay` and `FocusDimming` from `@/webview/types` equal those from `@/types`.

### E.7 Questions

- **webview-types Q1.** `CommitBranchType` accepts every string; the `"*"` member only helps editor completion. Is a real distinction (for example a separate all-branches marker) wanted?
- **webview-types Q2.** A content dialog's `message` is a `string`, a form's is `ComponentChildren`. Should both allow nodes?
- **webview-types Q3.** Text and text-area inputs may have a `placeholder`, ref inputs may not. Intended?
- **webview-types Q4.** `detail`, `started` and `onCancel` of a running dialog are independent in the type, but the one producer (`openRunningDialog`) passes `detail` and `started` together or neither. Should the type pair them?
- **webview-types Q5.** An error dialog must state `reason` (with `null` for none), and `""` behaves like `null`. Should `reason` be optional instead?
- **webview-types Q6.** `onSubmit` in the stored form receives untyped `Array<string | boolean>`; only `openFormDialog` offers typed values, through a cast. Acceptable?

---

## F. `src/webview/constants.ts`

### F.1 Interface

Module path `src/webview/constants.ts`, reached as `@/webview/constants`. Seven exported constants, no functions, no types.

| Export                  | Value          | Meaning                                                                                                                                                                                                                                                    |
| ----------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SHOW_ALL_BRANCHES`     | `"*"`          | The branch value meaning "all branches": the graph is not filtered and nothing is emphasised.                                                                                                                                                              |
| `UNCOMMITTED_CHANGES`   | `"*"`          | The `hash` of the placeholder row that `loadCommits` puts first when the working tree has changes. No real commit has this hash.                                                                                                                           |
| `ROW_HEIGHT`            | `24`           | The vertical pitch of the table body and of the graph drawn beside it, in CSS pixels: row `y`'s centre is at `(y + 0.5) × 24`. Rendered rows must measure exactly 24 pixels whatever the font size, or dots drift away from their rows.                    |
| `TABLE_HEADER_HEIGHT`   | `32`           | Height of the table's header row, in CSS pixels.                                                                                                                                                                                                           |
| `COMMIT_DETAILS_HEIGHT` | `250`          | The fixed height, in CSS pixels, of the details row inserted under an expanded commit. The graph's drawing gets taller by the same amount, and everything drawn below the expanded row shifts down by it.                                                  |
| `RESIZABLE_COLUMNS`     | `[0, 2, 3, 4]` | Cell indexes of the four user-sizable columns, in the same order as the entries of `GitRepoState.columnWidths`: stored width `k` belongs to cell `RESIZABLE_COLUMNS[k]`. A commit row's cells are 0 graph, 1 description, 2 date, 3 author, 4 commit hash. |
| `DESCRIPTION_COLUMN`    | `1`            | Cell index of the description column. It never has a stored width; the table gives it whatever width is left.                                                                                                                                              |

Today the scalar constants have their literal types (`"*"`, `24`, `32`, `250`, `1`) and `RESIZABLE_COLUMNS` has the type `number[]`. Nothing depends on the literal types; callers compare with strings and do arithmetic.

| Export                  | Source files                                                                                                                                                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SHOW_ALL_BRANCHES`     | `src/webview/components/repository/RefsPane.tsx` (the "all branches" entry), `src/webview/layout/MainHeader.tsx` (the value of the branch picker's show-all option), `src/webview/lib/actions.ts`, `src/webview/lib/handler/load-branches.ts` |
| `UNCOMMITTED_CHANGES`   | `src/webview/components/commit/{CommitRow,CommitTable}.tsx`, `src/webview/graph/layout.ts`, `src/webview/lib/actions.ts`                                                                                                                      |
| `ROW_HEIGHT`            | `src/webview/graph/{utils,strokes}.ts`, `src/webview/components/commit/CommitDetails.tsx`                                                                                                                                                     |
| `TABLE_HEADER_HEIGHT`   | `src/webview/components/commit/CommitTable.tsx`                                                                                                                                                                                               |
| `COMMIT_DETAILS_HEIGHT` | `src/webview/components/commit/{CommitDetails,CommitTable}.tsx`                                                                                                                                                                               |
| `RESIZABLE_COLUMNS`     | `src/webview/components/commit/useColumnResize.ts`, `src/webview/utils/columns.ts`                                                                                                                                                            |
| `DESCRIPTION_COLUMN`    | `src/webview/components/commit/useColumnResize.ts`                                                                                                                                                                                            |

No test imports these constants.

### F.2 Dependencies the implementation must use

None.

### F.3 Behaviour

Plain values. Where they surface:

- The uncommitted row is `tr[data-commit-hash="*"]`; UI workflow tests (`tests-ext/ui/history.test.cjs`) select it by that attribute.
- `ROW_HEIGHT` must equal the rendered row height (the row cells use a 24-pixel height class). The UI workflow tests check that each dot's centre lies within 2 pixels of its row's centre.
- `TABLE_HEADER_HEIGHT` is the fallback top offset of the graph viewport: `[data-graph-viewport]` carries the inline style `width: var(--graph-viewport-width, 0px); top: var(--graph-top, 32px);`. `src/webview/styles.css` repeats `32px` as the fallback of `--graph-top` for the focus rows' scroll margin, and the header cells use a 32-pixel height class.
- `COMMIT_DETAILS_HEIGHT` is the inline height of `[data-details-row]` (`height: 250px;`), and the value handed to the graph as the expansion height.

### F.4 Concrete examples

- With 21 rows and the details of row 1 open, the graph's `svg` is `21 × 24 + 250 = 754` pixels tall, and `[data-details-row]` has the style `height: 250px;`.
- `columnWidths` `[80, 90, 100, 110]` sets graph 80, date 90, author 100, commit 110; the description takes the rest.

### F.5 Non-functional requirements

Plain exported constants, evaluated at import with no other effect. `RESIZABLE_COLUMNS` must not be changed by anyone at run time (see Q2).

### F.6 Test coverage

Covered indirectly: `ROW_HEIGHT` through the graph geometry and golden paths (`tests/webview/graph/utils.test.ts`: row centres 12, 36, 60, …; `tests/webview/graph/strokes.*.test.ts`: paths such as `M8,12.0L8,36.0`); `RESIZABLE_COLUMNS` and `DESCRIPTION_COLUMN` through `tests/webview/utils/columns.test.ts` and `tests/webview/components/commit/ColumnResize.test.ts`; `"*"` as all-branches and as the uncommitted hash through `tests/webview/lib/{actions,branch-focus,preference-lifetime,remote-visibility,graph-requests,uncorrelated-replies}.test.ts` and the graph layout tests.

Gaps:

1. **Values.** Setup: import the module. Expected: the seven values of F.1 exactly (`RESIZABLE_COLUMNS` deep-equal to `[0, 2, 3, 4]`).
2. **Details height in the table.** Setup: jsdom, `setupWebviewTest()`, a stubbed `ResizeObserver`, 21 commits, `selectedRepo` set, render `CommitTable`, then set `expandedCommit` to the second commit's hash. Expected: the graph `svg` has `height="754"` and `[data-details-row]` has the style `height: 250px;`.
3. **Header fallback.** Same setup without expansion. Expected: `[data-graph-viewport]`'s `style` attribute contains `top: var(--graph-top, 32px)`.

### F.7 Questions

- **webview-constants Q1.** `SHOW_ALL_BRANCHES` and `UNCOMMITTED_CHANGES` share the value `"*"` but mean different things, and several modules (`stores.ts`, `navigation.ts`, `graph/focus.ts`) compare with the literal `"*"` instead of either constant. Should they be separated or used consistently?
- **webview-constants Q2.** `RESIZABLE_COLUMNS` is an exported mutable array. Should it be read-only (a frozen array or a read-only type)? No caller writes to it today.
- **webview-constants Q3.** `ROW_HEIGHT` and `TABLE_HEADER_HEIGHT` are repeated by hand as height classes on cells and as `32px` in `styles.css`. Should one source drive the others?

---

## G. `src/webview/global.d.ts`

### G.1 Interface

Module path `src/webview/global.d.ts`. An ambient declaration file: it declares globals for the webview project and for `tests/webview` (whose `tsconfig.json` includes it by path). Three declarations:

| Declaration                                  | What it states                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a wildcard module declaration for `"*.css"`  | Any import of a path ending in `.css` resolves, with no typed exports. `src/webview/main.tsx` has the side-effect import `import "./styles.css"`; with `noUncheckedSideEffectImports` on, that import needs this declaration (without it: `TS2882 Cannot find module or type declarations for side-effect import of './styles.css'`). |
| a global function `acquireVsCodeApi()`       | It returns an object with exactly three methods: `getState(): unknown`; `setState(state: unknown): void`; `postMessage(message: RequestMessage \| RpcRequest): void`. `RequestMessage` is module B's union and `RpcRequest` module A's (default argument).                                                                            |
| an addition to the global `Window` interface | `l10n: LocalizedStrings`, required, so `window.l10n.<name>` has the type `string` everywhere.                                                                                                                                                                                                                                         |

Users:

| Declaration        | Source files                                                                                                                           | Tests                                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `*.css`            | `src/webview/main.tsx`                                                                                                                 | none                                                                                                                      |
| `acquireVsCodeApi` | `src/webview/lib/vscode.ts` calls it once at import and exports the result as `vscode`; every webview module posts through that object | `tests/webview/setup.ts` defines a global `acquireVsCodeApi` returning mocked `getState`, `setState`, `postMessage`       |
| `Window.l10n`      | about every webview component and action module reads `window.l10n`; `main.tsx` assigns it                                             | `tests/webview/test-utils.ts` defines `window.l10n` as a proxy that returns each key's own name; several tests replace it |

### G.2 Dependencies the implementation must use

It needs these types:

- `RequestMessage` and `RpcRequest` from `@/types`;
- `LocalizedStrings` from `@/old-extension/l10n/webviewL10n`.

Whatever form is chosen, the three declarations must be global in both the webview project and `tests/webview`, without any file importing them. A declaration file with a top-level `import` or `export` is a module, and its plain declarations are then no longer global; type references written inline where they are used, or a `declare global` block, avoid that. The file must stay at this path, because `tests/webview/tsconfig.json` includes it by name.

### G.3 Behaviour

Declarations only. What the compiler then enforces:

1. `postMessage({ command: "viewReady" })` and `postMessage({ kind: "rpc.request", id: "1", method: "git.init", params: null })` compile; `postMessage({ command: "refresh" })` (a response-only command) and `postMessage({ command: "nope" })` do not.
2. `acquireVsCodeApi().getState()` has the type `unknown`, so readers of saved state cast or check it (`src/webview/lib/navigation.ts` does).
3. `window.l10n.repo` has the type `string` without an `undefined` check.
4. `import "./styles.css"` type-checks; so would any other CSS import, with an untyped default.

### G.4 Concrete examples

See G.3.

### G.5 Non-functional requirements

No runtime content; nothing is emitted for it. The declarations describe what VS Code (or, in tests, `tests/webview/setup.ts` and `tests/webview/test-utils.ts`) provides at run time.

### G.6 Test coverage

Covered: every `tsc -p src/webview` and `tsc -p tests/webview` run depends on these declarations; removing any of them breaks the type check of `main.tsx`, `lib/vscode.ts` or every user of `window.l10n`.

Gaps (compile-time, in a file under `tests/webview/`):

1. **What may be posted.** Expected: the two accepted messages of G.3.1 compile; `{ command: "refresh" }` and `{ command: "nope" }` are errors.
2. **State and strings.** Expected: assigning `acquireVsCodeApi().getState()` to a `string` is an error; assigning `window.l10n.repo` to a `string` compiles.

### G.7 Questions

- **global.d.ts Q1.** `Window.l10n` is declared as always present, but the page sets it only after `webview.initialize` answers; code that runs earlier (the loading page, start-up failures, RPC timeouts) must avoid it and uses the shell's own strings instead. Should the declaration say "possibly absent"?
- **global.d.ts Q2.** VS Code allows `acquireVsCodeApi` to be called only once per page; a second call throws. The declaration does not say so; `lib/vscode.ts` is the only caller. Worth documenting in the type?
- **global.d.ts Q3.** The CSS declaration types every CSS import as untyped. Only a side-effect import exists. Should default imports of CSS be rejected?

---

## H. `src/webview/tsconfig.json`

### H.1 Interface

The TypeScript project for the webview. Its content is a set of facts:

| Key                               | Value                                                  |
| --------------------------------- | ------------------------------------------------------ |
| `extends`                         | `"../../tsconfig.base.json"`                           |
| `compilerOptions.lib`             | `["esnext", "dom"]` (replaces the base's `["esnext"]`) |
| `compilerOptions.jsx`             | `"react-jsx"`                                          |
| `compilerOptions.jsxImportSource` | `"preact"`                                             |

No `include`, `files` or `exclude`, so the project covers every `.ts`, `.tsx` and `.d.ts` file under `src/webview/`, which includes `global.d.ts`. Every other option comes from the base: `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`, `isolatedModules`, `noUncheckedSideEffectImports`, `moduleDetection: "force"`, `skipLibCheck`, `module: "esnext"`, `moduleResolution: "bundler"`, `target: "esnext"`, `types: []`, `noEmit: true`, and `paths` `@/*` → `./src/*`, `@tests/*` → `./tests/*` (resolved relative to the base file, the repository root). The effective configuration (`tsc -p src/webview --showConfig`) must stay exactly as it is today.

Consumers:

| Consumer                                    | What it takes from the file                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run typecheck` (`tsc -p src/webview`) | The whole project: DOM library, Preact JSX, no Node or VS Code globals.                                                                                                                                                                                                                                                                                                                                                   |
| `tests/webview/tsconfig.json`               | Extends this file, adds `include` of `tests/webview/**/*.ts` and `src/webview/global.d.ts`; `tsc -p tests/webview` in `typecheck`.                                                                                                                                                                                                                                                                                        |
| Vitest (through Vite's esbuild transform)   | The JSX settings for `.tsx` files under `src/webview`. `vitest.config.ts` sets no JSX options, so this file is what makes components compile against Preact's automatic runtime in tests. Observed: without `jsx`/`jsxImportSource`, a component test fails with `Failed to resolve import "react/jsx-dev-runtime" from "src/webview/components/ui/ContextMenu.tsx"`, and the same happens with `jsx: "react-jsx"` alone. |
| Editors                                     | The TypeScript language service uses it for files under `src/webview`.                                                                                                                                                                                                                                                                                                                                                    |
| The root project                            | `tsconfig.json` excludes `src/webview`, leaving the webview to this project.                                                                                                                                                                                                                                                                                                                                              |

The production bundle (`esbuild.js`) passes `jsx: "automatic"` and `jsxImportSource: "preact"` itself.

### H.2 Dependencies the implementation must use

`tsconfig.base.json` at the repository root, through `extends`.

### H.3 Behaviour

- Files under `src/webview` may use DOM types and globals, Preact JSX, and the globals of module G; they may not use Node or VS Code globals (`types: []` keeps `@types/node` out), and a reference such as `process.cwd()` fails to type-check.
- JSX in `.tsx` files compiles to calls into `preact/jsx-runtime` (Vitest in development mode uses `preact/jsx-dev-runtime`).
- Nothing is emitted (`noEmit`).

### H.4 Concrete examples

`tsc -p src/webview` exits 0 today. Removing the `*.css` declaration of module G makes it fail on `main.tsx` (G.1). Removing the JSX options makes every component test fail as described in H.1.

### H.5 Non-functional requirements

JSON with the four keys above; no comments are needed. Key order is free.

### H.6 Test coverage

Covered implicitly: `pnpm run typecheck` in CI, and every Vitest test that renders a component (for example `tests/webview/components/ui/ContextMenu.test.ts`), fail when the file is wrong.

Gap: **No Node globals in the webview.** Setup: a file under `tests/webview/` with a function that is never called. Call: inside it, `// @ts-expect-error` followed by `process.cwd()`, and a plain `document.createElement("div")`. Expected: `tsc -p tests/webview` passes (the first line is an error as expected, the second compiles).

### H.7 Questions

- **webview-tsconfig Q1.** Every line of the file is a required fact, so a rewrite reproduces it exactly. This is a provenance-review matter (S.5) rather than a behaviour question: should it be listed as a reviewed coincidence?
- **webview-tsconfig Q2.** JSX settings live in two places, this file (type check and tests) and `esbuild.js` (the bundle). Should one follow from the other?

---

## I. `src/webview/graph/types.ts`

### I.1 Interface

Module path `src/webview/graph/types.ts`, reached as `@/webview/graph/types`. Types only. Eight exports. Unless noted, coordinates are grid units: `x` counts lanes from the left, starting at 0; `y` counts rows from the top, starting at 0, and equals the commit's index in the displayed list.

| Export           | Definition                                                                         | Meaning                                                                                                                                                                                                                                                                       |
| ---------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GraphPoint`     | `{ x: number; y: number }`                                                         | A grid cell: lane `x` of row `y`.                                                                                                                                                                                                                                             |
| `BranchRelation` | `"normal" \| "direct" \| "merged" \| "unrelated"`                                  | How a commit or line relates to the emphasised branch. `"normal"`: no emphasis applies. `"direct"`: on the branch's first-parent history. `"merged"`: an ancestor reached through a merge. `"unrelated"`: not an ancestor.                                                    |
| `GraphLine`      | I.1.1                                                                              | One segment of a branch's drawing, spanning one row.                                                                                                                                                                                                                          |
| `GraphBranch`    | `{ colour: number; lines: Array<GraphLine> }`                                      | One continuous track of the drawing. `colour` is an index into the palette (module L), not a CSS colour. `lines` are in drawing order, top to bottom as the track was walked, followed by lines of merge edges that were attached to this track.                              |
| `GraphVertex`    | I.1.2                                                                              | The dot of one commit.                                                                                                                                                                                                                                                        |
| `GraphLayout`    | `{ branches: Array<GraphBranch>; vertices: Array<GraphVertex>; lanes: number }`    | The whole drawing. `vertices` has one entry per displayed commit, in row order (`vertices[i].y === i`). `lanes` is the greatest number of lanes used in any row (0 for no commits).                                                                                           |
| `GraphExpansion` | `{ row: number; height: number }`                                                  | The commit details view that is open beneath row `row`, `height` pixels tall. Rows after `row` move down by `height`. Callers use `null` for "nothing open".                                                                                                                  |
| `GraphStroke`    | `{ relation: BranchRelation; path: string; colour: number; isCommitted: boolean }` | A single `path` element's worth of drawing. `path` holds SVG path data whose coordinates are CSS pixels within the graph's drawing. `colour` is a palette index. `isCommitted` is `false` for lines of the uncommitted row. `relation` is shared by every line of the stroke. |

#### I.1.1 `GraphLine`

| Field         | Type             | Meaning                                                                                                                                                                                                                                                                                         |
| ------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `child`       | `number`         | Row of the commit at the upper end of the edge this segment is part of. For every segment of an edge that spans several rows, `child` names the edge's commit, not the segment's own row.                                                                                                       |
| `parent`      | `number \| null` | Row of the parent that edge leads to, or `null` when that parent is not in the loaded list (the segment then belongs to a line trailing down to the last row).                                                                                                                                  |
| `p1`          | `GraphPoint`     | The segment's upper end.                                                                                                                                                                                                                                                                        |
| `p2`          | `GraphPoint`     | The segment's lower end, one row below `p1`.                                                                                                                                                                                                                                                    |
| `isCommitted` | `boolean`        | `false` only for the segments of the uncommitted row's edge.                                                                                                                                                                                                                                    |
| `lockedFirst` | `boolean`        | For a segment that changes lane: `true` means the change of lane happens at the upper end, after which the segment runs in `p2`'s lane; `false` means it runs in `p1`'s lane first and changes lane at the lower end. Also used to place the bend when a segment crosses the open details view. |

#### I.1.2 `GraphVertex`

| Field         | Type      | Meaning                                                                                                                                                                                          |
| ------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `x`           | `number`  | Lane of the dot.                                                                                                                                                                                 |
| `y`           | `number`  | Row of the dot (equal to its index in `vertices`).                                                                                                                                               |
| `colour`      | `number`  | Palette index of the track that placed the dot.                                                                                                                                                  |
| `isCommitted` | `boolean` | `false` only for the uncommitted row.                                                                                                                                                            |
| `isCurrent`   | `boolean` | Set on the checked-out commit's dot, or on the uncommitted row's dot when that row is present. Such a dot is rendered hollow: its outline takes the colour and its inside the editor background. |

#### I.1.3 Who uses what

| Export           | Source files                                                                                          | Tests                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `GraphPoint`     | `src/webview/graph/layout.ts`                                                                         | `tests/webview/graph/{layout,layout.rules}.test.ts`, `tests/webview/graph/layoutDrawing.ts`   |
| `BranchRelation` | `src/webview/graph/{focus,strokes}.ts`, `src/webview/components/commit/{CommitGraph,CommitRow}.tsx`   | `tests/webview/graph/strokes.cases.test.ts`                                                   |
| `GraphLine`      | `src/webview/graph/{focus,strokes}.ts`, `src/webview/components/commit/CommitGraph.tsx`               | `tests/webview/graph/{layout.rules,strokes.cases}.test.ts`, `layoutDrawing.ts`                |
| `GraphBranch`    | `src/webview/graph/{layout,strokes}.ts`                                                               | `tests/webview/graph/{strokes,strokes.cases,layout.examples}.test.ts`, `layoutDrawing.ts`     |
| `GraphVertex`    | `src/webview/graph/layout.ts`                                                                         | `layoutDrawing.ts`                                                                            |
| `GraphLayout`    | `src/webview/graph/{layout,utils}.ts`, `src/webview/components/commit/CommitGraph.tsx`                | `tests/webview/graph/{layout,layout.rules,layout.examples,utils}.test.ts`, `layoutDrawing.ts` |
| `GraphExpansion` | `src/webview/graph/{utils,strokes}.ts`, `src/webview/components/commit/{CommitGraph,CommitTable}.tsx` | `tests/webview/graph/{strokes,strokes.cases,utils}.test.ts`                                   |
| `GraphStroke`    | `src/webview/graph/strokes.ts`                                                                        | through `branchStrokes` in `tests/webview/graph/strokes*.test.ts`                             |

### I.2 Dependencies the implementation must use

None.

### I.3 Behaviour

Types only. `BranchRelation`'s four strings reach the DOM and the stylesheet: rows (`tr`), dots (`circle`) and lines (`path`) carry them as `data-branch-relation`; `styles.css` selects `.branch-focus-row[data-branch-relation="merged"]` and `[data-branch-relation="unrelated"]`; the UI workflow tests select `tr[data-commit-hash][data-branch-relation="normal"]`, `circle[data-branch-relation]`, `path[data-branch-relation="merged"]` and read `dataset.branchRelation` values `direct`, `merged` and `unrelated`. The values must stay exactly these four strings.

### I.4 Concrete examples

Observed with the current layout and stroke modules, for rows `*` (uncommitted, parent `m`), `m` (parents `a`, `x`), `a` (parent `b`), `x` (parent `b`), `b`, with `m` checked out:

- `vertices`: `(0,0) colour 0, uncommitted, current`; `(0,1) colour 0`; `(0,2) colour 0`; `(1,3) colour 1`; `(0,4) colour 0`; `lanes: 2`.
- Track 0 has four lines; the first is `{ child: 0, parent: 1, p1: (0,0), p2: (0,1), isCommitted: false, lockedFirst: false }`. Track 1 starts at the merge: `{ child: 1, parent: 3, p1: (0,1), p2: (1,2), isCommitted: true, lockedFirst: true }`, then `(1,2)→(1,3)`, then `{ child: 3, parent: 4, p1: (1,3), p2: (0,4), lockedFirst: false }`.
- Strokes of track 0 (rounded, nothing open): `{ path: "M8,12.0L8,36.0", colour: 0, isCommitted: false, relation: "normal" }` and `{ path: "M8,36.0L8,108.0", colour: 0, isCommitted: true, relation: "normal" }`.
- Rows `t` (parent not loaded), `u`, `v`: `t`'s track trails to the last row with `parent: null` on both segments.
- An empty list gives `{ branches: [], vertices: [], lanes: 0 }`.

### I.5 Non-functional requirements

Types only, no import-time effect, no dependencies.

### I.6 Test coverage

Covered: the layout and stroke tests build and compare these shapes extensively (`tests/webview/graph/{layout,layout.rules,layout.examples,strokes,strokes.cases,strokes.golden,utils,focus}.test.ts`); relation values in the DOM are checked by `tests-ext/ui/history.test.cjs`.

Gap: **Closed relation set.** Expected, at compile time: `BranchRelation` equals the four strings; a `GraphStroke` with `relation: "dimmed"` is an error; a `GraphLine` with `parent: null` compiles and one without `parent` is an error.

### I.7 Questions

- **graph-types Q1.** `GraphVertex.y` always equals the vertex's index. Keep the redundancy?
- **graph-types Q2.** `colour` in `GraphBranch`, `GraphVertex` and `GraphStroke` is a palette index, while the name suggests a colour value. Rename in a later change?

---

## J. `src/webview/graph/constants.ts`

### J.1 Interface

Module path `src/webview/graph/constants.ts`, reached as `@/webview/graph/constants`. Four exported numeric constants, all in CSS pixels.

| Export          | Value | Meaning                                                                                                                            | Used by                                                                                                                                                                       |
| --------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LANE_WIDTH`    | `16`  | Horizontal distance between the centres of neighbouring lanes.                                                                     | `src/webview/graph/utils.ts`                                                                                                                                                  |
| `LANE_OFFSET`   | `8`   | The x coordinate of lane 0's centre, measured from the drawing's left edge; the drawing keeps the same margin after its last lane. | `src/webview/graph/utils.ts`; `tests/webview/graph/utils.test.ts` imports it and also replaces it with 12 through `vi.doMock`                                                 |
| `VERTEX_RADIUS` | `4`   | The `r` attribute given to every commit `circle`.                                                                                  | `src/webview/components/commit/CommitGraph.tsx`; `src/webview/components/commit/useGraphScroll.ts` keeps `VERTEX_RADIUS + 4` pixels of margin when scrolling a lane into view |
| `GRAPH_PADDING` | `16`  | Space added after the drawing's width when sizing the graph column.                                                                | `src/webview/components/commit/CommitTable.tsx`                                                                                                                               |

### J.2 Dependencies the implementation must use

None.

### J.3 Behaviour

Plain values. Derived facts others rely on:

- Lane `x` is centred at `8 + 16x`; a drawing with `n > 0` lanes is `16n` pixels wide.
- The graph column's requested width is the drawing's width plus 16, kept between 64 and 240 pixels.
- The keyboard reveal keeps 8 pixels of margin around a dot (`tests/webview/components/commit/GraphScroll.test.ts` and `tests-ext/ui/history.test.cjs` both assert offsets of 8).

### J.4 Concrete examples

- Lane centres for lanes 0, 1, 2, 3, 10: 8, 24, 40, 56, 168. Widths for 0, 1, 3, 10 lanes: 0, 16, 48, 160.
- Rendered `CommitTable` with 13 lanes: `svg` width 208, `--col-graph: 224px`; with 20 lanes: width 320, `--col-graph: 240px`; with 1 lane: width 16, `--col-graph: 64px`.
- Every rendered `circle` has `r="4"`.

### J.5 Non-functional requirements

Plain named exports (S.1, because of the `vi.doMock` spread). No other effect at import.

### J.6 Test coverage

Covered indirectly: `LANE_WIDTH` and `LANE_OFFSET` through `tests/webview/graph/utils.test.ts` and the stroke golden paths; `VERTEX_RADIUS` through the 8-pixel reveal margin in `GraphScroll.test.ts`.

Gaps:

1. **Dot radius.** Setup: render `CommitTable` (as in F.6 gap 2) with any commits. Expected: every `circle` has `r="4"`.
2. **Graph column.** Setup: `CommitTable` with no stored widths and commits whose layout uses 13 lanes (13 commits whose only parent is a fourteenth). Expected: the table container's style contains `--col-graph: 224px`; with 20 such commits `--col-graph: 240px`; with one parent and one child `--col-graph: 64px`.

### J.7 Questions

- **graph-constants Q1.** `GRAPH_PADDING` equals `LANE_WIDTH`. Coincidence, or should one be defined through the other?
- **graph-constants Q2.** The reveal margin is `VERTEX_RADIUS + 4`, and tests assert its value 8. Changing the radius therefore changes scrolling. Intended coupling?

---

## K. `src/webview/graph/branchColours.ts`

### K.1 Interface

Module path `src/webview/graph/branchColours.ts`, reached as `@/webview/graph/branchColours`. One export:

`createBranchColours(): { claim(startAt: number): number; release(colour: number, end: number): void }`

- `createBranchColours()` makes a new, empty colour allocator. Allocators are independent of each other.
- `claim(startAt)`: returns a colour index (0, 1, 2, …) for a track that begins at row `startAt`.
- `release(colour, end)`: records that the track holding `colour` ended at row `end`.

Callers: `src/webview/graph/layout.ts` only. It creates one allocator per layout, claims a colour with the row where each track starts, walks the track to its end, and releases the colour with the last row the track reached, always before the next claim. No test imports the module; the layout tests observe it through `GraphBranch.colour` and `GraphVertex.colour`.

### K.2 Dependencies the implementation must use

None.

### K.3 Behaviour

Rules of `claim(startAt)`:

1. A colour is free for `startAt` when its most recently recorded end row is strictly less than `startAt`. A colour whose track ended on row `r` is therefore not free for a track starting on row `r`, but is free for one starting on row `r + 1`.
2. When several colours are free, the lowest index is returned.
3. When none is free, a new colour is created with the next index (the number of colours created so far) and returned.
4. A claimed colour is not reserved. Until `release` is called for it, a later `claim(s)` returns it again when it was newly created and `s > 0`, or when it was reused and its previous track ended above `s`. So a second claim made before the first is released can return the same colour (see Q1). The layout never does this.

Rules of `release(colour, end)`:

5. The colour's recorded end becomes `end`, whatever was recorded before (a lower value too).
6. Releasing an index that was never handed out records it anyway: indexes between the highest one created and it are left as gaps that are never handed out, and the next new colour is numbered after it (see Q2).

Other observations: a `startAt` that is `NaN` or negative never finds a free colour, so each such claim creates a new one. `claim` and `release` keep working when called detached from the object.

Taken with the layout's usage, the outcome is: colours are 0 … k − 1 without gaps, and two tracks of the same colour never share a row (`tests/webview/graph/layout.rules.test.ts` asserts both over many histories).

### K.4 Concrete examples

Each line starts from a new allocator:

| Calls                                                                        | Results                            |
| ---------------------------------------------------------------------------- | ---------------------------------- |
| `claim(0)`, `claim(0)`, `claim(5)` (no releases)                             | `0`, `1`, `0`                      |
| `claim(0)` → 0; `release(0, 3)`; `claim(3)`; `claim(4)`                      | `claim(3)` → `1`; `claim(4)` → `0` |
| `claim(0)` → 0, `release(0, 3)`; `claim(1)` → 1, `release(1, 9)`; `claim(4)` | `0`                                |
| `claim(0)` → 0, `release(0, 2)`; `claim(1)` → 1, `release(1, 1)`; `claim(3)` | `0` (lowest free)                  |
| `claim(0)` → 0, `release(0, 3)`, `release(0, 1)`; `claim(2)`                 | `0` (the later, lower end counts)  |
| `release(3, 0)`; `claim(1)`; `claim(1)`                                      | `3`, `3`                           |
| `claim(-1)`, `claim(-5)`                                                     | `0`, `1`                           |
| `claim(NaN)`, `claim(NaN)`                                                   | `0`, `1`                           |
| two allocators, `a.claim(0)` then `b.claim(0)`                               | `0` and `0`                        |

Through the layout (`layout.rules.test.ts`, "colours"): history `t a b, a x, b x, x y z, y r, z r, r` gives vertex colours `[0, 0, 1, 0, 0, 2, 0]` and track colours `[0, 1, 2]` (a colour is not reused in the row where its track ended); history `t a b, a x, b x, x y, m y z, y r, z r, r` gives `[0, 0, 1, 0, 1, 0, 2, 0]` and `[0, 1, 1, 2]` (reused from the next row on).

### K.5 Non-functional requirements

- No import-time effect; no shared state between allocators.
- `claim` may take time proportional to the number of colours created; there are rarely more than a few dozen. `release` is constant time.

### K.6 Test coverage

Covered through the layout: `tests/webview/graph/layout.rules.test.ts` ("does not reuse a colour in the row where its track ended", "reuses a colour from the row below the one where its track ended", "keeps a commit in the colour of the first track that reached it", and the general property check that colours are dense and never shared in a row), `tests/webview/graph/layout.examples.test.ts` (E13a, E13b), `tests/webview/graph/layout.test.ts` ("reuses lanes and colours once a merged branch has ended").

Gaps (a new `tests/webview/graph/branchColours.test.ts`):

1. **First colours.** Setup: new allocator. Call: `claim(0)` twice without release. Expected: `0`, then `1`.
2. **Strictly below.** Setup: `claim(0)`, `release(0, 3)`. Call: `claim(3)`, then `claim(4)`. Expected: `1`, then `0`.
3. **Lowest free first.** Setup: `claim(0)`, `release(0, 2)`, `claim(1)`, `release(1, 1)`. Call: `claim(3)`. Expected: `0`.
4. **Latest release wins.** Setup: `claim(0)`, `release(0, 3)`, `release(0, 1)`. Call: `claim(2)`. Expected: `0`.
5. **Independence.** Setup: allocators `a` and `b`; `a.claim(0)`. Call: `b.claim(0)`. Expected: `0`.

Behaviours in Q1 to Q3 should get tests only after they are decided.

### K.7 Questions

- **branchColours Q1.** A colour that has been claimed but not released can be handed out again (K.3 rule 4), so two overlapping claims can share a colour. The layout never overlaps claims. Should a claimed colour instead stay taken until it is released?
- **branchColours Q2.** Releasing an index that was never handed out leaves gaps that are never used and shifts the numbering of later colours. Should that be ignored, or be an error?
- **branchColours Q3.** A start row that is `NaN` or negative never reuses a colour. Should such input be rejected?

---

## L. `src/webview/graph/palette.ts`

### L.1 Interface

Module path `src/webview/graph/palette.ts`, reached as `@/webview/graph/palette`. Two exports:

| Export               | Signature or value                       | Meaning                                                                                               |
| -------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `UNCOMMITTED_COLOUR` | `"#808080"` (a string constant)          | The colour of the uncommitted row's dot and of the lines of its edge.                                 |
| `branchColour`       | `(index: number) => string \| undefined` | The configured colour for palette index `index`, or `undefined` when the configured palette is empty. |

| Export               | Source files                                                                                                                                                                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UNCOMMITTED_COLOUR` | `src/webview/components/commit/CommitGraph.tsx`: the `stroke` of uncommitted `path`s, and the colour of the uncommitted row's `circle` (its `stroke`, because that dot is always the current one and is drawn hollow)                                                                       |
| `branchColour`       | `src/webview/components/commit/CommitGraph.tsx` (colour of each committed stroke and dot, before focus dimming is applied), `src/webview/components/commit/CommitTable.tsx` (each row's branch colour, which sets the row's `--branch-colour` and `--branch-display-colour` CSS properties) |

No test imports the module.

### L.2 Dependencies the implementation must use

- `getWebviewConfig` from `@/webview/lib/webview-config`: returns the page's current `WebviewConfig` (module C), and throws `Error("Webview configuration is not initialized")` before `initializeWebviewConfig` has run. Reading it inside a Preact render or `effect` subscribes the reader to configuration changes.

### L.3 Behaviour

1. `branchColour(index)` reads `graphColours` from the current configuration on every call; nothing is cached, so a `config.changed` notification takes effect on the next call, and components that call it while rendering render again when the configuration changes.
2. With `n > 0` configured colours, the result for a whole number `index ≥ 0` is the entry at position `index mod n`: the palette is used cyclically.
3. With no configured colours, the result is `undefined`. Callers then use VS Code's focus border colour (`var(--vscode-focusBorder)`), which is also what the stylesheet's `--color-graph` token resolves to.
4. The entry is returned exactly as configured, spaces included.
5. Current results for other inputs: a negative index whose remainder is not 0 gives `undefined` (for example `-1`), a negative multiple of `n` gives the first colour (`-3` with three colours), a fractional index, `NaN` and `Infinity` give `undefined`. The layout only produces whole numbers from 0 upwards.
6. Before the configuration exists, it throws the error of L.2.

`UNCOMMITTED_COLOUR` is fixed, independent of theme and palette.

### L.4 Concrete examples

With `graphColours` `["#a", "#b", "#c"]`:

| `index` | 0      | 1      | 2      | 3      | 4      | 5      | 300    | -1          | -3     | 1.5         | NaN         |
| ------- | ------ | ------ | ------ | ------ | ------ | ------ | ------ | ----------- | ------ | ----------- | ----------- |
| result  | `"#a"` | `"#b"` | `"#c"` | `"#a"` | `"#b"` | `"#c"` | `"#a"` | `undefined` | `"#a"` | `undefined` | `undefined` |

- An `effect` reading `branchColour(1)` sees `"#b"`, then `"#y"` after the configuration changes to `["#x", "#y"]`, then `undefined` after it changes to `[]` (three runs).
- With `["rgb(1, 2, 3)", "  #00ff00  "]`: `branchColour(0)` is `"rgb(1, 2, 3)"`, `branchColour(1)` is `"  #00ff00  "`.
- With an empty palette, a rendered dot that is not the current one has `fill="var(--vscode-focusBorder)"`.

### L.5 Non-functional requirements

- No import-time effect beyond importing `webview-config`.
- Constant time per call; it is called once per stroke and once per row on each render.

### L.6 Test coverage

Not covered directly. Tests render graphs only with an empty palette (`tests/webview/test-utils.ts`), and `tests/webview/lib/config-changed.test.ts` sets a one-colour palette without checking colours.

Gaps (a new `tests/webview/graph/palette.test.ts`, with the configuration set through `initializeWebviewConfig` / `updateWebviewConfig`):

1. **Wrapping.** Setup: palette `["#a", "#b", "#c"]`. Call: `branchColour(i)` for `i` 0 to 5 and 300. Expected: `#a #b #c #a #b #c #a`.
2. **Empty palette.** Setup: palette `[]`. Call: `branchColour(0)`. Expected: `undefined`.
3. **Follows changes.** Setup: palette `["#a", "#b"]`, an `effect` recording `branchColour(1)`. Call: `updateWebviewConfig` with `["#x", "#y"]`. Expected: records `"#b"`, then `"#y"`.
4. **Before configuration.** Setup: a fresh module graph (`vi.resetModules()`), no configuration. Call: `branchColour(0)`. Expected: throws `Webview configuration is not initialized`.
5. **Uncommitted colour.** Setup: render `CommitTable` whose first commit has hash `"*"` and whose second is its parent. Expected: the first `circle` has `stroke="#808080"` and no `fill` attribute; the stroke `path` of the uncommitted row's edge has `stroke="#808080"`; `UNCOMMITTED_COLOUR` equals `"#808080"`.
6. **As written.** Setup: palette `["rgb(1, 2, 3)"]`. Expected: `branchColour(0)` is `"rgb(1, 2, 3)"`.

### L.7 Questions

- **palette Q1.** Negative, fractional and non-finite indexes give `undefined` (or, for negative multiples, the first colour) instead of always wrapping. Callers never pass them. Should the function normalise, reject, or leave them undefined?
- **palette Q2.** With an empty palette the function returns `undefined` and each caller supplies the fallback colour. Should `branchColour` return the fallback itself?
- **palette Q3.** The uncommitted colour is a fixed mid-grey regardless of theme. Should it follow a theme variable (for example `--vscode-descriptionForeground`)?

---

## M. `src/webview/utils/format.ts`

### M.1 Interface

Module path `src/webview/utils/format.ts`, reached as `@/webview/utils/format`. One export:

`format(template: string, ...parts: Array<ComponentChildren>): Array<ComponentChildren>`

- `template`: a localized string that may contain numbered placeholders `{0}`, `{1}`, ….
- `parts`: the values to put in place of the placeholders, by number: any Preact child (string, number, element, array, `null`, …).
- Returns the template cut into pieces, in order, with each placeholder replaced by its part. The caller renders the returned array as child nodes, so text that looks like HTML stays text.

Callers (all pass `window.l10n` templates): `src/webview/components/ui/ErrorBoundary.tsx`, `src/webview/components/history/{WorkspacePane,HistoryTools}.tsx`, `src/webview/components/repository/{RepositoryStatus,RefsPane,WorktreeManager,RebaseEditor,RemoteManager,StashManager}.tsx`, `src/webview/components/commit/{CommitRow,FileTree}.tsx`, `src/webview/lib/{menus,remote-actions}.tsx`. Most render the result, often with `<b>` or `<code>` parts. `FileTree.tsx` joins the result into a plain string for `title` attributes (with string parts only). `CommitRow.tsx` passes a number part.

Tests: `tests/webview/utils/format.test.ts` (inherited, S.5); menu and dialog texts in `tests/webview/lib/{menus,menu-text}.test.ts` and component tests render its output.

### M.2 Dependencies the implementation must use

- `ComponentChildren`, type-only, from `preact`.

### M.3 Behaviour

1. **Placeholder syntax.** A placeholder is `{`, one or more ASCII digits, `}`, with nothing else inside. Its number is the decimal value of the digits, so leading zeros are allowed (`{01}` is placeholder 1). Anything else in braces is ordinary text: `{a}`, `{ 0}`, `{0 }`, `{-1}`, `{}`, and digits from other scripts.
2. **Pieces.** The result lists, in template order, each maximal run of ordinary text as one string and each placeholder as its part. Empty text runs are not included: a template of only placeholders gives only parts, and adjacent placeholders give adjacent parts.
3. **Parts.** A placeholder is replaced by `parts[number]` exactly, the same value (the same object for elements), not a copy and not converted to text. A part used by two placeholders appears twice. A falsy part (`null`, `false`, `0`, `""`) is kept as it is.
4. **Missing parts.** A placeholder without a part becomes `undefined` in the result; rendered, it shows nothing, and joined into a string it contributes nothing. Parts that no placeholder uses are ignored.
5. **Braces around placeholders.** `{{0}}` gives `"{"`, the part, `"}"`.
6. **Empty template.** Gives `[]`.
7. **No markup.** The template's text and string parts are rendered as text; `<b>{0}</b>` with part `<i>x</i>` renders the literal characters.
8. A new array is returned on each call; the arguments are not changed.

### M.4 Concrete examples

| Call                                                       | Result                                                   |
| ---------------------------------------------------------- | -------------------------------------------------------- |
| `format("Refresh")`                                        | `["Refresh"]`                                            |
| `format("Add tag to commit {0}", "abcd1234")`              | `["Add tag to commit ", "abcd1234"]`                     |
| `format("Checkout {0}?", <b>abcd1234</b>)`                 | `["Checkout ", <that element>, "?"]`                     |
| `format("merge {0} into {1}?", "topic", "main")`           | `["merge ", "topic", " into ", "main", "?"]`             |
| `format("{1} then {0}", "second", "first")`                | `["first", " then ", "second"]`                          |
| `format("reset {0} to {1}", "main")`                       | `["reset ", "main", " to ", undefined]`                  |
| `format("")` and `format("", "a")`                         | `[]`                                                     |
| `format("{0}", "X")`                                       | `["X"]`                                                  |
| `format("{0}{1}", "A", "B")`                               | `["A", "B"]`                                             |
| `format("{0} and {0}", "A")`                               | `["A", " and ", "A"]`                                    |
| `format("{10}", "p0", …, "p10")`                           | `["p10"]`                                                |
| `format("{01}", "zero", "one")`                            | `["one"]`                                                |
| `format("{a} { 0} {0 } {-1} {}", "X")`                     | `["{a} { 0} {0 } {-1} {}"]`                              |
| `format("{{0}}", "X")`                                     | `["{", "X", "}"]`                                        |
| `format("x {0}", "A", "B", "C")`                           | `["x ", "A"]`                                            |
| `format("{0}\|{1}\|{2}\|{3}", null, false, 0, ["a", "b"])` | `[null, "\|", false, "\|", 0, "\|", ["a", "b"]]`         |
| `format("a\n{0}\nb", "X")`                                 | `["a\n", "X", "\nb"]`                                    |
| ``format("$& {0} $1", "$`")``                              | ``["$& ", "$`", " $1"]`` (`$` sequences are not special) |
| `format("{99999999999999999999}", "X")`                    | `[undefined]`                                            |

Rendered with Preact in jsdom: `format("{0} and {0}", <b>x</b>)` inside a `p` gives `<p><b>x</b> and <b>x</b></p>`; `format("reset {0} to {1}", "main")` gives `<p>reset main to </p>`; `format("{0}|{1}|{2}", null, false, 0)` gives `<p>||0</p>`; `format("<b>{0}</b>", "<i>x</i>")` gives `<p>&lt;b&gt;&lt;i&gt;x&lt;/i&gt;&lt;/b&gt;</p>`.

### M.5 Non-functional requirements

Pure: no state, no side effects, the same input gives an equal result. Linear in the template's length. Called during rendering, so it must be cheap.

### M.6 Test coverage

Covered (`tests/webview/utils/format.test.ts`): a template without placeholders; one string part; an element part kept as an element; several placeholders; parts placed by number rather than order; a missing part giving `undefined`.

Gaps:

1. **Empty template.** Call: `format("")`. Expected: `[]`.
2. **Adjacent and lone placeholders.** Call: `format("{0}{1}", "A", "B")` and `format("{0}", "X")`. Expected: `["A", "B"]` and `["X"]`.
3. **Repeated placeholder.** Setup: an element `b`. Call: `format("{0}-{0}", b)`. Expected: positions 0 and 2 are the same object as `b`; rendered twice.
4. **Numbers of more than one digit.** Call: `format("{10}", …eleven parts)`. Expected: the eleventh part.
5. **Not placeholders.** Call: `format("{a} { 0} {}", "X")`. Expected: the template as one string.
6. **Extra parts.** Call: `format("x {0}", "A", "B")`. Expected: `["x ", "A"]`.
7. **Falsy parts kept.** Call: `format("{0}{1}{2}", null, false, 0)`. Expected: `[null, false, 0]`.
8. **No markup.** Setup: jsdom. Call: render `format("<b>{0}</b>", "<i>x</i>")` in a `p`. Expected: the `p`'s `textContent` is `<b><i>x</i></b>` and it has no child elements.
9. **Joining.** Call: `format("{0} was renamed to {1}", "a").join("")`. Expected: `"a was renamed to "`.

### M.7 Questions

- **format Q1.** A placeholder without a part yields an `undefined` entry; the existing test calls this "dropping" the placeholder, but the entry is still in the array. Should the entry be left out, or should the absence be an error?
- **format Q2.** Leading zeros are accepted (`{01}` is part 1), and a very long number yields `undefined`. Intended?
- **format Q3.** A template cannot contain a literal `{0}`. Is an escape needed?

---

## N. `src/webview/utils/ref.ts`

### N.1 Interface

Module path `src/webview/utils/ref.ts`, reached as `@/webview/utils/ref`. One export:

`hasInvalidRefChars(name: string): boolean`

Returns `true` when `name` contains something the rules below reject for a Git ref name, `false` otherwise.

Caller: `src/webview/components/ui/Dialog.tsx`, for every `"ref"` input of a form (module E): the form refuses to submit while any ref field is empty or this returns `true`, and an invalid (non-empty) name puts `window.l10n.invalidCharacters` on the submit button's tooltip. Tests: `tests/webview/utils/ref.test.ts` (inherited, S.5) and the ref-field cases of `tests/webview/components/ui/Dialog.behaviour.test.ts`.

### N.2 Dependencies the implementation must use

None.

### N.3 Behaviour

`true` exactly when at least one of these holds (and `false` otherwise, including for `""`):

1. **Characters.** The name contains a space, `~`, `^`, `:`, `?`, `*`, `[` or `\`, or one of `"`, `<`, `>`.
2. **Sequences anywhere.** It contains `..`, `//`, `@{`, or `/.` (a component after the first one starts with a dot).
3. **Start.** It starts with `-` or `/`.
4. **End.** It ends with `.`, `/` or `.lock`.
5. **Whole name.** It is exactly `@`.

"Start" and "end" mean the start and end of the whole string, even when it contains line breaks. Only the plain space (U+0020) counts as a space; tab and other whitespace are not rejected. Characters outside ASCII are accepted.

The function is pure: the same name always gives the same answer, however often and in whatever order it is called.

Comparison with `git check-ref-format --branch` (Git 2.43.0):

- Rejected here but accepted by Git: names containing `"`, `<` or `>` (for example `a"b`, `a<b`, `a>b`).
- Accepted here but rejected by Git: a name starting with `.` (`.hidden`), a component ending in `.lock` before a slash (`a.lock/b`), control characters such as tab, newline and DEL (`a\tb`), and `HEAD`.
- Agreeing: everything in the example table not listed above.

### N.4 Concrete examples

Names are written as JavaScript string literals.

| Name                             | Result  |     | Name                                | Result |
| -------------------------------- | ------- | --- | ----------------------------------- | ------ |
| `""`                             | `false` |     | `"-x"`, `"-"`                       | `true` |
| `"main"`                         | `false` |     | `"/x"`, `"/"`                       | `true` |
| `"feature/login"`                | `false` |     | `"x/"`, `"a/"`                      | `true` |
| `"refs/heads/x"`                 | `false` |     | `"a//b"`                            | `true` |
| `"a.b"`                          | `false` |     | `"a..b"`, `"a.."`, `".."`           | `true` |
| `"x-"`                           | `false` |     | `"a/.b"`                            | `true` |
| `"a@b"`, `"@@"`                  | `false` |     | `"x."`, `"."`                       | `true` |
| `"a]b"`, `"a{b"`, `"a}b"`        | `false` |     | `"x.lock"`, `".lock"`, `"a/b.lock"` | `true` |
| `"ü-branch"`                     | `false` |     | `"a@{b"`, `"branch@{1}"`            | `true` |
| `"HEAD"`                         | `false` |     | `"@"`                               | `true` |
| `".hidden"`                      | `false` |     | `"a b"`                             | `true` |
| `"a./b"`                         | `false` |     | `"a~b"`, `"a^b"`, `"a:b"`           | `true` |
| `"a.lock/b"`                     | `false` |     | `"a?b"`, `"a*b"`, `"a[b"`           | `true` |
| `"a\tb"`, `"a\nb"`, `"a\u007fb"` | `false` |     | `"a\\b"`                            | `true` |
| `"a\n-b"`                        | `false` |     | `"a\"b"`, `"a<b"`, `"a>b"`          | `true` |
| `"a\u00a0b"` (no-break space)    | `false` |     |                                     |        |

### N.5 Non-functional requirements

Pure and stateless (no shared matcher state between calls). Linear in the name's length. No import-time effect.

### N.6 Test coverage

Covered (`tests/webview/utils/ref.test.ts`): a plain branch name; the same answer twice; rejection of a space, a leading dash, a leading slash, `..`, `//`, `/.`, a trailing dot, a trailing slash, `.lock`, `@{`, a lone `@`, `~`, `^`, `:`, `?`, `*`, `[`, `\`. The dialog's use (empty and invalid ref fields, the tooltip, the first problem field deciding) is covered in `tests/webview/components/ui/Dialog.behaviour.test.ts`.

Gaps:

1. **Accepted names.** Call: `hasInvalidRefChars` on `""`, `"a.b"`, `"x-"`, `"a@b"`, `"a]b"`, `"ü-branch"`, `"refs/heads/x"`. Expected: `false` for each.
2. **Rejected characters not yet tested.** Call: on `"a\"b"`, `"a<b"`, `"a>b"`. Expected: `true` for each (current behaviour; see Q1).
3. **Positions that need the whole string.** Call: on `"-"`, `"/"`, `"."`, `".lock"`. Expected: `true` for each.
4. **Many calls.** Call: on `"a..b"` and `"main"` alternately, ten times. Expected: always `true` and `false` respectively.

The cases listed under Q2 should get tests only after that question is decided.

### N.7 Questions

- **ref Q1.** The rules are stricter than Git's: `"`, `<` and `>` are refused although Git accepts them in branch names. Intended (for example to keep names safe to show or quote), or should they be accepted?
- **ref Q2.** The rules are looser than Git's: names starting with `.`, components ending in `.lock` before a slash, control characters (tab, newline, DEL) and `HEAD` pass here and then fail in Git with Git's own message. Should the dialog catch them?
- **ref Q3.** The empty string counts as valid here; the dialog checks emptiness separately. Should the function reject it?

---

## Summary of test gaps

- **A (rpc.types):** narrowing `RpcRequest` by method; `null` params required; response member forms; exact method, notification and pane sets; the notification union; `WebviewInitialize` and `ScanRepoResult` keys.
- **B (legacy):** exact command sets of both unions; `GitRepoState` forms; optional `focusBranch`; partial saves; shared `viewDiff` members and `graphQueryError.query`; the default `repoState` answer for an unsaved repository.
- **C (types/config):** read-only fields; `DateFormat` and `GraphStyle` match `package.json`; key set at compile time.
- **D (types/git):** `GitRepo` and `RepoUpdate` shapes and their use in the notification map.
- **E (webview types):** `DialogValues` on tuples; `DialogInput` forms; `DialogState` token; `ActionCommand` without `repo`; `CommitBranchType`; identity of the re-exported types.
- **F (webview constants):** direct value checks; details height in the rendered table; header-height fallback in the viewport style.
- **G (global.d.ts):** what `postMessage` accepts and rejects; `getState` and `window.l10n` types.
- **H (webview tsconfig):** no Node globals, DOM available.
- **I (graph types):** closed `BranchRelation` set and `GraphLine.parent` forms.
- **J (graph constants):** dot radius 4; graph column width from `GRAPH_PADDING` with its 64 and 240 limits.
- **K (branchColours):** direct allocator tests: first colours, strict reuse rule, lowest free first, latest release wins, independence.
- **L (palette):** wrapping, empty palette, reactivity, error before configuration, uncommitted colour in the DOM, colours as written.
- **M (format):** empty template, adjacent and lone placeholders, repeated placeholder, multi-digit numbers, non-placeholders, extra parts, falsy parts, no markup, joining.
- **N (ref):** accepted names, untested rejected characters, whole-string positions, repeated calls.

---

## Decisions

These decisions are the maintainer's answers to the questions above. Where they differ from "current behaviour" elsewhere in this specification, they win.

- **Every type-only module (A–E, G, I) and every question about them** (`rpc.types` Q1–Q4, `legacy` Q1–Q7, `types-config` Q1–Q2, `types-git` Q1, `webview-types` Q1–Q6, `global.d.ts` Q1–Q3, `graph-types` Q1–Q2): keep every exported name, field, literal and optionality exactly as specified. No type is widened, narrowed or made distributive in this rewrite.
- **webview-constants Q1, Q3.** Keep the current values and callers.
- **webview-constants Q2.** Give `RESIZABLE_COLUMNS` a read-only type (`readonly number[]` or equivalent) if every existing caller still type-checks unchanged; if any caller would need editing, keep `number[]` and say so in the report.
- **webview-tsconfig Q1, Q2.** Keep the options and values; the reviewer records the lines that necessarily match. Write the file in your own layout and order.
- **graph-constants Q1, Q2; branchColours Q1–Q3; palette Q1–Q3.** Keep the current behaviour: the graph's golden tests depend on the allocator and palette exactly as they are.
- **format Q1–Q3.** Keep the current behaviour.
- **ref Q1, Q3.** Keep: `"`, `<` and `>` stay rejected, and `""` stays `false` (the dialog checks emptiness itself).
- **ref Q2.** Also return `true` for: any control character (U+0000–U+001F and U+007F) anywhere in the name; a name that starts with `.`; any `/`-separated component that ends with `.lock` (not only the whole name's end); and the exact name `HEAD`. Update the example table accordingly (`".hidden"`, `"a.lock/b"`, `"a\tb"`, `"a\nb"`, `"a\u007fb"`, `"a\n-b"` and `"HEAD"` become `true`); `"a./b"`, `"a b"` and non-ASCII letters stay `false`.
