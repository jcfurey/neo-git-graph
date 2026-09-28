# Clean-room specification: the webview's state, message dispatch and response handlers

This document covers thirteen small modules of the webview (the Preact page inside the Branchwise
panel). Together they hold the page's shared state, receive the extension host's messages and turn
the answers to graph reads and Git actions into state changes. It is written for an engineer who
will build replacements without ever seeing the current files. Everything below describes what the
modules do as seen from outside: by the callers, by the tests, and by the other modules that read
the state they write.

| §   | Module                                      | In one line                                                                        |
| --- | ------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1   | `src/webview/lib/dispatcher.ts`             | Routes the extension's command messages to the right handler.                      |
| 2   | `src/webview/lib/stores.ts`                 | The page's shared signals: selection, lists, dialog, menu, per-repository records. |
| 3   | `src/webview/lib/stores/repo-list.store.ts` | The list of repositories the picker offers.                                        |
| 4   | `src/webview/lib/load-repos.ts`             | Runs a repository scan and records why it failed.                                  |
| 5   | `src/webview/lib/webview-config.ts`         | Holds the extension's settings for the page.                                       |
| 6   | `src/webview/lib/vscode.ts`                 | The one handle on the VS Code webview API.                                         |
| 7   | `src/webview/lib/handler/action-result.ts`  | Settles the answer to a Git action.                                                |
| 8   | `src/webview/lib/handler/load-branches.ts`  | Takes a branch list answer and keeps the selection valid.                          |
| 9   | `src/webview/lib/handler/load-commits.ts`   | Takes a page of graph rows.                                                        |
| 10  | `src/webview/lib/handler/commit-details.ts` | Takes the details of the expanded row.                                             |
| 11  | `src/webview/lib/handler/view-diff.ts`      | Reports a diff the extension could not open.                                       |
| 12  | `src/webview/lib/handler/refresh.ts`        | Reloads the graph when the extension asks.                                         |
| 13  | `src/webview/lib/actions/clipboard.ts`      | Copies text through the extension and reports a failure.                           |

None of the thirteen modules renders anything: there is no DOM contract (elements, classes, ARIA,
`data-*` attributes) to preserve. What they must preserve is their exports, the state they write,
the messages that result, and the dialogs they open.

Each module section has the seven parts the brief asks for. Questions are numbered per module
(`dispatcher Q1`, `stores Q1`, …) and collected again at the end (§14).

---

## 0. How the observations were made

- Repository at commit `71f1e92` (branch `claude/documented-backlog-lwou5x`). Node v22.22.2,
  Vitest 4.1.11, jsdom 30, `@preact/signals` 2.
- Read the thirteen modules, every file that imports them (`src/webview/main.tsx`,
  `src/webview/lib/actions.ts`, `rpc/rpc-handler.ts`, `copy.ts`, `menus.tsx`, `navigation.ts`,
  `repository-actions.tsx`, `remote-actions.tsx`, `graph-requests.ts`, `hints.ts`, `focus.ts`,
  `use-repository-query.ts`, the components that read the stores, `graph/palette.ts`,
  `utils/date.ts`, `utils/fileTree.ts`, `tests/webview/test-utils.ts`), the modules they import
  (`graph-requests.ts`, `remote-actions.tsx`, `activity.ts`, `navigation.ts`,
  `components/history/HistoryTools.tsx`, `utils/columns.ts`, `rpc/rpc-client.ts`,
  `rpc/rpc-handler.ts`), the message and configuration types (`src/types/`,
  `src/backend/types/`, `src/webview/types.ts`, `src/webview/global.d.ts`), the extension code
  that sends the messages (`src/old-extension/messageHandler.ts`, `src/extension/legacy.ts`,
  `src/extension/view-command.ts`, `src/extension/handlers/scan-repo.ts`,
  `src/extension/handlers/clipboard.ts`), the English strings
  (`src/old-extension/l10n/webviewL10n.ts`, `repositoryL10n.ts`), `docs/preferences.md`, the lint
  configuration (`.oxlintrc.json`, `oxlint/`), and the VS Code UI workflow test
  (`tests-ext/ui/history.test.cjs`).
- Ran the webview test project (59 files, 1 200 tests pass, 2 skipped benchmarks) and the twelve
  files that import these modules directly.
- Ran scratch Vitest files kept outside the repository (jsdom, the repository's
  `tests/webview/setup.ts`, which installs a global `acquireVsCodeApi` returning one shared mock
  `vscodeApi` whose `postMessage`, `getState` and `setState` are spies). Each scenario re-imported
  the modules with `vi.resetModules()`, installed the tests' localisation stand-in (see Terms), and
  recorded posted messages, store values and, with `effect` from `@preact/signals`, how many
  notifications a call produced. Messages from the extension were simulated with
  `window.dispatchEvent(new MessageEvent("message", { data }))`, which runs listeners
  synchronously.
- To learn what the existing tests actually check, the whole webview test project was run against
  83 deliberately altered copies of the modules, one alteration at a time (each copy substituted
  for the original through a resolver hook, without touching the repository). The result of each
  run is quoted in the "Test coverage" parts as "an alteration that … is caught by …" or "… is
  caught by no test". Two heavy tests unrelated to these modules (`FileTreeView.test.ts` "renders a
  large commit …" with 5 000 files, and `graph/layout.rules.test.ts`) sometimes time out while the
  project runs under load; alterations "caught" only by them were run again and are reported as
  caught by no test. Alterations that remove a check another module already performs (the
  repository check in §8 and §9) cannot be caught at all and are marked as such.
- All scratch files lived under `/tmp` and have been deleted.

### Terms used below

- **Stand-in strings.** The webview tests install a `window.l10n` whose every property reads as
  its own key, so `window.l10n.unableToViewDiff` is the string `"unableToViewDiff"`. Examples
  marked "(stand-in)" use it; examples marked "(English)" use the real strings.
- **Selected repository**: the value of the `selectedRepo` store (§2). "No repository" means
  `undefined`.
- **Selection**: the value of `selectedBranch`: a branch name, `"*"` (every branch; the constant
  `SHOW_ALL_BRANCHES` from `@/webview/constants`), or `undefined` (nothing chosen yet, which is the
  state right after a repository switch until the branch list arrives).
- **View mode**: the value of `branchDisplay`: `"filter"` (the graph is limited to the selected
  branch), `"focus"` or `"ancestors"` (the whole graph is shown and the selected branch is
  emphasised).
- **Displayed branch**: what `displayedBranch()` (§2) returns: the branch whose history the graph
  rows belong to, with `""` meaning every branch.
- **Visibility key**: what `remoteVisibilityKey()` (§2) returns. `loadBranches` and `loadCommits`
  requests carry it, and their answers may echo it.
- **Pending graph request / accepted**: `graph-requests.ts` remembers, for each of `loadBranches`,
  `loadCommits` and `commitDetails`, the id and repository of the latest request sent. An answer
  is _accepted_ when `acceptGraphResponse` agrees (§0.2); accepting forgets the pending request, so
  a second answer with the same id is refused.
- **One notification**: a group of store writes that `@preact/signals` subscribers observe as a
  single change (made inside one `batch`), so they never see the group half applied.
- **Error dialog**: the dialog store holding `{ kind: "error", message, reason, token }`, opened by
  `openErrorDialog(message, reason)` from `actions.ts`, which also closes any open context menu.

### 0.1 The messages the page receives

The extension posts messages to the page with VS Code's `webview.postMessage`; the page sees them
as `message` events on `window`. Two families share the channel:

- **Command messages** have a string field `command`. Their union is `ResponseMessage` in
  `src/types/legacy.ts` (re-exported from `@/types`):

  | `command`                     | Other fields                                                                                        |
  | ----------------------------- | --------------------------------------------------------------------------------------------------- |
  | `repoState`                   | `repo: string`, `state: GitRepoState`                                                               |
  | `graphQueryError`             | `query: "loadBranches" \| "loadCommits" \| "commitDetails"`, `repo`, `requestId`, `message: string` |
  | `fileHistory`                 | `repo: string`, `path: string`                                                                      |
  | the 17 action commands (§7.1) | `status: string \| null`, `repo?: string`, `requestId?: string`                                     |
  | `repositoryQuery`             | `repo`, `requestId`, `data`, `status`                                                               |
  | `loadRemotes`                 | `repo`, `requestId`, `remotes`, `upstream`, `pushRemote`, `status`                                  |
  | `commitDetails`               | `repo`, `requestId`, `commitDetails: GitCommitDetails \| null` (§10.1)                              |
  | `loadBranches`                | see §8.1                                                                                            |
  | `loadCommits`                 | see §9.1                                                                                            |
  | `viewDiff`                    | `success: boolean`                                                                                  |
  | `refresh`                     | none                                                                                                |

- **RPC messages** have a string field `kind` (`"rpc.response"` or `"rpc.notify"`) and no
  `command`. `src/webview/lib/rpc/rpc-handler.ts` has its own `window` listener for them. The
  dispatcher (§1) must leave them alone.

### 0.2 What the collaborating modules do

These are the contracts the thirteen modules rely on. They belong to other files and stay as they
are.

- `acceptGraphResponse(message)` from `@/webview/lib/graph-requests` takes an object with
  `command` (one of the three graph reads), `repo` and `requestId`. It returns `true` exactly when
  a request of that command is pending, the message's `requestId` and `repo` equal the pending
  request's, and `repo` equals the selected repository; it then forgets the pending request.
  Otherwise it returns `false` and forgets nothing. Requests are registered by `actions.ts` when it
  posts them; `closeCommitDetails` forgets a pending details request; `selectRepo` forgets all
  three.
- `actionMutates(message)` from `@/webview/lib/remote-actions` says whether an action answer should
  reload the graph: `true` when the answer has no `requestId`; `true` when it has one that belongs
  to an action still recorded as in flight and that action was recorded as changing the
  repository (explicitly, or by not being a background action); `false` otherwise, including for
  ids that are unknown or already settled.
- `acceptRemoteActionResult(message)` from the same module settles the in-flight record: for an
  answer without `requestId` it returns `true`. For an answer whose record names another
  repository it returns `false` and keeps the record. Otherwise it forgets the record (so
  `actionMutates` for the same message now answers `false`), finishes the Git Activity entry, runs
  the sender's completion callback, and returns `true` only when the running dialog it opened is
  still the open dialog and the repository being viewed has not changed. In the other cases it
  returns `false` after dealing with the outcome itself (a background failure becomes an error
  dialog or an unseen-failure mark; a result whose dialog was hidden or replaced becomes an
  unseen-failure mark; a switched repository also closes the dialog).
- From `@/webview/lib/actions` (see the separate `actions.ts` specification):
  - `refresh()`: with a repository selected, reloads everything shown for it: posts a new
    `loadBranches` request, asks for the repository state (`repositoryQuery` with
    `query: { kind: "state" }`, cancelling an earlier one with `cancelRepositoryQuery`), and posts
    a `loadCommits` request when the selection is not `undefined`. It keeps the loaded rows. With
    no repository selected it does nothing.
  - `selectBranch(branch)`: makes `branch` the selection (revealing its remote if hidden,
    resetting the loaded history when the displayed branch changes, requesting the rows that are
    now missing, and saving the view preferences with a `saveRepoState` message).
  - `closeCommitDetails()`: forgets a pending details request and sets `expandedCommit` and
    `commitDetails` to `null` in one notification.
  - `openErrorDialog(message, reason = null)` and `closeDialog()`.
  - `selectRepo(repo)` and `receiveRepoState(message)`.
- `savedFocusBranch(repo)` from `@/webview/lib/navigation`: the focus target saved for that
  repository: the `focusBranch` of its `graphPreferences` in `repoStates` when that record has
  preferences (possibly `undefined`, `"*"` or a branch name), otherwise the target migrated from
  the page's older webview state, otherwise `undefined`.
- `openFileHistory(file, revision = "")` from `@/webview/components/history/HistoryTools`: closes
  the dialog and sets the history search to follow `file` from `revision`.
- `handleGraphQueryError` (`@/webview/lib/handler/graph-query-error`), `handleLoadRemotes`
  (`@/webview/lib/remote-actions`) and `handleRepositoryQuery`
  (`@/webview/lib/repository-actions`) handle their messages completely; the dispatcher only
  routes to them.
- `rpcClient.request(method, params)` from `@/webview/lib/rpc/rpc-client` posts
  `{ kind: "rpc.request", id, method, params }` synchronously and returns a promise that resolves
  with the extension's result, or rejects with an `Error`: the extension's error text, the text
  `Malformed response to an RPC request`, a timeout after 30 000 ms, or the error thrown when the
  message could not be posted.

### 0.3 Repository rules that apply to all thirteen files

- `pnpm run typecheck`: TypeScript `strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`
  (type-only imports must be written `import type`), `isolatedModules`.
- `pnpm run lint` (oxlint): `no-console` is an error (an intended console call needs a disable
  comment on the line before it); `import/no-relative-parent-imports` is an error (use the `@/`
  alias rather than `../`); imports are alphabetised in groups, `@/` imports forming the internal
  group; every file under `src/webview/lib/handler/` is forbidden to import
  `@/webview/lib/vscode` (handlers change state only; requests are started from `actions.ts`).
- `pnpm run format` (oxfmt).
- `pnpm run check:provenance`: the rewritten files must contain no inherited lines.
- The webview is bundled by esbuild; the modules run in the VS Code webview (a browser) and, in
  tests, in jsdom.

---

## 1. `src/webview/lib/dispatcher.ts`

The page's entry point for command messages from the extension. Once started, it looks at every
`message` event on `window` and hands each command message to the function that deals with that
command.

### 1.1 Interface

Module path `src/webview/lib/dispatcher.ts`. `src/webview/main.tsx` imports it as
`./lib/dispatcher`; `tests/webview/test-utils.ts` as `@/webview/lib/dispatcher`.

One export, no default export, no exported types:

| Export           | Signature                |
| ---------------- | ------------------------ |
| `initDispatcher` | `initDispatcher(): void` |

It takes no parameters and returns nothing. Calling it starts the routing described in §1.3 for
the rest of the page's life.

Who uses it:

| User                          | Use                                                                                                                                                                                                   |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/webview/main.tsx`        | Calls it once at start-up, after `rpcClient.init()` and before the first render, so no message sent after the page loads is missed.                                                                   |
| `tests/webview/test-utils.ts` | `setupWebviewTest({ dispatchMessages: true })` calls `rpcClient.init()` and then `initDispatcher()`. Used by `tests/webview/lib/actions/clipboard.test.ts` and `tests/webview/lib/menu-text.test.ts`. |

### 1.2 Dependencies the implementation must use

| Import path                                 | Names                            | For                            |
| ------------------------------------------- | -------------------------------- | ------------------------------ |
| `@/types`                                   | `ResponseMessage` (type only)    | The shape of command messages. |
| `@/webview/lib/actions`                     | `receiveRepoState`, `selectRepo` | `repoState` and `fileHistory`. |
| `@/webview/components/history/HistoryTools` | `openFileHistory`                | `fileHistory`.                 |
| `@/webview/lib/handler/action-result`       | `handleActionResult`             | The 17 action commands.        |
| `@/webview/lib/handler/commit-details`      | `handleCommitDetails`            | `commitDetails`.               |
| `@/webview/lib/handler/graph-query-error`   | `handleGraphQueryError`          | `graphQueryError`.             |
| `@/webview/lib/handler/load-branches`       | `handleLoadBranches`             | `loadBranches`.                |
| `@/webview/lib/handler/load-commits`        | `handleLoadCommits`              | `loadCommits`.                 |
| `@/webview/lib/handler/refresh`             | `handleRefresh`                  | `refresh`.                     |
| `@/webview/lib/handler/view-diff`           | `handleViewDiff`                 | `viewDiff`.                    |
| `@/webview/lib/remote-actions`              | `handleLoadRemotes`              | `loadRemotes`.                 |
| `@/webview/lib/repository-actions`          | `handleRepositoryQuery`          | `repositoryQuery`.             |

The handler modules may equally be imported by sibling-relative paths (`./handler/…`); `../`
paths are not allowed by the lint rules.

### 1.3 Behaviour

**Starting.** `initDispatcher()` adds one listener for `message` events on `window` and returns.
It posts nothing and changes no store. Before it has been called, command messages have no
effect (the RPC listener ignores them).

**Which events are handled.** For each event the listener looks at `event.data`:

- It is ignored, silently, unless it is an object (not `null`) that has a property named
  `command` whose value is a string. So `null`, `undefined`, strings, numbers, arrays, objects
  without `command`, objects whose `command` is not a string, and every RPC message
  (`{ kind: "rpc.response" | "rpc.notify", … }`) produce nothing: no handler, no warning, no
  exception. The current check also accepts a `command` inherited through the object's prototype;
  messages that come through VS Code are plain structured-clone objects, so this never matters in
  practice.
- A message that has both a `kind` and a string `command` is treated as a command message (the
  RPC listener may handle it as well; the two listeners are independent).

**Routing.** A handled message is passed, as the same object (not a copy), to exactly one
function, according to its `command`:

| `command`                                                                                                                                                                                                                                                              | What happens                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `repoState`                                                                                                                                                                                                                                                            | `receiveRepoState(message)`                                                                                                      |
| `graphQueryError`                                                                                                                                                                                                                                                      | `handleGraphQueryError(message)`                                                                                                 |
| `fileHistory`                                                                                                                                                                                                                                                          | `selectRepo(message.repo)`, then `openFileHistory(message.path)` (one argument, so the history starts from the default revision) |
| `repositoryAction`, `addTag`, `checkoutBranch`, `checkoutCommit`, `cherrypickCommit`, `createBranch`, `deleteBranch`, `deleteTag`, `mergeBranch`, `mergeCommit`, `pushTag`, `pushBranch`, `pullBranch`, `fetchRemote`, `renameBranch`, `resetToCommit`, `revertCommit` | `handleActionResult(message)`                                                                                                    |
| `repositoryQuery`                                                                                                                                                                                                                                                      | `handleRepositoryQuery(message)`                                                                                                 |
| `loadRemotes`                                                                                                                                                                                                                                                          | `handleLoadRemotes(message)`                                                                                                     |
| `commitDetails`                                                                                                                                                                                                                                                        | `handleCommitDetails(message)`                                                                                                   |
| `loadBranches`                                                                                                                                                                                                                                                         | `handleLoadBranches(message)`                                                                                                    |
| `loadCommits`                                                                                                                                                                                                                                                          | `handleLoadCommits(message)`                                                                                                     |
| `refresh`                                                                                                                                                                                                                                                              | `handleRefresh()`                                                                                                                |
| `viewDiff`                                                                                                                                                                                                                                                             | `handleViewDiff(message)`                                                                                                        |

That is every `command` of `ResponseMessage`. Today nothing forces a new member of the union to
get a route (a command without one is simply warned about); whether the type should enforce
completeness is left to the implementer, but the table above must be covered.

- For `fileHistory` the order matters: the repository switch first, then the history search.
  Switching restores the new repository's own saved search, so a search set before the switch
  would be replaced by it. When the message names the repository already selected, the switch does
  nothing and only the search changes.
- No field of the message other than `command` is checked here. Whatever the target function does
  with a malformed message is its own business.
- The target runs synchronously inside the event dispatch; everything it does has happened when
  `window.dispatchEvent` returns.

**Unknown commands.** A string `command` with no route (for example `"bogus"` or `""`) calls
`console.warn` once with two arguments: the text `no handler for` and the command. Nothing else
happens. Command names that are also names of `Object.prototype` members behave differently today
(dispatcher Q2).

**Errors.** An exception thrown by a target function is not caught: it leaves the listener and is
reported by the browser as an uncaught error (in jsdom, as an `error` event on `window`). The
listener stays registered and handles the next message normally.

**Repeated start.** Each call of `initDispatcher()` adds another listener; after two calls every
command message is handled twice (dispatcher Q1).

**Disposal.** There is none: the listener lives as long as the page. There is no way to stop it.

### 1.4 Concrete examples

All with `initDispatcher()` called once, the stand-in strings, and a configuration with
`initialLoadCommits: 300`.

| Selected repository, selection         | `event.data`                                                                             | Observed effect                                                                                                                                                                                                                                                                                                 |
| -------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/r`, `main`                           | `{ command: "refresh" }`                                                                 | Posted, in order: `loadBranches` (repo `/r`), `repositoryQuery` (`query: { kind: "state" }`, preceded by a `cancelRepositoryQuery` when a state request was still open), `loadCommits` (repo `/r`, `branchName: "main"`).                                                                                       |
| any                                    | `{ command: "viewDiff", success: false }`                                                | `dialog` becomes `{ kind: "error", message: "unableToViewDiff", reason: null, token: <n> }`.                                                                                                                                                                                                                    |
| `/first`, error dialog open            | `{ command: "fileHistory", repo: "/second", path: "dir/a.txt" }`                         | `selectedRepo` is `/second`; posted `cancelRepositoryQuery` (for `/first`'s open state request), then `selectRepo`, `loadBranches`, `repositoryQuery` for `/second`; `dialog` is `null`; the history search is `{ text: "", author: "", since: "", until: "", path: "dir/a.txt", revision: "", follow: true }`. |
| `/second` (unchanged)                  | `{ command: "fileHistory", repo: "/second", path: "b.txt" }`                             | Nothing posted; the search's `path` becomes `b.txt`, `follow: true`.                                                                                                                                                                                                                                            |
| any                                    | `{ command: "bogus" }`                                                                   | `console.warn("no handler for", "bogus")`; nothing else.                                                                                                                                                                                                                                                        |
| any                                    | `{ command: "" }`                                                                        | `console.warn("no handler for", "")`.                                                                                                                                                                                                                                                                           |
| any                                    | `null`, `undefined`, `"refresh"`, `3`, `[]`, `{ command: 5 }`                            | Nothing, no warning.                                                                                                                                                                                                                                                                                            |
| any                                    | `{ kind: "rpc.response", id: "x", success: true, result: 1 }`                            | Nothing from the dispatcher, no warning.                                                                                                                                                                                                                                                                        |
| any                                    | `{ kind: "rpc.notify", id: "x", name: "repo.updated", message: {}, command: "refresh" }` | The dispatcher runs `handleRefresh()`.                                                                                                                                                                                                                                                                          |
| `/r`, `main`, dispatcher started twice | `{ command: "refresh" }`                                                                 | `handleRefresh()` runs twice (two `loadBranches` requests are posted).                                                                                                                                                                                                                                          |

Every one of the 27 routed commands was checked by replacing each target with a recorder: each
command reaches exactly its target, with the message object itself (`fileHistory` reaches
`selectRepo` with `"/r"` and then `openFileHistory` with `["p"]` for
`{ command: "fileHistory", repo: "/r", path: "p" }`).

### 1.5 Non-functional requirements

- **Import-time behaviour.** Importing the module must add no listener, post nothing and write no
  store. `main.tsx` decides when routing starts.
- **Import cycles.** The module is not part of any import cycle (only `main.tsx` and the test
  utilities import it), so its dependencies are fully evaluated before it. It still must not call
  any imported function while loading.
- **Synchronous.** Routing is synchronous; nothing is deferred.
- **Cost.** Constant work per message; no scanning of lists.
- **No state of its own** beyond the registered listener(s). Tests that call
  `vi.resetModules()` and set up again get a new listener each time, on the same `window`.
- **Lint.** The unknown-command warning is a console call; keep a disable comment for
  `no-console` on the line before it if the warning stays.

### 1.6 Test coverage

What the existing tests check:

- Only that a started dispatcher does not disturb RPC traffic: `clipboard.test.ts` and
  `menu-text.test.ts` start it and then deliver RPC responses. The command routes themselves are
  not exercised by any webview test. An alteration that stops the dispatcher from routing
  anything is caught by no test, and neither is removing the unknown-command warning or reversing
  the order of the two `fileHistory` calls.
- The routes are exercised end to end only by the VS Code UI workflow test
  (`tests-ext/ui/history.test.cjs`, run by `xvfb-run -a pnpm run test:ext`): graphs load
  (`loadBranches`, `loadCommits`), Git actions finish and close their running dialog (action
  results), a refused merge shows "Unable to Merge Branch", and a broken configuration shows the
  graph error with Retry (`graphQueryError`).

Gaps, with the test to add (jsdom; `setupWebviewTest()` without dispatching, then
`initDispatcher()` once in the file; replace targets with `vi.mock` recorders where noted):

1. **Every route.** Setup: `vi.mock` each target module so that its function records its
   argument; start the dispatcher. Call: dispatch `{ command: c, repo: "/r", path: "p" }` for
   each of the 27 commands. Expected: exactly one recorder called per command, with the dispatched
   object itself; for `fileHistory`, `selectRepo("/r")` then `openFileHistory("p")` and nothing
   else; for `refresh`, `handleRefresh` called.
2. **`fileHistory` switches first.** Setup: real modules; select `/first`; open an error dialog.
   Call: dispatch `{ command: "fileHistory", repo: "/second", path: "dir/a.txt" }`. Expected:
   `selectedRepo` is `/second`, `dialog` is `null`, `historyFilter.value` has
   `path: "dir/a.txt"` and `follow: true`.
3. **Ignored data.** Setup: spy on `console.warn`; `vscodeApi.postMessage.mockClear()`. Call:
   dispatch each of `null`, `undefined`, `"refresh"`, `3`, `[]`, `{ command: 5 }`,
   `{ kind: "rpc.response", id: "x", success: true, result: 1 }`. Expected: nothing posted, no
   store changed, `console.warn` not called, no `error` event on `window`.
4. **Unknown command.** Call: dispatch `{ command: "bogus" }`. Expected: `console.warn` called
   once with `("no handler for", "bogus")`; nothing posted.
5. **Exceptions do not stop routing.** Setup: a mocked target that throws once. Call: dispatch
   its command twice. Expected: one `error` event on `window` (prevent its default in the test),
   and the second dispatch reaches the target.
6. **Synchronous.** Call: dispatch `{ command: "viewDiff", success: false }`. Expected: `dialog`
   is the error dialog immediately after `dispatchEvent` returns, without awaiting.
7. Depending on the decisions on dispatcher Q1 and Q2: a second `initDispatcher()` does not
   double the handling; `{ command: "toString" }`, `{ command: "hasOwnProperty" }` and
   `{ command: "__proto__" }` are treated as unknown commands (warning, no exception).

### 1.7 Questions

- **dispatcher Q1. Starting twice doubles every message.** Each `initDispatcher()` call adds a
  listener, so a second call makes every command handled twice (two reloads per `refresh`, two
  error dialogs, and so on). `main.tsx` calls it once, so this only matters for tests or a future
  second caller. Should a repeated call be a no-op?
- **dispatcher Q2. Command names inherited from `Object.prototype`.** The route lookup is not
  limited to the routes themselves. Observed: `{ command: "toString" }` and
  `{ command: "constructor" }` do nothing and warn nothing; `{ command: "hasOwnProperty" }` and
  `{ command: "valueOf" }` throw `TypeError: Cannot convert undefined or null to object` out of
  the listener; `{ command: "__proto__" }` throws `TypeError` because the lookup finds a
  non-function. Should such names be treated like any other unknown command (a warning, no
  exception)? (`rpc-handler.ts` already limits its notification lookup to its own names.)
- **dispatcher Q3. The warning for unknown commands.** It goes to the developer console in
  production and needs a lint exception. Keep it, drop it, or report differently? Nothing depends
  on it.

---

## 2. `src/webview/lib/stores.ts`

The page's shared state as `@preact/signals` signals: which repository and branch are shown, the
loaded branch list and graph rows, the open details panel, the one context menu and the one
dialog, the per-repository records the extension keeps, the view mode, and a few values derived
from these. Components read the signals while rendering and re-render when they change; library
modules read and write them directly.

### 2.1 Interface

Module path `src/webview/lib/stores.ts`, imported as `@/webview/lib/stores` everywhere except
`src/webview/main.tsx` (`./lib/stores`). No default export, no exported types.

**Writable stores.** Each is a `Signal<T>` created with `signal()` from `@preact/signals`. Other
modules and the tests assign `.value`, read `.value` and `.peek()`, so every one must be a real
writable signal.

| Export                 | Type                                                                            | Initial value | Meaning                                                                                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `selectedRepo`         | `Signal<string \| undefined>`                                                   | `undefined`   | Path of the repository the graph shows; `undefined` when none.                                                                                                                                                           |
| `branchList`           | `Signal<Array<string> \| undefined>`                                            | `undefined`   | Branch names from the latest accepted `loadBranches` answer for the selected repository (checked-out branch first, then local branches, then `remotes/<remote>/<branch>`); `undefined` until one arrives after a switch. |
| `headBranch`           | `Signal<string \| null>`                                                        | `null`        | Name of the checked-out branch from the same answer; `null` when HEAD is detached, the repository has no commit yet, or no answer has arrived.                                                                           |
| `commitList`           | `Signal<Array<GitCommitNode> \| undefined>`                                     | `undefined`   | Graph rows of the displayed branch from the latest accepted `loadCommits` answer; `undefined` while none is loaded.                                                                                                      |
| `commitHead`           | `Signal<string \| null>`                                                        | `null`        | The `head` field of the latest accepted `loadCommits` answer: the full ID of HEAD's commit, `null` for a repository without commits; `null` before any answer.                                                           |
| `moreCommitsAvailable` | `Signal<boolean>`                                                               | `false`       | Whether a larger page would show more rows.                                                                                                                                                                              |
| `graphErrors`          | `Signal<Partial<Record<"loadBranches" \| "loadCommits", string \| undefined>>>` | `{}`          | The Git error text of the latest failed branch-list or row request; a key that is absent or `undefined` means no error.                                                                                                  |
| `uncommittedChanges`   | `Signal<number>`                                                                | `0`           | Number of working-tree entries from the latest accepted `loadCommits` answer; above zero exactly when the rows start with the uncommitted-changes row (hash `"*"`).                                                      |
| `expandedCommit`       | `Signal<string \| null>`                                                        | `null`        | The expanded row, by hash (`"*"` for the uncommitted-changes row), or `null` when no row is expanded.                                                                                                                    |
| `commitDetails`        | `Signal<GitCommitDetails \| null>`                                              | `null`        | The accepted `commitDetails` answer for the expanded row; `null` until it arrives and whenever no row is expanded.                                                                                                       |
| `contextMenu`          | `Signal<ContextMenuState \| null>`                                              | `null`        | The menu being shown, or `null`; opening a menu replaces any other.                                                                                                                                                      |
| `dialog`               | `Signal<DialogState \| null>`                                                   | `null`        | The dialog being shown, or `null`; opening a dialog replaces any other.                                                                                                                                                  |
| `repoStates`           | `Signal<GitRepoSet>`                                                            | `{}`          | `GitRepoState` records (column widths, hidden remotes, view preferences) keyed by repository path, as last received from or saved to the extension.                                                                      |
| `selectedBranch`       | `Signal<CommitBranchType \| undefined>`                                         | `undefined`   | The selection (see Terms).                                                                                                                                                                                               |
| `branchDisplay`        | `Signal<BranchDisplay>`                                                         | `"filter"`    | The view mode.                                                                                                                                                                                                           |
| `focusPaused`          | `Signal<boolean>`                                                               | `false`       | Whether the emphasis of a focus mode is paused (the target is kept).                                                                                                                                                     |
| `focusDimming`         | `Signal<FocusDimming>`                                                          | `"subtle"`    | How strongly a focus mode dims the rest of the graph.                                                                                                                                                                    |
| `showRemoteBranch`     | `Signal<boolean>`                                                               | `true`        | The global "Show Remote Branches" switch.                                                                                                                                                                                |
| `maxCommits`           | `Signal<number>`                                                                | `0`           | How many rows the next `loadCommits` request asks for.                                                                                                                                                                   |

**Derived stores.** Each is a `ReadonlySignal<T>` created with `computed()` from
`@preact/signals`; they are only read.

| Export              | Type                                         | Value                                                                                                                                                                                                                                                                                                                                                            |
| ------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activeSource`      | `ReadonlySignal<string \| null>`             | Which element the open context menu or form dialog belongs to (`RefLabel`, `CommitRow` and `RefsPane` compare it with their own menu key to draw themselves as active): when a context menu is open, its `source` (even `""`); otherwise, when the open dialog is a form dialog (`kind: "form"`), that dialog's `source` (a string or `null`); otherwise `null`. |
| `columnWidths`      | `ReadonlySignal<Array<number> \| null>`      | The stored column widths of the selected repository when they are usable: with a repository selected whose record's `columnWidths` passes `isColumnWidths` from `@/webview/utils/columns` (an array of exactly four finite numbers above zero, with no holes), that very array; otherwise `null`.                                                                |
| `branchFocusTarget` | `ReadonlySignal<(string & {}) \| undefined>` | The branch a focus mode emphasises: the selection when the view mode is not `"filter"` and the selection is not `"*"` (it may still be `undefined`); otherwise `undefined`. `focusPaused` plays no part in it.                                                                                                                                                   |
| `hiddenRemotes`     | `ReadonlySignal<Array<string>>`              | The selected repository's hidden remotes: the `hiddenRemotes` array of its record in `repoStates`, as stored (same array, neither sorted nor de-duplicated here); `[]` when no repository is selected, it has no record, or the record has no such field.                                                                                                        |

**Functions.**

| Export                | Signature                                                         | Meaning                                                                                                                                                                                                                                                                                                                                              |
| --------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `displayedBranch`     | `displayedBranch(branch?: CommitBranchType \| undefined): string` | The branch whose history the rows belong to, for the given selection (default: the current `selectedBranch`): in view mode `"filter"`, the branch itself, or `""` when it is `"*"` or `undefined`; in the focus modes always `""` (all branches). Because the parameter defaults, passing `undefined` explicitly also means "the current selection". |
| `remoteVisibilityKey` | `remoteVisibilityKey(): string`                                   | A text that changes whenever the remote choice that shapes the lists changes: the JSON text of a two-element array, the value of `showRemoteBranch` followed by a sorted copy of `hiddenRemotes` (default JavaScript sort, i.e. by UTF-16 code units; repeats are kept). The stored array is not reordered.                                          |
| `initializeStores`    | `initializeStores(initialLoadCommits: number): void`              | Sets `maxCommits` to `initialLoadCommits`. `main.tsx` calls it once with the configuration's `initialLoadCommits`, right after `initializeWebviewConfig`. Calling it again simply sets the value again.                                                                                                                                              |

**Types used in the signatures** (defined elsewhere, unchanged):

- From `@/backend/types`: `GitCommitNode` (`hash`, `parentHashes`, `author`, `email`, `date`,
  `message`, `refs`) and `GitCommitDetails` (`hash`, `parents`, `author`, `email`, `date`,
  `committer`, `body`, `fileChanges`).
- From `@/types`: `GitRepoSet = { [repo: string]: GitRepoState }`, with
  `GitRepoState = { columnWidths: number[] | null; hiddenRemotes?: string[]; graphPreferences?: GraphPreferences }`.
- From `@/webview/types`: `CommitBranchType = "*" | (string & {})`;
  `BranchDisplay = "filter" | "focus" | "ancestors"`; `FocusDimming = "subtle" | "strong"`;
  `ContextMenuState = { x: number; y: number; entries: Array<ContextMenuEntry>; source: string }`;
  `DialogState`, a `DialogBody` (`kind` `"content"`, `"form"` — which has
  `source: string | null` —, `"running"` or `"error"`) plus `token: number`.

The type of `branchFocusTarget` is the one TypeScript infers once `"*"` has been ruled out of
`CommitBranchType`; keep it (callers pass it where a branch name is expected).

**Who uses what.**

| Export                 | Source users                                                                                                                                                                                                                                                                                                                                         | Tests (under `tests/webview/`)                                                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `selectedRepo`         | `main.tsx`, `actions.ts`, `graph-requests.ts`, `navigation.ts`, `repository-actions.tsx`, `remote-actions.tsx`, `use-repository-query.ts`, `rpc/rpc-handler.ts`, `handler/load-branches.ts`, `handler/load-commits.ts`, `layout/GraphView.tsx`, `layout/MainHeader.tsx`, the history and repository panes, `useColumnResize.ts`, `useGraphScroll.ts` | almost every file in `lib/` and `components/`                                                                                                                         |
| `branchList`           | `actions.ts`, `handler/load-branches.ts`, `MainHeader.tsx`                                                                                                                                                                                                                                                                                           | `actions`, `branch-focus`, `graph-requests`, `remote-visibility`, `uncorrelated-replies`                                                                              |
| `headBranch`           | `actions.ts`, `handler/load-branches.ts`, `GraphView.tsx`, `RebaseEditor.tsx`                                                                                                                                                                                                                                                                        | the same five plus `menu-actions`                                                                                                                                     |
| `commitList`           | `actions.ts`, `handler/load-commits.ts`, `GraphView.tsx`                                                                                                                                                                                                                                                                                             | `actions`, `branch-focus`, `graph-requests`, `remote-visibility`, `repo-selection`, `GraphErrors`, `utils/date`                                                       |
| `commitHead`           | `actions.ts`, `handler/load-commits.ts`, `GraphView.tsx`, `RefsPane.tsx`, `RebaseEditor.tsx`                                                                                                                                                                                                                                                         | `actions`, `graph-requests`, `menu-actions`, `remote-visibility`, `GraphErrors`, `RefsPane`                                                                           |
| `moreCommitsAvailable` | `actions.ts`, `handler/load-commits.ts`, `GraphView.tsx`                                                                                                                                                                                                                                                                                             | `actions`, `graph-requests`                                                                                                                                           |
| `graphErrors`          | `actions.ts`, `handler/graph-query-error.ts`, `GraphView.tsx`                                                                                                                                                                                                                                                                                        | `actions`, `GraphErrors`                                                                                                                                              |
| `uncommittedChanges`   | `actions.ts`, `handler/load-commits.ts`, `CommitRow.tsx`                                                                                                                                                                                                                                                                                             | `actions`, `WorkingTreeDetails`, `WorkingTreeTiming`                                                                                                                  |
| `expandedCommit`       | `actions.ts`, `handler/load-commits.ts`, `handler/commit-details.ts`, `CommitTable.tsx`                                                                                                                                                                                                                                                              | `actions`, `branch-focus`, `graph-requests`, `FileTreeView`, `GraphErrors`, `GraphScroll`, `WorkingTreeDetails`, `WorkingTreeTiming`, `utils/date`                    |
| `commitDetails`        | `actions.ts`, `handler/commit-details.ts`, `CommitTable.tsx`                                                                                                                                                                                                                                                                                         | `actions`, `graph-requests`                                                                                                                                           |
| `contextMenu`          | `actions.ts`, `focus.ts`, `hints.ts`, `ContextMenu.tsx`, `NavigationEffects.tsx`                                                                                                                                                                                                                                                                     | `actions`, `hints`, `history-tools`, `menu-anchor`, `menus`, `workflows`, `CommitRow`, `ContextMenu`, `Dialog`, `FileTreeView`, `RefsPane`, `RefsScale`, `RefsTiming` |
| `dialog`               | `actions.ts`, `focus.ts`, `repository-actions.tsx`, `remote-actions.tsx`, `Dialog.tsx`, `HistoryTools.tsx`, `NavigationEffects.tsx`                                                                                                                                                                                                                  | twenty files, including `clipboard`, `uncorrelated-replies`, `unseen-failures`, `graph-requests`, `Dialog.behaviour`                                                  |
| `activeSource`         | `RefLabel.tsx`, `CommitRow.tsx`, `RefsPane.tsx`                                                                                                                                                                                                                                                                                                      | none directly (`RefsScale` reaches it through the Branches pane)                                                                                                      |
| `repoStates`           | `actions.ts`, `navigation.ts`, `useColumnResize.ts`                                                                                                                                                                                                                                                                                                  | `actions`, `branch-focus`, `graph-requests`, `preference-lifetime`, `remote-visibility`, `uncorrelated-replies`, `ColumnResize`, `GraphErrors`, `GraphScroll`         |
| `columnWidths`         | `useColumnResize.ts`, `CommitTable.tsx`                                                                                                                                                                                                                                                                                                              | `actions`, `preference-lifetime`, `remote-visibility`, `ColumnResize`                                                                                                 |
| `selectedBranch`       | `actions.ts`, `navigation.ts`, `handler/load-branches.ts`, `MainHeader.tsx`, `RefsPane.tsx`                                                                                                                                                                                                                                                          | fourteen files                                                                                                                                                        |
| `branchDisplay`        | `actions.ts`, `navigation.ts`, `handler/load-branches.ts`, `GraphView.tsx`, `MainHeader.tsx`                                                                                                                                                                                                                                                         | `actions`, `branch-focus`, `graph-requests`, `preference-lifetime`, `remote-visibility`, `uncorrelated-replies`, `GraphErrors`                                        |
| `focusPaused`          | `actions.ts`, `navigation.ts`, `GraphView.tsx`, `BranchFocusBadge.tsx`                                                                                                                                                                                                                                                                               | `actions`, `branch-focus`, `preference-lifetime`                                                                                                                      |
| `focusDimming`         | `actions.ts`, `navigation.ts`, `GraphView.tsx`                                                                                                                                                                                                                                                                                                       | `actions`, `branch-focus`, `preference-lifetime`                                                                                                                      |
| `branchFocusTarget`    | `actions.ts`, `GraphView.tsx`, `BranchFocusBadge.tsx`                                                                                                                                                                                                                                                                                                | `actions`, `branch-focus`, `menu-actions`, `preference-lifetime`, `remote-visibility`                                                                                 |
| `displayedBranch`      | `actions.ts`, `handler/load-commits.ts`, `GraphView.tsx` (all without an argument)                                                                                                                                                                                                                                                                   | none directly                                                                                                                                                         |
| `showRemoteBranch`     | `actions.ts`, `navigation.ts`, `GraphView.tsx`, `MainHeader.tsx`, `RefsPane.tsx`                                                                                                                                                                                                                                                                     | nine files                                                                                                                                                            |
| `hiddenRemotes`        | `actions.ts`, `GraphView.tsx`, `RefsPane.tsx`                                                                                                                                                                                                                                                                                                        | `actions`, `preference-lifetime`, `remote-visibility`                                                                                                                 |
| `remoteVisibilityKey`  | `actions.ts`, `handler/load-branches.ts`, `handler/load-commits.ts`                                                                                                                                                                                                                                                                                  | `remote-visibility`                                                                                                                                                   |
| `maxCommits`           | `actions.ts`, `GraphView.tsx`                                                                                                                                                                                                                                                                                                                        | `actions`, `branch-focus`, `config-changed`, `graph-requests`, `remote-visibility`, `rpc-handler`, `webview-config`                                                   |
| `initializeStores`     | `main.tsx`                                                                                                                                                                                                                                                                                                                                           | none                                                                                                                                                                  |

Several tests import the whole module as a namespace (`import * as stores`) or with
`await import(...)` after `vi.resetModules()`, and write stores directly in `beforeEach`.

### 2.2 Dependencies the implementation must use

| Import path               | Names                                                                                          | For                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `@preact/signals`         | `signal`, `computed`                                                                           | Every store; notifications to components and effects.                             |
| `@/webview/utils/columns` | `isColumnWidths`                                                                               | The one definition of usable stored widths, shared with the column resizing code. |
| `@/backend/types`         | `GitCommitDetails`, `GitCommitNode` (types)                                                    | Store types.                                                                      |
| `@/types`                 | `GitRepoSet` (type)                                                                            | `repoStates`.                                                                     |
| `@/webview/types`         | `BranchDisplay`, `CommitBranchType`, `ContextMenuState`, `DialogState`, `FocusDimming` (types) | Store types.                                                                      |

It must not import anything that reaches the VS Code API, the configuration, `window.l10n` or any
other webview module with side effects.

### 2.3 Behaviour

The module holds values; it has no behaviour beyond what the tables in §2.1 say. The points below
make the derived values exact.

- **Derived values are always current.** Reading a derived store gives the value for the current
  contents of the stores it depends on, even in the middle of a `batch`; it notifies its
  subscribers only when its value actually changes. For example, opening an error dialog while no
  menu is open leaves `activeSource` at `null` and does not notify its subscribers.
- **`activeSource`.** An open menu wins over an open form dialog. A form dialog with
  `source: null`, and every dialog that is not a form, give `null`.
- **`columnWidths`** returns the stored array object itself (not a copy) when it is usable, so
  consumers can compare by identity: `actions.test.ts` and `remote-visibility.test.ts` check
  `columnWidths.value` with `toBe` against the array they stored. Values below the table's minimum widths, and fractions, are usable; zero, negative
  numbers, `NaN`, infinities, non-numbers, a wrong length, holes and non-arrays are not.
- **`branchFocusTarget`** can be `""` if the selection is the empty string in a focus mode (no
  branch has that name; only direct writes produce it).
- **`hiddenRemotes`** returns the stored array itself when there is one. With no repository, no
  record, or no field, it gives an empty array.
- **`displayedBranch()`** reads `branchDisplay` and, without an argument, `selectedBranch`; called
  inside a render or effect it subscribes to them like any signal read.
- **`remoteVisibilityKey()`** reads `showRemoteBranch` and `hiddenRemotes` (and so subscribes to
  them when called inside a render or effect). The text is exactly what `JSON.stringify` produces
  for the array, with no spaces: `[true,[]]`, `[false,["origin"]]`. The page sends it in
  `loadBranches` and `loadCommits` requests (`visibilityKey`) and compares it with the key an answer
  echoes (§8, §9); the extension treats it as opaque. `repo-selection.test.ts` checks the request
  field is `JSON.stringify([true, []])`; `actions.test.ts` checks `"[false,[]]"`.
- **`initializeStores(n)`** changes only `maxCommits`.

### 2.4 Concrete examples

Fresh module, nothing written yet: every store has the initial value in §2.1; `activeSource` is
`null`, `columnWidths` `null`, `branchFocusTarget` `undefined`, `hiddenRemotes` `[]`,
`displayedBranch()` `""`, `remoteVisibilityKey()` `"[true,[]]"`.

`displayedBranch` and `branchFocusTarget` (observed):

| `branchDisplay` | `selectedBranch` | `displayedBranch()` | `displayedBranch("topic")` | `displayedBranch("*")` | `branchFocusTarget` |
| --------------- | ---------------- | ------------------- | -------------------------- | ---------------------- | ------------------- |
| `"filter"`      | `undefined`      | `""`                | `"topic"`                  | `""`                   | `undefined`         |
| `"filter"`      | `"*"`            | `""`                | `"topic"`                  | `""`                   | `undefined`         |
| `"filter"`      | `"main"`         | `"main"`            | `"topic"`                  | `""`                   | `undefined`         |
| `"focus"`       | `undefined`      | `""`                | `""`                       | `""`                   | `undefined`         |
| `"focus"`       | `"*"`            | `""`                | `""`                       | `""`                   | `undefined`         |
| `"focus"`       | `"main"`         | `""`                | `""`                       | `""`                   | `"main"`            |
| `"ancestors"`   | `"main"`         | `""`                | `""`                       | `""`                   | `"main"`            |
| `"focus"`       | `""`             | `""`                | `""`                       | `""`                   | `""`                |

`activeSource` (observed, in this order):

| `contextMenu`           | `dialog`                     | `activeSource` |
| ----------------------- | ---------------------------- | -------------- |
| `null`                  | `null`                       | `null`         |
| `null`                  | form, `source: "ref:head:x"` | `"ref:head:x"` |
| `null`                  | form, `source: null`         | `null`         |
| `null`                  | error dialog                 | `null`         |
| `{ …, source: "menu" }` | form, `source: "d"`          | `"menu"`       |
| `{ …, source: "" }`     | form, `source: "d"`          | `""`           |

`columnWidths` with `selectedRepo` `/r` and `repoStates` `{ "/r": { columnWidths: w } }`:

| `w`                                                                                         | `columnWidths.value` |
| ------------------------------------------------------------------------------------------- | -------------------- |
| `[1, 2, 3, 4]`                                                                              | that same array      |
| `[0.5, 1, 1, 1]`                                                                            | that same array      |
| `[1, 2, 3]`, `[1, 2, 3, 4, 5]`                                                              | `null`               |
| `[0, 1, 1, 1]`, `[-1, 1, 1, 1]`                                                             | `null`               |
| `[NaN, 1, 1, 1]`, `[Infinity, 1, 1, 1]`                                                     | `null`               |
| `["1", 1, 1, 1]`, `null`, `"x"`, an array-like object `{0: 1, 1: 2, 2: 3, 3: 4, length: 4}` | `null`               |
| `[1, 2, 3, <hole>]` (length 4)                                                              | `null`               |
| any, but `selectedRepo` `undefined` or no record for `/r`                                   | `null`               |

`hiddenRemotes` and `remoteVisibilityKey`:

| `showRemoteBranch` | stored `hiddenRemotes` of the selected repository | `hiddenRemotes.value`     | `remoteVisibilityKey()`                |
| ------------------ | ------------------------------------------------- | ------------------------- | -------------------------------------- |
| `true`             | (no repository selected)                          | `[]`                      | `[true,[]]`                            |
| `true`             | (record without the field)                        | `[]`                      | `[true,[]]`                            |
| `true`             | `["b", "B", "a", "a"]`                            | the same array, unchanged | `[true,["B","a","a","b"]]`             |
| `false`            | `["b", "B", "a", "a"]`                            | the same array            | `[false,["B","a","a","b"]]`            |
| `false`            | `["ä", "z", "a/b", "a", "10", "9"]`               | the same array            | `[false,["10","9","a","a/b","z","ä"]]` |

`initializeStores(123)` then `initializeStores(5)`: `maxCommits.value` is `5`.

### 2.5 Non-functional requirements

- **Import-time behaviour.** Loading the module creates the signals and nothing else: no DOM or
  `window` access, no configuration, no `window.l10n`, no VS Code API. Many tests import it before
  any of those exist. It is not part of any import cycle.
- **One instance per module load.** Each export is one long-lived signal object for the life of
  the module instance; nothing may replace them (other modules hold references to them). Tests
  re-import with `vi.resetModules()` to get fresh stores; no state may live outside the module
  instance (not on `window`, `globalThis` or the webview state).
- **Writers.** The module writes no store itself except `maxCommits` in `initializeStores`. The
  writers are `actions.ts` (most stores), `navigation.ts` (view preferences, `repoStates`), the
  response handlers (§7–§10), `handler/graph-query-error.ts`, `main.tsx` (clears `selectedRepo`
  when no repository remains) and the tests.
- **Derived stores cannot be written.** Keep them as `computed` values: the tests only read them,
  but consumers rely on their being consistent with their inputs at every read.
- **Cost.** Every derived value is computed in constant time apart from copying and sorting the
  (short) hidden-remote list for the key. Nothing here may scan the rows or the branch list: the
  graph can hold tens of thousands of rows and the Branches pane thousands of refs.
  `RefsScale.test.ts` checks that opening and closing a menu in a pane of 3 000 refs re-renders
  exactly the rows whose highlight changes, which needs `activeSource` to follow the menu at once.

### 2.6 Test coverage

What the existing tests check (by alteration):

- `displayedBranch` depends on the view mode: returning the selection in every mode is caught by
  eleven tests in `actions.test.ts` and `branch-focus.test.ts`.
- `branchFocusTarget` excludes `"*"`: caught by `branch-focus.test.ts`,
  `preference-lifetime.test.ts` and `remote-visibility.test.ts`.
- `hiddenRemotes` reads the selected repository's record (an always-empty list is caught by 18
  tests) and returns the stored array itself (a sorted copy is caught by `actions.test.ts`, "remote
  visibility writes the list, the switch and the selection in one notification").
- `remoteVisibilityKey` includes the remotes switch (caught by `actions.test.ts` and
  `uncorrelated-replies.test.ts`); its exact text is checked as `[true,[]]`
  (`repo-selection.test.ts`) and `[false,[]]` (`actions.test.ts`).
- `columnWidths` refuses malformed widths (`ColumnResize.test.ts`, "treats malformed widths as
  none …") and returns the stored array itself (a copy is caught by `actions.test.ts` and
  `remote-visibility.test.ts`).
- `activeSource` follows the open menu (`RefsScale.test.ts`, "re-renders only the rows whose menu
  opens or closes").
- The initial view mode `"filter"`: starting in `"focus"` is caught by `RefsPane.test.ts`.

Caught by no test:

- `activeSource` for form dialogs (ignoring the dialog's `source`).
- `branchFocusTarget` being `undefined` in `"filter"` mode.
- The sorting inside `remoteVisibilityKey`.
- `initializeStores` (doing nothing).
- The initial values of `showRemoteBranch`, `focusDimming`, `maxCommits` and `selectedBranch`
  (every test sets them in `beforeEach`).

Gaps, with the test to add (plain Vitest; jsdom only where a test needs it; fresh modules with
`vi.resetModules()` and `await import("@/webview/lib/stores")`):

1. **Initial values.** Call: import. Expected: every writable store has the initial value in §2.1;
   `activeSource.value` `null`, `columnWidths.value` `null`, `branchFocusTarget.value` `undefined`,
   `hiddenRemotes.value` `[]`, `displayedBranch()` `""`, `remoteVisibilityKey()` `"[true,[]]"`.
2. **`activeSource`.** Setup/call: the six rows of the `activeSource` table in §2.4, in order.
   Expected: the values in the table.
3. **`branchFocusTarget` by mode.** Setup: `selectedBranch` `"main"`. Expected: `undefined` with
   `branchDisplay` `"filter"`, `"main"` with `"focus"` and `"ancestors"`, still `"main"` after
   `focusPaused.value = true`; `undefined` for `"*"` in `"focus"`.
4. **Key sorting.** Setup: `selectedRepo` `/r`, `repoStates` `{ "/r": { columnWidths: null, hiddenRemotes: ["origin", "b"] } }`.
   Call: `remoteVisibilityKey()`. Expected: `'[true,["b","origin"]]'`, and the stored array still
   reads `["origin", "b"]`.
5. **`initializeStores`.** Call: `initializeStores(500)`. Expected: `maxCommits.value` is `500`.
6. **`displayedBranch` with an argument.** Expected: `displayedBranch("topic")` is `"topic"` in
   `"filter"` mode and `""` in `"focus"` mode; `displayedBranch("*")` is `""`.
7. **`hiddenRemotes` without a repository.** Setup: `selectedRepo` `undefined`, a record for `/r`
   with hidden remotes. Expected: `[]`.

### 2.7 Questions

- **stores Q1. `maxCommits` before `initializeStores`.** It starts at `0`, so a row request made
  before the page calls `initializeStores` would ask for zero rows. In practice every repository
  switch sets it from the configuration's `initialLoadCommits` (through `actions.ts`), and
  `main.tsx` initialises before any switch, so `initializeStores` only covers the time before the
  first switch. Is the separate initialisation wanted, or should the value come from the
  configuration when first needed?
- **stores Q2. The visibility key sorts but does not de-duplicate.** `hiddenRemotes` exposes the
  stored list as it is, and `remoteVisibilityKey()` sorts a copy but keeps repeats, so the stored
  lists `["a", "a"]` and `["a"]` give different keys for the same set of hidden remotes. Since the
  `actions.ts` decisions make every stored list a sorted set, the difference only shows when
  `repoStates` is written directly (as tests do). Should the key normalise to a set as well, or
  may it rely on the writers?
- **stores Q3. `displayedBranch`'s parameter.** No caller passes an argument, and because the
  parameter defaults, an explicit `undefined` cannot mean "no selection". Keep the parameter (it
  is part of the exported signature), or drop it?

---

## 3. `src/webview/lib/stores/repo-list.store.ts`

The list of repositories the page offers in its repository picker and uses to decide what to
show: a loading page before the first scan answer, "no repository" for an empty list, the graph
otherwise.

### 3.1 Interface

Module path `src/webview/lib/stores/repo-list.store.ts`, imported as
`@/webview/lib/stores/repo-list.store` (and `./lib/stores/repo-list.store` from `main.tsx`). One
export, no default export:

```ts
export const repoListStore: {
  get: () => Array<GitRepo> | undefined;
  load: () => Promise<Array<GitRepo>>;
  add: (repo: GitRepo) => void;
};
```

`GitRepo` comes from `@/types`: `{ name: string; path: string }` — the folder name shown in the
picker and the repository's path, which identifies it everywhere else.

| Member      | Parameters                                                                                                                                                   | Returns                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `get()`     | none                                                                                                                                                         | The current list, or `undefined` before the first successful scan (and before any `add`). |
| `load()`    | none                                                                                                                                                         | A promise for the list the scan returned; rejects when the scan fails.                    |
| `add(repo)` | `repo`: the repository named by a `repo.select` notification; it need not be in the scanned list (`repo-selection.test.ts` adds one the scan did not return) | nothing                                                                                   |

Who uses what:

| User                                           | Uses                                                                                                                                                                   |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/webview/main.tsx`                         | `get()` while rendering the root and inside its effect (to select the first repository when the selected one is not listed, or clear the selection for an empty list). |
| `src/webview/lib/load-repos.ts`                | `load()`.                                                                                                                                                              |
| `src/webview/lib/rpc/rpc-handler.ts`           | `add(repo)` for the `repo.select` notification, before calling `selectRepo`.                                                                                           |
| `tests/webview/lib/rpc-handler.test.ts`        | `add`, `get`, and `vi.spyOn(repoListStore, "add")`.                                                                                                                    |
| `tests/webview/lib/rpc-handler-client.test.ts` | `get`.                                                                                                                                                                 |
| `tests/webview/lib/repo-selection.test.ts`     | `get`.                                                                                                                                                                 |

### 3.2 Dependencies the implementation must use

| Import path                    | Names            | For                                                                      |
| ------------------------------ | ---------------- | ------------------------------------------------------------------------ |
| `@preact/signals`              | `signal`         | Holding the list so that readers re-render when it changes.              |
| `@/webview/lib/rpc/rpc-client` | `rpcClient`      | The `repo.scan` request, made as `rpcClient.request("repo.scan", null)`. |
| `@/types`                      | `GitRepo` (type) | Entry type.                                                              |

### 3.3 Behaviour

- **State.** One list, initially absent (`undefined`).
- **`get()`** returns the current list object. Reading it inside a component render or an effect
  subscribes that reader, so the page re-renders when `load` or `add` replaces the list.
- **`load()`** sends one RPC request, method `repo.scan`, params `null` (posted synchronously,
  before `load` returns its promise). Starting a scan neither clears nor changes the list; only a
  successful answer replaces it.
  - On success the list becomes the answer's `repos` array, the same array object and in the
    order the extension sent it (the extension sorts it by path with `localeCompare` in the
    extension host), and the promise resolves with that array.
  - On failure the promise rejects with the `Error` from `rpcClient` (the extension's error text,
    `Malformed response to an RPC request`, the timeout message after 30 000 ms, or a posting
    error) and the list is left unchanged.
  - Every call sends its own request. Answers are applied in the order they arrive, whichever
    request they answer (repo-list Q1).
  - An answer whose result lacks `repos` stores `undefined` (the page goes back to its loading
    view) and resolves with `undefined`; a `null` result rejects with a `TypeError`. The extension
    never sends either (repo-list Q2).
- **`add(repo)`** replaces the list with a new array: the previous entries except any whose `path`
  equals `repo.path`, plus `repo`, sorted by `path` with `String.prototype.localeCompare` (the
  page's default locale). When the list was absent the result is `[repo]`. The previous array is
  not modified, entry objects are kept as they are, a new array is stored even when nothing
  changed, and nothing is posted. A second `add` for the same path therefore replaces the entry
  (renaming it) instead of adding a duplicate.

### 3.4 Concrete examples

- `get()` on a fresh module: `undefined`.
- `load()`: posts `{ kind: "rpc.request", id: "<uuid>", method: "repo.scan", params: null }`. Answer
  `{ success: true, result: { repos: R } }` with `R = [{ name: "b", path: "/b" }, { name: "A", path: "/A" }, { name: "a", path: "/a" }]`:
  the promise resolves with `R` itself and `get()` returns `R` itself, still in the order `/b`,
  `/A`, `/a`.
- Then `add({ name: "c", path: "/c" })`: `get()` is a new array
  `[/a, /A, /b, /c]` (by path); `R` is unchanged.
- Then `add({ name: "c2", path: "/c" })`: `[/a, /A, /b, {name: "c2", path: "/c"}]`, a new array.
- After adding `/B`, `/ä`, `/Z`, `/10` and `/9` as well, the paths read (Node 22, English ICU
  collation): `/10`, `/9`, `/a`, `/A`, `/ä`, `/b`, `/B`, `/c`, `/Z`.
- `load()` answered with `{ success: false, error: "scan failed" }`: rejects with
  `Error("scan failed")`; `get()` still returns the nine entries.
- Two `load()` calls, the second answered first with `[/second]`, then the first with `[/first]`:
  `get()` ends as `[{ name: "first", path: "/first" }]`.
- `add({ name: "q", path: "/q" })` on a fresh module: `[{ name: "q", path: "/q" }]`.

### 3.5 Non-functional requirements

- **Import cycle.** The module is part of a cycle (`rpc-client.ts` → `rpc-handler.ts` →
  `actions.ts` / `load-repos.ts` → … → this module). Its top level may create the signal and the
  object, but must not call or read anything imported from the cycle; `rpcClient` may only be used
  inside `load`.
- **A plain, mutable object.** `repoListStore` must be an ordinary object whose three members are
  own, writable, configurable function properties, and the other modules call them as
  `repoListStore.add(...)` at the time of use: `rpc-handler.test.ts` replaces `add` with
  `vi.spyOn` and expects the notification handler's call to reach the spy. Do not freeze it, and
  do not make the members getters or class methods on a prototype.
- **No in-place mutation** of a list that has been handed out.
- **No state outside the module instance** (tests re-import with `vi.resetModules()`).
- **Cost.** `add` sorts the whole list each time; lists are short (repositories in the workspace).

### 3.6 Test coverage

What the existing tests check:

- `rpc-handler-client.test.ts`: a `repo.rescan` scan fills the list with the answer; a failed scan
  keeps the list (an alteration that never stores the scan is caught by both tests).
- `rpc-handler.test.ts`: `repo.select` adds a new entry before the switch is posted, renames the
  entry of the repository already selected (one entry per path), and an invalid payload leaves the
  list the same object; `repo-selection.test.ts`: two identical selections leave one entry. (Adding
  without removing the entry with the same path is caught by both files.)

Caught by no test: the sorting in `add`; the reactivity of `get()` (an alteration that reads the
list without subscribing passes, because every test reads it directly); storing the scan's array
itself rather than a copy.

Gaps, with the test to add (jsdom; `setupWebviewTest()`; `rpcClient.init()`; answer requests by
dispatching `rpc.response` messages):

1. **`add` sorts by path.** Setup: `load()` answered with `[{ name: "c", path: "/c" }, { name: "a", path: "/a" }]`.
   Call: `add({ name: "b", path: "/b" })`. Expected: paths `/a`, `/b`, `/c`; the scan's array
   still reads `/c`, `/a`.
2. **Reactive `get`.** Setup: an `effect` that calls `repoListStore.get()` and counts runs. Call:
   `load()` answered successfully, then `add(...)`. Expected: the effect ran once after each.
3. **`load` returns and stores the answer's array.** Expected: `await load()` is the answer's
   `repos` array itself, and `get()` returns that same array.
4. **`load` failure.** Setup: a list already loaded. Call: `load()` answered
   `{ success: false, error: "scan failed" }`. Expected: rejects with an `Error` whose message is
   `scan failed`; `get()` returns the earlier list object.
5. **`add` on an empty store.** Setup: fresh modules. Call: `add({ name: "q", path: "/q" })`.
   Expected: `get()` is `[{ name: "q", path: "/q" }]`.
6. Depending on repo-list Q1: two overlapping `load()` calls answered newest first leave the
   newest list (if decided) or the last-arriving one (current).

### 3.7 Questions

- **repo-list Q1. Overlapping scans.** Answers are applied in arrival order, so when two scans
  overlap (the initial load, a Retry, and `repo.rescan` notifications can overlap) an older scan
  that answers last overwrites a newer one. Should the newest scan's answer win?
- **repo-list Q2. Unchecked answers.** A successful answer without `repos` empties the page back to
  the loading view, and a `null` result rejects with a `TypeError` whose message then shows as the
  scan error. The extension always answers `{ repos: [...] }`. Should `load` validate the answer?
- **repo-list Q3. Two orders.** The scan's list keeps the extension's order (sorted by path in the
  extension host's locale), while `add` re-sorts the whole list in the page's locale. The two
  locales can differ (the webview follows VS Code's display language, the host process may not),
  so an SCM selection can reorder the picker. Should the page keep one rule for both (for example
  insert without re-sorting, or sort both the same way)?

---

## 4. `src/webview/lib/load-repos.ts`

Runs a repository scan through the repository-list store and keeps the reason the last scan
failed, so the page can show it with a Retry button.

### 4.1 Interface

Module path `src/webview/lib/load-repos.ts`, imported as `@/webview/lib/load-repos` (and
`./lib/load-repos` from `main.tsx`). No default export.

| Export          | Type / signature                                                              | Meaning                                                                                 |
| --------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `repoListError` | `Signal<string \| undefined>` (from `@preact/signals`), initially `undefined` | The message of the latest scan failure; `undefined` while no failure is being reported. |
| `loadRepoList`  | `loadRepoList(): Promise<void>`                                               | Start a scan and wait for it; never rejects.                                            |

Who uses what:

| User                                           | Uses                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/webview/main.tsx`                         | `await loadRepoList()` once after the first render (before posting `viewReady`); `void loadRepoList()` from the Retry button; reads `repoListError.value` while rendering, and shows `unableToLoadRepositories` ("Unable to load repositories: {0}") with the error in place of `{0}`, plus Retry, whenever it is set. |
| `src/webview/lib/rpc/rpc-handler.ts`           | `void loadRepoList()` for each `repo.rescan` notification.                                                                                                                                                                                                                                                             |
| `tests/webview/lib/rpc-handler-client.test.ts` | Writes and reads `repoListError`.                                                                                                                                                                                                                                                                                      |

### 4.2 Dependencies the implementation must use

| Import path                            | Names           | For                                   |
| -------------------------------------- | --------------- | ------------------------------------- |
| `@preact/signals`                      | `signal`        | `repoListError`.                      |
| `@/webview/lib/stores/repo-list.store` | `repoListStore` | `repoListStore.load()` does the scan. |

### 4.3 Behaviour

- `loadRepoList()` first sets `repoListError` to `undefined`, synchronously, before it returns its
  promise; the scan request is also posted before it returns (through `repoListStore.load()`).
- It then waits for the scan.
  - On success the list is already stored by `repoListStore.load()`; the error stays `undefined`
    (as cleared at the start, unless an overlapping call set it since).
  - On failure it sets `repoListError` to the failure's message: the `message` of an `Error`
    (which may be `""`), or `String(value)` for anything else thrown.
- The returned promise resolves with `undefined` in both cases, after the store or the error has
  been updated. It never rejects: `main.tsx` awaits it without a `catch` inside its start-up
  function (a rejection there would replace the page with the start-up failure text), and the
  other callers discard it.
- Calls are independent: each starts its own scan, clears the error at its start, and sets it on
  its own failure (load-repos Q1).
- No timeout of its own; a scan that gets no answer fails after `rpcClient`'s 30 000 ms deadline
  with the timeout message.

### 4.4 Concrete examples

- `repoListError` is `"old"`; `loadRepoList()` is called: immediately afterwards
  `repoListError.value` is `undefined` and one `repo.scan` request has been posted. Answer
  `{ success: true, result: { repos: [{ name: "z", path: "/z" }] } }`: the promise resolves with
  `undefined`, `repoListStore.get()` is `[{ name: "z", path: "/z" }]`, the error stays `undefined`.
- Answer `{ success: false, error: "boom" }`: resolves with `undefined`; `repoListError.value` is
  `"boom"`; the list is unchanged.
- The post itself throws `new Error("")`: resolves; `repoListError.value` is `""`.
- The post throws the string `"string thrown"`: `rpcClient` turns it into an `Error`, so
  `repoListError.value` is `"string thrown"`.
- Two calls overlap; the second's scan succeeds, then the first's fails with `"late failure"`:
  `repoListError.value` ends as `"late failure"` although the list was just refreshed.

### 4.5 Non-functional requirements

- **Import cycle.** Part of the same cycle as §3; the top level may only create the signal.
- **Import-time behaviour.** No request is made on import.
- **Never rejects**, as above.
- **No state outside the module instance.**

### 4.6 Test coverage

What the existing tests check (`rpc-handler-client.test.ts`, through `repo.rescan`):

- "scans again without waiting, and fills the picker with the answer": the error is cleared
  synchronously when the scan starts (an alteration that does not clear it, and one that clears it
  only after the scan, are both caught).
- "reports a failed scan and keeps the list shown": the failure's message becomes the error (not
  recording it is caught).
- Letting the promise reject is not asserted by any test, but it makes the Vitest run fail with an
  unhandled rejection (the failed-scan test starts the scan with `void`).

Gaps, with the test to add:

1. **Never rejects.** Setup: `vi.spyOn(repoListStore, "load").mockRejectedValue(new Error("x"))`.
   Call: `await loadRepoList()`. Expected: resolves with `undefined`; `repoListError.value` is `"x"`.
2. **A non-`Error` failure.** Setup: `load` rejects with the string `"text"`. Expected:
   `repoListError.value` is `"text"`.
3. **Success.** Setup: `repoListError.value = "old"`; `load` resolves. Call: `await loadRepoList()`.
   Expected: `undefined` result; `repoListError.value` `undefined`.
4. Depending on load-repos Q1: overlapping calls (older one fails after the newer one succeeds).

### 4.7 Questions

- **load-repos Q1. Overlapping scans and the error.** Each call clears the error when it starts and
  sets it when it fails, whatever other calls are doing. So an older scan that fails after a newer
  one succeeded leaves the error showing over a fresh list. Should the newest scan alone decide
  whether an error shows?
- **load-repos Q2. A failed background rescan replaces the page.** A `repo.rescan` notification
  whose scan fails sets the error, and `main.tsx` then shows the error and Retry in place of the
  graph, although the previous list is still there. Intended, or should a rescan failure keep the
  graph and report differently?

---

## 5. `src/webview/lib/webview-config.ts`

Holds the settings the extension gives the page (`WebviewConfig`): the answer to the
`webview.initialize` request first, then each `config.changed` notification.

### 5.1 Interface

Module path `src/webview/lib/webview-config.ts`, imported as `@/webview/lib/webview-config` (and
`./lib/webview-config` from `main.tsx`). Three exports, no default export, no exported types:

| Export                    | Signature                                             | Meaning                                                                                                          |
| ------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `initializeWebviewConfig` | `initializeWebviewConfig(value: WebviewConfig): void` | Store the first configuration. Throws when one is already stored.                                                |
| `updateWebviewConfig`     | `updateWebviewConfig(value: WebviewConfig): boolean`  | Replace the stored configuration; returns `true` when it did, `false` (storing nothing) when there was none yet. |
| `getWebviewConfig`        | `getWebviewConfig(): WebviewConfig`                   | The stored configuration. Throws when there is none yet.                                                         |

`WebviewConfig` (from `@/types`, defined in `src/types/config.ts`):

```ts
type WebviewConfig = Readonly<{
  autoCenterCommitDetailsView: boolean;
  dateFormat: DateFormat; // "Date & Time" | "Date Only" | "Relative"
  graphColours: readonly string[];
  graphStyle: GraphStyle; // "rounded" | "angular"
  initialLoadCommits: number;
  loadMoreCommits: number;
  locale: string; // VS Code's display language
  showCurrentBranchByDefault: boolean;
}>;
```

Who uses what:

| User                                                                                           | Uses                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/webview/main.tsx`                                                                         | `initializeWebviewConfig(config)` once with the `webview.initialize` answer, before `initializeStores` and before rendering the application.                                        |
| `src/webview/lib/actions.ts`                                                                   | `getWebviewConfig()` (`initialLoadCommits`, `loadMoreCommits`); `updateWebviewConfig` inside `applyWebviewConfig` (the `config.changed` path), which stops when it returns `false`. |
| `src/webview/lib/handler/load-branches.ts`                                                     | `getWebviewConfig().showCurrentBranchByDefault`.                                                                                                                                    |
| `src/webview/components/commit/CommitGraph.tsx`                                                | `graphStyle`, while rendering.                                                                                                                                                      |
| `src/webview/components/commit/CommitDetails.tsx`                                              | `autoCenterCommitDetailsView`.                                                                                                                                                      |
| `src/webview/graph/palette.ts`                                                                 | `graphColours`.                                                                                                                                                                     |
| `src/webview/utils/date.ts`                                                                    | `locale`, `dateFormat`.                                                                                                                                                             |
| `src/webview/utils/fileTree.ts`                                                                | `locale`.                                                                                                                                                                           |
| `tests/webview/test-utils.ts`, `lib/repo-selection.test.ts`, `lib/preference-lifetime.test.ts` | `initializeWebviewConfig`.                                                                                                                                                          |
| `tests/webview/lib/webview-config.test.ts`                                                     | all three.                                                                                                                                                                          |
| `tests/webview/utils/fileTree.test.ts`                                                         | `initializeWebviewConfig`, then `updateWebviewConfig` to switch locales.                                                                                                            |
| `lib/actions.test.ts`, `lib/rpc-handler.test.ts`                                               | `getWebviewConfig` (identity checks after `config.changed`).                                                                                                                        |
| `utils/date.test.ts`, `utils/date-time-zone.test.ts`                                           | `getWebviewConfig()`, then change fields of the returned object in place with `Object.assign`.                                                                                      |

### 5.2 Dependencies the implementation must use

| Import path       | Names                    | For                                                               |
| ----------------- | ------------------------ | ----------------------------------------------------------------- |
| `@preact/signals` | `signal` (or equivalent) | Readers must re-render when the configuration is replaced (§5.3). |
| `@/types`         | `WebviewConfig` (type)   | The value's type.                                                 |

### 5.3 Behaviour

- **State.** One configuration, initially absent.
- **`initializeWebviewConfig(value)`**: when a configuration is already stored, throws
  `new Error("Webview configuration is already initialized")` and keeps the stored one. Otherwise
  stores `value` itself.
- **`updateWebviewConfig(value)`**: when none is stored yet, returns `false` and discards `value`
  (`webview-config.test.ts` covers this with a `config.changed` notification that arrives before
  the `webview.initialize` answer). Otherwise stores `value` itself and returns
  `true`, also when `value` is the object already stored.
- **`getWebviewConfig()`**: returns the stored object; when none is stored, throws
  `new Error("Webview configuration is not initialized")`.
- **Reactivity.** A component render, `computed` or `effect` that calls `getWebviewConfig()`
  depends on the configuration: when `initializeWebviewConfig` or `updateWebviewConfig` stores a
  different object, it runs again. Storing the object that is already stored notifies no one.
  `config-changed.test.ts` relies on this: an open graph row re-renders its date column after a
  `config.changed` notification. (A reader that called `getWebviewConfig()` before initialisation,
  and caught the error, also runs again once the configuration is stored.)
- **No copies.** The stored object is the caller's object: not copied, not frozen, not validated.
  `getWebviewConfig()` returns it by identity (`webview-config.test.ts`, `rpc-handler.test.ts` and
  `actions.test.ts` check with `toBe`), and `date.test.ts` / `date-time-zone.test.ts` change its
  fields in place with `Object.assign` and expect the date helpers to see the change. Changing
  fields in place notifies no one.
- Checking whether a configuration is stored, in `initializeWebviewConfig` and
  `updateWebviewConfig`, should not make the caller depend on the configuration (neither is called
  inside a render today).

### 5.4 Concrete examples

Let `base` be `{ autoCenterCommitDetailsView: true, dateFormat: "Date & Time", graphColours: [], graphStyle: "rounded", initialLoadCommits: 300, loadMoreCommits: 100, locale: "en", showCurrentBranchByDefault: false }`,
on a fresh module:

| Call                                                                                                          | Result                                                                                         |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `getWebviewConfig()`                                                                                          | throws `Error` with message `Webview configuration is not initialized`                         |
| `updateWebviewConfig({ ...base })`                                                                            | `false`; still nothing stored                                                                  |
| `initializeWebviewConfig(cfg)` (`cfg = { ...base }`)                                                          | returns; `getWebviewConfig() === cfg`; `Object.isFrozen(cfg)` is `false`                       |
| `initializeWebviewConfig({ ...base })` again                                                                  | throws `Error` with message `Webview configuration is already initialized`; `cfg` still stored |
| with an effect reading `getWebviewConfig()`: `updateWebviewConfig(next)` (`next = { ...base, locale: "de" }`) | `true`; the effect ran again once; `getWebviewConfig() === next`                               |
| `updateWebviewConfig(next)` again                                                                             | `true`; the effect did not run                                                                 |
| `updateWebviewConfig({ ...next })`                                                                            | `true`; the effect ran again                                                                   |

End to end (`webview-config.test.ts`): on fresh modules, `applyWebviewConfig(changed)` from
`actions.ts` before initialisation does not throw and leaves `maxCommits` unchanged; the following
`initializeWebviewConfig(config)` succeeds.

### 5.5 Non-functional requirements

- **Import-time behaviour.** Nothing but creating the holder. Not part of an import cycle.
- **Synchronous.** All three functions act immediately.
- **No state outside the module instance.** `webview-config.test.ts` and
  `preference-lifetime.test.ts` re-import with `vi.resetModules()` and expect a fresh, empty
  holder.
- **Identity and mutability**, as in §5.3.

### 5.6 Test coverage

What the existing tests check:

- `webview-config.test.ts`: `getWebviewConfig()` throws `Webview configuration is not initialized`
  before initialisation; `initializeWebviewConfig` stores the object itself and a second call throws
  `Webview configuration is already initialized`; `updateWebviewConfig` before initialisation returns
  `false` and stores nothing, after it returns `true` and stores the object itself; `applyWebviewConfig`
  (actions) before initialisation neither throws nor changes `maxCommits`. Alterations that let a
  second initialisation overwrite, apply an update before initialisation, store a copy, or make
  `updateWebviewConfig` report `false` are each caught here.
- `config-changed.test.ts`: a rendered row's date column changes after a `config.changed`
  notification (an alteration that reads the configuration without subscribing is caught only
  here), and the graph reloads with the new page size.
- `rpc-handler.test.ts` and `actions.test.ts`: the notification's object becomes the configuration
  (identity), and a larger `initialLoadCommits` raises `maxCommits`.
- `fileTree.test.ts`, `date.test.ts`, `date-time-zone.test.ts`: updates and in-place changes reach
  the helpers that read the configuration.

Gaps, with the test to add:

1. **Same object, no notification.** Setup: fresh module; `initializeWebviewConfig(cfg)`; an
   `effect` that calls `getWebviewConfig()` and counts runs. Call: `updateWebviewConfig(cfg)`.
   Expected: returns `true`; the effect count is unchanged. Then `updateWebviewConfig({ ...cfg })`:
   the effect ran once more.
2. **Initialisation notifies an earlier reader.** Setup: fresh module; an `effect` that calls
   `getWebviewConfig()` inside `try`/`catch` and counts runs. Call: `initializeWebviewConfig(cfg)`.
   Expected: the effect ran again, and now sees `cfg`.
3. **Error type.** Expected: both thrown values are instances of `Error` (not only matching
   messages).
4. **Not frozen.** Setup: `initializeWebviewConfig(cfg)`. Expected: `Object.isFrozen(getWebviewConfig())`
   is `false` and `Object.assign(getWebviewConfig(), { locale: "de" })` is visible through the next
   `getWebviewConfig()`. (The date tests rely on this implicitly.)

### 5.7 Questions

- **webview-config Q1. Equal configurations.** Every `config.changed` stores a new object, so every
  reader re-renders even when no value changed (and `actions.ts` reloads the graph, which its own
  decision Q7 keeps). Should an update whose fields all equal the stored ones be treated as no
  change here, or is re-rendering acceptable?

---

## 6. `src/webview/lib/vscode.ts`

The page's handle on the VS Code webview API, through which every message to the extension is
posted and the page's own saved state is read and written.

### 6.1 Interface

Module path `src/webview/lib/vscode.ts`, imported as `@/webview/lib/vscode` (and `./lib/vscode`
from `main.tsx`). One export, no default export:

```ts
export const vscode: {
  getState(): unknown;
  setState(state: unknown): void;
  postMessage(message: RequestMessage | RpcRequest): void;
};
```

The type is the return type of the ambient `acquireVsCodeApi()` declared in
`src/webview/global.d.ts` (`RequestMessage` and `RpcRequest` from `@/types`); keep it that way
rather than declaring a second, different type.

- `postMessage(message)`: sends a request to the extension (legacy command requests and RPC
  requests).
- `getState()` / `setState(state)`: the page's state that VS Code keeps while the panel exists
  (used by `navigation.ts` and `hints.ts`).

Who uses it: `actions.ts`, `repository-actions.tsx`, `remote-actions.tsx`, `navigation.ts`
(`getState` while loading, `setState`, `postMessage`), `hints.ts` (`getState` while loading,
`setState`), `rpc/rpc-client.ts` (`postMessage`), `main.tsx` (`postMessage({ command: "viewReady" })`).
Tests reach it through `tests/webview/setup.ts`, which defines the global `acquireVsCodeApi` to
return the shared mock `vscodeApi`, and assert on `vscodeApi.postMessage` / `setState` calls;
`Dialog.test.ts`, `RefsPane.test.ts`, `RefsScale.test.ts`, `RefsTiming.test.ts`,
`remote-actions.test.ts` and `repository-actions.test.ts` replace the whole module with
`vi.mock("@/webview/lib/vscode", () => ({ vscode: { postMessage, getState, setState } }))`, so the
export must be named `vscode` and be the module's only value the others need.

### 6.2 Dependencies the implementation must use

None to import. It calls the global function `acquireVsCodeApi()` that VS Code defines in every
webview (declared in `src/webview/global.d.ts`).

### 6.3 Behaviour

When the module is loaded it calls `acquireVsCodeApi()` exactly once and exports the object that
call returns, itself (not a wrapper or copy). VS Code lets a page acquire the API only once (a
second call throws), so this module is the only place that may call it; everything else imports
`vscode`.

### 6.4 Concrete examples

- In the tests, after `tests/webview/setup.ts` has run, `vscode` is the `vscodeApi` mock object,
  so `vscode.postMessage({ command: "viewReady" })` records one call on
  `vscodeApi.postMessage`.
- Loading the module twice through `vi.resetModules()` calls the (mock) `acquireVsCodeApi` again;
  in a real webview a page loads the module once.

### 6.5 Non-functional requirements

- **Import-time side effect, deliberately.** Unlike the other modules, this one does its work while
  loading, because `navigation.ts` and `hints.ts` read `vscode.getState()` while they load. It
  must not defer the call.
- **Not part of an import cycle**; imports nothing.
- **Lint.** Files under `src/webview/lib/handler/` may not import it (§0.3).

### 6.6 Test coverage

Every webview test that inspects `vscodeApi` depends on this module exporting the object
`acquireVsCodeApi()` returned. No test checks that the function is called only once, or that the
export is that object rather than a forwarding wrapper. Gap:

1. **Acquired once, exported as is.** Setup: `vi.resetModules()`; replace the global
   `acquireVsCodeApi` with a spy returning a fresh object `api`. Call: import the module. Expected:
   the spy was called once with no arguments, and `vscode === api`; importing again without
   resetting modules does not call it again.

### 6.7 Questions

None.

---

## 7. `src/webview/lib/handler/action-result.ts`

Settles the extension's answer to a Git action (any of the 17 action commands): reloads the graph
when the action may have changed the repository, then closes the running dialog on success or
shows an error dialog titled after the command on failure — unless the answer is outdated or
belongs to work that reports its own outcome.

### 7.1 Interface

Module path `src/webview/lib/handler/action-result.ts`, imported as
`@/webview/lib/handler/action-result`. One export:

```ts
export function handleActionResult(msg: ActionResponse): void;
```

`ActionResponse` (from `@/backend/types`) is, for each action command `C` in `repositoryAction`,
`addTag`, `checkoutBranch`, `checkoutCommit`, `cherrypickCommit`, `createBranch`, `deleteBranch`,
`deleteTag`, `mergeBranch`, `mergeCommit`, `pushTag`, `pushBranch`, `pullBranch`, `fetchRemote`,
`renameBranch`, `resetToCommit`, `revertCommit`:
`{ command: C; status: string | null; repo?: string; requestId?: string }`. `status` is `null` when
the action succeeded, otherwise the reason it failed (often Git's own text). `repo` and
`requestId` are echoed from the request, together, when the request had a `requestId`.

Who uses it: the dispatcher (§1) for those 17 commands. Tests call it directly:
`uncorrelated-replies.test.ts`, `remote-actions.test.ts`, `history-tools.test.ts`,
`unseen-failures.test.ts`.

### 7.2 Dependencies the implementation must use

| Import path                        | Names                                                 | For                                                                 |
| ---------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------- |
| `@/webview/lib/remote-actions`     | `actionMutates`, `acceptRemoteActionResult`           | Whether to reload; whether the answer is still for the open dialog. |
| `@/webview/lib/actions`            | `refresh`, `closeDialog`, `openErrorDialog`           | The effects.                                                        |
| `@/backend/types`                  | `ActionResponse` (type)                               | Parameter type.                                                     |
| `@/old-extension/l10n/webviewL10n` | `LocalizedStrings` (type, optional)                   | Typing the title keys so that a missing key is a type error.        |
| global `window.l10n`               | the title strings (§7.3), read when an error is shown |                                                                     |

It must not import `@/webview/lib/vscode` (§0.3).

### 7.3 Behaviour

In this order, all synchronously:

1. **Reload.** If `actionMutates(msg)` is `true`, call `refresh()`. This must be decided before
   step 2, because `acceptRemoteActionResult` forgets the in-flight record, after which
   `actionMutates` answers `false` for the same message. It happens for successes and failures
   alike (a failed merge or pull can still leave the repository changed), and whether or not the
   answer is still wanted in step 2. `refresh()` reloads the _selected_ repository (and does
   nothing when none is selected).
2. **Acceptance.** If `acceptRemoteActionResult(msg)` is `false`, stop: the answer is outdated,
   belongs to a background action, or has already been reported by that call.
3. **Success** (`status === null`): `closeDialog()` — the running dialog goes away and focus
   returns to where it was.
4. **Failure** (`status` a string): `openErrorDialog(title, msg.status)`, where `title` is
   `window.l10n[key]` for the command's key, read at that moment:

| `command`          | l10n key                 | English title                    |
| ------------------ | ------------------------ | -------------------------------- |
| `repositoryAction` | `unableToRunGitAction`   | Unable to complete Git operation |
| `addTag`           | `unableToAddTag`         | Unable to Add Tag                |
| `checkoutBranch`   | `unableToCheckoutBranch` | Unable to Checkout Branch        |
| `checkoutCommit`   | `unableToCheckoutCommit` | Unable to Checkout Commit        |
| `cherrypickCommit` | `unableToCherryPick`     | Unable to Cherry Pick Commit     |
| `createBranch`     | `unableToCreateBranch`   | Unable to Create Branch          |
| `deleteBranch`     | `unableToDeleteBranch`   | Unable to Delete Branch          |
| `deleteTag`        | `unableToDeleteTag`      | Unable to Delete Tag             |
| `mergeBranch`      | `unableToMergeBranch`    | Unable to Merge Branch           |
| `mergeCommit`      | `unableToMergeCommit`    | Unable to Merge Commit           |
| `pushTag`          | `unableToPushTag`        | Unable to Push Tag               |
| `pushBranch`       | `unableToPushBranch`     | Unable to push branch            |
| `pullBranch`       | `unableToPullBranch`     | Unable to pull branch            |
| `fetchRemote`      | `unableToFetch`          | Unable to fetch                  |
| `renameBranch`     | `unableToRenameBranch`   | Unable to Rename Branch          |
| `resetToCommit`    | `unableToReset`          | Unable to Reset to Commit        |
| `revertCommit`     | `unableToRevert`         | Unable to Revert Commit          |

The reason shown is `msg.status` unchanged. The error dialog replaces the running dialog (and
closes any context menu).

What callers observe in the common cases (the collaborators' parts included):

| Answer                                                                                                                       | Reload                               | Dialog afterwards                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| No `requestId`, success                                                                                                      | yes                                  | closed, whatever it was                                                                                             |
| No `requestId`, failure                                                                                                      | yes                                  | error dialog with the command's title and the reason                                                                |
| Action sent with `runAction` or `sendRepositoryAction` (not background), running dialog still open, same repository, success | yes                                  | closed                                                                                                              |
| The same, failure                                                                                                            | yes                                  | error dialog (title, reason)                                                                                        |
| The same, but the user closed the running dialog or opened another one meanwhile                                             | yes                                  | unchanged; a failure is marked as unseen in Git Activity                                                            |
| The same, but the user switched repositories meanwhile                                                                       | yes (of the repository now selected) | closed; a failure is marked as unseen                                                                               |
| Background view (native diff, file preview), success or failure                                                              | no                                   | unchanged (a failure while still viewing shows an error dialog titled `unableToRunGitAction` from `remote-actions`) |
| Workspace background action (`backgroundAction`), marked as changing the repository                                          | yes                                  | unchanged; its completion callback gets the status                                                                  |
| Unknown or already settled `requestId`                                                                                       | no                                   | unchanged                                                                                                           |
| `repo` differs from the in-flight record's repository                                                                        | as `actionMutates` says              | unchanged; the record is kept                                                                                       |

### 7.4 Concrete examples

Stand-in strings; repository `/r` selected, selection `main`.

- `openRunningDialog("deleting")`, then `handleActionResult({ command: "deleteTag", status: null })`:
  posted `loadBranches` (repo `/r`), `repositoryQuery` (`query: { kind: "state" }`), `loadCommits`
  (`branchName: "main"`); `dialog` is `null` (`uncorrelated-replies.test.ts`).
- The same with `status: "boom"`: the same reload; `dialog` is
  `{ kind: "error", message: "unableToDeleteTag", reason: "boom", token: <n> }`.
- For each command with `status: "why"` and no `requestId`, the dialog's `message` is the key in the
  table (e.g. `fetchRemote` → `"unableToFetch"`, `repositoryAction` → `"unableToRunGitAction"`) and
  its `reason` is `"why"`.
- No repository selected, `{ command: "deleteTag", status: null }` with a running dialog open:
  nothing posted; `dialog` is `null`.
- `runAction({ command: "deleteTag", tagName: "v1" })` posts
  `{ command: "deleteTag", tagName: "v1", requestId: "action-1", repo: "/r" }` and opens the running
  dialog. `handleActionResult({ command: "deleteTag", status: "failed!", repo: "/r", requestId: "action-1" })`:
  the reload is posted while the running dialog is still shown, then the dialog is
  `{ kind: "error", message: "unableToDeleteTag", reason: "failed!", … }`.
- `{ command: "deleteTag", status: null, repo: "/r", requestId: "action-999" }` (never sent) with a
  running dialog open: nothing posted; the dialog is the same object as before.
- (`unseen-failures.test.ts`) `sendRemoteAction({ command: "fetchRemote", remote: "origin", prune: false, requestId: "shown" }, "/repo", "Running")`,
  then `{ command: "fetchRemote", requestId: "shown", repo: "/repo", status: "timeout" }`: the
  dialog is `{ kind: "error", reason: "timeout", message: "unableToFetch", … }` and no unseen-failure
  cue appears. If the running dialog had been closed first, the dialog stays `null` and the cue
  appears instead.

### 7.5 Non-functional requirements

- Synchronous; no state of its own; nothing happens on import; not in an import cycle.
- Reads `window.l10n` only when a failure is shown (tests install different `window.l10n` objects
  per file).
- Must not post messages itself (the lint rule of §0.3); every request comes from `refresh()`.

### 7.6 Test coverage

What the existing tests check:

- `uncorrelated-replies.test.ts`: an answer without `requestId` reloads (`loadBranches`,
  `repositoryQuery` with `{ kind: "state" }`, `loadCommits` for the selection) and closes the open
  dialog on success; on failure it shows the command's own title (`unableToDeleteTag`) with the
  reason. Alterations that drop the reload, keep the dialog open on success, drop the reason, or use
  the generic title for every command are each caught here.
- `history-tools.test.ts`: a background diff or restore preview leaves the dialog alone; a
  submodule action run in the parent repository closes the dialog; a failure that arrives after the
  running dialog was replaced still reloads the graph. That last test is the only one that catches
  asking `actionMutates` after `acceptRemoteActionResult` instead of before.
- `remote-actions.test.ts`: a background fetch's result lets the pull preview continue; late
  results neither replace another repository's dialog nor close a newer action's dialog.
- `unseen-failures.test.ts`: a `fetchRemote` failure shows its reason in the dialog when the running
  dialog is still open, and otherwise leaves the dialog as it is. Ignoring the verdict of
  `acceptRemoteActionResult` is caught by ten tests across these four files.
- End to end, `tests-ext/ui/history.test.cjs` waits for "Unable to Merge" after a refused merge and
  treats any dialog starting with "Unable" as a failed step.

Not checked by any webview test:

- Reloading only when `actionMutates` says so: an alteration that reloads after every answer
  (including background diffs and previews) is caught by no test.
- The titles of 15 of the 17 commands: mapping `fetchRemote` to the generic title is caught by no
  test (only `deleteTag` is checked, and `mergeBranch` in the UI test).

Gaps, with the test to add (stand-in strings; `setupWebviewTest()`; repository `/r`, selection
`main`):

1. **Every title.** For each command in the table of §7.3: open a running dialog, call
   `handleActionResult({ command, status: "why" })`. Expected: `dialog` is
   `{ kind: "error", message: <key>, reason: "why" }`.
2. **No reload for a background view.** Setup: `sendRepositoryAction({ kind: "viewRangeFile", left: "a", right: "b", before: "f", after: "f" })`;
   note its request; `vscodeApi.postMessage.mockClear()`. Call: its answer with `status: null`.
   Expected: no `loadBranches`, `repositoryQuery` or `loadCommits` posted; `dialog` unchanged.
3. **Unknown id.** Setup: running dialog open. Call:
   `handleActionResult({ command: "deleteTag", status: null, repo: "/r", requestId: "action-999" })`.
   Expected: nothing posted, `dialog` is the same object.
4. **Tracked failure.** Setup: `runAction({ command: "deleteTag", tagName: "v1" })`. Call: its answer
   with `status: "failed!"`. Expected: `loadBranches`, `repositoryQuery`, `loadCommits` posted;
   `dialog` is `{ kind: "error", message: "unableToDeleteTag", reason: "failed!" }`.
5. Depending on the decision on action-result Q1: a mutating action's answer arriving after
   `selectRepo("/other")` reloads `/other` (current behaviour), or reloads nothing.

### 7.7 Questions

- **action-result Q1. Reloading another repository.** The reload follows the in-flight record
  (whether the action changes the repository), not the repository: when the user has switched
  repositories before a mutating action answers, the answer reloads the repository now selected,
  which the action did not touch. Harmless but wasted work. Should the reload be limited to answers
  for the selected repository?
- **action-result Q2. Uncorrelated answers close any dialog.** An answer without a `requestId`
  closes whatever dialog is open, or replaces it with an error, even one the user opened after the
  action (e.g. a new form). `uncorrelated-replies.test.ts` asserts exactly this, and every sender in
  the page now supplies a `requestId`, so only an older or foreign sender could produce such an
  answer. Keep?

---

## 8. `src/webview/lib/handler/load-branches.ts`

Takes the extension's branch list for the selected repository. It stores the list and the
checked-out branch, and when the current selection is missing from the new list it chooses another
one.

### 8.1 Interface

Module path `src/webview/lib/handler/load-branches.ts`, imported as
`@/webview/lib/handler/load-branches`. One export:

```ts
export function handleLoadBranches(
  msg: Extract<ResponseMessage, { command: "loadBranches" }>
): void;
```

The message (from `QueryResponse` in `@/backend/types`, via `ResponseMessage` in `@/types`):

| Field           | Type                             | Meaning                                                                                                             |
| --------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `command`       | `"loadBranches"`                 |                                                                                                                     |
| `repo`          | `string`                         | Repository the list belongs to (echoed from the request).                                                           |
| `requestId`     | `string`                         | Echoed from the request.                                                                                            |
| `branches`      | `string[]`                       | Checked-out branch first, then the other local branches, then remote-tracking ones as `remotes/<remote>/<branch>`.  |
| `head`          | `string \| null`                 | Name of the checked-out branch; `null` when HEAD is detached, the branch has no commit yet, or HEAD cannot be read. |
| `hard`          | `boolean`                        | Always `true`; ignored.                                                                                             |
| `isRepo`        | `boolean`                        | Always `true`; ignored.                                                                                             |
| `visibilityKey` | `string \| undefined` (optional) | The request's visibility key, copied back; may be absent or present as `undefined`.                                 |

Who uses it: the dispatcher; tests `graph-requests.test.ts`, `uncorrelated-replies.test.ts`,
`preference-lifetime.test.ts`, `remote-visibility.test.ts`, `branch-focus.test.ts` call it
directly, usually with the request object spread into the answer (extra request fields such as
`showRemoteBranches` are present and must be ignored).

### 8.2 Dependencies the implementation must use

| Import path                    | Names                                                                                                | For                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `@preact/signals`              | `batch`                                                                                              | One notification for list and head.                      |
| `@/webview/lib/stores`         | `selectedRepo`, `selectedBranch`, `branchDisplay`, `branchList`, `headBranch`, `remoteVisibilityKey` | Reading the view; storing the list.                      |
| `@/webview/lib/graph-requests` | `acceptGraphResponse`                                                                                | Only the latest request's answer is taken.               |
| `@/webview/lib/actions`        | `selectBranch`                                                                                       | Choosing a replacement selection (with all its effects). |
| `@/webview/lib/navigation`     | `savedFocusBranch`                                                                                   | The saved focus target.                                  |
| `@/webview/lib/webview-config` | `getWebviewConfig`                                                                                   | `showCurrentBranchByDefault`.                            |
| `@/webview/constants`          | `SHOW_ALL_BRANCHES`                                                                                  | `"*"`.                                                   |
| `@/types`                      | `ResponseMessage` (type)                                                                             | Parameter type.                                          |

### 8.3 Behaviour

**Which answers are taken.** The answer is ignored — nothing changes and the pending request stays
pending — when either holds:

- `msg.repo` is not the selected repository (including when none is selected);
- `msg.visibilityKey` is present and not `undefined`, and differs from `remoteVisibilityKey()` at
  arrival. An answer without a key is not checked against the key (`uncorrelated-replies.test.ts`).

Otherwise the answer goes to `acceptGraphResponse(msg)`; when that refuses it (not the latest
`loadBranches` request for this repository, or already answered), the answer is ignored. The two
checks above must come before the acceptance, so that an answer refused by them does not use up
the pending request (`uncorrelated-replies.test.ts`: a stale-keyed answer is refused, and an answer
with the same `requestId` and no key is then still accepted).

**Taking the answer.** In one notification, `branchList` becomes `msg.branches` (the same array)
and `headBranch` becomes `msg.head`. `graphErrors` is not touched (the request cleared it when it
was sent).

**Keeping the selection valid.** Let _current_ be the selection when the answer is taken. It is
valid when it is `"*"` or equals one of `msg.branches` exactly. When valid, nothing more happens
(no request is posted). When not valid (`undefined`, or a branch that is no longer listed), the
handler calls `selectBranch(choice)` after storing the list, where _choice_ is:

| View mode                 | _current_                       | Saved focus target `savedFocusBranch(msg.repo)` | `showCurrentBranchByDefault` | _choice_                                   |
| ------------------------- | ------------------------------- | ----------------------------------------------- | ---------------------------- | ------------------------------------------ |
| `"focus"` / `"ancestors"` | `undefined`                     | `"*"`, or a name in `msg.branches`              | any                          | the saved target                           |
| `"focus"` / `"ancestors"` | `undefined`                     | absent, `""`, or a name not in `msg.branches`   | any                          | `msg.head`, or `"*"` when `head` is `null` |
| `"focus"` / `"ancestors"` | a missing branch                | not consulted                                   | any                          | `msg.head`, or `"*"` when `head` is `null` |
| `"filter"`                | `undefined` or a missing branch | not consulted                                   | `true`                       | `msg.head`, or `"*"` when `head` is `null` |
| `"filter"`                | `undefined` or a missing branch | not consulted                                   | `false`                      | `"*"`                                      |

`selectBranch` then does what `actions.ts` specifies: it may reveal the chosen remote branch's
remote, resets the history when the displayed branch changes, requests the rows that are now
missing (`loadCommits`), and saves the view preferences (`saveRepoState` with `graphPreferences`),
which is how a fallback target gets saved (`docs/preferences.md`: "The fallback is saved").
Choosing `"*"` also un-pauses focus.

The configuration is read only for the `"filter"` rows of the table.

### 8.4 Concrete examples

Each with fresh modules, stand-in strings, `initialLoadCommits: 300`, repository `/r` just selected
with `selectRepo` (selection `undefined`), then the answer to the latest `loadBranches` request.
For the focus modes the repository's saved preferences (`receiveRepoState` with
`graphPreferences`, no `focusBranch`) set the view mode first.

| `showCurrentBranchByDefault` | View mode             | `branches`          | `head`   | Selection afterwards |
| ---------------------------- | --------------------- | ------------------- | -------- | -------------------- |
| `false`                      | `filter`              | `["main","topic"]`  | `"main"` | `"*"`                |
| `false`                      | `filter`              | `["topic"]` or `[]` | `null`   | `"*"`                |
| `false`                      | `focus`               | `["main","topic"]`  | `"main"` | `"main"`             |
| `false`                      | `focus`               | `["topic"]` or `[]` | `null`   | `"*"`                |
| `false`                      | `ancestors`           | `["main","topic"]`  | `"main"` | `"main"`             |
| `true`                       | `filter`              | `["main","topic"]`  | `"main"` | `"main"`             |
| `true`                       | `filter`              | `["topic"]`         | `null`   | `"*"`                |
| `true`                       | `focus` / `ancestors` | `["main","topic"]`  | `"main"` | `"main"`             |

In every row `branchList` is the answer's array and `headBranch` its `head`.

Saved target (view mode `focus`, `focusPaused: true`, `focusDimming: "strong"`), answer
`["main","topic"]` with head `"main"`:

| Saved `focusBranch` | Selection afterwards | `focusPaused` |
| ------------------- | -------------------- | ------------- |
| `"topic"`           | `"topic"`            | `true`        |
| `"*"`               | `"*"`                | `false`       |
| `""`                | `"main"`             | `true`        |
| `"gone"`            | `"main"`             | `true`        |
| absent              | `"main"`             | `true`        |

Messages: with `showCurrentBranchByDefault: true` in `filter` mode, the first answer
(`["main","topic"]`, head `"main"`) causes exactly `loadCommits` (`branchName: "main"`) and then
`saveRepoState` to be posted.

Selection kept or replaced within a session (`filter`, `showCurrentBranchByDefault: false`):
selection `topic`, answer `["main","topic"]` → stays `topic`, nothing posted by the handler;
answer `["main"]` → `"*"`. After `focusBranchInGraph("main")`, answer `["other"]` with head
`"other"` → `"other"`.

Refusals: with a pending request `graph-7` for `/r`, an answer for `/other`, or one whose
`visibilityKey` is `"nope"`, changes nothing; a following answer with id `graph-7`, repository
`/r` and the current key is accepted; another answer with id `graph-7` is then refused. An answer
whose `visibilityKey` field is present with the value `undefined` is accepted.

Notifications: an effect reading `branchList` and `headBranch` runs once for an accepted answer.

### 8.5 Non-functional requirements

- Synchronous; no state of its own; nothing on import; not in an import cycle.
- Posts nothing itself (lint rule, §0.3); every request comes from `selectBranch`.
- Cost: one pass over `msg.branches` to validate the selection (lists can hold thousands of
  remote branches); no other scanning.
- The stored list is the answer's array, not a copy.

### 8.6 Test coverage

What the existing tests check (by alteration):

- The visibility-key check, including accepting an answer without a key and checking before the
  request is used up: `remote-visibility.test.ts` ("ignores history and branch replies from older
  remote visibility choices"), `uncorrelated-replies.test.ts`, and for an absent key also
  `branch-focus.test.ts`.
- Refusing older answers and answers from a previous visit: `graph-requests.test.ts`.
- Storing the list: `graph-requests.test.ts`, `remote-visibility.test.ts`,
  `uncorrelated-replies.test.ts`.
- The saved focus target: used (`branch-focus.test.ts`, "restores the paused target and dimming per
  repository"; four tests in `preference-lifetime.test.ts`) and checked against the list
  (`preference-lifetime.test.ts`, "falls back to HEAD when the saved focus branch is deleted /
  renamed", "clears unavailable focus in a detached or unborn repository").
- Falling back to HEAD in the focus modes: `branch-focus.test.ts` ("falls back when the focused
  branch disappears") and `preference-lifetime.test.ts`.
- Choosing a replacement at all: eleven tests across `branch-focus.test.ts`,
  `graph-requests.test.ts`, `preference-lifetime.test.ts` and `remote-visibility.test.ts`.

Caught by no test:

- Keeping `"*"` as a valid selection (treating it as invalid changes nothing in any test).
- Using the saved target only when the selection is `undefined` (consulting it also when the
  current branch disappeared), and only outside `"filter"` mode.
- `showCurrentBranchByDefault` (every test configures `false`).
- Storing `headBranch`.
- Falling back to `"*"`, rather than some listed branch, when HEAD is detached in a focus mode with
  a non-empty list.
- Grouping `branchList` and `headBranch` into one notification, and storing the answer's array
  itself. (A heavy unrelated test, `FileTreeView.test.ts` "renders a large commit …", sometimes
  times out while the whole project runs under load; it does not depend on this module.)
- The separate repository check: removing it changes nothing observable, because
  `acceptGraphResponse` also refuses an answer for a repository that is not selected, without
  using up the request.

Gaps, with the test to add (jsdom; `setupWebviewTest()` with fresh modules where the configuration
must differ; repository `/r` selected with `selectRepo`, then answers built from
`latestGraphRequest("loadBranches")`):

1. **`showCurrentBranchByDefault`.** Setup: configuration with `showCurrentBranchByDefault: true`,
   view mode `"filter"`. Call: answer `["main", "topic"]`, head `"main"`. Expected: selection
   `"main"`; posted `loadCommits` (`branchName: "main"`) then `saveRepoState`. With head `null` and
   branches `["topic"]`: selection `"*"`.
2. **`headBranch`.** Call: answer with head `"main"`, then (after `refresh()`) with head `null`.
   Expected: `headBranch.value` `"main"`, then `null`.
3. **`"*"` survives in a focus mode.** Setup: view mode `"focus"`, selection `"*"`; `refresh()`;
   `vscodeApi.postMessage.mockClear()`. Call: answer `["main"]`, head `"main"`. Expected: selection
   still `"*"`; nothing posted.
4. **A vanished focus target falls back to HEAD, not the saved target.** Setup: view mode `"focus"`,
   saved preferences with `focusBranch: "other"`, selection `"topic"`. Call: answer
   `["main", "other"]`, head `"main"`. Expected: selection `"main"`.
5. **Detached HEAD in a focus mode.** Setup: view mode `"focus"`, no saved target. Call: answer
   `["topic"]`, head `null`. Expected: selection `"*"`.
6. **No saved target in filter mode.** Setup: `repoStates` for `/r` with
   `graphPreferences: { branchDisplay: "filter", focusBranch: "topic", focusPaused: false, focusDimming: "subtle", showRemoteBranches: true }`,
   view mode `"filter"`, configuration `showCurrentBranchByDefault: false`. Call: answer
   `["main", "topic"]`, head `"main"`. Expected: selection `"*"`.
7. **One notification, same array.** Setup: an `effect` reading `branchList` and `headBranch`.
   Call: an accepted answer. Expected: the effect ran once; `branchList.value` is the answer's
   array.

### 8.7 Questions

- **load-branches Q1. An empty saved target.** A saved `focusBranch` of `""` (possible only from a
  hand-edited or damaged record) is treated like no saved target and HEAD is focused instead, and
  that fallback is then saved over it. Fine as it is, or should `""` be treated like `"*"`?
- **load-branches Q2. Answers refused by the repository or key check stay pending.** Such an answer
  leaves the request registered, so a later answer with the same id could still be accepted (the
  test relies on this for an answer without a key). A newer request replaces the registration
  anyway. Is leaving it pending intended, rather than dropping the request once its answer turned
  out to be for another view?

---

## 9. `src/webview/lib/handler/load-commits.ts`

Takes a page of graph rows for the displayed branch of the selected repository.

### 9.1 Interface

Module path `src/webview/lib/handler/load-commits.ts`, imported as
`@/webview/lib/handler/load-commits`. One export:

```ts
export function handleLoadCommits(msg: Extract<ResponseMessage, { command: "loadCommits" }>): void;
```

The message:

| Field                  | Type                             | Meaning                                                                                   |
| ---------------------- | -------------------------------- | ----------------------------------------------------------------------------------------- |
| `command`              | `"loadCommits"`                  |                                                                                           |
| `repo`, `requestId`    | `string`                         | Echoed from the request.                                                                  |
| `branchName`           | `string`                         | The branch the rows were loaded for, `""` for all branches (echoed).                      |
| `commits`              | `GitCommitNode[]`                | The rows in graph order; when there are uncommitted changes the first row has hash `"*"`. |
| `head`                 | `string \| null`                 | Full ID of HEAD's commit; `null` when the repository has none.                            |
| `moreCommitsAvailable` | `boolean`                        | Whether the page was cut short.                                                           |
| `hard`                 | `boolean`                        | Ignored.                                                                                  |
| `uncommittedChanges`   | `number`                         | Number of working-tree entries; above zero exactly when `commits` starts with `"*"`.      |
| `visibilityKey`        | `string \| undefined` (optional) | Echoed from the request.                                                                  |

Who uses it: the dispatcher; tests `graph-requests.test.ts`, `branch-focus.test.ts`,
`remote-visibility.test.ts`, `components/commit/GraphErrors.test.ts`, `utils/date.test.ts`.

### 9.2 Dependencies the implementation must use

| Import path                    | Names                                                                                                                                                | For                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `@preact/signals`              | `batch`                                                                                                                                              | One notification.                  |
| `@/webview/lib/stores`         | `selectedRepo`, `displayedBranch`, `remoteVisibilityKey`, `commitList`, `commitHead`, `moreCommitsAvailable`, `uncommittedChanges`, `expandedCommit` | Checks and state.                  |
| `@/webview/lib/graph-requests` | `acceptGraphResponse`                                                                                                                                | Latest request only.               |
| `@/webview/lib/actions`        | `closeCommitDetails`                                                                                                                                 | Closing details whose row is gone. |
| `@/types`                      | `ResponseMessage` (type)                                                                                                                             | Parameter type.                    |

### 9.3 Behaviour

**Which answers are taken.** Ignored, without using up the pending request, when any holds:

- `msg.repo` is not the selected repository;
- `msg.branchName` differs from `displayedBranch()` at arrival (for example an answer for a
  filtered branch arriving after the view switched to a focus mode, which shows all branches);
- `msg.visibilityKey` is present, not `undefined`, and differs from `remoteVisibilityKey()`.

Otherwise `acceptGraphResponse(msg)` decides; a refusal ignores the answer.

**Taking the answer**, in one notification:

- `commitList` becomes `msg.commits` (the same array), `commitHead` becomes `msg.head`,
  `moreCommitsAvailable` and `uncommittedChanges` take the answer's values;
- when a row is expanded (`expandedCommit` not `null`) and no row of `msg.commits` has that hash,
  the details are closed with `closeCommitDetails()` (which also drops a pending details request).
  This includes the uncommitted-changes row `"*"` when the new rows no longer start with it.

`maxCommits` and `graphErrors` are not touched; nothing is posted.

### 9.4 Concrete examples

Repository `/r`, selection `main`, view mode `filter`; `refresh()` posted
`{ command: "loadCommits", requestId: "graph-2", repo: "/r", branchName: "main", maxCommits: …, showRemoteBranches: true, hiddenRemotes: [], visibilityKey: "[true,[]]", hard: true }`.
Let `A` be that request's answer with `commits: C` (rows with hashes `"*"`, `c1`, `c2`), `head: "c1"`,
`moreCommitsAvailable: true`, `uncommittedChanges: 2`.

| Answer                            | Effect                                                                                                                                                    |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `A` with `branchName: ""`         | ignored                                                                                                                                                   |
| `A` with `repo: "/x"`             | ignored                                                                                                                                                   |
| `A` with `visibilityKey: "stale"` | ignored                                                                                                                                                   |
| `A`                               | `commitList.value === C`, `commitHead` `"c1"`, `moreCommitsAvailable` `true`, `uncommittedChanges` `2`; an effect reading all six stores of §9.3 ran once |
| `A` again (same id)               | ignored                                                                                                                                                   |

Expanded rows: with `c2` expanded and its details loaded, an accepted answer containing `c2` keeps
`expandedCommit` `"c2"` and the details; an accepted answer with only `c3` sets `expandedCommit`
and `commitDetails` to `null` (one notification together with the rows), and a details answer for
the earlier `c2` request is then refused. With `"*"` expanded, an accepted answer whose rows are
only `[c1]` (and `uncommittedChanges: 0`) closes the details.

Repository cleared: with the pending request for `/r`, `selectedRepo` set to `undefined`, an answer
for `/r` is ignored; after `selectedRepo` is `/r` again the same answer is accepted.

View mode switch (`branch-focus.test.ts`): after `setBranchDisplay("focus")` a request with
`branchName: ""` is pending; its answer with `branchName: "main"` is ignored and `commitList`
stays `undefined`; with `branchName: ""` it is taken.

### 9.5 Non-functional requirements

- Synchronous; no state of its own; nothing on import; not in an import cycle; posts nothing.
- Cost: at most one pass over the rows to look for the expanded hash (pages hold hundreds to tens
  of thousands of rows); the rows are stored without copying.

### 9.6 Test coverage

What the existing tests check (by alteration):

- The displayed-branch check and checking before using up the request: `branch-focus.test.ts`
  ("loads all branches for focus and ignores an older filtered response").
- The visibility-key check: `remote-visibility.test.ts`.
- Acceptance of the latest request only, `commitHead` and `moreCommitsAvailable`:
  `graph-requests.test.ts` (four tests).
- Rows reach the graph: `GraphErrors.test.ts` (an empty answer shows "noCommits" after a failure
  was retried) and `utils/date.test.ts` (rows with unusual dates render).

Caught by no test:

- Closing the details when the expanded row is not among the new rows (never closing, and always
  closing, both pass).
- Storing `uncommittedChanges`.
- One notification for the whole answer, and storing the answer's array itself.
- The separate repository check (not observable, as in §8.6).

Gaps, with the test to add (jsdom; `setupWebviewTest()`; repository `/r`, selection `main`,
`filter`; answers built from `latestGraphRequest("loadCommits")` after `refresh()`):

1. **Expanded row kept.** Setup: `toggleCommitDetails("c2")`; `commitDetails` set. Call: an
   answer whose rows include `c2`. Expected: `expandedCommit` `"c2"`, `commitDetails` unchanged.
2. **Expanded row gone.** Setup: `toggleCommitDetails("c2")`; keep its details request. Call: an
   answer with only `c3`. Expected: `expandedCommit` and `commitDetails` `null`; then an answer to
   the kept details request is refused (`commitDetails` stays `null`).
3. **Uncommitted row gone.** Setup: `toggleCommitDetails("*")`. Call: an answer with rows `[c1]`
   and `uncommittedChanges: 0`. Expected: `expandedCommit` `null`.
4. **`uncommittedChanges`.** Call: an answer with `uncommittedChanges: 2` (rows starting with
   `"*"`). Expected: `uncommittedChanges.value` `2`.
5. **One notification, same array.** Setup: an `effect` reading `commitList`, `commitHead`,
   `moreCommitsAvailable`, `uncommittedChanges`, `expandedCommit`, `commitDetails`, with a row
   expanded that the answer lacks. Call: the answer. Expected: the effect ran once;
   `commitList.value` is the answer's array.

### 9.7 Questions

None beyond the shared point of load-branches Q2, which applies here in the same way.

---

## 10. `src/webview/lib/handler/commit-details.ts`

Takes the details of the expanded row, or reports that they could not be loaded.

### 10.1 Interface

Module path `src/webview/lib/handler/commit-details.ts`, imported as
`@/webview/lib/handler/commit-details`. One export:

```ts
export function handleCommitDetails(
  msg: Extract<ResponseMessage, { command: "commitDetails" }>
): void;
```

The message: `command: "commitDetails"`, `repo: string`, `requestId: string` (both echoed from the
request), `commitDetails: GitCommitDetails | null` — `null` when the revision is not a single
commit or Git's answer could not be read. `GitCommitDetails` (from `@/backend/types`):
`{ hash: string; parents: string[]; author: string; email: string; date: number; committer: string; body: string; fileChanges: GitFileChange[] }`,
where `hash` is the resolved commit's full ID.

Who uses it: the dispatcher; tests `graph-requests.test.ts`,
`components/commit/FileTreeView.test.ts`, `components/commit/WorkingTreeDetails.test.ts`.

### 10.2 Dependencies the implementation must use

| Import path                    | Names                                                         | For                          |
| ------------------------------ | ------------------------------------------------------------- | ---------------------------- |
| `@/webview/lib/graph-requests` | `acceptGraphResponse`                                         | Latest details request only. |
| `@/webview/lib/stores`         | `expandedCommit`, `commitDetails`                             | Check and state.             |
| `@/webview/lib/actions`        | `closeCommitDetails`, `openErrorDialog`                       | Failure handling.            |
| `@/types`                      | `ResponseMessage` (type)                                      | Parameter type.              |
| global `window.l10n`           | `unableToLoadCommitDetails` ("Unable to load commit details") |                              |

### 10.3 Behaviour

1. The answer must be accepted by `acceptGraphResponse(msg)` (the latest `commitDetails` request,
   same id, same repository, which is still selected); otherwise it is ignored. Toggling to another
   row, closing the details, and switching repositories all drop the pending request, so their late
   answers are ignored.
2. `commitDetails` `null`: close the details (`closeCommitDetails()`: `expandedCommit` and
   `commitDetails` become `null`), then open the error dialog with title
   `window.l10n.unableToLoadCommitDetails` and no reason (`reason: null`); an open context menu is
   closed.
3. Otherwise, when `msg.commitDetails.hash` differs from `expandedCommit`, the answer is ignored
   (the request has nonetheless been used up; commit-details Q1).
4. Otherwise `commitDetails` becomes `msg.commitDetails` (the same object). Nothing else changes;
   no dialog changes.

The uncommitted-changes row (`"*"`) never has a details request (its panel loads its own data), so
its answers never arrive here.

### 10.4 Concrete examples

Repository `/r`; `toggleCommitDetails("abc")` posted
`{ command: "commitDetails", requestId: "graph-1", repo: "/r", commitHash: "abc" }`.

| Answer                                                               | Effect                                                                                                                                                                         |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `graph-1`, details with `hash: "abc"`                                | `commitDetails.value` is that object; one notification; `dialog` unchanged                                                                                                     |
| `graph-1`, details with `hash: "abcdef"`                             | ignored; `expandedCommit` stays `"abc"`, `commitDetails` stays `null`; a following `graph-1` answer with `hash: "abc"` is refused too                                          |
| `graph-1`, `commitDetails: null`, a menu open                        | `expandedCommit` `null`, `commitDetails` `null`, `contextMenu` `null`, `dialog` `{ kind: "error", message: "unableToLoadCommitDetails", reason: null, token: <n> }` (stand-in) |
| answer for a request made before `toggleCommitDetails("second")`     | ignored, even with `null` (`graph-requests.test.ts`)                                                                                                                           |
| answer for `/r` after `selectRepo("/other")` and a new request there | ignored; the current request's `null` then closes the details and shows the error                                                                                              |

### 10.5 Non-functional requirements

Synchronous; no state of its own; nothing on import; not in an import cycle; posts nothing; reads
`window.l10n` only when showing the error.

### 10.6 Test coverage

What the existing tests check (by alteration):

- Acceptance of the latest details request only: `graph-requests.test.ts` (three tests) and
  `WorkingTreeDetails.test.ts` ("ignores a late commit error after switching to working
  changes …").
- A `null` answer closes the details and shows the error: `graph-requests.test.ts` ("ignores
  another repository's details for the same hash and reports the current error").
- A good answer is stored (`graph-requests.test.ts` checks the `body`), and the details panel
  renders it (`FileTreeView.test.ts`, "lets Escape close the details …").

Caught by no test: the hash check (dropping it passes); storing the answer's object itself; the
`reason: null` of the error dialog and the closing of an open menu (the test matches `kind` and
`message` only).

Gaps, with the test to add (jsdom; `setupWebviewTest()`; repository `/r`):

1. **Hash mismatch.** Setup: `toggleCommitDetails("abc")`. Call: its answer with details whose
   `hash` is `"abcdef"`. Expected (current behaviour, subject to commit-details Q1):
   `commitDetails` `null`, `expandedCommit` `"abc"`, `dialog` `null`.
2. **Failure dialog shape.** Setup: `toggleCommitDetails("abc")`; a context menu open. Call: its
   answer with `commitDetails: null`. Expected: `contextMenu` `null`; `dialog` equals
   `{ kind: "error", message: "unableToLoadCommitDetails", reason: null, token: expect.any(Number) }`.
3. **Same object.** Call: a matching answer. Expected: `commitDetails.value` is the answer's
   `commitDetails` object.

### 10.7 Questions

- **commit-details Q1. A hash mismatch leaves the panel loading.** An accepted answer whose `hash`
  differs from the expanded row is dropped after the request has been used up, so the panel keeps
  waiting with no error and no further answer. The extension resolves the revision to its full ID,
  so this only happens when the row's hash is not the full lowercase ID (rows always carry full
  IDs today). Should a mismatch be treated as a failure, or should the check go, since the request
  id already ties the answer to the row?

---

## 11. `src/webview/lib/handler/view-diff.ts`

Reports that the extension could not open a file's diff.

### 11.1 Interface

Module path `src/webview/lib/handler/view-diff.ts`, imported as
`@/webview/lib/handler/view-diff`. One export:

```ts
export function handleViewDiff(msg: ResponseViewDiff): void;
```

`ResponseViewDiff` (from `@/types`): `{ command: "viewDiff"; success: boolean }` — the extension's
answer to a `viewDiff` request (`actions.ts` `viewDiff(commitHash, file)`), `true` when the diff
editor opened.

Who uses it: the dispatcher only. No test.

### 11.2 Dependencies the implementation must use

| Import path             | Names                                              | For                 |
| ----------------------- | -------------------------------------------------- | ------------------- |
| `@/webview/lib/actions` | `openErrorDialog`                                  | The failure dialog. |
| `@/types`               | `ResponseViewDiff` (type)                          | Parameter type.     |
| global `window.l10n`    | `unableToViewDiff` ("Unable to view diff of file") |                     |

### 11.3 Behaviour

- `success` `true`: nothing happens.
- `success` `false`: `openErrorDialog(window.l10n.unableToViewDiff)` — an error dialog with that
  title and `reason: null`, replacing any open dialog and closing any context menu.

The answer carries no repository or request id; it is shown whenever it arrives (view-diff Q1).

### 11.4 Concrete examples

- A running dialog is open; `{ command: "viewDiff", success: true }`: the dialog is the same object.
- A menu is open; `{ command: "viewDiff", success: false }`: `contextMenu` `null`, `dialog`
  `{ kind: "error", message: "unableToViewDiff", reason: null, token: <n> }` (stand-in); in English
  the title reads "Unable to view diff of file".

### 11.5 Non-functional requirements

Synchronous; stateless; nothing on import; posts nothing.

### 11.6 Test coverage

No test exercises this module (an alteration that never shows the error, and one that shows it
even on success, are both caught by no test).

Gaps, with the test to add (stand-in strings):

1. **Success is silent.** Setup: `openRunningDialog("r")`; `vscodeApi.postMessage.mockClear()`.
   Call: `handleViewDiff({ command: "viewDiff", success: true })`. Expected: `dialog` is the same
   object; nothing posted.
2. **Failure.** Setup: a context menu open. Call: `handleViewDiff({ command: "viewDiff", success: false })`.
   Expected: `contextMenu` is `null`; `dialog` is
   `{ kind: "error", message: "unableToViewDiff", reason: null }`.
3. **Through the dispatcher** (see §1.6 gap 6).

### 11.7 Questions

- **view-diff Q1. A late failure replaces any dialog.** The failure is not tied to a request, so it
  replaces whatever dialog is open when it arrives (a form being filled in, a comparison). Diffs
  normally answer quickly. Should the error be shown only when no other dialog has been opened since
  the diff was requested, or is replacing acceptable?

---

## 12. `src/webview/lib/handler/refresh.ts`

Reloads the graph when the extension asks for it.

### 12.1 Interface

Module path `src/webview/lib/handler/refresh.ts`, imported as `@/webview/lib/handler/refresh`. One
export:

```ts
export function handleRefresh(): void;
```

It takes no parameter (the dispatcher passes the message, which is ignored; `handleRefresh.length`
is `0`). Who uses it: the dispatcher only. No test.

The extension sends `{ command: "refresh" }` when a hidden graph panel becomes visible again
(`src/extension/legacy.ts`, tested on the extension side in
`tests/extension/message-protocol.test.ts`) and after undoing a file restore
(`src/old-extension/messageHandler.ts`, `tests/extension/restore-undo.test.ts`).

### 12.2 Dependencies the implementation must use

`refresh` from `@/webview/lib/actions`.

### 12.3 Behaviour

Calls `refresh()` once: with a repository selected, posts `loadBranches`, the repository-state
query (after cancelling an open one), and `loadCommits` when the selection is not `undefined`; the
loaded rows stay until the answers replace them. With no repository selected, nothing happens.

### 12.4 Concrete examples

| Selected repository | Selection   | Posted                                                                  |
| ------------------- | ----------- | ----------------------------------------------------------------------- |
| `/r`                | `main`      | `loadBranches`, `repositoryQuery`, `loadCommits` (`branchName: "main"`) |
| `/r`                | `undefined` | `loadBranches`, (`cancelRepositoryQuery`,) `repositoryQuery`            |
| none                | any         | nothing                                                                 |

### 12.5 Non-functional requirements

Synchronous; stateless; nothing on import; posts nothing itself.

### 12.6 Test coverage

No test exercises this module (an alteration that does nothing is caught by no test). The
extension side of the message is tested in `tests/extension/message-protocol.test.ts` and
`tests/extension/restore-undo.test.ts`.

Gaps, with the test to add:

1. **Reloads the selected repository.** Setup: repository `/r`, selection `main`;
   `vscodeApi.postMessage.mockClear()`. Call: `handleRefresh()`. Expected: `loadBranches` (repo
   `/r`), `repositoryQuery` (`query: { kind: "state" }`) and `loadCommits` (`branchName: "main"`)
   posted; `commitList` unchanged.
2. **No repository.** Setup: `selectedRepo` `undefined`. Call: `handleRefresh()`. Expected: nothing
   posted.

### 12.7 Questions

None.

---

## 13. `src/webview/lib/actions/clipboard.ts`

Copies text to the system clipboard through the extension, and shows an error dialog when that did
not work.

### 13.1 Interface

Module path `src/webview/lib/actions/clipboard.ts`. One export:

```ts
export function copyToClipboard(type: string, data: string): Promise<void>;
```

| Parameter | Meaning                                                                                                                                                                                                                                                                      |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`    | What is being copied, as the user should read it in a failure message: a localised name such as `window.l10n.typeCommitHash` ("Commit Hash"), `typeBranchName` ("Branch Name"), `typeTagName` ("Tag Name") or `copyError` ("Copy Error Details"). Used only in that message. |
| `data`    | The exact text to put on the clipboard.                                                                                                                                                                                                                                      |

The promise resolves (with `undefined`) once the attempt is over, after any error dialog has been
opened. It never rejects. Callers do not await it.

Who uses it:

| User                                                                                                                                                                                      | How                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/webview/lib/menus.tsx` (imports `@/webview/lib/actions/clipboard`)                                                                                                                   | Menu entries: copy a branch's full name (`typeBranchName`, e.g. `origin/topic` for a remote branch), a commit hash (`typeCommitHash`), a tag name (`typeTagName`). |
| `src/webview/lib/copy.ts`                                                                                                                                                                 | Re-exports it by name (`export { copyToClipboard } from "./actions/clipboard"`), for the three below.                                                              |
| `src/webview/components/ui/Dialog.tsx`                                                                                                                                                    | The error dialog's "Copy Error Details" button copies the reason (`copyError`).                                                                                    |
| `src/webview/components/history/QueryControls.tsx`                                                                                                                                        | Copies a query error (`copyError`).                                                                                                                                |
| `src/webview/components/history/ActivityView.tsx`                                                                                                                                         | Copies an activity entry's title, repository and error, joined with newlines (`copyError`).                                                                        |
| Tests: `lib/actions/clipboard.test.ts`, `lib/menu-text.test.ts` (through the menus), `components/ui/Dialog.behaviour.test.ts` (through the Dialog, with `vi.spyOn(rpcClient, "request")`) |                                                                                                                                                                    |

### 13.2 Dependencies the implementation must use

| Import path                    | Names                                                         | For                                                                                     |
| ------------------------------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `@/webview/lib/rpc/rpc-client` | `rpcClient`                                                   | `rpcClient.request("clipboard.copy", data)`, called as a method of the exported object. |
| `@/webview/lib/actions`        | `openErrorDialog`                                             | The failure dialog.                                                                     |
| global `window.l10n`           | `unableToCopyToClipboard` ("Unable to Copy {0} to Clipboard") |                                                                                         |

### 13.3 Behaviour

1. Sends the RPC request `clipboard.copy` with `data` as its parameter: exactly
   `rpcClient.request("clipboard.copy", data)` (two arguments), which posts
   `{ kind: "rpc.request", id, method: "clipboard.copy", params: data }` synchronously, before
   `copyToClipboard` returns its promise.
2. Waits for the answer. The extension answers `true` when the text was written, `false` when the
   clipboard refused it, and fails the request when the parameter is not a string.
3. When the result is truthy, nothing else happens: no dialog, no store change.
4. When the result is falsy (`false`, and also a missing or `0` result), or the request rejects
   (the extension's error, a malformed answer, the 30 000 ms deadline, or a posting failure), it
   opens an error dialog: `openErrorDialog(text)` with no reason, where `text` is
   `window.l10n.unableToCopyToClipboard` with its first `{0}` replaced by `type` (with the
   replacement semantics of `String.prototype.replace` with a string pattern; clipboard Q1). The
   rejection's own message is not shown.

There is no correlation with what happened in the meantime: the error dialog replaces whatever
dialog is open when the answer (or the deadline) arrives (clipboard Q2).

### 13.4 Concrete examples

Stand-in strings (so the title is `"unableToCopyToClipboard"`), `copyToClipboard("Commit Hash", "abc")`:
posted `{ kind: "rpc.request", id: "<uuid>", method: "clipboard.copy", params: "abc" }`.

| Answer                                         | Promise resolves with | `dialog` afterwards                                                               |
| ---------------------------------------------- | --------------------- | --------------------------------------------------------------------------------- |
| `{ success: true, result: true }`              | `undefined`           | unchanged (`null`)                                                                |
| `{ success: true, result: false }`             | `undefined`           | `{ kind: "error", message: "unableToCopyToClipboard", reason: null, token: <n> }` |
| `{ success: false, error: "nope" }`            | `undefined`           | the same error dialog                                                             |
| `{ success: "x" }` (malformed)                 | `undefined`           | the same error dialog                                                             |
| `{ success: true }` (no result) or `result: 0` | `undefined`           | the same error dialog                                                             |
| `{ success: true, result: "yes" }`             | `undefined`           | unchanged                                                                         |
| no answer                                      | after 30 000 ms       | the same error dialog, opened at the deadline                                     |

With `window.l10n.unableToCopyToClipboard` = `"Unable to Copy {0} to Clipboard"` (English):
`copyToClipboard(window.l10n.typeCommitHash, hash)` refused → message
`"Unable to Copy Commit Hash to Clipboard"`; branch name → `"Unable to Copy Branch Name to Clipboard"`;
tag name → `"Unable to Copy Tag Name to Clipboard"` (`menu-text.test.ts`). With the template
`"Unable to Copy {0} to Clipboard {0}"` and the type `"Tag $& Name"`, the message is
`"Unable to Copy Tag {0} Name to Clipboard {0}"` (only the first placeholder is replaced, and `$&`
in the type is expanded).

`Dialog.behaviour.test.ts`: with `rpcClient.request` spied to resolve `true`, pressing the error
dialog's `copyError` button calls it with exactly `("clipboard.copy", "r")` and the same dialog stays
open; resolving `false` replaces it with the copy-failure error dialog.

### 13.5 Non-functional requirements

- **Method call through the exported client.** Tests replace `rpcClient.request` with
  `vi.spyOn(rpcClient, "request")`; the call must look up `request` on `rpcClient` at call time.
- **Import cycle.** The module is part of the cycle through `rpc-client.ts`, `rpc-handler.ts` and
  `actions.ts`; nothing imported may be used while it loads.
- **Never rejects**; nothing on import; no state of its own; reads `window.l10n` only when a failure
  is shown.
- **Exported name.** `copy.ts` re-exports `copyToClipboard` by name, and `menus.tsx` imports it from
  this path.

### 13.6 Test coverage

What the existing tests check (by alteration):

- A `false` answer opens the error dialog: `clipboard.test.ts` (four tests), `menu-text.test.ts`
  (three), `Dialog.behaviour.test.ts` ("reports a copy that failed").
- The request carries `data` as its parameter, exactly `("clipboard.copy", data)`:
  `clipboard.test.ts`, `Dialog.behaviour.test.ts` ("copies the reason and stays open", which also
  checks that a successful copy leaves the dialog as it was).
- The type fills the English template: `menu-text.test.ts` ("Unable to Copy Commit Hash to
  Clipboard", "… Branch Name …", "… Tag Name …").

Caught by no test: showing the error when the request rejects (dropping it passes); that the
rejection's reason is not shown; the 30 000 ms deadline; that the promise never rejects.

Gaps, with the test to add (jsdom; `setupWebviewTest()`):

1. **Rejected request.** Setup: `vi.spyOn(rpcClient, "request").mockRejectedValue(new Error("nope"))`.
   Call: `await copyToClipboard("Commit Hash", "abc")`. Expected: resolves with `undefined`;
   `dialog` is `{ kind: "error", message: "unableToCopyToClipboard", reason: null }`.
2. **Deadline.** Setup: fake timers; `rpcClient.init()`; `dialog` `null`. Call:
   `copyToClipboard("T", "d")` with no answer; advance 29 999 ms, then 1 ms more. Expected: no
   dialog before the deadline; the error dialog after it; the promise resolves.
3. **Success keeps an empty screen empty.** Setup: `dialog` `null`; `request` resolves `true`.
   Expected: `dialog` stays `null`.
4. Depending on clipboard Q1: with the template `"Unable to Copy {0} to Clipboard {0}"` and the
   type `"Tag $& Name"`, the message is `"Unable to Copy Tag $& Name to Clipboard Tag $& Name"`
   (literal fill of every placeholder) or, as today, `"Unable to Copy Tag {0} Name to Clipboard {0}"`.

### 13.7 Questions

- **clipboard Q1. Filling the placeholder.** Only the first `{0}` of the translated template is
  replaced, and `$&`, `` $` ``, `$'` and `$$` in the type name are interpreted as replacement
  patterns rather than copied. Type names come from the translations (none contains `$` or a second
  `{0}` today). Should the fill be literal and cover every `{0}`, as `rpc-client.ts` already does
  for its timeout text?
- **clipboard Q2. A late failure replaces the current dialog.** A refusal or timeout (up to 30
  seconds later) opens its error dialog over whatever is open then, e.g. a form the user started
  meanwhile. Should it only appear when nothing else has been opened since the copy?
- **clipboard Q3. The reason is dropped.** A rejected request's message (the extension's error, the
  timeout text) is not shown; the dialog only says the copy failed. Intended?
- **clipboard Q4. "Copy Error Details" in the failure text.** The Dialog, query controls and
  activity view pass `copyError` ("Copy Error Details") as the type, so a failure reads "Unable to
  Copy Copy Error Details to Clipboard". Should they pass a noun (a new string such as "Error
  Details") instead? (That change would belong to the callers and the translations.)

---

## 14. All questions

| Id                | Short form                                                                                        | Section |
| ----------------- | ------------------------------------------------------------------------------------------------- | ------- |
| dispatcher Q1     | A second `initDispatcher()` doubles the handling of every message.                                | §1.7    |
| dispatcher Q2     | Commands named like `Object.prototype` members do nothing or throw instead of being warned about. | §1.7    |
| dispatcher Q3     | Keep the console warning for unknown commands?                                                    | §1.7    |
| stores Q1         | `maxCommits` is `0` until `initializeStores`; is the separate initialisation needed?              | §2.7    |
| stores Q2         | The visibility key sorts but keeps repeats.                                                       | §2.7    |
| stores Q3         | `displayedBranch`'s unused parameter.                                                             | §2.7    |
| repo-list Q1      | Overlapping scans: the last answer to arrive wins, even an older one.                             | §3.7    |
| repo-list Q2      | Scan answers are not validated.                                                                   | §3.7    |
| repo-list Q3      | The scan's order and `add`'s re-sorting can disagree.                                             | §3.7    |
| load-repos Q1     | Overlapping scans: an older failure can show an error over a fresh list.                          | §4.7    |
| load-repos Q2     | A failed background rescan replaces the graph with the error page.                                | §4.7    |
| webview-config Q1 | Equal configurations still notify every reader.                                                   | §5.7    |
| action-result Q1  | A late mutating result reloads the repository selected now, not the one it ran in.                | §7.7    |
| action-result Q2  | Uncorrelated results close or replace any open dialog.                                            | §7.7    |
| load-branches Q1  | An empty saved focus target counts as none.                                                       | §8.7    |
| load-branches Q2  | Answers refused by the repository or key check leave their request pending.                       | §8.7    |
| commit-details Q1 | A hash mismatch leaves the details panel loading forever.                                         | §10.7   |
| view-diff Q1      | A late diff failure replaces any open dialog.                                                     | §11.7   |
| clipboard Q1      | Only the first `{0}` is filled, and `$` patterns in the type are expanded.                        | §13.7   |
| clipboard Q2      | A late copy failure replaces any open dialog.                                                     | §13.7   |
| clipboard Q3      | The failure's reason is not shown.                                                                | §13.7   |
| clipboard Q4      | "Unable to Copy Copy Error Details to Clipboard".                                                 | §13.7   |

`vscode.ts`, `load-commits.ts` and `refresh.ts` raise no questions of their own.

---

## 15. Decisions

These decisions are the maintainer's answers to the questions above. Where they differ from "current behaviour" elsewhere in this specification, they win.

- **dispatcher Q1.** A second `initDispatcher()` call is a no-op: at most one listener is ever installed.
- **dispatcher Q2.** Only the dispatcher's own route names are routes. Any other command, including names such as `toString`, `constructor`, `hasOwnProperty`, `valueOf` and `__proto__`, is handled like any unknown command (the warning below, no exception).
- **dispatcher Q3.** Keep the console warning for unknown commands.
- **stores Q1–Q3.** Keep the current behaviour and signatures.
- **repo-list Q1.** Only the newest scan's answer is stored: an answer that arrives after a newer scan has already answered is ignored.
- **repo-list Q2, Q3.** Keep the current behaviour.
- **load-repos Q1.** Only the newest call decides the error: an older call that fails after a newer call started does not set `repoListError`, and an older call's success does not clear an error set by a newer one.
- **load-repos Q2.** Keep the current behaviour.
- **webview-config Q1.** Keep the current behaviour.
- **action-result Q1.** A mutating action's answer reloads the graph only when the repository the action ran in is the selected repository when the answer arrives. Everything else about the answer (activity entry, dialogs) is unchanged.
- **action-result Q2.** Keep the current behaviour (`uncorrelated-replies.test.ts` stays as it is).
- **load-branches Q1, Q2.** Keep the current behaviour (the same for load-commits).
- **commit-details Q1.** Drop the hash comparison: an answer accepted by its request id is shown for the expanded row. The request id already ties it to that row, since expanding another row makes a new request.
- **view-diff Q1.** Keep the current behaviour.
- **clipboard Q1.** Fill every `{0}` in the template, inserting the type literally (no `$` expansion).
- **clipboard Q2.** Keep the current behaviour.
- **clipboard Q3.** Show the failure's reason: the error dialog gets the rejection's message (an `Error`'s `message`, otherwise `String(reason)`) as its reason, under the same title.
- **clipboard Q4.** Add a string key `errorDetails` with English text "Error Details" (zh-cn "错误详情", zh-tw "錯誤詳細資料") in the webview's localisation table beside `copyError`, with the translations in `l10n/bundle.l10n.zh-cn.json` and `l10n/bundle.l10n.zh-tw.json`. The three callers that pass `window.l10n.copyError` as the copied thing's type (`src/webview/components/ui/Dialog.tsx`, `src/webview/components/history/QueryControls.tsx`, `src/webview/components/history/ActivityView.tsx`) pass `window.l10n.errorDetails` instead; their button labels stay `copyError`. A failure then reads "Unable to Copy Error Details to Clipboard". Adjust any test that asserts the old type.

### Amendment to action-result Q1 (after review)

The first wording ("the repository the action ran in") was wrong for actions sent to another repository, such as a submodule update sent to the parent while the child is shown: those change the shown repository too. The rule is instead: a mutating action's answer reloads the graph when the repository selected now is the repository that was selected when the action was sent (the in-flight record's `viewRepo` in `@/webview/lib/remote-actions`). When that is unknown (an answer without a `requestId`, or no in-flight record), reload as before. Expose what is needed from `remote-actions.tsx` with the smallest addition (for example one exported function that returns the recorded `viewRepo` for an answer, or `undefined`), without changing its other behaviour.
