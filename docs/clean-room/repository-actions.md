# Clean-room specification: repository reads and actions, and the remote manager

This specification covers two webview modules of Branchwise:

- `src/webview/lib/repository-actions.tsx`: the webview's single owner of `repositoryQuery`
  traffic (every read of repository details the webview asks the extension for), of the
  repository-state stores the page shows permanently, and of the helpers that send, or ask the
  user to confirm, a `repositoryAction`.
- `src/webview/components/repository/RemoteManager.tsx`: the dialogs and the content panel for
  managing a repository's remotes, and the dialog that sets a local branch's upstream.

Part A describes the first module, Part B the second. Each part has the seven sections the brief
asks for. Nothing here describes how the current files are written; everything is observable
behaviour or a fact of the interface.

## 0. How the observations were made

- Read both modules, every file that imports them (`lib/actions.ts`, `lib/remote-actions.tsx`,
  `lib/dispatcher.ts`, `lib/use-repository-query.ts`, `lib/workspace-actions.ts`, `lib/menus.tsx`,
  `layout/MainHeader.tsx`, `components/repository/{RefsPane,RepositoryStatus,StashManager,
RebaseEditor,WorktreeManager,BisectView}.tsx`, `components/history/{HistoryTools,WorkflowTools,
WorkspacePane,file-menu}.tsx`, `components/commit/{WorkingTreeDetails,RefLabel}.tsx`), the
  modules they import (`stores.ts`, `vscode.ts`, `activity.ts`, `handler/action-result.ts`,
  `components/ui/{Dialog,Button,Select}.tsx`, `utils/format.ts`, `webview/types.ts`,
  `backend/types/*`), the extension's handler for `repositoryQuery` / `cancelRepositoryQuery`
  (`src/old-extension/messageHandler.ts`), the backend that carries out the remote actions
  (`src/backend/actions/remotes.ts`) and builds the repository state
  (`src/backend/queries/repository.ts`), and the English strings in
  `src/old-extension/l10n/{repositoryL10n,webviewL10n}.ts`.
- Read every test that reaches the modules: `tests/webview/lib/{repository-actions,history-tools,
workflows,actions,menu-actions}.test.ts`, `tests/webview/components/ui/Dialog.test.ts`,
  `tests/webview/components/repository/{RefsPane,RefsScale,RefsTiming}.test.ts`,
  `tests/webview/components/commit/{WorkingTreeDetails,WorkingTreeTiming}.test.ts`, and the UI
  workflow test `tests-ext/ui/history.test.cjs`. The UI harness (`scripts/test-ui-harness.cjs`,
  `tests-ext/ui/diagnostics.cjs`) and the stylesheet (`src/webview/styles.css`) do not select on
  anything these modules render.
- Ran the webview Vitest project with coverage limited to the two files (all tests pass; one
  unrelated graph-layout property test times out only under coverage instrumentation and was
  excluded). Line coverage: `repository-actions.tsx` 86.9 %, `RemoteManager.tsx` 47.6 %.
- Ran a scratch Vitest file (kept in `/tmp`, since deleted) that drove every export with the test
  localisation proxy (each `window.l10n` key reads as its own name) and printed the posted
  messages, dialog store values and rendered HTML. The examples in §A4 and §B4 are those outputs.

Conventions used below:

- "Posts `X`" means `vscode.postMessage(X)` through the `vscode` export of `@/webview/lib/vscode`.
- "The selected repository" is `selectedRepo.value` from `@/webview/lib/stores` at the moment
  described. "The dialog" is `dialog.value` from the same module; dialogs are compared by object
  identity (every opener in `lib/actions.ts` stores a fresh object).
- `l10n.x` means `window.l10n.x`, read when the behaviour happens (never at import). English
  values are given where they matter; tests replace `window.l10n` with a proxy whose values are
  the key names, so tests match on, for example, `"addRemote"`.

---

# Part A. `src/webview/lib/repository-actions.tsx`

## A1. Interface

Module path: `src/webview/lib/repository-actions.tsx` (imported as
`@/webview/lib/repository-actions`, and as `./repository-actions` by `lib/dispatcher.ts`).

### A1.1 Stores

| Export                 | Type                              | Initial value | Meaning                                                                                                                                                                                   |
| ---------------------- | --------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `repositoryState`      | `Signal<RepositoryState \| null>` | `null`        | The last successfully loaded state of the selected repository, shown by the refs pane, ref labels and status bar. `null` while nothing is loaded, after a failed load, and after a reset. |
| `repositoryStateError` | `Signal<string \| null>`          | `null`        | The extension's failure message for the last state load, or `null`.                                                                                                                       |
| `repositoryRevision`   | `Signal<number>`                  | `0`           | A counter other modules increase to say "the repository may have changed; panels should read again". This module never changes it; it only owns it.                                       |

All three are plain writable `@preact/signals` signals (`signal(...)`), created once at import;
their identity never changes. Tests assign to them directly (`repositoryState.value = state`,
`repositoryRevision.value++`).

`RepositoryState` (from `@/backend/types`) is
`{ remotes: RemoteDetails[]; pushDefault: string | null; branches: BranchDetails[]; remoteBranches: RefDetails[]; tags: RefDetails[]; worktrees: WorktreeDetails[]; head: string; operation: OperationState | null; conflicts: string[] }`.

### A1.2 Functions

```ts
function requestPanelQuery(
  query: RepositoryQuery,
  receive: (data: RepositoryQueryData | null, error: string | null) => void,
  repo?: string, // omitted or undefined: the selected repository at call time
  detached?: boolean // default false
): () => void;

function resetRepositoryState(): void;

function requestRepositoryState(): void;

function requestRepositoryQuery(
  query: RepositoryQuery,
  callback: (data: RepositoryQueryData) => void,
  repo?: string // omitted or undefined: the selected repository at call time
): void;

function handleRepositoryQuery(message: QueryResult<"repositoryQuery">): void;

function sendRepositoryAction(
  action: RepositoryAction,
  repo?: string // omitted or undefined: the selected repository at call time
): void;

function confirmRepositoryAction(
  message: ComponentChildren,
  actionLabel: string,
  action: RepositoryAction,
  repo?: string // omitted or undefined: the selected repository at call time
): void;

function openRepositoryManager(
  title: string,
  render: (state: RepositoryState, repo: string) => ComponentChildren
): void;
```

Parameters:

- `query`: the read to perform (`RepositoryQuery`, a union discriminated by `kind`, from
  `@/backend/types`). Passed to the extension unchanged.
- `receive(data, error)`: called at most once with the extension's answer: `data` is the
  `RepositoryQueryData` or `null`, `error` the failure message or `null`.
- `repo`: the repository path the request concerns. For all four functions that take it, an
  omitted **or explicitly `undefined`** value means "the selected repository at the moment of the
  call" (callers such as `useRepositoryQuery(query, repo = selectedRepo.value)` rely on this).
- `detached`: when `true`, the answer is delivered even if the user has switched repositories in
  the meantime (used for background work across many repositories).
- `callback(data)`: called once with a successful answer, after the loading dialog has closed.
- `message` (handler): `{ repo: string; requestId: string; data: RepositoryQueryData | null; status: string | null }`.
  The dispatcher also passes `command: "repositoryQuery"`; tests omit it. The handler must not
  depend on `command`.
- `action`: a `RepositoryAction` (union discriminated by `kind`, from `@/backend/types`).
- `message` (confirmation): the question shown in the confirmation dialog (any Preact children).
- `actionLabel`: the text of the confirming button.
- `title`: the heading of the content dialog.
- `render(state, repo)`: builds the dialog content from the loaded state and the repository it
  was loaded for.

Return values: `requestPanelQuery` returns a disposer (see §A3.2); all others return `undefined`.

`requestRepositoryState` is used directly as a click handler (`<Button
onClick={requestRepositoryState}>` in `RepositoryStatus.tsx`), so it is called with a
`MouseEvent` argument and must ignore any arguments.

### A1.3 Who uses what

| Export                    | Source callers                                                                                                                                                                                                                        | Tests                                                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `repositoryState`         | `lib/actions.ts` (reads remote names), `RefsPane.tsx`, `RefLabel.tsx`, `RepositoryStatus.tsx`                                                                                                                                         | `repository-actions.test.ts`, `actions.test.ts`, `RefsPane.test.ts`, `RefsScale.test.ts`, `RefsTiming.test.ts` (write it directly)                                                        |
| `repositoryStateError`    | `RepositoryStatus.tsx`                                                                                                                                                                                                                | none                                                                                                                                                                                      |
| `repositoryRevision`      | `lib/actions.ts` (`refresh` increments), `workspace-actions.ts` (increments), `use-repository-query.ts` (reads), `WorkflowTools.tsx`, `WorkspacePane.tsx` (increment)                                                                 | `repository-actions.test.ts` (increments), `actions.test.ts` (checks `refresh` increments it)                                                                                             |
| `requestPanelQuery`       | `use-repository-query.ts`, `workspace-actions.ts` (`detached = true`), `HistoryTools.tsx`                                                                                                                                             | `history-tools.test.ts`, `workflows.test.ts`                                                                                                                                              |
| `resetRepositoryState`    | `lib/actions.ts` (`selectRepo`)                                                                                                                                                                                                       | `repository-actions.test.ts`, `actions.test.ts` (in `beforeEach`)                                                                                                                         |
| `requestRepositoryState`  | `lib/actions.ts` (`selectRepo`, `refresh`), `RepositoryStatus.tsx` (Refresh button)                                                                                                                                                   | `repository-actions.test.ts`                                                                                                                                                              |
| `requestRepositoryQuery`  | `RemoteManager.tsx` (`openTracking`), `StashManager.tsx`, `RebaseEditor.tsx`, `HistoryTools.tsx`                                                                                                                                      | via those callers                                                                                                                                                                         |
| `handleRepositoryQuery`   | `lib/dispatcher.ts` (handler for every `repositoryQuery` message)                                                                                                                                                                     | `repository-actions.test.ts`, `history-tools.test.ts`, `workflows.test.ts`, `RefsPane.test.ts`, `WorkingTreeDetails.test.ts`, `WorkingTreeTiming.test.ts` (benchmark, skipped by default) |
| `sendRepositoryAction`    | `remote-actions.tsx`, `RemoteManager.tsx`, `WorkingTreeDetails.tsx`, `StashManager.tsx`, `RebaseEditor.tsx`, `WorktreeManager.tsx`, `BisectView.tsx`, `RepositoryStatus.tsx`, `HistoryTools.tsx`, `file-menu.ts`, `WorkflowTools.tsx` | `history-tools.test.ts`                                                                                                                                                                   |
| `confirmRepositoryAction` | `RemoteManager.tsx`, `StashManager.tsx`, `RebaseEditor.tsx`, `WorktreeManager.tsx`, `BisectView.tsx`, `RepositoryStatus.tsx`, `WorkflowTools.tsx`, `WorkspacePane.tsx`                                                                | `Dialog.test.ts`                                                                                                                                                                          |
| `openRepositoryManager`   | `RemoteManager.tsx` (`openRemotes`), `WorktreeManager.tsx` (`openWorktrees`)                                                                                                                                                          | via `openRemotes` in `repository-actions.test.ts`                                                                                                                                         |

## A2. Dependencies the implementation must use

| Import path                    | Names                                                                                                | Why                                                                                                                                                                                                                                            |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@preact/signals`              | `signal` (and a way to react to store changes, such as `effect`)                                     | The three exported stores; watching `dialog` and `selectedRepo` to abandon dialog-owned reads (§A3.4).                                                                                                                                         |
| `preact`                       | type `ComponentChildren`                                                                             | Types of the confirmation message and of manager content.                                                                                                                                                                                      |
| `@/backend/types`              | types `QueryResult`, `RepositoryAction`, `RepositoryQuery`, `RepositoryQueryData`, `RepositoryState` | Message and data shapes.                                                                                                                                                                                                                       |
| `@/webview/lib/actions`        | `closeDialog`, `openContentDialog`, `openErrorDialog`, `openFormDialog`, `openRunningDialog`         | The only way to show or close dialogs. Never assign `dialog.value` directly.                                                                                                                                                                   |
| `@/webview/lib/remote-actions` | `sendRemoteAction`                                                                                   | Must carry every `repositoryAction`: it records the Git Activity entry, opens the running dialog, remembers the pending action so the answer (handled by `handler/action-result.ts` through `acceptRemoteActionResult`) is matched, and posts. |
| `@/webview/lib/stores`         | `dialog`, `selectedRepo`                                                                             | Current dialog and repository.                                                                                                                                                                                                                 |
| `@/webview/lib/vscode`         | `vscode`                                                                                             | Posting. Several tests replace this module with `vi.mock("@/webview/lib/vscode", ...)`, so every post must go through this export.                                                                                                             |
| `@/webview/types`              | type `DialogState`                                                                                   | Remembering which dialog a read belongs to.                                                                                                                                                                                                    |

Strings: `l10n.loadingRepository` ("Loading repository details"), `l10n.unableToLoadRepository`
("Unable to load repository details"), `l10n.runningGitAction` ("Running Git operation").

## A3. Behaviour

### A3.1 Messages and request ids

The module posts two message shapes and receives one:

- Read: `{ command: "repositoryQuery", repo, requestId, query }`.
- Cancel: `{ command: "cancelRepositoryQuery", repo, requestId }`, with exactly these three
  fields (`workflows.test.ts` and `WorkingTreeDetails.test.ts` compare with `toEqual` /
  `toHaveBeenCalledWith`). `repo` is the repository the read was posted for. The extension aborts
  the read and then sends no answer at all.
- Answer (to `handleRepositoryQuery`): `{ repo, requestId, data, status }`. On failure the
  extension sends `data: null` and the message in `status`.
- Actions are posted by `sendRemoteAction` as
  `{ command: "repositoryAction", requestId, action, repo }`.

Request ids are strings with a prefix naming the kind of request followed by a number:

| Prefix               | Used for                 |
| -------------------- | ------------------------ |
| `repository-panel-`  | `requestPanelQuery`      |
| `repository-state-`  | `requestRepositoryState` |
| `repository-query-`  | `requestRepositoryQuery` |
| `repository-action-` | `sendRepositoryAction`   |

Ids must be unique for the life of the page and must not collide with ids made by other modules
(`action-<n>`, `remote-<n>`, `workspace-action-<n>`, `graph-<n>`), because Git Activity and
`remote-actions` key their records by request id and the extension keys cancellation by it.
Currently one counter serves all four prefixes: it starts at 1 when the module is loaded and
increases by one for each id made, so a number never appears under two prefixes. Nothing reads
the numbers themselves; tests take the id from the posted message.

### A3.2 Panel reads: `requestPanelQuery`

For components that stay on screen and read repository details for themselves (the refs pane's
stash list, the working-tree list, history panels, workflow panels, workspace sync).

- No repository (the `repo` argument resolves to `undefined`): nothing is posted and a disposer
  that does nothing is returned.
- Otherwise: posts the read with a new `repository-panel-<n>` id and returns a disposer. The
  subscription remembers the target repository, whether it is detached, and which repository
  was selected when the call was made (call it the "originally shown repository"; it may differ from the target,
  for example a submodule's parent read while the child is shown).
- Answer arrives: the subscription ends (it never receives a second answer). `receive(data,
status)` is called once, synchronously, only if the answer's `repo` equals the target
  repository and either the subscription is detached or the selected repository is still the
  originally shown repository. Otherwise the answer is dropped silently.
- The answer is routed to the subscription regardless of which repository is selected; the
  selected-repository rule above is the only filter.
- Disposer: if the subscription is still waiting, it ends it and posts
  `{ command: "cancelRepositoryQuery", repo: <target>, requestId }`. After an answer, or on a
  second call, it does nothing (no message).
- Panel reads are not tied to dialogs: opening, replacing or closing a dialog does not affect
  them, and neither does changing the selected repository (the owner disposes them).

### A3.3 The repository state: `requestRepositoryState`, `resetRepositoryState`, `repositoryState`, `repositoryStateError`

- `requestRepositoryState()`: if no repository is selected, does nothing. Otherwise, if a state
  read is still outstanding it is cancelled first (posting `cancelRepositoryQuery` with that
  read's own repository and id), then a new read
  `{ command: "repositoryQuery", repo: <selected>, requestId: "repository-state-<n>", query: { kind: "state" } }`
  is posted. The stores are **not** cleared while the new read is pending; the previous state
  stays on screen.
- `resetRepositoryState()`: cancels an outstanding state read (as above), then sets
  `repositoryState` and `repositoryStateError` to `null` and forgets the read. With nothing
  outstanding it posts nothing. `selectRepo` calls it when the user switches repositories.
- Answer handling, for the current state read only:
  - The answer's `repo` must equal the selected repository at the time it arrives; otherwise it
    is ignored entirely (and the read still counts as outstanding, see Q1).
  - An answer carrying an older, superseded state id is ignored.
  - Accepted answer: the read is no longer outstanding; `repositoryStateError` becomes `status`
    (a string or `null`); `repositoryState` becomes `data.state` when `data` is
    `{ kind: "state", ... }`, else `null`. So a failure shows `null` state with the message, and
    a success shows the state with no message.
- Once an answer has been accepted (success or failure), later calls post no cancel for it.

### A3.4 Dialog-owned reads: `requestRepositoryQuery`

For reads the user waits for behind a loading dialog, whose result opens a dialog (the remote
and worktree managers, the stash manager, the upstream picker, the rebase plan, restore and fixup
previews, batch plans).

- If `repo` resolves to `undefined`, or is not the selected repository, nothing happens: no
  dialog, no message.
- Otherwise, in this order: opens the running dialog with message `l10n.loadingRepository` (no
  detail, no Cancel button); records the read as belonging to that running dialog (the dialog
  object now in the store) and to `repo`; posts the read with a new `repository-query-<n>` id.
- At most one dialog-owned read is outstanding. Opening the new running dialog replaces the old
  dialog, which abandons any earlier dialog-owned read (next point), so the earlier read is
  cancelled before the new one is posted.
- Abandonment: whenever the dialog store changes, or the selected repository changes, each
  outstanding dialog-owned read whose dialog is no longer the one in the store, or whose
  repository is no longer the selected one, is forgotten and
  `{ command: "cancelRepositoryQuery", repo, requestId }` is posted for it. This happens
  synchronously as part of the store change. It covers the user pressing Escape or clicking the
  backdrop, another dialog opening, and switching repository.
- Answer:
  - For a repository other than the selected one: the read is forgotten, nothing else happens.
  - For a read that is no longer outstanding, for a different repository than it was posted for,
    or when the dialog in the store is no longer the read's running dialog: ignored, and the
    current dialog stays (`repository-actions.test.ts`: "keeps a newer dialog when a repository
    query completes late").
  - `status !== null` or `data === null`: `openErrorDialog(l10n.unableToLoadRepository, status)`
    (the reason is `null` when `status` was `null`). The callback is not called.
  - Success: `closeDialog()` first (which also returns focus to where it was before the loading
    dialog), then `callback(data)` synchronously. The callback usually opens the next dialog.
    If it opens nothing, the page is left with no dialog.

### A3.5 Routing: `handleRepositoryQuery`

Every `repositoryQuery` answer from the extension comes here (the dispatcher and many tests call
it directly). Ids are unique across the three read kinds, so each answer belongs to at most one
of: a panel subscription (§A3.2), the current state read (§A3.3), a dialog-owned read (§A3.4).
Panel answers are handled whatever the selected repository; the other two kinds are dropped when
the answer's `repo` is not the selected repository. An answer whose id matches nothing is ignored.
The function never throws for unknown ids and never posts anything.

### A3.6 Actions: `sendRepositoryAction`

- If `repo` resolves to `undefined`: nothing.
- Otherwise it calls
  `sendRemoteAction({ command: "repositoryAction", requestId: "repository-action-<n>", action }, repo, l10n.runningGitAction, { background, otherRepo })`
  with both option flags always present as booleans:

  | `action.kind`         | `background` | `otherRepo` |
  | --------------------- | ------------ | ----------- |
  | `viewWorkingTreeFile` | true         | false       |
  | `previewFileRestore`  | true         | false       |
  | `viewRangeFile`       | true         | true        |
  | `viewHistoricalFile`  | true         | true        |
  | `submodule`           | false        | true        |
  | `submodulePointer`    | false        | true        |
  | every other kind      | false        | false       |

  No `mutates` or `onComplete` option is passed.

What callers then observe (behaviour of `sendRemoteAction`, `activity.ts` and
`handler/action-result.ts`, listed so the effect of the flags is clear):

- `otherRepo: false` and `repo` is not the selected repository (or nothing is selected): the
  current dialog is closed and nothing is posted or recorded.
- Otherwise a Git Activity entry keyed by the request id is added, and the message
  `{ command: "repositoryAction", requestId, action, repo }` is posted.
- `background: false`: a running dialog opens, titled from the action kind (for example
  `addRemote` → "Add Remote", `pushDefault` → "Default Push Remote", `setTracking` →
  "Configure Upstream"; `l10n.runningGitAction` is the fallback), with the repository and the
  action's `remote`/`name`/`path`/... values as detail, and a Cancel button for actions that use
  the network (`fetch`, `deleteRemoteRef`, `addRemote` with `fetch: true`, `sync` push). On the
  answer the page refreshes, and the running dialog closes on success or becomes the error
  dialog "Unable to complete Git operation" with Git's message.
- `background: true`: no dialog opens and the current dialog stays; the page is not refreshed
  on completion; a failure is shown as an error dialog only if the same repository and dialog
  are still showing, otherwise it is marked unseen in Git Activity.

### A3.7 Confirmation: `confirmRepositoryAction`

Opens a yes/no form through `openFormDialog` with: `message`; no inputs; `action: actionLabel`;
`source: null`; `destructive` as in the table below; and a submit handler that calls
`sendRepositoryAction(action, repo)` with the `repo` resolved when the confirmation was opened
(not when it is submitted). `openFormDialog` itself drops the submission and closes the dialog if
the selected repository changed meanwhile. The dialog opens even when no repository is selected
(submitting then does nothing).

`destructive: true` makes the Dialog start with focus on Cancel. It is true exactly for:

| `action.kind`     | Destructive when                                   |
| ----------------- | -------------------------------------------------- |
| `removeRemote`    | always                                             |
| `removeWorktree`  | always                                             |
| `deleteRemoteRef` | always                                             |
| `cleanup`         | always                                             |
| `stash`           | `operation === "drop"`                             |
| `recover`         | `resolution !== "continue"` (i.e. `abort`, `skip`) |
| `bisectMark`      | `mark === "reset"`                                 |
| any other kind    | never                                              |

### A3.8 Managers: `openRepositoryManager`

- No selected repository: nothing.
- Otherwise: a dialog-owned read (§A3.4) of `{ kind: "state" }` for the selected repository.
  On success, if the data is `{ kind: "state", state }`, opens
  `openContentDialog(title, render(state, repo))` (not wide), where `repo` is the repository
  selected when the manager was requested. Data of another kind leaves no dialog open.
- This read does not touch `repositoryState` or `repositoryStateError`.

### A3.9 Timing, events and disposal

- No timers, debouncing or timeouts. Every function acts synchronously; answers arrive whenever
  the extension sends them.
- The only long-lived subscription is the watch on `dialog` and `selectedRepo` (§A3.4); it lives
  as long as the page and is never disposed.
- Panel subscriptions are disposed by their owners through the returned function.

### A3.10 What the extension does with these messages (orientation only)

This module runs no Git itself. The extension (`messageHandler.ts`) answers `repositoryQuery` by
running the backend query for `query.kind` in `repo`, and posts
`{ command: "repositoryQuery", repo, requestId, data, status }` unless the read was aborted by a
`cancelRepositoryQuery` with the same `repo` and `requestId`, in which case it posts nothing. A
state read may also make the extension post a `repoState` message first (hidden-remote pruning).

## A4. Concrete examples

All start from a freshly loaded module, `selectedRepo = "/repo"`, no dialog, and the test
localisation proxy. `S` is a `RepositoryState`.

1. `requestRepositoryState()` posts
   `{ command: "repositoryQuery", repo: "/repo", requestId: "repository-state-1", query: { kind: "state" } }`.
   `handleRepositoryQuery({ repo: "/repo", requestId: "repository-state-1", data: null, status: "bad" })`
   leaves `repositoryState = null`, `repositoryStateError = "bad"`.
2. Then `requestRepositoryState()` posts only the new read `repository-state-2` (the first was
   answered, so no cancel). Answering it with `{ kind: "state", state: S }` gives
   `repositoryState = S`, `repositoryStateError = null`.
3. `requestRepositoryState()` twice in a row: the second call posts
   `{ command: "cancelRepositoryQuery", repo: "/repo", requestId: <first id> }` then the new read.
   An answer to the first id afterwards changes nothing.
4. With a state read outstanding, `resetRepositoryState()` posts
   `{ command: "cancelRepositoryQuery", repo: "/repo", requestId: <its id> }` and sets both
   stores to `null`.
5. `requestRepositoryState()`, then `selectedRepo = "/x"`, then the answer for `/repo` arrives:
   nothing changes. Back on `/repo`, the next `requestRepositoryState()` posts a cancel for the
   old id, then a new read.
6. `const stop = requestPanelQuery({ kind: "stashes" }, cb)` posts
   `{ command: "repositoryQuery", repo: "/repo", requestId: "repository-panel-<n>", query: { kind: "stashes" } }`.
   `stop()` posts `{ command: "cancelRepositoryQuery", repo: "/repo", requestId: "repository-panel-<n>" }`;
   a later answer is not delivered. Had the answer `{ data: null, status: "err" }` come first,
   `cb(null, "err")` would have been called once and `stop()` would post nothing.
7. `requestPanelQuery({ kind: "cleanupPlan" }, cb, "/parent")` while `/repo` is selected: the read
   goes to `/parent`; its answer `{ repo: "/parent", ... }` reaches `cb` while `/repo` stays
   selected. If `/elsewhere` were selected before the answer, `cb` would not be called — unless
   the call passed `detached = true`.
8. `requestRepositoryQuery({ kind: "state" }, cb)`: dialog becomes
   `{ kind: "running", message: "loadingRepository", token }`; posts
   `{ command: "repositoryQuery", repo: "/repo", requestId: "repository-query-<n>", query: { kind: "state" } }`.
   `closeDialog()` then posts `{ command: "cancelRepositoryQuery", repo: "/repo", requestId: "repository-query-<n>" }`.
   Calling `requestRepositoryQuery` again instead posts the cancel for the first id and then the
   second read.
9. Answer to (8) with `{ data: null, status: "boom" }`: dialog becomes
   `{ kind: "error", message: "unableToLoadRepository", reason: "boom", token }`; `cb` not called.
   With `{ data: null, status: null }`: the same with `reason: null`.
10. `requestRepositoryQuery({ kind: "state" }, cb, "/elsewhere")` while `/repo` is selected:
    nothing posted, no dialog.
11. `sendRepositoryAction({ kind: "viewHistoricalFile", hash: "h", path: "p" }, "/other")` while
    `/repo` is selected and no dialog is open: posts
    `{ command: "repositoryAction", requestId: "repository-action-<n>", action: { kind: "viewHistoricalFile", hash: "h", path: "p" }, repo: "/other" }`;
    the dialog stays `null`.
12. `sendRepositoryAction({ kind: "removeRemote", name: "x" }, "/other")` while an error dialog is
    open for `/repo`: nothing posted; the dialog becomes `null`.
13. `sendRepositoryAction({ kind: "fetch", remote: null })`: posts the action for `/repo`; dialog
    is a running dialog titled `"fetch"` with detail `"/repo"` and an `onCancel`.
14. `confirmRepositoryAction("Remove?", "Remove Remote", { kind: "removeRemote", name: "origin" })`:
    dialog is `{ kind: "form", message: "Remove?", inputs: [], action: "Remove Remote", source: null, destructive: true, onSubmit, token }`;
    `onSubmit([])` posts `{ command: "repositoryAction", requestId: ..., action: { kind: "removeRemote", name: "origin" }, repo: "/repo" }`.
15. `openRepositoryManager("Remotes", render)`: running dialog and a state read; the answer
    `{ kind: "state", state: S }` gives `{ kind: "content", message: "Remotes", content: render(S, "/repo"), wide: false, token }`.
    An answer `{ kind: "stashes", stashes: [] }` leaves `dialog = null`.
16. With `selectedRepo = undefined`: `requestRepositoryState()`, `requestPanelQuery(...)` (and its
    disposer), `sendRepositoryAction(...)`, `openRepositoryManager(...)` post nothing and open
    nothing.

## A5. Non-functional requirements

- Import-time: creates the three stores and starts watching `dialog` and `selectedRepo`. It must
  not read `window.l10n` or the webview configuration, post anything, or call any function
  imported from `lib/actions.ts`, `lib/remote-actions.tsx` or their dependants. The module is in
  import cycles (`actions.ts` ↔ this module; `remote-actions.tsx` ↔ this module; also through
  `workspace-actions.ts`, `use-repository-query.ts`, `WorkflowTools.tsx`, `HistoryTools.tsx`),
  so, depending on load order, those modules may not have run yet when this module's top level
  runs. Reading the stores of `lib/stores.ts` at import is safe (it depends on nothing in the
  cycle).
- Store identity: the three exported signals are created once and never replaced. Never assign
  `dialog.value` or change a dialog object; use the openers and `closeDialog`.
- Holds no browser storage and no DOM listeners.
- Memory: finished, cancelled and abandoned reads must be forgotten; nothing grows with the number
  of requests made.
- Performance: every operation is constant time apart from the abandonment check, which looks at
  the (at most one) outstanding dialog-owned read.
- All posting goes through `@/webview/lib/vscode`'s `vscode` (mocked by tests); all actions go
  through `sendRemoteAction` (Git Activity and result matching depend on it).
- The file is `.tsx` but renders nothing itself; it only passes content through.

## A6. Test coverage

Already checked by existing tests:

- `tests/webview/lib/repository-actions.test.ts`: a manager opened from a state read
  (`openRemotes`) renders inside the Dialog and its buttons work; a late dialog-owned answer does
  not replace a newer dialog; a superseded state answer and a state answer for a previously
  selected repository leave `repositoryState` `null`; confirmation submissions post the bound
  action (`stash` drop, `recover` abort); `repositoryRevision.value++` makes panel reads read
  again while keeping the rendered review and its focus.
- `tests/webview/lib/history-tools.test.ts`: two panel reads are independent; a disposed read's
  answer and an answer after a repository switch are not delivered; `viewRangeFile` leaves the
  open content dialog in place; `previewFileRestore` runs without a running dialog; a `submodule`
  action is posted for the parent while the child stays selected, and its answer closes the
  running dialog; a `recoverBranch` failure after the dialog was replaced keeps the newer dialog.
- `tests/webview/lib/workflows.test.ts`: the disposer posts the exact cancel message; a read bound
  to another repository is delivered while the view is unchanged; detached reads survive a
  repository switch; `submodulePointer` goes to the parent.
- `tests/webview/components/ui/Dialog.test.ts`: the destructive classification for `stash`
  drop/pop, `removeRemote`, `removeWorktree`, `deleteRemoteRef`, `recover` abort/skip/continue,
  `bisectMark` reset/good, `cleanup`.
- `tests/webview/components/commit/WorkingTreeDetails.test.ts`: panel read answers (data and
  error) reach the working-tree list; closing it posts the exact cancel message;
  `viewWorkingTreeFile` posts without a dialog.
- `tests/webview/components/repository/RefsPane.test.ts`: a panel read's answer reaches the refs
  pane.
- `tests/webview/lib/actions.test.ts`: `refresh` and `selectRepo` post a `{ kind: "state" }` read
  (it filters out cancel messages).

Not checked (gaps), each as setup → call → expected:

1. State success. Setup: `/repo` selected, `requestRepositoryState()`. Call: answer
   `{ data: { kind: "state", state: S }, status: null }` with that id. Expect
   `repositoryState.value === S`, `repositoryStateError.value === null`.
2. State failure. Setup: as 1, with `repositoryState.value = S` beforehand. Call: answer
   `{ data: null, status: "bad" }`. Expect state `null`, error `"bad"`.
3. State kept while refreshing. Setup: `repositoryState.value = S`. Call:
   `requestRepositoryState()`. Expect `repositoryState.value === S` before any answer.
4. Superseding posts a cancel. Setup: `requestRepositoryState()` (id A). Call: again. Expect the
   posted messages to end with cancel `{ repo: "/repo", requestId: A }` then a new read.
5. Reset. Setup: a state read outstanding (id A) and `repositoryState.value = S`,
   `repositoryStateError.value = "e"`. Call: `resetRepositoryState()`. Expect one cancel for A,
   both stores `null`; a second `resetRepositoryState()` posts nothing.
6. No repository. Setup: `selectedRepo.value = undefined`. Call each of
   `requestRepositoryState()`, `requestPanelQuery(q, cb)()`, `sendRepositoryAction(a)`,
   `openRepositoryManager("t", render)`, `requestRepositoryQuery(q, cb)`. Expect no posts and
   `dialog.value === null`.
7. Loading dialog. Call: `requestRepositoryQuery({ kind: "stashes" }, cb)`. Expect
   `dialog.value` to match `{ kind: "running", message: "loadingRepository" }` and a read with a
   `repository-query-` id.
8. Abandoning on dialog change. Setup: as 7 (id Q). Call: `closeDialog()`. Expect cancel
   `{ command: "cancelRepositoryQuery", repo: "/repo", requestId: Q }` posted immediately; a
   later answer for Q does not call `cb` and leaves `dialog.value === null`.
9. Abandoning on repository change with the dialog unchanged. Setup: as 7. Call:
   `selectedRepo.value = "/other"`. Expect the cancel for Q.
10. Query failure dialog. Setup: as 7. Call: answer `{ data: null, status: "boom" }`. Expect
    `dialog.value` to match `{ kind: "error", message: "unableToLoadRepository", reason: "boom" }`
    and `cb` not called.
11. Wrong repository for a dialog-owned read. Call:
    `requestRepositoryQuery(q, cb, "/elsewhere")` with `/repo` selected. Expect no post, no
    dialog.
12. Panel disposer idempotence. Setup: `stop = requestPanelQuery(q, cb)`; answer it. Call:
    `stop(); stop();`. Expect no cancel posted; `cb` called once.
13. Panel reads ignore dialogs. Setup: `requestPanelQuery(q, cb)`. Call: `openErrorDialog("x");
closeDialog();` then answer. Expect no cancel posted and `cb` called once.
14. Request id prefixes. Call each of the four request-making functions. Expect ids matching
    `/^repository-(panel|state|query|action)-\d+$/` respectively, all distinct.
15. `openRepositoryManager` with the wrong data kind. Setup: `openRepositoryManager("t", render)`.
    Call: answer `{ kind: "stashes", stashes: [] }`. Expect `render` not called and
    `dialog.value === null`.
16. Non-`otherRepo` action for another repository. Setup: `/repo` selected, an error dialog open.
    Call: `sendRepositoryAction({ kind: "removeRemote", name: "x" }, "/other")`. Expect no post
    and `dialog.value === null`.
17. `viewHistoricalFile` for another repository. Call:
    `sendRepositoryAction({ kind: "viewHistoricalFile", hash: "h", path: "p" }, "/other")`.
    Expect a post with `repo: "/other"` and the dialog unchanged.
18. Remaining destructive rows. Call `confirmRepositoryAction` with `stash` apply and inspect,
    `bisectMark` bad and skip, and `rebase`. Expect `destructive: false` for each.
19. Confirmation binds the repository at open time. Setup: `confirmRepositoryAction(m, l, a,
"/repo")`. Call: `form.onSubmit([])`. Expect the action posted with `repo: "/repo"`.

## A7. Questions

- **repository-actions Q1.** A state answer that arrives for a repository that is no longer
  selected is ignored but the read is still treated as outstanding, so the next
  `requestRepositoryState()` or `resetRepositoryState()` posts a cancel for a read the extension
  already answered. Harmless today; possibly the read was meant to be forgotten.
- **repository-actions Q2.** A panel answer whose `repo` differs from the read's target ends the
  subscription without calling `receive`; the owner then never hears back (a
  `useRepositoryQuery` panel would stay "loading") and its disposer posts nothing. Only a
  misbehaving extension would send such an answer. Intended: ignore it and keep waiting, or
  deliver it as an error?
- **repository-actions Q3.** For a non-detached panel read made with an explicit `repo` while no
  repository is selected, the originally shown repository is "none", so the answer is delivered only if
  still nothing is selected. Probably unintended but unreachable today.
- **repository-actions Q4.** If `requestRepositoryQuery` is called inside an outer
  `batch(...)`, the store watcher runs only after the batch, and the earlier dialog-owned read is
  dropped without a cancel message. No caller does this today.
- **repository-actions Q5.** A dialog-owned answer with `status: null` and `data: null` shows the
  failure dialog with no reason. Intended, or should it be treated differently?
- **repository-actions Q6.** A state answer with `status: null` and data of another kind leaves
  both stores `null`, which looks like "not loaded" (the status bar shows nothing).
- **repository-actions Q7.** The two state stores are written one after the other, not in one
  batch, so a subscriber can be notified between the two writes (error updated, state not yet).
  Intended to be atomic?
- **repository-actions Q8.** `sendRepositoryAction` for a repository other than the selected one,
  with a kind not in the `otherRepo` list, closes whatever dialog is showing (even an unrelated
  newer one) and silently sends nothing; no Git Activity entry, no message to the user.
- **repository-actions Q9.** The destructive list is fixed: `rebase` (confirmed through this
  function by `RebaseEditor.openRebase`) and `submodule` actions (confirmed by `WorkspacePane`)
  rewrite history or move checkouts but start with focus on the confirming button. Is that
  intended?

---

# Part B. `src/webview/components/repository/RemoteManager.tsx`

## B1. Interface

Module path: `src/webview/components/repository/RemoteManager.tsx` (imported as
`@/webview/components/repository/RemoteManager`).

```ts
function addRemote(repo: string): void;
function editRemote(remote: RemoteDetails, repo: string): void;
function renameRemote(remote: RemoteDetails, repo: string): void;
function removeRemote(remote: RemoteDetails, repo: string): void;
function remoteMenu(remote: RemoteDetails, repo: string): Array<ContextMenuEntry>;
function RemoteManager(props: { state: RepositoryState; repo: string }): JSX.Element; // Preact component
function openRemotes(): void;
function openTracking(branch: string): void;
```

- `repo`: the repository the resulting action is sent for (passed to `sendRepositoryAction`).
- `remote`: `RemoteDetails = { name: string; fetchUrls: string[]; pushUrls: string[] }` from
  `@/backend/types`: the remote's name and its configured `remote.<name>.url` and
  `remote.<name>.pushurl` values in order.
- `state`: a `RepositoryState` (see §A1.1); the component uses `remotes` and `pushDefault`.
- `branch`: the short name of a local branch (no `refs/heads/`).
- `ContextMenuEntry` (from `@/webview/types`) is `{ title: string; onClick: () => void } | null`,
  `null` being a divider.
- `openRemotes` is used as a context-menu `onClick` and must ignore arguments.

Who uses what:

| Export                                                        | Source callers                                                                                                  | Tests                                                                                   |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `addRemote`                                                   | `RefsPane.tsx` (the "+" button in the remotes section header)                                                   | reached through the manager in `repository-actions.test.ts`                             |
| `remoteMenu`                                                  | `RefsPane.tsx` (the per-remote actions button, source key `remote:<name>`)                                      | UI test `tests-ext/ui/history.test.cjs` (menu items "Rename Remote…", "Remove Remote…") |
| `openRemotes`                                                 | `layout/MainHeader.tsx` (Settings & Tools menu entry "Remotes"), `remoteMenu`                                   | `repository-actions.test.ts`; UI test (`button("Remotes")`)                             |
| `openTracking`                                                | `lib/menus.tsx` (local-branch menu "Configure Upstream…"), `RepositoryStatus.tsx` ("Configure Upstream" button) | `repository-actions.test.ts`, `menu-actions.test.ts`; UI test                           |
| `editRemote`, `renameRemote`, `removeRemote`, `RemoteManager` | only this module                                                                                                | none directly                                                                           |

Keep all eight exports with these names and signatures.

## B2. Dependencies the implementation must use

| Import path                          | Names                                                                                                | Why                                                               |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `@/webview/lib/repository-actions`   | `confirmRepositoryAction`, `openRepositoryManager`, `requestRepositoryQuery`, `sendRepositoryAction` | Loading state, confirming and sending actions (Part A).           |
| `@/webview/lib/actions`              | `openFormDialog`                                                                                     | The add, edit, rename and upstream forms.                         |
| `@/webview/lib/remote-actions`       | `openRemoteAction`                                                                                   | The menu's Fetch entry.                                           |
| `@/webview/lib/stores`               | `selectedRepo`                                                                                       | The repository for `openTracking`.                                |
| `@/webview/components/ui/Button`     | `Button`                                                                                             | Every button in the manager (default variant, `type="button"`).   |
| `@/webview/components/ui/Select`     | `Select`                                                                                             | The default-push-remote choice.                                   |
| `@/webview/utils/format`             | `format`                                                                                             | Placing the bold remote name into the localised removal question. |
| `preact/hooks` (or equivalent)       | component-local state                                                                                | The push-default choice inside the manager.                       |
| `@/backend/types`, `@/webview/types` | types `RemoteDetails`, `RepositoryState`; `ContextMenuEntry`                                         | Signatures.                                                       |

User-visible text must come from `window.l10n` (the repository's `oxlint/webview-text.cjs` rule
rejects hard-coded words in webview JSX). Keys and English values used:

| Key                   | English                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| `manageRemotes`       | Remotes                                                                                                 |
| `addRemote`           | Add Remote                                                                                              |
| `editRemote`          | Edit URLs                                                                                               |
| `renameRemote`        | Rename Remote                                                                                           |
| `removeRemote`        | Remove Remote                                                                                           |
| `fetch`               | Fetch                                                                                                   |
| `dialogAddTagName`    | Name                                                                                                    |
| `remoteUrl`           | URL                                                                                                     |
| `fetchAfterAdding`    | Fetch after adding                                                                                      |
| `fetchUrls`           | Fetch URLs (one per line)                                                                               |
| `pushUrls`            | Push URLs (blank uses fetch URLs)                                                                       |
| `save`                | Save                                                                                                    |
| `removeRemoteConfirm` | Remove remote {0} and its remote-tracking references? The remote server and local branches will remain. |
| `defaultPushRemote`   | Default Push Remote                                                                                     |
| `defaultSetting`      | Use Git default                                                                                         |
| `configureUpstream`   | Configure Upstream                                                                                      |
| `upstreamBranch`      | Upstream Branch                                                                                         |
| `none`                | None                                                                                                    |

## B3. Behaviour

The forms below are shown by the shared Dialog; two of its rules matter here: a `ref` input
blocks submission while it is empty or holds characters Git forbids in ref names, and the Dialog
closes itself before calling the submit handler. `openFormDialog` also drops a submission (and
closes) when the selected repository changed after the form opened. None of the forms below is
destructive unless stated.

### B3.1 `addRemote(repo)`

Opens a form:

- message: `l10n.addRemote`; action (submit label): `l10n.addRemote`; source: `null`.
- inputs, in this order:
  1. `{ kind: "ref", label: l10n.dialogAddTagName, value: "" }` (the remote name);
  2. `{ kind: "text", label: l10n.remoteUrl, value: "" }`;
  3. `{ kind: "checkbox", label: l10n.fetchAfterAdding, value: true }`.
- submit `[name, url, fetch]` → `sendRepositoryAction({ kind: "addRemote", name, url, fetch }, repo)`,
  values passed as entered (not trimmed).

The UI test fills the two text inputs of the dialog in order (name, then URL) and relies on the
fetch box being ticked by default.

### B3.2 `editRemote(remote, repo)`

Opens a form:

- message: `l10n.editRemote`, then `": "`, then the remote name in a `<b>` (English:
  "Edit URLs: **origin**"); action: `l10n.save`; source: `null`.
- inputs:
  1. `{ kind: "textarea", label: l10n.fetchUrls, value: remote.fetchUrls joined with "\n" }`;
  2. `{ kind: "textarea", label: l10n.pushUrls, value: remote.pushUrls joined with "\n" }`.
- submit `[fetchText, pushText]` →
  `sendRepositoryAction({ kind: "editRemote", name: remote.name, fetchUrls, pushUrls }, repo)`
  where each list is its text split at line breaks (`\n` or `\r\n`), each line trimmed of
  surrounding whitespace, empty lines dropped, order and duplicates kept. The form does not
  prevent an empty fetch list (the backend rejects it).

### B3.3 `renameRemote(remote, repo)`

Opens a form:

- message: `l10n.renameRemote`; action: `l10n.renameRemote`; source: `null`.
- inputs: `[{ kind: "ref", value: remote.name }]`, with **no** `label` (the Dialog names the field
  by the message).
- submit `[newName]` → `sendRepositoryAction({ kind: "renameRemote", name: remote.name, newName }, repo)`.
  An unchanged name is sent as well.

### B3.4 `removeRemote(remote, repo)`

`confirmRepositoryAction(message, l10n.removeRemote, { kind: "removeRemote", name: remote.name }, repo)`
where `message` is `l10n.removeRemoteConfirm` with `{0}` replaced by the name in a `<b>` element
(via `format`). The confirmation is destructive (focus starts on Cancel). Submitting sends the
action.

### B3.5 `remoteMenu(remote, repo)`

Returns a new array of six entries, in order:

| #   | `title`                            | On click                                                                                                                                        |
| --- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `` `${l10n.fetch}…` `` ("Fetch…")  | `openRemoteAction("fetch", "", remote.name + "/")`: the fetch dialog of `remote-actions`, preselecting this remote, for the selected repository |
| 2   | `` `${l10n.editRemote}…` ``        | `editRemote(remote, repo)`                                                                                                                      |
| 3   | `` `${l10n.renameRemote}…` ``      | `renameRemote(remote, repo)`                                                                                                                    |
| 4   | `` `${l10n.removeRemote}…` ``      | `removeRemote(remote, repo)`                                                                                                                    |
| 5   | `null` (divider)                   | —                                                                                                                                               |
| 6   | `l10n.manageRemotes` (no ellipsis) | `openRemotes()`                                                                                                                                 |

The ellipsis is the single character U+2026 appended directly to the label. The UI test clicks
the menu items whose trimmed text is exactly "Rename Remote…" and "Remove Remote…".

### B3.6 `openRemotes()`

Calls `openRepositoryManager` with the title `l10n.manageRemotes` and a render function that returns the `RemoteManager` component for the given state and repository:
a loading dialog, then a content dialog titled "Remotes" (not wide) holding the manager for the
repository selected when it was opened. Nothing happens when no repository is selected.

### B3.7 `RemoteManager({ state, repo })`

A snapshot of `state` taken when the dialog opened. Rendering is pure apart from the push-default
choice, which is local state initialised from `state.pushDefault ?? ""` on first render and not
reset by later renders.

Rendered contract, in document order (all inside the content dialog, which centres text; this
root restores left alignment):

1. A root `div`.
2. First child: a `button` (the shared `Button`, default variant, `type="button"`) whose text
   content is exactly `l10n.addRemote`. Click → `addRemote(repo)`. It must be the first focusable
   control and there must be no text input before it: the Dialog focuses it when the manager
   opens.
3. One block per entry of `state.remotes`, in the given order. Each block is a `div` containing,
   in order:
   - a `b` with the remote's name;
   - a `p` whose text is `fetchUrls` joined with `"\n"` (always present, empty when there are
     none);
   - only when `pushUrls` is not empty: a `p` whose text is `l10n.pushUrls`, `": "`, and
     `pushUrls` joined with `"\n"` (English: "Push URLs (blank uses fetch URLs): ssh://…");
   - a `div` holding three `button`s (shared `Button`, default variant) with text content exactly
     `l10n.editRemote`, `l10n.renameRemote`, `l10n.removeRemote`, in that order, calling
     `editRemote(remote, repo)`, `renameRemote(remote, repo)`, `removeRemote(remote, repo)`.
4. A `label` element containing the text `l10n.defaultPushRemote` followed by the shared `Select`
   (which renders a `select` with no `id` or `aria-label` here; the enclosing label names it).
   Options, in order: `{ label: l10n.defaultSetting, value: "" }`, then one
   `{ label: name, value: name }` per remote in `state.remotes` order. Its value is the local
   choice; changing it updates the choice only.
5. A final `button` (shared `Button`, default variant) with text content exactly `l10n.save`.
   Click → `sendRepositoryAction({ kind: "pushDefault", remote: choice || null }, repo)`: the
   empty choice sends `null` (use Git's default), anything else the remote's name. It is sent
   even when unchanged.

With no remotes the manager is just the Add Remote button, the label with a one-option select,
and Save (`repository-actions.test.ts` opens this empty manager and clicks "addRemote").

Button text must be the label and nothing else (no icons, no extra whitespace): tests find
buttons by `textContent === label`, and the UI test by trimmed text within `[role=dialog]`. No
test, UI test, harness script or stylesheet selects on any class name, `id` or `data-*` attribute
of this component, and it renders none that others rely on; it uses no ARIA attributes of its own.

Look, in words:

- Root: children stacked vertically with 0.75rem between them; text left-aligned.
- Remote block: children stacked with 0.5rem between them; 0.5rem padding; a 1px solid border in
  the theme's line colour (`--color-line`, half-transparent grey) with 0.25rem rounded corners.
- URL paragraphs: line breaks and spaces preserved, long URLs broken at any character so nothing
  overflows the dialog, and text selectable (user-select: text) so URLs can be copied.
- The three per-remote buttons sit in a row that wraps, 0.5rem apart.
- The label is block-level; the select fills the width (the `Select` component's own styling:
  dropdown colours `--vscode-dropdown-background` / `--vscode-dropdown-foreground`, input border
  colour, focus outline in `--vscode-focusBorder`).
- Buttons keep the shared `Button` look (grey translucent background, line-coloured border, hover
  darkening, focus outline in `--vscode-focusBorder`); no extra classes.

### B3.8 `openTracking(branch)`

- No selected repository: nothing.
- Otherwise a dialog-owned read (`requestRepositoryQuery({ kind: "state" }, ..., repo)`, §A3.4)
  for the selected repository `repo`. The request is observable in `menu-actions.test.ts` as
  `{ command: "repositoryQuery", repo: "/repo", query: { kind: "state" } }`.
- On an answer of kind `state` (other kinds: nothing opens):
  - The branch's current upstream is the `upstream` of the `state.branches` entry named `branch`
    (a short name such as `origin/main` or, for a local upstream, `main`; `""` when none), or
    `""` when the branch is not in the list.
  - Options, in order:
    1. `{ label: l10n.none, value: "" }`;
    2. for each `state.remoteBranches` entry, in order: `{ label: name, value: "refs/remotes/" + name }`
       (all remote-tracking refs, including those of remotes hidden from the graph; symbolic
       refs such as `origin/HEAD` are already absent from the state);
    3. for each `state.branches` entry except `branch` itself, in order:
       `{ label: name, value: "refs/heads/" + name }`.
  - Preselected value: the `value` of the first option whose `label` equals the current upstream
    string, or `""` when none matches (so a gone upstream, whose remote ref no longer exists,
    preselects None).
  - Opens a form: message `l10n.configureUpstream`, `": "`, and the branch name in a `<b>`
    (English "Configure Upstream: **main**"); inputs
    `[{ kind: "select", label: l10n.upstreamBranch, value: <preselected>, options }]`; action
    `l10n.save`; source `` `ref:head:${branch}` `` (the branch's ref label highlights itself while
    the form is open).
  - Submit `[ref]`:
    - `ref === ""` and the current upstream was `""`: nothing is sent.
    - otherwise `sendRepositoryAction({ kind: "setTracking", branch, upstream: ref || null }, repo)`:
      `null` removes the upstream, a full ref name sets it.

### B3.9 What the extension does with these actions (orientation only)

This module runs no Git. The backend (`src/backend/actions/remotes.ts`) validates and then runs:

| Action         | Git (after validation)                                                                                                                                         |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `addRemote`    | `git remote add -- <name> <url>`, then, if `fetch`, `git fetch -- <name>`                                                                                      |
| `editRemote`   | replaces `remote.<name>.url` with the fetch list and `remote.<name>.pushurl` with the push list (`git config --local --replace-all` / `--add` / `--unset-all`) |
| `renameRemote` | `git remote rename -- <name> <newName>`, then repoints `remote.pushDefault` / `branch.*.pushRemote` values naming the old remote                               |
| `removeRemote` | `git remote remove -- <name>`, then removes `remote.pushDefault` / `branch.*.pushRemote` values naming it                                                      |
| `pushDefault`  | sets `remote.pushDefault` to the remote, or unsets it for `null`                                                                                               |
| `setTracking`  | `git branch --set-upstream-to=<upstream> -- <branch>`, or `git branch --unset-upstream -- <branch>` for `null`                                                 |

The results come back through `handler/action-result.ts` (§A3.6): the page refreshes, and the
running dialog closes on success or shows "Unable to complete Git operation" with Git's message.
The manager is not reopened after an action.

## B4. Concrete examples

With the test localisation proxy, `/repo` selected, and
`origin = { name: "origin", fetchUrls: ["https://a/x.git", "https://b/x.git"], pushUrls: ["ssh://p"] }`,
`mirror = { name: "team/mirror", fetchUrls: ["/srv/m"], pushUrls: [] }`:

1. `addRemote("/repo")` → dialog
   `{ kind: "form", message: "addRemote", inputs: [{ kind: "ref", label: "dialogAddTagName", value: "" }, { kind: "text", label: "remoteUrl", value: "" }, { kind: "checkbox", label: "fetchAfterAdding", value: true }], action: "addRemote", source: null, destructive: false }`.
   `onSubmit(["up", "https://example.com/p.git", true])` posts
   `{ command: "repositoryAction", requestId: "repository-action-<n>", action: { kind: "addRemote", name: "up", url: "https://example.com/p.git", fetch: true }, repo: "/repo" }`
   and shows a running dialog titled "addRemote" with detail `"/repo\nup"` and a Cancel button
   (with `fetch: false` there is no Cancel button).
2. `editRemote(origin, "/repo")` → inputs
   `[{ kind: "textarea", label: "fetchUrls", value: "https://a/x.git\nhttps://b/x.git" }, { kind: "textarea", label: "pushUrls", value: "ssh://p" }]`,
   action `"save"`; the message renders as `editRemote: <b>origin</b>`.
   `onSubmit([" a \r\n\n  b\n", "\n \n"])` sends
   `{ kind: "editRemote", name: "origin", fetchUrls: ["a", "b"], pushUrls: [] }`.
3. `renameRemote(mirror, "/repo")` → `{ kind: "form", message: "renameRemote", inputs: [{ kind: "ref", value: "team/mirror" }], action: "renameRemote", source: null, destructive: false }`;
   `onSubmit(["x/y"])` sends `{ kind: "renameRemote", name: "team/mirror", newName: "x/y" }`.
4. `removeRemote(mirror, "/repo")` → `{ kind: "form", inputs: [], action: "removeRemote", source: null, destructive: true }`;
   in English the message reads "Remove remote **team/mirror** and its remote-tracking
   references? The remote server and local branches will remain." `onSubmit([])` sends
   `{ kind: "removeRemote", name: "team/mirror" }` for `/repo`.
5. `remoteMenu(mirror, "/repo").map(e => e && e.title)` →
   `["fetch…", "editRemote…", "renameRemote…", "removeRemote…", null, "manageRemotes"]`
   (English: "Fetch…", "Edit URLs…", "Rename Remote…", "Remove Remote…", divider, "Remotes").
   Clicking the first posts `{ command: "loadRemotes", repo: "/repo", requestId: "remote-<n>", branchName: null }`;
   the last posts a `{ kind: "state" }` read and shows the loading dialog.
6. `RemoteManager({ state: { ...S, remotes: [origin, mirror], pushDefault: null }, repo: "/repo" })`
   renders buttons with texts, in order: `addRemote`, `editRemote`, `renameRemote`,
   `removeRemote`, `editRemote`, `renameRemote`, `removeRemote`, `save`; paragraphs
   `"https://a/x.git\nhttps://b/x.git"`, `"pushUrls: ssh://p"`, `"/srv/m"` (no push paragraph for
   `team/mirror`); a select with option values `["", "origin", "team/mirror"]` and value `""`.
   Clicking Save sends `{ kind: "pushDefault", remote: null }`; choosing `origin` first sends
   `{ kind: "pushDefault", remote: "origin" }`.
7. With `state.branches = [main (upstream "origin/main"), dev (upstream "main"), stale (upstream "origin/stale", gone)]`
   and `state.remoteBranches = [origin/main]`:
   - `openTracking("main")` → options `none:"" , origin/main:"refs/remotes/origin/main", dev:"refs/heads/dev", stale:"refs/heads/stale"`,
     preselected `"refs/remotes/origin/main"`, source `"ref:head:main"`; `onSubmit([""])` sends
     `{ kind: "setTracking", branch: "main", upstream: null }`.
   - `openTracking("dev")` → preselected `"refs/heads/main"`.
   - `openTracking("stale")` → preselected `""`; `onSubmit([""])` still sends
     `{ kind: "setTracking", branch: "stale", upstream: null }`.
   - `openTracking("missing")` → preselected `""`, options list every local branch;
     `onSubmit([""])` sends nothing.
8. `repository-actions.test.ts`: `openTracking("main")` with
   `remoteBranches: [{ name: "team/origin/release", ... }]` offers
   `[{ label: "none", value: "" }, { label: "team/origin/release", value: "refs/remotes/team/origin/release" }]`,
   and submitting that value sends `{ kind: "setTracking", branch: "main", upstream: "refs/remotes/team/origin/release" }`.
9. UI (English, real Git): Settings & Tools → "Remotes" → "Add Remote" → fill "upstream" and a
   bare repository path → "Add Remote": `git remote get-url upstream` returns the path. Then
   "Configure Upstream" → choose `refs/remotes/upstream/main` → "Save":
   `git config branch.main.remote` is `upstream`.

## B5. Non-functional requirements

- Import-time: defines functions and the component only; no posts, no store reads, no
  `window.l10n` reads. It is reached from `lib/menus.tsx`, `MainHeader.tsx`, `RefsPane.tsx` and
  `RepositoryStatus.tsx`, some of which sit in the webview's import cycles, so its top level must
  not call anything it imports.
- Rendering `RemoteManager` posts nothing and opens nothing; only clicks do.
- No browser storage, timers or global listeners.
- `remoteMenu` returns a fresh array on every call.
- All text from `window.l10n`; buttons contain only their label text.

## B6. Test coverage

Already checked:

- `tests/webview/lib/repository-actions.test.ts`: `openRemotes` opens an (empty) manager whose
  "addRemote" button opens the add form, and submitting it posts `addRemote` with the given
  values; after switching repositories a pending manager form posts nothing; `openTracking`
  offers remote-tracking refs (with a slash-containing remote) and sends `setTracking` with the
  chosen full ref.
- `tests/webview/lib/menu-actions.test.ts`: the local-branch menu's "configureUpstream…" posts a
  `{ kind: "state" }` read for the selected repository.
- `tests/webview/components/ui/Dialog.test.ts`: a `removeRemote` confirmation is destructive.
- `tests-ext/ui/history.test.cjs` (real VS Code and Git): adding a remote from the manager,
  choosing an upstream and saving, renaming and removing a remote from the per-remote menu.

Not checked (gaps), each as setup → call → expected:

1. Add form shape. Call `addRemote("/repo")`. Expect the three inputs of §B3.1 (kinds, labels,
   initial values `""`, `""`, `true`), action `"addRemote"`, `source: null`, not destructive.
2. Edit form and URL clean-up. Call `editRemote(origin, "/repo")`. Expect the two textareas with
   joined values and action `"save"`; `onSubmit([" a \r\n\n  b\n", "\n \n"])` posts
   `{ kind: "editRemote", name: "origin", fetchUrls: ["a", "b"], pushUrls: [] }`.
3. Rename form. Call `renameRemote(mirror, "/repo")`. Expect one unlabelled `ref` input holding
   `"team/mirror"`, action `"renameRemote"`; `onSubmit(["x/y"])` posts
   `{ kind: "renameRemote", name: "team/mirror", newName: "x/y" }`.
4. Remove confirmation. Call `removeRemote(mirror, "/repo")`. Expect a destructive form with no
   inputs and action `"removeRemote"`; `onSubmit([])` posts `{ kind: "removeRemote", name: "team/mirror" }`.
5. Menu. Call `remoteMenu(mirror, "/repo")`. Expect the six titles of §B4.5; the first entry
   posts `loadRemotes` with `branchName: null`; entries 2–4 open the forms of gaps 2–4; the last
   posts a `{ kind: "state" }` read.
6. Manager with remotes. Render `RemoteManager` with `[origin, mirror]`. Expect the button texts,
   paragraph texts and select options of §B4.6, and no push paragraph for a remote without push
   URLs.
7. Push default. Setup: render with `pushDefault: "origin"`. Expect select value `"origin"`;
   clicking Save posts `{ kind: "pushDefault", remote: "origin" }`; after changing the select to
   `""`, Save posts `{ kind: "pushDefault", remote: null }`.
8. Manager focus. Setup: render `Dialog`, `openRemotes()`, answer with a state that has remotes.
   Expect `document.activeElement` to be the "addRemote" button.
9. Upstream preselection. As §B4.7: remote upstream, local upstream, gone upstream, unknown
   branch; also that the branch itself is not among the options and `source` is
   `"ref:head:<branch>"`.
10. Upstream no-op. Setup: branch without upstream. Call `onSubmit([""])`. Expect no post.
11. Upstream removal. Setup: branch with upstream `origin/main`. Call `onSubmit([""])`. Expect
    `{ kind: "setTracking", branch, upstream: null }`.
12. No repository. Setup: `selectedRepo.value = undefined`. Call `openRemotes()` and
    `openTracking("main")`. Expect no posts and no dialog.
13. Wrong answer kind. Setup: `openTracking("main")`. Call: answer `{ kind: "stashes", stashes: [] }`.
    Expect `dialog.value === null`.

## B7. Questions

- **RemoteManager Q1.** When `state.pushDefault` names a remote that is not in `state.remotes`,
  the select shows no option selected, yet Save sends that stale name (and the backend rejects
  it as an unknown remote). Should the choice fall back to "Use Git default", or should the
  stale value be shown?
- **RemoteManager Q2.** Save sends `pushDefault` even when the choice has not changed, costing a
  Git config write and a page refresh.
- **RemoteManager Q3.** The upstream is preselected by comparing its short name with option
  labels. A local branch and a remote-tracking ref can share a short name (a local branch named
  `origin/main`), and the first match (the remote-tracking one) wins. If the upstream is a branch
  whose name equals the localised "None" label, None is preselected and saving would silently
  remove the real upstream.
- **RemoteManager Q4.** Saving is skipped only when there was no upstream and None is chosen. An
  unchanged existing upstream is sent again; a gone upstream (preselected as None) is removed if
  the user just presses Save. Intended?
- **RemoteManager Q5.** Renaming to the unchanged name is sent, and Git answers
  "remote <name> already exists", which the user sees as a failure.
- **RemoteManager Q6.** In `remoteMenu`, the Fetch entry works on the selected repository while
  the other entries use the `repo` argument. They coincide for the only caller.
- **RemoteManager Q7.** The manager prefixes the push URLs with the edit form's field label
  ("Push URLs (blank uses fetch URLs)"), whose parenthesis is an editing hint, not a heading.
- **RemoteManager Q8.** A remote with no fetch URL still gets an empty paragraph.
- **RemoteManager Q9.** Add Remote passes the name and URL untrimmed (the backend accepts a URL
  with surrounding spaces as long as it is not blank), while Edit URLs trims each line.
- **RemoteManager Q10.** The name field of Add Remote reuses the tag dialog's string key
  `dialogAddTagName`. Fine in English ("Name"); translators cannot word it differently for
  remotes.
- **RemoteManager Q11.** The manager is a snapshot: after any action from it the dialog is
  replaced by the action's running dialog and the manager is not shown again. Intended, or should
  it reopen with fresh state?

---

# 8. Decisions

These decisions are the maintainer's answers to the questions above. Where they differ from "current behaviour" elsewhere in this specification, they win.

## repository-actions

- **Q1.** An answer whose request id is the current state read's id always ends that read (later calls post no cancel for it), whichever repository it names. It changes the stores only when its `repo` is the selected repository at the time it arrives.
- **Q2.** A panel answer whose `repo` differs from the read's target does not belong to that read: ignore it, keep the subscription waiting, and let its disposer still post the cancel.
- **Q3.** Keep the rule: a non-detached panel answer is delivered only when the selected repository (including "none") is the same as when the read was made.
- **Q4.** `requestRepositoryQuery` must itself cancel any outstanding dialog-owned read (posting its `cancelRepositoryQuery`) before posting the new one, so that no read is dropped without a cancel even inside an outer `batch`. The store watch still abandons reads when the dialog or repository changes.
- **Q5.** Keep: `data: null` with `status: null` opens the failure dialog with a `null` reason.
- **Q6.** Keep: both stores become `null`.
- **Q7.** Write `repositoryStateError` and `repositoryState` together in one `batch` from `@preact/signals`, so subscribers never see one updated without the other.
- **Q8.** Keep; this is the behaviour of `sendRemoteAction`, which this module does not own.
- **Q9.** Add `rebase` to the destructive list (always destructive: it rewrites history, so focus starts on Cancel). Keep `submodule` actions non-destructive.

## RemoteManager

- **Q1.** When `state.pushDefault` names a remote that is not in `state.remotes`, the choice starts as `""` ("Use Git default"), so the select and what Save sends agree.
- **Q2.** Save sends nothing when the choice equals the value it started with; it just closes the dialog (`closeDialog` from `@/webview/lib/actions`). A changed choice is sent as specified.
- **Q3.** Preselect the upstream by name, never by comparing with the localised "None" label: the first remote-tracking option whose name equals the current upstream, else the first local-branch option whose name equals it, else `""`. "None" is preselected only when there is no upstream or nothing matches (a gone upstream).
- **Q4.** Submitting sends nothing when the chosen value equals the preselected one and that preselection is the branch's real current state (the upstream matched an option, or the branch has no upstream). A gone upstream (non-empty upstream that matched no option, so None is preselected) is still removed by saving None, which is how the user cleans it up.
- **Q5.** Renaming to the unchanged name sends nothing.
- **Q6.** Keep: the Fetch entry calls `openRemoteAction` exactly as specified.
- **Q7.** Add a string key `remotePushUrls` with English text "Push URLs" and use it as the prefix of the manager's push-URL paragraph (the edit form keeps `pushUrls`). Translations: zh-cn "推送 URL", zh-tw "推送 URL".
- **Q8.** Omit the fetch-URL paragraph for a remote with no fetch URLs.
- **Q9.** Add Remote trims surrounding whitespace from the name and the URL before sending.
- **Q10.** Add a string key `remoteName` with English text "Remote name" and use it as the label of Add Remote's name field instead of `dialogAddTagName`. Translations: zh-cn "远程仓库名称", zh-tw "遠端儲存庫名稱".
- **Q11.** Keep: the manager is a snapshot and is not reopened after an action.

New string keys go beside the existing remote strings in the extension's localisation table for the repository UI (`src/old-extension/l10n/repositoryL10n.ts`), with the translations in `l10n/bundle.l10n.zh-cn.json` and `l10n/bundle.l10n.zh-tw.json`; run `pnpm run l10n:check` to confirm every bundle agrees.
