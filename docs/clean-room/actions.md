# Clean-room specification: `src/webview/lib/actions.ts`

This module is the webview's shared set of user-level operations. Components, message handlers
and other library modules call it to switch the graph to another repository, choose which branch
the graph filters to or emphasises, change the view mode and remote visibility, keep per-repository
state (column widths, hidden remotes) in step with the extension, ask the extension for the branch
list, the commit list and a commit's details, open and close the one context menu and the one
dialog the page can show, and send Git commands and diff requests for the selected repository.
It owns no stores of its own: every effect is a write to a store that lives in another module, a
message posted to the extension, or a call into a collaborating module.

## 0. How the observations were made

- Read every file that imports the module (36 source files, 18 test files), the modules it depends
  on (`stores.ts`, `navigation.ts`, `graph-requests.ts`, `focus.ts`, `vscode.ts`,
  `webview-config.ts`, `remote-actions.tsx`, `repository-actions.tsx`, `activity.ts`,
  `constants.ts`, `backend/utils/remoteVisibility.ts`), the types in `src/webview/types.ts`,
  `src/types/` and `src/backend/types/`, and the extension side that receives the messages
  (`src/old-extension/messageHandler.ts`, `src/extension/repoSelection.ts`,
  `src/extension/view-command.ts`). Also read `docs/preferences.md`, which documents the
  user-visible rules for view preferences.
- Ran the 18 test files that import the module (17 pass, 1 is a benchmark that is skipped unless
  `NGG_BENCH_WORKING_TREE=1`; 432 tests) and the whole webview project with coverage restricted to
  this file (50 files, 922 tests, all pass; 93.6 % of lines, 97.9 % of functions; not reached:
  `viewDiff`, and most "no repository selected" and "nothing changed" cases, listed in §6.2).
- Ran scratch Vitest files kept outside the repository. Each scenario re-imported the modules
  (`vi.resetModules`) so request ids and dialog tokens start from their first value, installed the
  tests' l10n stand-in (every `window.l10n.<key>` reads as the key's own name) and a configuration
  with `initialLoadCommits: 300` and `loadMoreCommits: 100`, called one export, and recorded every
  message posted through the VS Code API and the value of every store listed in §2.3. Signal
  effects were used to count how many notifications a call produced. A scratch type check
  confirmed that the `const` modifier on `openFormDialog`'s type parameter is needed by callers
  (§1.2). The scratch files have been deleted.

### Terms used below

- **Selected repository**: the value of the `selectedRepo` store. "No repository" means
  `undefined`. The empty string is a repository like any other (see §7, question 16).
- **Selection**: the value of the `selectedBranch` store: a branch name, `"*"` (show all
  branches, the constant `SHOW_ALL_BRANCHES`), or `undefined` (nothing chosen yet; the branch list
  has not loaded since the repository was selected).
- **View mode**: the `branchDisplay` store: `"filter"`, `"focus"` or `"ancestors"`.
- **Displayed branch**: what `displayedBranch()` from `stores.ts` returns: the selection when the
  view mode is `"filter"` and the selection is a branch name; the empty string (all branches)
  otherwise. The commit list the graph shows is always the list for the displayed branch.
- **Focus target**: the `branchFocusTarget` computed store: the selection when the view mode is not
  `"filter"` and the selection is neither `"*"` nor `undefined`; otherwise `undefined`.
- **Hidden-remote list**: the `hiddenRemotes` computed store, i.e. the `hiddenRemotes` field of the
  selected repository's record in `repoStates`, or `[]`.
- **Remotes switch**: the `showRemoteBranch` store (the global "Show Remote Branches" toggle).
- **Remote of a branch**: only names that start with `remotes/` have one. Take the rest of the
  name after `remotes/`. Among the candidate remote names (the names of the remotes in
  `repositoryState.remotes` when the repository state has loaded, followed by the entries of the
  hidden-remote list), the remote is the longest candidate `R` for which that rest starts with
  `R/`; when no candidate matches, it is the rest's first `/`-separated segment. This is exactly
  `remoteForRef(rest, candidates)` from `backend/utils/remoteVisibility.ts`. Examples:
  `remotes/origin/main` → `origin`; `remotes/team/mirror/x` with `team/mirror` among the
  candidates → `team/mirror`, with no candidates → `team`; `origin/main` → no remote.
- **Visibility key**: the string `remoteVisibilityKey()` from `stores.ts` returns: the JSON text of
  `[remotes switch, hidden-remote list sorted]`, e.g. `[true,[]]` or `[false,["up"]]`.
- **Initial page size** / **page increment**: `getWebviewConfig().initialLoadCommits` /
  `getWebviewConfig().loadMoreCommits`, read at the moment they are needed.
- **One notification**: a group of store writes that `@preact/signals` subscribers observe as a
  single change (they never see a state in which only part of the group has been applied).
- **Stand-in strings**: under the tests' l10n stand-in a localized string reads as its key, e.g.
  `window.l10n.runningGitAction` is `"runningGitAction"`.

---

## 1. Interface

### 1.1 Module path

`src/webview/lib/actions.ts`, imported everywhere as `@/webview/lib/actions` (and once as
`./lib/actions` from `src/webview/main.tsx`). A directory `src/webview/lib/actions/` also exists
(it holds `clipboard.ts`); the file must stay at `src/webview/lib/actions.ts` so that the bare
specifier keeps resolving to it.

### 1.2 Exports

The module exports exactly these 25 functions and nothing else (no types, no constants). All
return `void` (nothing a caller could use). Names and signatures must stay as given; the tests
type-check against them (`typeof import("@/webview/lib/actions")`).

| Export                | Signature                                                                                                                                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `selectRepo`          | `(repo: string): void`                                                                                                                                                                                               |
| `selectBranch`        | `(branch: CommitBranchType): void`                                                                                                                                                                                   |
| `setBranchDisplay`    | `(value: BranchDisplay): void`                                                                                                                                                                                       |
| `focusBranchInGraph`  | `(branch: string): void`                                                                                                                                                                                             |
| `toggleBranchFocus`   | `(): void`                                                                                                                                                                                                           |
| `setFocusDimming`     | `(value: FocusDimming): void`                                                                                                                                                                                        |
| `setColumnWidths`     | `(widths: Array<number>): void`                                                                                                                                                                                      |
| `saveColumnWidths`    | `(widths: Array<number>): void`                                                                                                                                                                                      |
| `setShowRemoteBranch` | `(value: boolean): void`                                                                                                                                                                                             |
| `receiveRepoState`    | `(message: Extract<ResponseMessage, { command: "repoState" }>): void`                                                                                                                                                |
| `setRemoteVisible`    | `(remote: string, visible: boolean): void`                                                                                                                                                                           |
| `loadMoreCommits`     | `(): void`                                                                                                                                                                                                           |
| `applyWebviewConfig`  | `(config: WebviewConfig): void`                                                                                                                                                                                      |
| `refresh`             | `(): void`                                                                                                                                                                                                           |
| `closeCommitDetails`  | `(): void`                                                                                                                                                                                                           |
| `toggleCommitDetails` | `(hash: string): void`                                                                                                                                                                                               |
| `openContextMenu`     | `(event: MouseEvent, source: string, entries: Array<ContextMenuEntry>): void`                                                                                                                                        |
| `closeContextMenu`    | `(): void`                                                                                                                                                                                                           |
| `closeDialog`         | `(): void`                                                                                                                                                                                                           |
| `openContentDialog`   | `(message: string, content: ComponentChildren, wide?: boolean): void` — `wide` defaults to `false`                                                                                                                   |
| `openFormDialog`      | `<const T extends ReadonlyArray<DialogInput>>(options: { message: ComponentChildren; inputs: T; action: string; source: string \| null; onSubmit: (values: DialogValues<T>) => void; destructive?: boolean }): void` |
| `openErrorDialog`     | `(message: string, reason?: string \| null): void` — `reason` defaults to `null`                                                                                                                                     |
| `openRunningDialog`   | `(message: string, context?: { detail: string; started: number; onCancel?: () => void } \| undefined): void`                                                                                                         |
| `runAction`           | `(command: ActionCommand): void`                                                                                                                                                                                     |
| `viewDiff`            | `(commitHash: string, file: GitFileChange): void`                                                                                                                                                                    |

Types come from: `CommitBranchType`, `BranchDisplay`, `FocusDimming`, `ContextMenuEntry`,
`DialogInput`, `DialogValues`, `ActionCommand` — `@/webview/types`; `ResponseMessage`,
`WebviewConfig` — `@/types`; `GitFileChange` — `@/backend/types`; `ComponentChildren` —
`preact`.

Notes on the signatures:

- The parameter of `receiveRepoState` is the message type `{ command: "repoState"; repo: string;
state: GitRepoState }` (`GitRepoState` = `{ columnWidths: number[] | null; hiddenRemotes?:
string[]; graphPreferences?: GraphPreferences }`).
- `openFormDialog` takes a single options object. Its type parameter **must** carry the `const`
  modifier: with it, an `inputs` array literal is inferred as a readonly tuple and `onSubmit`
  receives a tuple typed per input (a checkbox gives `boolean`, every other kind gives `string`).
  Without it, destructured values become `string | boolean | undefined` and callers such as
  `menus.tsx` and `remote-actions.tsx` stop type-checking (verified with a scratch type check).
  `destructive` is an optional `boolean` (the repository enables `exactOptionalPropertyTypes`, so
  callers pass a boolean or omit it).
- `openRunningDialog`'s `context.onCancel` is optional; callers add it only for operations that
  can be stopped. Under `exactOptionalPropertyTypes` they never pass `onCancel: undefined`.
- Zero-parameter exports are passed directly as event handlers (`onClick={refresh}`,
  `onClick={loadMoreCommits}`, `onClick={toggleBranchFocus}` in `GraphView.tsx` and
  `MainHeader.tsx`), so they receive and must ignore an event argument. `selectRepo` and
  `selectBranch` are passed directly as a Dropdown's `onChange` (one string argument).

### 1.3 Meaning of parameters and options

| Export / parameter                                     | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `selectRepo(repo)`                                     | Path of the repository to show, exactly as the repository list or the extension spells it (compared with `===`).                                                                                                                                                                                                                                                                                                         |
| `selectBranch(branch)`                                 | A branch name as it appears in the branch list (`main`, `remotes/origin/main`) or `"*"` for all branches.                                                                                                                                                                                                                                                                                                                |
| `setBranchDisplay(value)`                              | New view mode.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `focusBranchInGraph(branch)`                           | Branch to emphasise (local name or `remotes/<remote>/<name>`).                                                                                                                                                                                                                                                                                                                                                           |
| `setFocusDimming(value)`                               | `"subtle"` or `"strong"`: how strongly commits outside the focus are dimmed.                                                                                                                                                                                                                                                                                                                                             |
| `setColumnWidths(widths)` / `saveColumnWidths(widths)` | Widths in pixels of the resizable columns (graph, date, author, commit), in that order. Not validated here; `columnWidths` in `stores.ts` validates on read.                                                                                                                                                                                                                                                             |
| `setShowRemoteBranch(value)`                           | New state of the remotes switch.                                                                                                                                                                                                                                                                                                                                                                                         |
| `receiveRepoState(message)`                            | The extension's stored record for `message.repo`.                                                                                                                                                                                                                                                                                                                                                                        |
| `setRemoteVisible(remote, visible)`                    | A remote name (may contain `/`) and whether its branches should be shown.                                                                                                                                                                                                                                                                                                                                                |
| `applyWebviewConfig(config)`                           | The extension's complete, current webview configuration.                                                                                                                                                                                                                                                                                                                                                                 |
| `toggleCommitDetails(hash)`                            | Full hash of a commit row, or `"*"` (the constant `UNCOMMITTED_CHANGES`) for the uncommitted-changes row.                                                                                                                                                                                                                                                                                                                |
| `openContextMenu(event, source, entries)`              | `event`: the mouse event that asked for the menu (a real `click`, `contextmenu`, etc., or a synthetic `MouseEvent` that was never dispatched). `source`: the key identifying the element the menu belongs to, so that element can show that its menu is open (read through `activeSource`). `entries`: the menu rows (`null` = divider), shown in order.                                                                 |
| `openContentDialog(message, content, wide)`            | `message`: the heading. `content`: any Preact children rendered as the body. `wide`: use the wider panel.                                                                                                                                                                                                                                                                                                                |
| `openFormDialog({...})`                                | `message`: the question or title (text or Preact children). `inputs`: the fields, in order; an empty array makes a plain yes/no confirmation. `action`: caption of the confirming button. `source`: menu key of the element that should stay highlighted while the form is open, or `null`. `onSubmit`: receives one value per input, in input order. `destructive`: `true` makes the Dialog start with focus on Cancel. |
| `openErrorDialog(message, reason)`                     | `message`: the headline of the failure. `reason`: longer text shown below it with a copy button (callers pass Git's stderr, an exception message, …), or `null`.                                                                                                                                                                                                                                                         |
| `openRunningDialog(message, context)`                  | `message`: what is running. `context.detail`: extra lines (repository path, arguments). `context.started`: start time in ms since the epoch, for the elapsed-time display. `context.onCancel`: called when the user asks to stop the operation.                                                                                                                                                                          |
| `runAction(command)`                                   | A Git command for the extension, without `repo` (see `ActionCommand`); any `requestId` it carries is replaced.                                                                                                                                                                                                                                                                                                           |
| `viewDiff(commitHash, file)`                           | The commit and one entry of its `fileChanges`.                                                                                                                                                                                                                                                                                                                                                                           |

### 1.4 Who uses what

Source callers:

| Caller                                                  | Exports used                                                                                                                  |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `src/webview/main.tsx`                                  | `selectRepo` (first repository once the list loads)                                                                           |
| `src/webview/lib/dispatcher.ts`                         | `receiveRepoState` (handler of `repoState`), `selectRepo` (handler of `fileHistory`)                                          |
| `src/webview/lib/rpc/rpc-handler.ts`                    | `selectRepo` (`repo.select`), `applyWebviewConfig` (`config.changed`), `refresh` (`repo.updated`)                             |
| `src/webview/lib/handler/action-result.ts`              | `refresh`, `closeDialog`, `openErrorDialog`                                                                                   |
| `src/webview/lib/handler/commit-details.ts`             | `closeCommitDetails`, `openErrorDialog`                                                                                       |
| `src/webview/lib/handler/graph-query-error.ts`          | `closeCommitDetails`, `openErrorDialog`                                                                                       |
| `src/webview/lib/handler/load-branches.ts`              | `selectBranch` (fallback selection after the branch list loads)                                                               |
| `src/webview/lib/handler/load-commits.ts`               | `closeCommitDetails`                                                                                                          |
| `src/webview/lib/handler/refresh.ts`                    | `refresh`                                                                                                                     |
| `src/webview/lib/handler/view-diff.ts`                  | `openErrorDialog`                                                                                                             |
| `src/webview/lib/menus.tsx`                             | `closeDialog`, `focusBranchInGraph`, `openFormDialog`, `runAction`                                                            |
| `src/webview/lib/remote-actions.tsx`                    | `closeDialog`, `openErrorDialog`, `openFormDialog`, `openRunningDialog`                                                       |
| `src/webview/lib/repository-actions.tsx`                | `closeDialog`, `openContentDialog`, `openErrorDialog`, `openFormDialog`, `openRunningDialog`                                  |
| `src/webview/lib/actions/clipboard.ts`                  | `openErrorDialog`                                                                                                             |
| `src/webview/components/commit/CommitDetails.tsx`       | `closeCommitDetails`                                                                                                          |
| `src/webview/components/commit/CommitRow.tsx`           | `openContextMenu`                                                                                                             |
| `src/webview/components/commit/CommitTable.tsx`         | `toggleCommitDetails`                                                                                                         |
| `src/webview/components/commit/FileTree.tsx`            | `openContextMenu` (also with an undispatched synthetic event), `viewDiff`                                                     |
| `src/webview/components/commit/RefLabel.tsx`            | `openContextMenu`                                                                                                             |
| `src/webview/components/commit/WorkingTreeDetails.tsx`  | `refresh`                                                                                                                     |
| `src/webview/components/commit/useColumnResize.ts`      | `setColumnWidths` (at most once per drag, while no widths are stored), `saveColumnWidths` (on release and on keyboard nudges) |
| `src/webview/components/history/ActivityView.tsx`       | `openContentDialog`                                                                                                           |
| `src/webview/components/history/HistoryTools.tsx`       | `closeDialog`, `openContentDialog`, `openErrorDialog`, `openFormDialog`                                                       |
| `src/webview/components/history/SearchBar.tsx`          | `openFormDialog`                                                                                                              |
| `src/webview/components/history/WorkflowTools.tsx`      | `closeDialog`, `openContentDialog`, `selectRepo`                                                                              |
| `src/webview/components/history/WorkspacePane.tsx`      | `openContextMenu`, `selectRepo`                                                                                               |
| `src/webview/components/repository/BisectView.tsx`      | `closeDialog`, `openContentDialog`                                                                                            |
| `src/webview/components/repository/RebaseEditor.tsx`    | `openContentDialog`, `openErrorDialog`                                                                                        |
| `src/webview/components/repository/RefsPane.tsx`        | `openContextMenu`, `openFormDialog`, `runAction`, `selectBranch`, `setRemoteVisible`, `setShowRemoteBranch`                   |
| `src/webview/components/repository/RemoteManager.tsx`   | `openFormDialog`                                                                                                              |
| `src/webview/components/repository/StashManager.tsx`    | `openContentDialog`, `openFormDialog`                                                                                         |
| `src/webview/components/repository/WorktreeManager.tsx` | `openFormDialog`                                                                                                              |
| `src/webview/components/ui/ContextMenu.tsx`             | `closeContextMenu`                                                                                                            |
| `src/webview/components/ui/Dialog.tsx`                  | `closeDialog` (every dismissal, and before calling a form's `onSubmit`)                                                       |
| `src/webview/layout/GraphView.tsx`                      | `loadMoreCommits`, `refresh` (Retry button), `selectBranch` (Clear focus), `setFocusDimming`, `toggleBranchFocus`             |
| `src/webview/layout/MainHeader.tsx`                     | `openContextMenu`, `openFormDialog`, `refresh`, `selectBranch`, `selectRepo`, `setBranchDisplay`, `setShowRemoteBranch`       |

Tests that import the module (statically, or dynamically after `vi.resetModules`):

| Test file                                                                                          | Exports used                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/webview/lib/branch-focus.test.ts`                                                           | `focusBranchInGraph`, `loadMoreCommits`, `refresh`, `selectBranch`, `selectRepo`, `setBranchDisplay`, `setFocusDimming`, `toggleBranchFocus`                                                      |
| `tests/webview/lib/graph-requests.test.ts`                                                         | `closeCommitDetails`, `loadMoreCommits`, `refresh`, `selectRepo`, `setRemoteVisible`, `toggleCommitDetails`                                                                                       |
| `tests/webview/lib/remote-visibility.test.ts`                                                      | `focusBranchInGraph`, `receiveRepoState`, `selectBranch`, `selectRepo`, `setRemoteVisible`, `setShowRemoteBranch`                                                                                 |
| `tests/webview/lib/preference-lifetime.test.ts` (dynamic, fresh modules per "panel")               | `focusBranchInGraph`, `receiveRepoState`, `saveColumnWidths`, `selectBranch`, `selectRepo`, `setBranchDisplay`, `setFocusDimming`, `setRemoteVisible`, `setShowRemoteBranch`, `toggleBranchFocus` |
| `tests/webview/lib/menu-anchor.test.ts` (dynamic)                                                  | `openContextMenu`                                                                                                                                                                                 |
| `tests/webview/lib/workflows.test.ts`                                                              | `closeContextMenu`, `closeDialog`, `openContentDialog`, `openContextMenu`                                                                                                                         |
| `tests/webview/lib/webview-config.test.ts` (dynamic, before configuration exists)                  | `applyWebviewConfig`                                                                                                                                                                              |
| `tests/webview/lib/history-tools.test.ts`                                                          | `openContentDialog`, `openErrorDialog`                                                                                                                                                            |
| `tests/webview/lib/remote-actions.test.ts`                                                         | `closeDialog`, `openErrorDialog`                                                                                                                                                                  |
| `tests/webview/lib/repository-actions.test.ts`                                                     | `openErrorDialog`                                                                                                                                                                                 |
| `tests/webview/lib/unseen-failures.test.ts` (dynamic)                                              | `closeDialog`, `openErrorDialog`                                                                                                                                                                  |
| `tests/webview/components/commit/ColumnResize.test.ts`                                             | `receiveRepoState` (and `setColumnWidths` / `saveColumnWidths` through `useColumnResize`)                                                                                                         |
| `tests/webview/components/commit/GraphErrors.test.ts`                                              | `refresh`, `selectRepo`, `toggleCommitDetails`                                                                                                                                                    |
| `tests/webview/components/commit/WorkingTreeTiming.test.ts` (dynamic; benchmark, normally skipped) | `refresh`                                                                                                                                                                                         |
| `tests/webview/components/ui/ContextMenu.test.ts`                                                  | `closeContextMenu`, `openContentDialog`, `openContextMenu`                                                                                                                                        |
| `tests/webview/components/ui/Dialog.behaviour.test.ts`                                             | `closeDialog`, `openContentDialog`, `openErrorDialog`, `openFormDialog`, `openRunningDialog`                                                                                                      |
| `tests/webview/components/ui/Dialog.test.ts` (dynamic; mocks `@/webview/lib/vscode`)               | `openFormDialog`                                                                                                                                                                                  |
| `tests/webview/utils/date.test.ts`                                                                 | `refresh`                                                                                                                                                                                         |

Tests that reach the module only through its callers: `menus.test.ts`, `menu-actions.test.ts`,
`menu-text.test.ts` (`runAction`, `openFormDialog`, `focusBranchInGraph` through menu entries);
`cancel-action.test.ts` (`openRunningDialog` through `sendRemoteAction`); `repo-selection.test.ts`,
`rpc-handler.test.ts`, `config-changed.test.ts` (`selectRepo`, `refresh`, `applyWebviewConfig`
through RPC notifications); `RefsPane.test.ts`, `RefsScale.test.ts`, `RefsTiming.test.ts`
(`selectBranch`, `setShowRemoteBranch`, `openContextMenu`); `CommitRow.test.ts`
(`openContextMenu`); `WorkingTreeDetails.test.ts` (`toggleCommitDetails("*")`, `refresh`);
`clipboard.test.ts` (`openErrorDialog` when copying fails); `ListEditors.test.ts` only loads
components that import the module. The UI harness
(`tests-ext/ui/history.test.cjs`) drives the same flows end to end in VS Code.

---

## 2. Dependencies the implementation must use

### 2.1 Imports

| Import path                        | Names                                                                                                                                                                                                                                                                                                                                                                                             | Used for                                                                                                                                                                                                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@preact/signals`                  | `batch`                                                                                                                                                                                                                                                                                                                                                                                           | Making each group of store writes listed in §5.3 one notification.                                                                                                                                                                                                                        |
| `preact`                           | type `ComponentChildren`                                                                                                                                                                                                                                                                                                                                                                          | Dialog messages and bodies.                                                                                                                                                                                                                                                               |
| `@/webview/lib/stores`             | `selectedRepo`, `branchList`, `headBranch`, `commitList`, `commitHead`, `moreCommitsAvailable`, `graphErrors`, `uncommittedChanges`, `expandedCommit`, `commitDetails`, `contextMenu`, `dialog`, `repoStates`, `selectedBranch`, `branchDisplay`, `focusPaused`, `focusDimming`, `branchFocusTarget`, `showRemoteBranch`, `hiddenRemotes`, `maxCommits`, `displayedBranch`, `remoteVisibilityKey` | The page state this module reads and writes (§2.3). The signal objects are shared with every component and test; write into them, never replace them.                                                                                                                                     |
| `@/webview/lib/vscode`             | `vscode`                                                                                                                                                                                                                                                                                                                                                                                          | Posting every message (`vscode.postMessage`). Tests mock this module (`Dialog.test.ts`, `RefsPane.test.ts`, …) or spy on the object `acquireVsCodeApi` returns; posting any other way would bypass both.                                                                                  |
| `@/webview/lib/graph-requests`     | `startGraphRequest`, `invalidateGraphRequest`, `resetGraphRequests`                                                                                                                                                                                                                                                                                                                               | Request ids for `loadBranches`, `loadCommits` and `commitDetails`, and forgetting pending ones. The reply handlers accept only the latest request of each kind that this module registered (`acceptGraphResponse`), so every such request must be registered through `startGraphRequest`. |
| `@/webview/lib/navigation`         | `leaveNavigation`, `enterNavigation`, `restoreGraphPreferences`, `historyOffset`                                                                                                                                                                                                                                                                                                                  | Persisting and restoring per-repository view state (§2.4), and resetting the history page offset.                                                                                                                                                                                         |
| `@/webview/lib/repository-actions` | `repositoryState`, `repositoryRevision`, `requestRepositoryState`, `resetRepositoryState`                                                                                                                                                                                                                                                                                                         | Remote names for the "remote of a branch" rule; asking for and resetting the repository state; bumping the revision that repository-query panels watch.                                                                                                                                   |
| `@/webview/lib/remote-actions`     | `sendRemoteAction`                                                                                                                                                                                                                                                                                                                                                                                | Sending Git commands (`runAction`). It records the pending action so its result is routed correctly (`acceptRemoteActionResult`), adds the activity entry and shows the running dialog; the module must not post action commands itself.                                                  |
| `@/webview/lib/focus`              | `captureFocus`, `restoreFocus`                                                                                                                                                                                                                                                                                                                                                                    | Remembering the control that opened a menu or dialog and returning focus to it when the last one closes.                                                                                                                                                                                  |
| `@/webview/lib/webview-config`     | `getWebviewConfig`, `updateWebviewConfig`                                                                                                                                                                                                                                                                                                                                                         | Page sizes; applying a changed configuration.                                                                                                                                                                                                                                             |
| `@/webview/constants`              | `SHOW_ALL_BRANCHES`, `UNCOMMITTED_CHANGES` (both `"*"`)                                                                                                                                                                                                                                                                                                                                           | The all-branches selection and the uncommitted-changes row.                                                                                                                                                                                                                               |
| `@/backend/utils/remoteVisibility` | `remoteForRef`                                                                                                                                                                                                                                                                                                                                                                                    | The "remote of a branch" rule (§0 terms), shared with the backend so both sides agree on which remote a ref belongs to.                                                                                                                                                                   |
| `@/webview/types`                  | types `ActionCommand`, `BranchDisplay`, `CommitBranchType`, `ContextMenuEntry`, `DialogBody`, `DialogInput`, `DialogValues`, `FocusDimming`                                                                                                                                                                                                                                                       | Signatures and store value shapes (`DialogState` = `DialogBody` plus `token: number`).                                                                                                                                                                                                    |
| `@/types`                          | types `ResponseMessage`, `WebviewConfig`                                                                                                                                                                                                                                                                                                                                                          | Signatures.                                                                                                                                                                                                                                                                               |
| `@/backend/types`                  | type `GitFileChange`                                                                                                                                                                                                                                                                                                                                                                              | `viewDiff`'s parameter.                                                                                                                                                                                                                                                                   |

Global read at call time only: `window.l10n.runningGitAction` (typed in
`src/webview/global.d.ts`), used by `runAction`.

### 2.2 Messages posted to the extension

All messages go through `vscode.postMessage`, synchronously, in the order stated for each export.
Field sets are exact: `repo-selection.test.ts` compares a `loadBranches` message with
`toHaveBeenCalledWith` on the whole object, and `menu-actions.test.ts` compares action messages
with `toEqual`, so no extra fields may be added.

| Message                | Exact shape                                                                                                                                                     | Notes                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Repository choice      | `{ command: "selectRepo", repo }`                                                                                                                               | The extension answers at once with `{ command: "repoState", repo, state }` (the stored record, or `{ columnWidths: null }`), which the dispatcher hands to `receiveRepoState`.                                                                                                                                                                               |
| Branch-list request    | `{ command: "loadBranches", requestId, repo, showRemoteBranches, hiddenRemotes, visibilityKey, hard: true }`                                                    | `requestId` = `startGraphRequest("loadBranches", repo)` (`"graph-<n>"`). `showRemoteBranches` = remotes switch, `hiddenRemotes` = the hidden-remote list array as stored (not copied or sorted), `visibilityKey` = visibility key, all read when the message is built (after the call's own store changes). Answered by `loadBranches` or `graphQueryError`. |
| Commit-list request    | `{ command: "loadCommits", requestId, repo, branchName, maxCommits, showRemoteBranches, hiddenRemotes, visibilityKey, hard: true }`                             | `requestId` = `startGraphRequest("loadCommits", repo)`. `branchName` = the displayed branch and `maxCommits` = the `maxCommits` store, both after the call's own store changes. Answered by `loadCommits` (accepted only if its `branchName` still equals the displayed branch) or `graphQueryError`.                                                        |
| Commit-details request | `{ command: "commitDetails", requestId, repo, commitHash }`                                                                                                     | `requestId` = `startGraphRequest("commitDetails", repo)`.                                                                                                                                                                                                                                                                                                    |
| Column widths          | `{ command: "saveRepoState", repo, state: { columnWidths } }`                                                                                                   | Only the one field; the extension merges partial states into its record.                                                                                                                                                                                                                                                                                     |
| Hidden remotes         | `{ command: "saveRepoState", repo, state: { hiddenRemotes } }`                                                                                                  | The list sorted (default JavaScript sort, i.e. by UTF-16 code units: `["B","a"]`).                                                                                                                                                                                                                                                                           |
| View preferences       | `{ command: "saveRepoState", repo, state: { graphPreferences } }`                                                                                               | Posted by `navigation.leaveNavigation`, not by this module directly (§2.4).                                                                                                                                                                                                                                                                                  |
| Diff                   | `{ command: "viewDiff", repo, commitHash, oldFilePath, newFilePath, type }`                                                                                     | The three file fields are copied from the `GitFileChange`; `additions` and `deletions` are not sent. Answered by `{ command: "viewDiff", success }`; the view-diff handler shows an error dialog on failure.                                                                                                                                                 |
| Git command            | `{ ...command, requestId: "action-<n>", repo }`                                                                                                                 | Posted by `sendRemoteAction`, which appends `repo`. Answered by an `ActionResponse` with the same `command`, `requestId` and `repo`.                                                                                                                                                                                                                         |
| Repository state       | `{ command: "repositoryQuery", repo, requestId: "repository-state-<n>", query: { kind: "state" } }` and `{ command: "cancelRepositoryQuery", repo, requestId }` | Posted by `repository-actions` when this module asks for or resets the repository state (§2.4). Opening, replacing or closing a dialog can also make `repository-actions` post `cancelRepositoryQuery` for a query that belonged to the previous dialog (it watches the `dialog` store).                                                                     |

Request ids:

- `"graph-<n>"` ids come from `graph-requests.ts`: one counter for all three graph queries,
  starting at 1 when the module is first loaded.
- `"repository-state-<n>"` ids come from `repository-actions.tsx` (its counter is shared with its
  other ids).
- `"action-<n>"` ids are made by this module: the prefix `action-` followed by a counter that
  starts at 1 when the module is loaded and increases by one for each command actually sent
  (a call that sends nothing does not use a number). They must be unique for the page's lifetime
  and must not collide with the other modules' ids (`remote-<n>`, `repository-action-<n>`,
  `repository-query-<n>`, `repository-panel-<n>`, `repository-state-<n>`, `graph-<n>`), because
  `remote-actions.tsx` keys its pending actions and `activity.ts` keys its entries by request id.
  Keeping the `action-` prefix satisfies this.

### 2.3 Stores read and written

| Store (module)                                                           | Written by                                                                                                                                                                                                 | Read by                                                                               |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `selectedRepo`                                                           | `selectRepo`                                                                                                                                                                                               | nearly every export                                                                   |
| `branchList`, `headBranch`                                               | `selectRepo` (`undefined`, `null`)                                                                                                                                                                         | `setBranchDisplay` (fallback selection)                                               |
| `commitList`, `commitHead`, `moreCommitsAvailable`, `uncommittedChanges` | resetting the loaded history (§3.0)                                                                                                                                                                        | `selectBranch`, `setBranchDisplay`, `focusBranchInGraph` (whether to request commits) |
| `graphErrors`                                                            | `selectRepo` (`{}`); each branch-list request clears `loadBranches`; each commit-list request and each history reset clears `loadCommits` (the object is replaced, the key set to `undefined`)             | —                                                                                     |
| `expandedCommit`, `commitDetails`                                        | `toggleCommitDetails`, `closeCommitDetails`, history reset                                                                                                                                                 | `toggleCommitDetails`                                                                 |
| `contextMenu`                                                            | `openContextMenu`, `closeContextMenu`, every dialog opener (`null`)                                                                                                                                        | —                                                                                     |
| `dialog`                                                                 | the four dialog openers, `closeDialog`, `selectRepo` (`null`), a form's guarded submit (`null`)                                                                                                            | —                                                                                     |
| `repoStates`                                                             | `setColumnWidths`, `saveColumnWidths`, `setRemoteVisible`, `selectBranch` / `focusBranchInGraph` (when revealing a hidden remote), `receiveRepoState`; `navigation` also writes `graphPreferences` into it | `saveColumnWidths`, `receiveRepoState`, hidden-remote list                            |
| `selectedBranch`                                                         | `selectRepo` (`undefined`), `selectBranch`, `setBranchDisplay` (fallback), `focusBranchInGraph`, remote-visibility changes (`"*"`)                                                                         | many                                                                                  |
| `branchDisplay`                                                          | `setBranchDisplay`, `focusBranchInGraph`; `navigation` when restoring                                                                                                                                      | many (through the displayed branch)                                                   |
| `focusPaused`                                                            | `selectBranch("*")`, `setBranchDisplay`, `focusBranchInGraph`, `toggleBranchFocus`, remote-visibility changes; `navigation` when restoring                                                                 | `toggleBranchFocus`                                                                   |
| `focusDimming`                                                           | `setFocusDimming`; `navigation` when restoring                                                                                                                                                             | —                                                                                     |
| `showRemoteBranch`                                                       | `setShowRemoteBranch`, `setRemoteVisible(_, true)`, revealing a branch's remote; `navigation` when restoring                                                                                               | messages, remote-visibility rule                                                      |
| `maxCommits`                                                             | history reset (initial page size), `loadMoreCommits`, `applyWebviewConfig`                                                                                                                                 | commit-list request                                                                   |
| `historyOffset` (`navigation`)                                           | remote-visibility changes (`0`); `selectRepo` through `enterNavigation`                                                                                                                                    | —                                                                                     |
| `repositoryRevision` (`repository-actions`)                              | `refresh` (+1)                                                                                                                                                                                             | —                                                                                     |
| `repositoryState` (`repository-actions`)                                 | `selectRepo` (reset to `null` through `resetRepositoryState`)                                                                                                                                              | remote-of-a-branch rule                                                               |
| `activity` (`activity.ts`)                                               | `runAction` (through `sendRemoteAction`)                                                                                                                                                                   | —                                                                                     |

Derived stores that change as a consequence: `activeSource`, `columnWidths`, `hiddenRemotes`,
`branchFocusTarget` (all in `stores.ts`).

### 2.4 What the collaborating functions do (the contracts relied on)

- `leaveNavigation(repo)` (navigation): does nothing for `undefined`. Otherwise records the
  repository's navigation snapshot (history filter, saved filters, view mode, focus target, pause,
  dimming, vertical scroll) in the webview state (`vscode.setState`), and, only when the selection
  is not `undefined` and the current view preferences differ from the `graphPreferences` stored in
  `repoStates[repo]`, writes them there (creating the record with `columnWidths: null` if needed)
  and posts `{ command: "saveRepoState", repo, state: { graphPreferences } }`. `graphPreferences`
  is `{ branchDisplay, focusBranch (only when the mode is not "filter"), focusPaused,
focusDimming, showRemoteBranches }`. In this spec "**persist the view preferences**" means
  calling it with the selected repository at the moment stated.
- `enterNavigation(repo)` (navigation): restores the view mode, pause and dimming from
  `repoStates[repo].graphPreferences` (else from the older webview-state snapshot, else
  `"filter"`, `false`, `"subtle"`), the remotes switch from `graphPreferences.showRemoteBranches`
  (else `true`), the history filter and saved filters from the snapshot, and resets
  `historyOffset` to 0, the selected commits to `[]`, the focused commit to `null` and the scroll
  to restore to the snapshot's value (else 0).
- `restoreGraphPreferences(repo)` (navigation): the first half of the above: view mode, pause,
  dimming and remotes switch only.
- `resetRepositoryState()` (repository-actions): posts `cancelRepositoryQuery` for a pending
  repository-state query, then sets `repositoryState` and `repositoryStateError` to `null`.
- `requestRepositoryState()` (repository-actions): for the selected repository, cancels a pending
  state query (posting `cancelRepositoryQuery`) and posts a new `repositoryQuery` for
  `{ kind: "state" }` with id `repository-state-<n>`.
- `sendRemoteAction(command, repo, message, options?)` (remote-actions): if nothing is selected or
  another repository is selected, closes the dialog and sends nothing. Otherwise adds an activity
  entry (id = request id; title from the command, `message` being the fallback title), opens a
  running dialog (title, detail `"<repo>\n<details>"`, start time, and a stop callback for commands
  that use the network), records the pending action, and posts `{ ...command, repo }`.
- `captureFocus(target?)` (focus): remembers, once, the control to return focus to: the target if
  it is an HTML element, else the focused element; ignored when that element is inside an open
  dialog or menu, or when a control is already remembered. `restoreFocus()`: after a microtask, if
  neither a dialog nor a menu is open, focuses the remembered control (or the row of the same
  commit if the control was re-rendered, or the search field / first header button) and forgets it.
- `startGraphRequest(command, repo)` registers the new id as the only acceptable reply for that
  command; `invalidateGraphRequest(command)` makes no reply for that command acceptable;
  `resetGraphRequests()` does so for all three.
- `updateWebviewConfig(config)` returns `false` and changes nothing when the configuration has not
  been initialised; otherwise stores it and returns `true`. `getWebviewConfig()` throws
  `Error("Webview configuration is not initialized")` before initialisation.

---

## 3. Behaviour

Every export completes all of its store writes and posts all of its messages before it returns.
Nothing is deferred except the focus return that `restoreFocus` performs one microtask later.

### 3.0 Recurring effects

These are named here only because several exports produce the same outcome; how an
implementation shares the work is up to it.

**History reset.** Outcome: `graphErrors.loadCommits` is cleared; no reply or error for a
commit-list request sent earlier is accepted any more; `commitList` = `undefined`, `commitHead` =
`null`, `moreCommitsAvailable` = `false`, `uncommittedChanges` = `0`, `maxCommits` = the initial
page size; the commit details are closed (`expandedCommit` and `commitDetails` = `null`, their
pending request no longer accepted). `selectRepo` always causes it. `selectBranch`,
`setBranchDisplay` and `focusBranchInGraph` cause it exactly when they change the displayed branch
(the value before the call differs from the value after it). It arrives in the same notification
as the call's selection and mode changes. `refresh`, `loadMoreCommits`, `applyWebviewConfig` and
remote-visibility changes never cause it.

**Remote-visibility change.** Caused by `setShowRemoteBranch`, `setRemoteVisible` and, when
something relevant changed, `receiveRepoState`, once their own store changes are in place.

- Outcome: `historyOffset` = 0. If the selection has a remote (§0 terms, judged with the new
  hidden-remote list) and that remote is now hidden or the remotes switch is now off, the
  selection becomes `"*"` and `focusPaused` becomes `false`. These arrive as one notification.
  The loaded history is kept: the old rows stay until the reply replaces them, and `maxCommits`
  is unchanged.
- Messages, only when a repository is selected, in this order: a branch-list request; a
  commit-list request if the selection is not `undefined`; whatever persisting the view
  preferences posts. Without a repository nothing is posted or persisted.

**Remote reveal.** Caused by `selectBranch` and `focusBranchInGraph` before anything else they do.

- It applies to a branch that has a remote (§0 terms). The branch "needs revealing" when, before
  the call, the remotes switch was off or its remote was in the hidden-remote list.
- Outcome (one notification): the remotes switch is on. If the remote was hidden and a repository
  is selected, the remote is taken off the list — only that one; other hidden remotes stay — and
  the shortened list, sorted, is persisted: `repoStates[repo]` becomes a new record with the
  previous fields (or `columnWidths: null` when there was none) and the new `hiddenRemotes`.
- Messages: `{ command: "saveRepoState", repo, state: { hiddenRemotes: <sorted list> } }` when the
  list was persisted; this is the first message of the call.

### 3.1 `selectRepo(repo)`

**Same repository** (`repo === selectedRepo`): no effect at all — no message, no store change;
an open dialog stays open.

**Another repository:**

- The previously selected repository's view preferences are persisted from the state it had
  before the call (nothing when none was selected). So the first message can be a `saveRepoState
{ graphPreferences }` for the **old** repository.
- Graph replies: no reply or error for any branch-list, commit-list or details request sent before
  the call is accepted afterwards, even after switching back to the same repository later.
- End state: `selectedRepo` = `repo`; the new repository's navigation state restored as
  `enterNavigation` does (§2.4: view mode, pause, dimming and remotes switch from its stored
  preferences or defaults; its history filter and saved filters; `historyOffset` 0; no selected
  commits); `branchList` = `undefined`; `headBranch` = `null`; `selectedBranch` = `undefined`;
  history reset (§3.0, so `maxCommits` = initial page size and the details closed); repository
  state reset (`repositoryState` and `repositoryStateError` = `null`); `graphErrors` without any
  error; the dialog closed as by `closeDialog` (including the focus return). An open context menu
  **stays open** (§7, question 8).
- Notifications: everything in the end state except `graphErrors` arrives as one notification; the
  old repository's preference write to `repoStates` comes before it, separately.
- Messages, in order: `saveRepoState { graphPreferences }` for the old repository (if its
  preferences changed and it had a selected branch); `cancelRepositoryQuery` for the old
  repository's pending state query (if any); `cancelRepositoryQuery` for a query owned by the
  dialog that closed (if any; posted by `repository-actions`); `{ command: "selectRepo", repo }`;
  a branch-list request for `repo` (with the restored remotes switch and `repo`'s hidden-remote
  list); a repository-state query for `repo`. No commit-list request: the selection stays
  `undefined` until the branch list arrives and `handler/load-branches.ts` calls `selectBranch`.
- Callers rely on the switch being complete when the call returns: `WorkflowTools.tsx` calls
  `selectRepo` and then `focusHistory`, the dispatcher calls it and then `openFileHistory`; both
  must act on the new repository.

### 3.2 `selectBranch(branch)`

- **No effect** when `branch` is already the selection and does not need revealing (no remote, or
  its remote visible with the remotes switch on): no message, no store change, no preference
  persistence.
- Otherwise the outcome is: the remote revealed if needed (§3.0); `selectedBranch` = `branch`;
  `focusPaused` = `false` when `branch` is `"*"` (other branches leave it); a history reset when
  the displayed branch changed. The selection, pause and reset arrive as one notification, after
  the reveal's.
- Messages, only when a repository is selected, in this order: the reveal's `saveRepoState
{ hiddenRemotes }` (if any); a branch-list request if the branch needed revealing; a
  commit-list request if the branch needed revealing or `commitList` is `undefined` after the
  store changes; then whatever persisting the view preferences posts.
- Consequences: in `"filter"` mode choosing another branch resets the history and loads the list
  for it (`branchName` = the branch, or `""` for `"*"`). In `"focus"` and `"ancestors"` modes the
  displayed branch is always `""`, so choosing a branch keeps the rows and sends no graph request
  unless the rows have not loaded yet or a remote was revealed. Re-selecting the current remote
  branch while its remote is hidden or remotes are off reveals it and reloads both lists without
  resetting the rows. Without a repository the stores still change (a history reset included)
  but nothing is posted. The checked-out branch (`headBranch`) is never touched.

### 3.3 `setBranchDisplay(value)`

- **No effect** when `value` is the current view mode.
- Otherwise, as one notification: `branchDisplay` = `value`; `focusPaused` = `false` (every mode
  change clears the pause); when `value` is not `"filter"` and the selection is `"*"`, the
  selection becomes `headBranch`, or failing that the first entry of `branchList`, or failing
  that stays `"*"`; a history reset when the displayed branch changed.
- Messages, in this order: a commit-list request when a repository is selected, the selection is
  not `undefined` and `commitList` is `undefined` after the store changes; then whatever
  persisting the view preferences posts.
- Consequences: switching between `"focus"` and `"ancestors"`, or from `"filter"` with `"*"`
  selected, keeps the rows and requests nothing. Switching between `"filter"` with a branch
  selected and a focus mode changes the displayed branch, so the rows are reset and reloaded. With
  the selection `undefined` nothing is requested and no `saveRepoState` is posted.

### 3.4 `focusBranchInGraph(branch)`

Emphasises `branch` without changing Git state: no Git command is sent and `headBranch` is not
touched.

- Outcome: the remote revealed if needed (§3.0); then, as one notification: `"filter"` mode
  becomes `"focus"` (`"focus"` and `"ancestors"` are kept); `selectedBranch` = `branch`;
  `focusPaused` = `false`; a history reset when the displayed branch changed (that is, when
  leaving `"filter"` mode with a specific branch selected).
- Messages, only when a repository is selected, in this order: the reveal's `saveRepoState
{ hiddenRemotes }` (if any); a branch-list request if the branch needed revealing; a
  commit-list request if it needed revealing or `commitList` is `undefined`; then whatever
  persisting the view preferences posts.
- There is no "already focused" shortcut: calling it again for the current target has the same
  outcome, which in that case changes nothing and posts nothing. `"*"` is accepted; it leaves no
  focus target and persists `focusBranch: "*"`.

### 3.5 `toggleBranchFocus()` and `setFocusDimming(value)`

- `toggleBranchFocus`: no effect when there is no focus target. Otherwise `focusPaused` is
  inverted and the view preferences are persisted. Rows, `maxCommits` and the expanded commit are
  untouched; no graph request is sent. Without a repository the flag still flips and nothing is
  persisted.
- `setFocusDimming(value)`: `focusDimming` = `value` (also when unchanged), and the view
  preferences are persisted. No graph request. Setting the same value again posts nothing,
  because navigation finds the stored preferences equal.

### 3.6 `setShowRemoteBranch(value)` and `setRemoteVisible(remote, visible)`

- `setShowRemoteBranch(value)`: no effect when `value` equals the remotes switch. Otherwise the
  switch takes `value`, followed by a remote-visibility change (§3.0). The hidden-remote list is
  not touched, so switching remotes off and on again keeps every remote's own choice.
- `setRemoteVisible(remote, visible)`: the new hidden list is the current one with `remote`
  removed (`visible` true) or added (`visible` false), without duplicates, sorted. As one
  notification: when a repository is selected the list is persisted as a reveal persists it
  (new record, `columnWidths: null` when there was none, `saveRepoState { hiddenRemotes }`
  posted); when `visible` is true the remotes switch is turned on. A remote-visibility change
  follows. There is no "unchanged" shortcut: hiding a hidden remote or showing a visible one
  still persists and reloads (§7, question 4). Without a repository nothing is persisted or
  posted, but the remotes switch and the selection rule of §3.0 still apply.

### 3.7 `receiveRepoState(message)`

The extension's record for `message.repo` arrives (after `selectRepo`, and whenever it resends).

- Stored record: a new object holding the fields of `message.state`, overridden by the fields of
  the in-memory record `repoStates[message.repo]` where that record has them, with
  `hiddenRemotes` always taken from the message (`[]` when the message has none, in the message's
  order). So an in-memory `columnWidths` (kept as the same array) or `graphPreferences` wins over
  the message's; `ColumnResize.test.ts` depends on the widths surviving while a boundary is being
  dragged. Other repositories' records keep their identity.
- Two conditions are judged against the in-memory record as it was before the message:
  **new preferences** — it had no `graphPreferences` and the message has them; **hidden list
  changed** — its hidden list (absent = `[]`) and the message's (absent = `[]`) differ as JSON, so
  the same names in another order count as a change.
- For a repository other than the selected one, the store update is the only effect.
- For the selected repository, as one notification together with the store changes of what
  follows: with new preferences and the selection `undefined`, the view mode, pause, dimming and
  remotes switch are set from the stored `graphPreferences` (as `restoreGraphPreferences` does);
  then, with new preferences or a changed hidden list, a remote-visibility change (§3.0) follows,
  whose messages are posted during the call.
- When nothing relevant changed only the store is updated and nothing is posted. When
  preferences arrive while a branch is already selected they are stored but not applied, the
  graph reloads anyway, and the reload's preference persistence overwrites the stored preferences
  with the in-memory ones (§7, question 2).

### 3.8 `setColumnWidths(widths)` and `saveColumnWidths(widths)`

- `setColumnWidths`: without a repository nothing happens. Otherwise `repoStates` becomes a new
  object in which the selected repository's record is a new object with its previous fields and
  `columnWidths` = `widths` — the very array passed in, not a copy (`useColumnResize` later checks
  by identity whether the stored widths are still the ones it wrote). Creates
  `{ columnWidths: widths }` when there was no record. Other records keep their identity. Nothing
  is posted.
- `saveColumnWidths`: without a repository nothing happens. Otherwise the same store update, then
  `{ command: "saveRepoState", repo, state: { columnWidths: widths } }` (same array) is posted,
  even when the widths did not change and for an empty array.

### 3.9 `loadMoreCommits()`, `refresh()` and `applyWebviewConfig(config)`

- `loadMoreCommits`: `maxCommits` grows by the page increment — always, even when nothing can be
  requested (§7, question 6). Then, if a repository is selected and the selection is not
  `undefined`, a commit-list request is posted (with the displayed branch, so `""` in focus
  modes, and the new `maxCommits`). The loaded history is kept; only `graphErrors.loadCommits` is
  cleared.
- `refresh`: without a repository, no effect (`repositoryRevision` unchanged). Otherwise
  `repositoryRevision` goes up by 1 (panels built on `use-repository-query` reload), and the
  messages are, in this order: a branch-list request; `cancelRepositoryQuery` for a pending
  repository-state query (if any); a new repository-state query; a commit-list request if the
  selection is not `undefined`. Rows, `maxCommits`, the expanded commit and its details are kept.
  The graph errors are cleared by the requests (the commit one only when a commit request is
  sent).
- `applyWebviewConfig(config)`: if the configuration has not been initialised yet
  (`updateWebviewConfig` answers `false`), nothing happens and nothing is thrown; the
  configuration the page is still waiting for is at least as new, so nothing is lost. Otherwise
  the new configuration is in effect (`getWebviewConfig()` returns this object), `maxCommits`
  becomes the greater of its current value and `config.initialLoadCommits`, and `refresh` runs.
  There is no change detection: the same configuration again still reloads.

### 3.10 `toggleCommitDetails(hash)` and `closeCommitDetails()`

- `closeCommitDetails`: no reply or error for an earlier details request is accepted any more;
  as one notification `expandedCommit` = `null` and `commitDetails` = `null`. Nothing is posted.
  Harmless when nothing is open.
- `toggleCommitDetails(hash)`: if `hash` is the expanded commit, it behaves as
  `closeCommitDetails`. Otherwise: earlier details requests are forgotten; as one notification
  `expandedCommit` = `hash` and `commitDetails` = `null` (the details are loading); then, if a
  repository is selected and `hash` is not `"*"`, a commit-details request is posted. For `"*"`
  (the uncommitted-changes row) nothing is posted: the working-tree panel loads its own data.
  Without a repository the commit is marked expanded and nothing is posted (§7, question 9).

### 3.11 `openContextMenu(event, source, entries)` and `closeContextMenu()`

- `openContextMenu`:
  - The event: `event.preventDefault()` and `event.stopPropagation()` are called, so neither the
    host's own context menu nor a handler further up the tree reacts to the same event.
  - Focus: `event.target` is handed to `captureFocus`, so that control is remembered for when the
    menu (or a dialog started from it) closes.
  - Position: the opening counts as keyboard-initiated when the event is a `click` whose `detail`
    is 0, or an event of any other type whose `clientX` and `clientY` are both 0. A
    keyboard-initiated opening whose `event.currentTarget` is an `Element` is placed at that
    element's bounding rectangle, `x` = `left` and `y` = `bottom` (below the element whose listener
    handled the event, which may be an ancestor of the target). Every other opening — including a
    keyboard-initiated one whose current target is `window`, `document` or `null` — is placed at
    `x` = `clientX`, `y` = `clientY`.
  - Store: `contextMenu` = `{ x, y, entries, source }` (the same `entries` array), replacing any
    open menu. The dialog store is not touched.
- `closeContextMenu`: `contextMenu` = `null`, then `restoreFocus()` (focus goes back one microtask
  later, provided no dialog or menu is open by then). Harmless when no menu is open.

### 3.12 Dialogs

Common to the four openers:

- Focus: `captureFocus()` is called without a target before either store changes, so the control
  focused at that moment (not one inside the new dialog) is remembered. When a menu is open, the
  control that opened it is already remembered and stays so.
- Stores, as one notification: `contextMenu` = `null` (without asking for focus to return; focus
  returns when the dialog is dismissed) and `dialog` = a new object with the dialog's fields and a
  `token`.
- `token` is a number never given before by this module instance: 1 for the first dialog, then
  2, 3, … across all four kinds. The Dialog component keys its panel by the token, so every call —
  even with identical arguments — must store a new object with a new token; `remote-actions`,
  `repository-actions` and the tests detect that their dialog was replaced by comparing the
  `dialog` object's identity.

The stored objects, key for key:

| Export                                              | `dialog` value                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openContentDialog(message, content, wide = false)` | `{ kind: "content", message, content, wide, token }` — `wide` always present as a boolean.                                                                                                                                                                                                        |
| `openErrorDialog(message, reason = null)`           | `{ kind: "error", message, reason, token }` — an omitted or `undefined` reason becomes `null`; `""` stays `""` (the Dialog treats it as no reason).                                                                                                                                               |
| `openRunningDialog(message, context?)`              | `{ kind: "running", message, token }` plus exactly the properties present in `context` (`detail`, `started`, `onCancel` — the same function). Without `context`, the keys are only `kind`, `message`, `token`.                                                                                    |
| `openFormDialog(options)`                           | `{ kind: "form", message, inputs, action, destructive, onSubmit, source, token }` — `inputs` is a new array holding the caller's input objects in order; `destructive` is `true` only when the option is `true` (omitted → `false`); `source` as given; `onSubmit` is a guarded callback (below). |

`openFormDialog`'s guard: the selected repository at the moment the form opens is remembered.
When the stored `onSubmit` is called with the values array, it compares the selected repository
at that moment with the remembered one (`===`, so "none" equals "none"):

- the same: the caller's `onSubmit` is called with the very same array; its return value is
  ignored (the stored callback returns nothing);
- different: `closeDialog()` is called and the caller's `onSubmit` is not called.

Only the two moments are compared: switching away and back before submitting passes the check.
The Dialog component calls `closeDialog()` itself before calling `onSubmit`, so a callback that
opens another dialog keeps it open.

`closeDialog()`: `dialog` = `null`, then `restoreFocus()`. Harmless when no dialog is open (it
still asks for focus to return, which moves focus to a remembered control if one exists and
nothing is open).

### 3.13 `runAction(command)` and `viewDiff(commitHash, file)`

- `runAction(command)`: without a repository nothing happens (no dialog, no activity entry, no
  request number used). Otherwise calls `sendRemoteAction` with `{ ...command, requestId:
"action-<n>" }` (a `requestId` in `command` is overwritten), the selected repository, the string
  `window.l10n.runningGitAction` (read now), and no options. The observable result is that of
  `sendRemoteAction` (§2.4): an activity entry `{ id: "action-<n>", repo, title, detail, started,
finished: null, error: null }`, a running dialog (which also closes a context menu), the pending
  action registered, and `{ ...command, requestId, repo }` posted. The later result arrives as an
  `ActionResponse` and is handled by `handler/action-result.ts`.
- `viewDiff(commitHash, file)`: without a repository nothing happens. Otherwise posts
  `{ command: "viewDiff", repo, commitHash, oldFilePath: file.oldFilePath, newFilePath:
file.newFilePath, type: file.type }`. No dialog, no store change.

### 3.14 With no repository selected

| Export                                                   | Effect when `selectedRepo` is `undefined`                                                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `selectRepo(r)`                                          | Selects `r` normally (there are no old preferences to persist).                                                                                   |
| `selectBranch`, `setBranchDisplay`, `focusBranchInGraph` | Store changes and history reset happen; revealing turns the remotes switch on but persists no hidden list; nothing is posted.                     |
| `toggleBranchFocus`, `setFocusDimming`                   | Store change only; nothing persisted or posted.                                                                                                   |
| `setShowRemoteBranch`, `setRemoteVisible`                | Remotes switch changes (and, for the latter, is turned on when showing); selection rule and `historyOffset` 0 apply; nothing persisted or posted. |
| `receiveRepoState`                                       | Record stored; nothing else (no repository is "the selected one").                                                                                |
| `setColumnWidths`, `saveColumnWidths`                    | Nothing at all (`repoStates` keeps its identity).                                                                                                 |
| `loadMoreCommits`                                        | `maxCommits` still grows; nothing posted.                                                                                                         |
| `refresh`                                                | Nothing at all.                                                                                                                                   |
| `applyWebviewConfig`                                     | Configuration applied and `maxCommits` raised; nothing posted.                                                                                    |
| `toggleCommitDetails(h)`                                 | `expandedCommit` = `h`, `commitDetails` = `null`; nothing posted.                                                                                 |
| `openFormDialog`                                         | Opens; submitting while still nothing is selected calls the callback; submitting after a repository was selected closes instead.                  |
| `runAction`, `viewDiff`                                  | Nothing at all.                                                                                                                                   |
| Menus and other dialogs                                  | Unaffected.                                                                                                                                       |

---

## 4. Concrete examples (observed)

Unless stated otherwise: fresh module instances (ids start at 1), stand-in strings,
`initialLoadCommits` 300, `loadMoreCommits` 100. "Populated" means: `selectedRepo` `/repo`,
`branchList` `["main","topic","remotes/origin/main"]`, `headBranch` `main`, `commitList` `[]`,
`commitHead` `"abc"`, `moreCommitsAvailable` `true`, `uncommittedChanges` 3, `maxCommits` 600,
view mode `"filter"`, `focusPaused` false, dimming `"subtle"`, remotes switch on, `repoStates`
`{}`, `historyOffset` 0.

### 4.1 `selectRepo`

1. Nothing selected, `selectRepo("/a")` posts, in order:
   `{ command: "selectRepo", repo: "/a" }`;
   `{ command: "loadBranches", requestId: "graph-1", repo: "/a", showRemoteBranches: true, hiddenRemotes: [], visibilityKey: "[true,[]]", hard: true }`;
   `{ command: "repositoryQuery", repo: "/a", requestId: "repository-state-1", query: { kind: "state" } }`.
   Afterwards `branchList` `undefined`, `headBranch` `null`, `commitList` `undefined`,
   `selectedBranch` `undefined`, `maxCommits` 300, `repoStates` still `{}`.
2. Populated, plus: `selectedBranch` `main`, view mode `"focus"`, `focusPaused` true, dimming
   `"strong"`, remotes switch off, an error dialog and a context menu open, `historyOffset` 5, a
   pending state query `repository-state-1`, and `repoStates` `{ "/b": { columnWidths: null,
hiddenRemotes: ["up"], graphPreferences: { branchDisplay: "ancestors", focusPaused: true,
focusDimming: "strong", showRemoteBranches: false } } }`. `selectRepo("/b")` posts:
   `{ command: "saveRepoState", repo: "/repo", state: { graphPreferences: { branchDisplay: "focus", focusBranch: "main", focusPaused: true, focusDimming: "strong", showRemoteBranches: false } } }`;
   `{ command: "cancelRepositoryQuery", repo: "/repo", requestId: "repository-state-1" }`;
   `{ command: "selectRepo", repo: "/b" }`;
   `{ command: "loadBranches", requestId: "graph-1", repo: "/b", showRemoteBranches: false, hiddenRemotes: ["up"], visibilityKey: "[false,[\"up\"]]", hard: true }`;
   `{ command: "repositoryQuery", repo: "/b", requestId: "repository-state-2", query: { kind: "state" } }`.
   Afterwards: dialog `null`, **context menu still open**, view mode `"ancestors"`, `focusPaused`
   true, dimming `"strong"`, remotes switch off, hidden list `["up"]`, `historyOffset` 0,
   `commitHead` `null`, `moreCommitsAvailable` false, `uncommittedChanges` 0, `expandedCommit`
   `null`, `maxCommits` 300, no graph errors, `repositoryState` `null`, and `repoStates["/repo"]`
   = `{ columnWidths: null, graphPreferences: { … as posted } }`.
3. With a dialog-bound repository query `repository-query-1` pending, `selectRepo("/q")` posts
   `saveRepoState` (old repository), `cancelRepositoryQuery` for `repository-query-1`,
   `selectRepo`, `loadBranches`, `repositoryQuery`.
4. `selectRepo("/repo")` while `/repo` is selected: nothing posted, every store unchanged.
5. An effect reading `selectedRepo`, `branchList`, `commitList`, `selectedBranch`,
   `expandedCommit`, `dialog`, `maxCommits` and `repoStates` ran twice for the call: once for the
   old repository's preference write to `repoStates`, once for the whole switch.
   Without `repoStates` among its reads it would run once.

### 4.2 `selectBranch`

Populated, `selectedBranch` `"*"`:

| Call and extra setup                                                                                                                    | Messages (in order)                                                                                                                                                                                                                                                                                                                                                    | Stores afterwards                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `selectBranch("*")`                                                                                                                     | none                                                                                                                                                                                                                                                                                                                                                                   | unchanged                                                                                                                                                                                                                                           |
| `selectBranch("topic")` with `focusPaused` true, `expandedCommit` `"abc"`, errors `{ loadBranches: "b", loadCommits: "c" }`             | `loadCommits` `{ requestId: "graph-1", repo: "/repo", branchName: "topic", maxCommits: 300, showRemoteBranches: true, hiddenRemotes: [], visibilityKey: "[true,[]]", hard: true }`; `saveRepoState { graphPreferences: { branchDisplay: "filter", focusPaused: true, focusDimming: "subtle", showRemoteBranches: true } }`                                             | selection `topic`; `commitList` `undefined`; `commitHead` `null`; `moreCommitsAvailable` false; `uncommittedChanges` 0; `maxCommits` 300; `expandedCommit` `null`; errors `loadBranches: "b"` kept, `loadCommits` cleared; `focusPaused` still true |
| then `selectBranch("*")`                                                                                                                | `loadCommits` `{ requestId: "graph-2", branchName: "", maxCommits: 300, … }`; `saveRepoState` with `focusPaused: false`                                                                                                                                                                                                                                                | `focusPaused` false; `commitList` `undefined`                                                                                                                                                                                                       |
| mode `"focus"`, selection `main`, `focusPaused` true: `selectBranch("topic")`                                                           | `saveRepoState { graphPreferences: { branchDisplay: "focus", focusBranch: "topic", focusPaused: true, … } }` only                                                                                                                                                                                                                                                      | rows kept (`commitList` `[]`), `maxCommits` 600, still paused                                                                                                                                                                                       |
| same, but `commitList` `undefined`: `selectBranch("main")`                                                                              | `loadCommits` `{ branchName: "", maxCommits: 600, … }`; `saveRepoState`                                                                                                                                                                                                                                                                                                |                                                                                                                                                                                                                                                     |
| mode `"focus"`: `selectBranch("*")`                                                                                                     | (`commitList` `undefined`) `loadCommits` `{ branchName: "" }`; `saveRepoState { graphPreferences: { branchDisplay: "focus", focusBranch: "*", focusPaused: false, … } }`                                                                                                                                                                                               | no focus target, un-paused                                                                                                                                                                                                                          |
| no repository: `selectBranch("topic")`                                                                                                  | none                                                                                                                                                                                                                                                                                                                                                                   | selection `topic`, `commitList` `undefined`, `maxCommits` 300                                                                                                                                                                                       |
| `repoStates` `{ "/repo": { columnWidths: [1,2,3,4], hiddenRemotes: ["origin","team/mirror"] } }`: `selectBranch("remotes/origin/main")` | `saveRepoState { hiddenRemotes: ["team/mirror"] }`; `loadBranches` `{ requestId: "graph-1", showRemoteBranches: true, hiddenRemotes: ["team/mirror"], visibilityKey: "[true,[\"team/mirror\"]]" }`; `loadCommits` `{ requestId: "graph-2", branchName: "remotes/origin/main", maxCommits: 300, hiddenRemotes: ["team/mirror"] }`; `saveRepoState { graphPreferences }` | record `{ columnWidths: [1,2,3,4], hiddenRemotes: ["team/mirror"], graphPreferences: … }`; calling it again posts nothing                                                                                                                           |
| selection `remotes/origin/main`, remotes switch off, rows `[]`: `selectBranch("remotes/origin/main")`                                   | `loadBranches` `{ showRemoteBranches: true, hiddenRemotes: [] }`; `loadCommits` `{ branchName: "remotes/origin/main", maxCommits: 600 }`; `saveRepoState { graphPreferences }`                                                                                                                                                                                         | switch on; rows kept; `maxCommits` 600                                                                                                                                                                                                              |
| hidden `["team/mirror","team"]`, no repository state: `selectBranch("remotes/team/mirror/x")`                                           | `saveRepoState { hiddenRemotes: ["team"] }`, `loadBranches`, `loadCommits`, `saveRepoState`                                                                                                                                                                                                                                                                            | hidden `["team"]`                                                                                                                                                                                                                                   |
| `repositoryState.remotes` `[{ name: "team/mirror" }]`, hidden `["team"]`: `selectBranch("remotes/team/mirror/x")`                       | `loadCommits`, `saveRepoState` (not revealed: the remote `team/mirror` is not hidden)                                                                                                                                                                                                                                                                                  | hidden still `["team"]`                                                                                                                                                                                                                             |
| remotes switch off: `selectBranch("origin/main")`                                                                                       | `loadCommits`, `saveRepoState`                                                                                                                                                                                                                                                                                                                                         | switch stays off (no `remotes/` prefix, no remote)                                                                                                                                                                                                  |

### 4.3 `setBranchDisplay`

Populated, selection `"*"`:

1. `setBranchDisplay("filter")`: nothing.
2. With `focusPaused` true, `setBranchDisplay("focus")`: selection becomes `main` (the head),
   `focusPaused` false, rows kept, `maxCommits` 600; posts only `saveRepoState { graphPreferences:
{ branchDisplay: "focus", focusBranch: "main", focusPaused: false, focusDimming: "subtle",
showRemoteBranches: true } }`.
3. Then `setBranchDisplay("filter")` (selection `main`): history reset (`maxCommits` 300); posts
   `loadCommits { requestId: "graph-1", branchName: "main", maxCommits: 300 }` and `saveRepoState`.
4. With rows `[]` again, `setBranchDisplay("ancestors")` (from `"filter"`, selection `main`):
   posts `loadCommits { branchName: "", maxCommits: 300 }` and `saveRepoState { graphPreferences:
{ branchDisplay: "ancestors", focusBranch: "main", … } }`.
5. With rows `[]`, `setBranchDisplay("focus")` from `"ancestors"`: only `saveRepoState`.
6. Fallbacks from `"filter"` with `"*"`: `headBranch` `null` → first branch `main`; `headBranch`
   `null` and `branchList` `[]` → `"*"`; `branchList` `undefined` → `"*"`.
7. Selection `undefined`, rows `undefined`: `setBranchDisplay("focus")` posts nothing; selection
   stays `undefined`.
8. No repository, selection `main`: `setBranchDisplay("focus")` posts nothing; mode `"focus"`,
   rows `undefined` (history reset).

### 4.4 `focusBranchInGraph`, `toggleBranchFocus`, `setFocusDimming`

1. Populated, selection `main`, `focusPaused` true: `focusBranchInGraph("topic")` → mode
   `"focus"`, selection `topic`, `focusPaused` false, history reset (`maxCommits` 300); posts
   `loadCommits { requestId: "graph-1", branchName: "", maxCommits: 300 }` and
   `saveRepoState { graphPreferences: { branchDisplay: "focus", focusBranch: "topic", focusPaused:
false, focusDimming: "subtle", showRemoteBranches: true } }`.
2. With rows `[]`, the same call again posts nothing.
3. Mode `"ancestors"`: `focusBranchInGraph("main")` keeps `"ancestors"`; posts `saveRepoState`
   with `branchDisplay: "ancestors", focusBranch: "main"`.
4. `focusBranchInGraph("*")` in `"ancestors"`: selection `"*"`, no focus target; posts
   `saveRepoState` with `focusBranch: "*"`.
5. No repository, rows `undefined`: `focusBranchInGraph("topic")` posts nothing; mode `"focus"`,
   selection `topic`.
6. Mode `"focus"`, selection `main`, hidden `["origin"]`: `focusBranchInGraph("remotes/origin/main")`
   posts `saveRepoState { hiddenRemotes: [] }`, `loadBranches { hiddenRemotes: [] }`,
   `loadCommits { branchName: "", maxCommits: 600 }`, `saveRepoState { graphPreferences: { …,
focusBranch: "remotes/origin/main" } }`; rows kept.
7. `toggleBranchFocus()` with selection `"*"` (no target): nothing. With mode `"focus"` and
   selection `main`: `focusPaused` true, posts `saveRepoState { graphPreferences: { branchDisplay:
"focus", focusBranch: "main", focusPaused: true, … } }`.
8. `setFocusDimming("strong")`: posts `saveRepoState` with `focusDimming: "strong"`; calling it
   again posts nothing. Without a repository both functions change their store and post nothing.

### 4.5 Remote visibility

1. Populated, selection `remotes/origin/main`, `focusPaused` true, `expandedCommit` `"abc"`,
   `historyOffset` 7: `setShowRemoteBranch(false)` posts
   `loadBranches { requestId: "graph-1", showRemoteBranches: false, hiddenRemotes: [], visibilityKey: "[false,[]]" }`,
   `loadCommits { requestId: "graph-2", branchName: "", maxCommits: 600, showRemoteBranches: false }`,
   `saveRepoState { graphPreferences: { branchDisplay: "filter", focusPaused: false, focusDimming: "subtle", showRemoteBranches: false } }`.
   Afterwards selection `"*"`, `focusPaused` false, `historyOffset` 0, and **kept**: rows `[]`,
   `commitHead` `"abc"`, `moreCommitsAvailable` true, `uncommittedChanges` 3, `expandedCommit`
   `"abc"`, `maxCommits` 600.
2. `setShowRemoteBranch(true)` then posts `loadBranches` (`graph-3`), `loadCommits` (`graph-4`),
   `saveRepoState` with `showRemoteBranches: true`. With the selection `undefined`,
   `setShowRemoteBranch(false)` posts only `loadBranches`. `setShowRemoteBranch(<same value>)`:
   nothing.
3. No repository, selection `remotes/origin/main`, `historyOffset` 3:
   `setShowRemoteBranch(true)` then `(false)` → nothing posted; switch off, selection `"*"`,
   `historyOffset` 0.
4. `repoStates` `{ "/repo": { columnWidths: [1,2,3,4] } }`: `setRemoteVisible("zeta", false)`
   posts `saveRepoState { hiddenRemotes: ["zeta"] }`, `loadBranches { hiddenRemotes: ["zeta"],
visibilityKey: "[true,[\"zeta\"]]" }`, `loadCommits { branchName: "", maxCommits: 600 }`,
   `saveRepoState { graphPreferences }`; then `setRemoteVisible("alpha", false)` posts
   `saveRepoState { hiddenRemotes: ["alpha","zeta"] }`, `loadBranches` (`graph-3`), `loadCommits`
   (`graph-4`). Record: `{ columnWidths: [1,2,3,4], hiddenRemotes: ["alpha","zeta"],
graphPreferences: … }`. Hiding `alpha` again posts the same `saveRepoState`, `loadBranches`,
   `loadCommits` once more.
5. Remotes switch off: `setRemoteVisible("nothidden", true)` turns the switch on and posts
   `saveRepoState { hiddenRemotes: ["alpha","zeta"] }`, `loadBranches`, `loadCommits`.
   `setRemoteVisible("alpha", false)` with the switch off leaves it off.
6. Selection `remotes/zeta/x`: `setRemoteVisible("zeta", false)` → selection `"*"`, the commit
   request uses `branchName: ""`.
7. No record: `setRemoteVisible("B", false)` → record `{ columnWidths: null, hiddenRemotes:
["B"], graphPreferences: … }`; then `setRemoteVisible("a", false)` → `["B","a"]`.
8. No repository, switch off: `setRemoteVisible("origin", true)` → nothing posted, `repoStates`
   still `{}`, switch on.

### 4.6 `receiveRepoState`

Populated, `repoStates` `{}` unless stated:

| Setup / message                                                                                                                                                                                                 | Messages                                                                                                                                                                                                          | Resulting record / view                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| selection `main`; `{ columnWidths: [1,2,3,4] }`                                                                                                                                                                 | none                                                                                                                                                                                                              | `{ columnWidths: [1,2,3,4], hiddenRemotes: [] }`                                                                                     |
| then `{ columnWidths: [9,9,9,9], hiddenRemotes: ["o"] }`                                                                                                                                                        | `loadBranches { requestId: "graph-1", hiddenRemotes: ["o"], visibilityKey: "[true,[\"o\"]]" }`; `loadCommits { requestId: "graph-2", branchName: "main", maxCommits: 600 }`; `saveRepoState { graphPreferences }` | widths stay `[1,2,3,4]`; hidden `["o"]`; `graphPreferences` written by the preference persistence                                    |
| then `{ columnWidths: null, hiddenRemotes: ["o"] }`                                                                                                                                                             | none                                                                                                                                                                                                              | unchanged                                                                                                                            |
| then `{ columnWidths: null }`                                                                                                                                                                                   | `loadBranches`, `loadCommits`                                                                                                                                                                                     | hidden `[]`                                                                                                                          |
| record hidden `["b","a"]`; message hidden `["a","b"]`                                                                                                                                                           | `loadBranches`, `loadCommits`, `saveRepoState`                                                                                                                                                                    | hidden `["a","b"]`                                                                                                                   |
| selection `undefined`, rows `undefined`; `{ columnWidths: null, graphPreferences: { branchDisplay: "ancestors", focusBranch: "topic", focusPaused: true, focusDimming: "strong", showRemoteBranches: false } }` | `loadBranches { requestId: "graph-1", showRemoteBranches: false, hiddenRemotes: [], visibilityKey: "[false,[]]" }` only                                                                                           | view: `"ancestors"`, paused, `"strong"`, switch off; record `{ columnWidths: null, graphPreferences: <as sent>, hiddenRemotes: [] }` |
| selection `main`, `historyOffset` 2; same preferences                                                                                                                                                           | `loadBranches`, `loadCommits { branchName: "main", maxCommits: 600 }`, `saveRepoState { graphPreferences: { branchDisplay: "filter", focusPaused: false, focusDimming: "subtle", showRemoteBranches: true } }`    | view unchanged (`"filter"`); stored `graphPreferences` replaced by the in-memory ones; `historyOffset` 0                             |
| record `{ columnWidths: null, hiddenRemotes: [] }`; message `{ columnWidths: [5,5,5,5], graphPreferences: {…} }`                                                                                                | `loadBranches`, `loadCommits`, `saveRepoState`                                                                                                                                                                    | `columnWidths` stays `null`                                                                                                          |
| message for `/else` (not selected) with widths, hidden `["q"]`, preferences                                                                                                                                     | none                                                                                                                                                                                                              | `repoStates["/else"]` = message state with `hiddenRemotes: ["q"]`; view untouched                                                    |
| selection `remotes/origin/main`, `focusPaused` true, record `{ columnWidths: null }`; message hidden `["origin"]`                                                                                               | `loadBranches { hiddenRemotes: ["origin"] }`, `loadCommits { branchName: "" }`, `saveRepoState`                                                                                                                   | selection `"*"`, `focusPaused` false                                                                                                 |

### 4.7 Widths

- `setColumnWidths(w)` with `w = [10,20,30,40]` and no record: `repoStates` `{ "/repo": {
columnWidths: w } }` (the same array), nothing posted.
- Record `{ columnWidths: null, hiddenRemotes: ["x"], graphPreferences: P }` and another
  repository's record R: `setColumnWidths([5,6])` → new top-level object, `/repo` record `{
columnWidths: [5,6], hiddenRemotes: ["x"], graphPreferences: P }`, R is the same object.
- `saveColumnWidths(w2)` with `w2 = [1,2,3,4]` posts `{ command: "saveRepoState", repo: "/repo",
state: { columnWidths: w2 } }` (the same array). `saveColumnWidths([])` posts `columnWidths: []`.
- No repository: both functions post nothing and leave `repoStates` as the same object.

### 4.8 Loading

- `loadMoreCommits()` with `maxCommits` 600 and errors `{ loadBranches: "b", loadCommits: "c" }`:
  `maxCommits` 700; posts `loadCommits { requestId: "graph-1", branchName: "", maxCommits: 700 }`;
  errors `loadBranches: "b"`, `loadCommits` cleared; rows kept. Selection `undefined`: 800,
  nothing posted. No repository: 900, nothing posted. Mode `"focus"`: `branchName: ""`.
- `refresh()` populated, errors both set, `expandedCommit` `"abc"`: posts
  `loadBranches { requestId: "graph-1" }`,
  `repositoryQuery { requestId: "repository-state-1", query: { kind: "state" } }`,
  `loadCommits { requestId: "graph-2", branchName: "", maxCommits: 600 }`;
  `repositoryRevision` 0 → 1; both errors cleared; rows, `commitHead`, `expandedCommit`,
  `maxCommits` kept. Again: `loadBranches` (`graph-3`), `cancelRepositoryQuery`
  (`repository-state-1`), `repositoryQuery` (`repository-state-2`), `loadCommits` (`graph-4`).
  Selection `undefined`: the first three only. No repository: nothing, revision unchanged.
  Called with a click event as argument: same as without.
- `applyWebviewConfig({ …, initialLoadCommits: 500, loadMoreCommits: 50 })` with `maxCommits` 600:
  `maxCommits` stays 600; posts `loadBranches`, `repositoryQuery`, `loadCommits { maxCommits: 600 }`;
  `getWebviewConfig()` returns the new object. Then `initialLoadCommits: 1000`: `maxCommits` 1000,
  `loadCommits { maxCommits: 1000 }`; a following `loadMoreCommits()` gives 1050. No repository:
  `initialLoadCommits: 2000` → `maxCommits` 2000, nothing posted. Passing the current configuration
  object again still posts the full refresh. Before the configuration is initialised (fresh
  modules, `maxCommits` 10): no exception, `maxCommits` 10, nothing posted.
- `config-changed.test.ts`: `maxCommits` 300, configuration with `initialLoadCommits: 500` →
  `loadCommits { maxCommits: 500 }`; then `initialLoadCommits: 50` → `loadCommits { maxCommits: 500 }`.

### 4.9 Commit details

- `toggleCommitDetails("h1")` (details previously holding another commit): posts
  `{ command: "commitDetails", requestId: "graph-1", repo: "/repo", commitHash: "h1" }`;
  `expandedCommit` `"h1"`, `commitDetails` `null`.
- `toggleCommitDetails("h1")` again: nothing posted; both `null`.
- `toggleCommitDetails("*")`: nothing posted; `expandedCommit` `"*"`. Again: `null`.
- No repository, `toggleCommitDetails("h2")`: nothing posted; `expandedCommit` `"h2"`.
  Then with `/repo` selected, `toggleCommitDetails("h3")` uses `requestId: "graph-2"` (no number
  was used without a repository).
- `closeCommitDetails()`: both `null`, nothing posted; a late reply or `graphQueryError` for the
  closed request is ignored (`graph-requests.test.ts`, `GraphErrors.test.ts`).

### 4.10 `openContextMenu`

Listener on a button whose bounding rectangle is `left 120, bottom 64`:

| Event dispatched on the button           | Stored `x`, `y` |
| ---------------------------------------- | --------------- |
| `click`, `detail` 0, client (30, 40)     | 120, 64         |
| `click`, `detail` 1, client (0, 0)       | 0, 0            |
| `click`, `detail` 2, client (7, 8)       | 7, 8            |
| `contextmenu`, client (0, 0)             | 120, 64         |
| `contextmenu`, client (0, 9)             | 0, 9            |
| `contextmenu`, `detail` 0, client (3, 4) | 3, 4            |
| `mousedown`, client (0, 0)               | 120, 64         |
| `auxclick`, `detail` 0, client (5, 6)    | 5, 6            |

Every one of these had `defaultPrevented` true, never reached a listener on `document.body`, and
stored the same `entries` array with `source` as given. Also:

- listener on a parent `div` (rectangle `left 1, bottom 4`), `click` with `detail` 0 dispatched on
  a child `span` → (1, 4);
- listener on `window`, `contextmenu` at (0, 0) dispatched on `body` → (0, 0);
- a `MouseEvent("click", { detail: 0, clientX: 11, clientY: 12 })` that was never dispatched →
  (11, 12) (this is how `FileTree.tsx` opens a menu from the keyboard);
- with an error dialog open, opening a menu leaves the dialog store as it was.

Focus: button A focused, menu opened, button B focused, `closeContextMenu()` → focus still on B
right after the call, on A after one microtask. Opening a menu from A and then (without closing)
from B, then closing → focus returns to A (§7, question 12).

### 4.11 Dialogs

In a fresh module instance, in this order:

| Call                                                                                                              | `dialog` afterwards                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| (menu open) `openErrorDialog("E")`                                                                                | `{ kind: "error", message: "E", reason: null, token: 1 }`; menu `null`; one notification for both stores                                                           |
| `openErrorDialog("E", undefined)`                                                                                 | `reason: null`, `token: 2`                                                                                                                                         |
| `openErrorDialog("E", "")`                                                                                        | `reason: ""`, `token: 3`                                                                                                                                           |
| `openContentDialog("T", "body")`                                                                                  | `{ kind: "content", message: "T", content: "body", wide: false, token: 4 }`                                                                                        |
| `openContentDialog("T", "body", true)`                                                                            | `wide: true`, `token: 5`                                                                                                                                           |
| `openRunningDialog("R")`                                                                                          | `{ kind: "running", message: "R", token: 6 }` (keys exactly `kind`, `message`, `token`)                                                                            |
| `openRunningDialog("R", { detail: "d", started: 5, onCancel: f })`                                                | `{ kind: "running", message: "R", detail: "d", started: 5, onCancel: f, token: 7 }` (the same `f`)                                                                 |
| `openRunningDialog("R", { detail: "", started: 0 })`                                                              | keys `kind`, `message`, `detail`, `started`, `token` (no `onCancel`), `token: 8`                                                                                   |
| `openFormDialog({ message: "M", inputs: [{ kind: "text", value: "x" }], action: "Go", source: "src", onSubmit })` | `{ kind: "form", message: "M", inputs: [{ kind: "text", value: "x" }] (new array), action: "Go", destructive: false, onSubmit: <guard>, source: "src", token: 9 }` |
| `openFormDialog({ …, inputs: [], source: null, destructive: true })`                                              | `destructive: true`, `source: null`, `token: 10`                                                                                                                   |
| `openErrorDialog("same")` twice (after three more forms, tokens 11–13)                                            | two different objects, tokens 14 and 15                                                                                                                            |

Form guard, with `/repo` selected when the form opened: calling the stored `onSubmit(["typed"])`
calls the caller's callback with that same array and leaves the dialog as it was. With the
selection changed to `/other` before submitting: the caller's callback is not called and `dialog`
becomes `null`. Opened with no repository and submitted with none: callback called. Opened with
none and submitted after `/x` was selected: not called, dialog `null`. Opened with `/a`, selection
changed to `/b` and back to `/a`, submitted: callback called. `menus.test.ts`: a Create Branch form
submitted after `selectedRepo` changed posts nothing and leaves `dialog` `null`.

Focus: button A focused, `openErrorDialog("E")`, a control inside the dialog focused,
`openErrorDialog("E2")` (replacing), `closeDialog()` → focus unchanged right after the call, on A
after one microtask. `closeDialog()` immediately followed by `openContentDialog(…)` → focus is not
moved back; it returns to A only after the second dialog is closed.

### 4.12 `runAction` and `viewDiff`

- `/repo` selected, a context menu open: `runAction({ command: "deleteTag", tagName: "v1" })` posts
  `{ command: "deleteTag", tagName: "v1", requestId: "action-1", repo: "/repo" }`; `dialog` =
  `{ kind: "running", message: "deleteTag", detail: "/repo\nv1", started: <now>, token: 1 }`;
  context menu `null`; `activity` = `[{ id: "action-1", repo: "/repo", title: "deleteTag",
detail: "v1", started: <now>, finished: null, error: null }]`.
- `runAction({ command: "pushTag", tagName: "v1", remote: "origin", requestId: "mine" })` posts
  `{ command: "pushTag", tagName: "v1", remote: "origin", requestId: "action-2", repo: "/repo" }`;
  the running dialog has detail `"/repo\norigin · v1"` and an `onCancel` (a network command).
- `runAction({ command: "repositoryAction", requestId: "x", action: { kind: "fetch", remote: "origin" } })`
  posts `{ command: "repositoryAction", requestId: "action-3", action: { … }, repo: "/repo" }`.
- No repository: `runAction(…)` and `viewDiff(…)` post nothing, open nothing, add no activity.
- `viewDiff("c1", { oldFilePath: "a.txt", newFilePath: "b.txt", type: "R", additions: 3,
deletions: null })` posts `{ command: "viewDiff", repo: "/repo", commitHash: "c1", oldFilePath:
"a.txt", newFilePath: "b.txt", type: "R" }`; `dialog` stays `null`.

---

## 5. Non-functional requirements

### 5.1 Loading the module

- Importing must have no effect of its own: no message, no store write, no DOM access, and no
  read of `window.l10n` or of the configuration. `branch-focus.test.ts` and others import it before
  `window.l10n` exists; `webview-config.test.ts` and `preference-lifetime.test.ts` import it before
  the configuration is initialised. (Importing its dependencies does call `acquireVsCodeApi` inside
  `vscode.ts` and `vscode.getState` inside `navigation.ts`; that is theirs.)
- The module sits in import cycles: it imports `repository-actions.tsx` and `remote-actions.tsx`,
  which import it back, and the cycles also run through `workspace-actions.ts`,
  `use-repository-query.ts`, `components/history/WorkflowTools.tsx` and
  `components/history/HistoryTools.tsx` (all six modules both depend on it and are reached from
  it, counting value imports only). Depending on which module a test or the page loads first,
  this module's body may run before or after theirs. Its top level must therefore not use
  any imported binding (no calls, no reads of stores, no derived constants built from imports);
  all such use belongs inside the exported functions. The exports themselves should be usable as
  soon as the module is linked (declared functions rather than values assigned while the module
  body runs), so that a module in the cycle that evaluates first could call them.
- Configuration: only `applyWebviewConfig` must work before the configuration is initialised
  (`webview-config.test.ts`). The page initialises it before calling anything else, and every
  test that calls the other exports does so first, so their behaviour without a configuration is
  not relied on; today the exports that need a page size (a history reset, `loadMoreCommits`)
  throw part-way through (§7, question 14).
- Module-level state (the dialog token counter, the action id counter) belongs to the module
  instance: `preference-lifetime.test.ts` and `webview-config.test.ts` re-import everything with
  `vi.resetModules()` to simulate a new panel and expect nothing to survive. Do not keep state on
  `window`, `globalThis` or in the webview state.

### 5.2 Synchronous, ordered effects

- Every store write and message happens before the call returns, in the order given in §3. Tests
  read the stores and the mocked `postMessage` right after calling, often outside `act()`; inside
  `act()` the resulting renders are flushed when `act` ends. Nothing may be deferred to a promise,
  timer or animation frame.
- The only deferred effect is the focus return, which `restoreFocus` schedules as one microtask.
  `closeDialog` and `closeContextMenu` must call it synchronously so that a single
  `await Promise.resolve()` in the tests sees the focus back (`ContextMenu.test.ts`,
  `workflows.test.ts`, `Dialog.behaviour.test.ts`).
- Focus capture must happen before the dialog or menu store changes.

### 5.3 Grouped notifications

Subscribers (components, `repository-actions`' dialog watcher, `useColumnResize`) must never see
these groups half-applied; each is one notification (observed by counting effect runs):

- `selectRepo`: the end state listed in §3.1 except `graphErrors` (repository, restored
  navigation, branch and commit stores, history reset, repository-state reset, dialog closing).
  The old repository's preference write to `repoStates` comes before, separately.
- `selectBranch`, `setBranchDisplay`, `focusBranchInGraph`: the selection / mode / pause change
  together with the history reset. (Revealing a remote is its own notification before it; the
  preference write is a separate one after.)
- `toggleCommitDetails`, `closeCommitDetails`: `expandedCommit` with `commitDetails`.
- Remote-visibility change: the selection reset, `focusPaused` and `historyOffset`.
- `receiveRepoState` for the selected repository: the preference restoration together with the
  remote-visibility change's store writes.
- Revealing a remote; `setRemoteVisible`'s hidden-list write with the remotes switch.
- Every dialog opener: closing the context menu with setting the dialog.

### 5.4 Store identity and value shapes

- Write into the signal objects exported by `stores.ts`, `navigation.ts` and
  `repository-actions.tsx`; never create replacements.
- `repoStates` is updated immutably: each write stores a new top-level object and a new record for
  the repository concerned; records of other repositories keep their identity
  (`remote-visibility.test.ts` checks `columnWidths` keeps its identity through
  `receiveRepoState`; `ColumnResize.test.ts` relies on the stored widths array being the one
  passed in).
- `contextMenu` and `dialog` values have exactly the keys listed in §3.11–3.12 (no `undefined`
  placeholders for absent optional fields: with `exactOptionalPropertyTypes` they are not allowed,
  and the running dialog's rendering depends on their absence).
- This module is the only writer of `dialog` and `contextMenu` in `src/`.

### 5.5 Performance

- All exports do a constant amount of work apart from copying small arrays (hidden remotes, form
  inputs). None may iterate the commit list, the branch list or the refs (the Branches pane
  renders thousands of refs in `RefsScale.test.ts` / `RefsTiming.test.ts`, and the graph can hold
  tens of thousands of rows).
- `setColumnWidths` is on the column-drag path. It must post nothing and write `repoStates` once
  per call; `ColumnResize.test.ts` checks that a drag does not re-render the table after the
  first change, so no extra store writes may be added.
- No timers, intervals or listeners are created by this module.

### 5.6 Repository checks the file must pass

- `pnpm run typecheck` (the webview and test projects, `strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax` —
  type-only imports must use `import type`).
- `pnpm run lint` (oxlint), including alphabetised, grouped imports (`@/` imports as the internal
  group) and the `oxlint/webview-text.cjs` rule against user-visible literal text (this module
  shows none; its only string for the user comes from `window.l10n`).
- `pnpm run format` (oxfmt).
- `pnpm run check:provenance`: after the rewrite the file must contain no upstream lines; lines
  that necessarily coincide (such as exported signatures) are reviewed and listed as the
  provenance process describes.

---

## 6. Test coverage

### 6.1 What the existing tests check

- `tests/webview/lib/branch-focus.test.ts`: focusing a local branch from its menu switches
  `"filter"` to `"focus"` without checkout, keeps loaded rows and posts only `saveRepoState`;
  focusing a hidden remote branch turns remotes on and posts exactly `loadBranches`, `loadCommits`
  (`branchName: ""`); pause/resume keeps rows, target, expansion and `maxCommits`; paused target and
  dimming restored per repository; `setBranchDisplay("focus")` from Show All targets HEAD without
  reloading; focus mode requests `branchName: ""` and ignores an older filtered reply;
  `loadMoreCommits` and switching back to `"filter"` request the right `branchName`; the view is
  restored per repository and falls back when the focused branch disappears (with `refresh`).
- `tests/webview/lib/graph-requests.test.ts`: an older reply cannot undo a newer load-more or
  refresh (`maxCommits` 400 vs 300); older branch replies ignored; replies from before a
  visibility change away and back are rejected; replies from a previous visit to a repository are
  rejected; stale details errors and closed/replaced details requests ignored; another
  repository's details for the same hash ignored.
- `tests/webview/lib/remote-visibility.test.ts`: `setRemoteVisible` persists
  `saveRepoState { hiddenRemotes }` and survives the global toggle and repository switches;
  hiding the focused remote clears the target; selecting/focusing a hidden remote branch reveals
  only its remote; replies with an old visibility key are ignored; `receiveRepoState` restores
  hidden remotes and widths before the first branch request of a reopened panel, keeps the widths
  array identity, and does nothing visible (no message) for another repository.
- `tests/webview/lib/preference-lifetime.test.ts`: view mode, focus target, pause, dimming, both
  remote choices and widths persist per repository across switches and fresh panels (checked
  against a simulated extension store); a cleared target stays cleared; fallback to HEAD when the
  saved target is gone, saved; unborn/detached repositories clear focus; switching away before
  branches load does not overwrite saved preferences; a newer local choice beats an older
  preference snapshot; migration from old webview state.
- `tests/webview/lib/menu-anchor.test.ts`: keyboard `click` (`detail` 0) and `contextmenu` at
  (0, 0) open below the button; pointer openings use the pointer position.
- `tests/webview/lib/workflows.test.ts`: focus returns to the original control across menu → dialog
  → close.
- `tests/webview/lib/webview-config.test.ts`: `applyWebviewConfig` before initialisation neither
  throws nor changes `maxCommits`. `config-changed.test.ts` and `rpc-handler.test.ts`: a changed
  configuration raises `maxCommits` for a larger first page, keeps it for a smaller one, and
  reloads; `repo.updated` reloads (`loadBranches`, `repositoryQuery`, `loadCommits`); `repo.select`
  selects and posts `selectRepo` after the picker entry is added; selecting the already selected
  repository posts nothing. `repo-selection.test.ts`: the exact `loadBranches` message after a
  switch; selection and rows cleared.
- `tests/webview/components/commit/GraphErrors.test.ts`: graph errors shown with Retry; Retry
  (`refresh`) sends a new request and clears the error; `selectRepo` clears all errors; stale
  errors ignored; independent branch and commit errors; a stale details error does not close a
  newer selection.
- `tests/webview/components/commit/ColumnResize.test.ts`: `setColumnWidths` / `saveColumnWidths`
  through the resize hook (one save per drag, exact `saveRepoState { columnWidths }` message, no
  save without a repository or after a repository switch); `receiveRepoState` during a drag does
  not replace the dragged widths.
- `tests/webview/components/ui/ContextMenu.test.ts`: menus opened through `openContextMenu` from
  real events, replacing each other, closing with focus returned after a microtask, closing when a
  dialog opens.
- `tests/webview/components/ui/Dialog.behaviour.test.ts` and `Dialog.test.ts`: rendering, closing,
  initial focus (including `destructive` forms), a new token per opened dialog ("starts a new
  dialog afresh"), submit order (close first, then `onSubmit` with one value per input), a dialog
  opened by `onSubmit` stays, running and error dialog contents, content dialog width, focus
  restoration only through `closeDialog`.
- `menus.test.ts`, `menu-actions.test.ts`: `runAction` messages (`requestId` any string, `repo`
  appended), the form guard after a repository change, nothing sent without a repository.
  `cancel-action.test.ts`: running dialogs offer to stop network commands.
- `WorkingTreeDetails.test.ts`: `toggleCommitDetails("*")` expands the uncommitted row and posts
  no `commitDetails`; its Retry (`refresh`) reloads the working tree (through
  `repositoryRevision`).
- `RefsPane.test.ts`: clicking a branch requests its commits; clicking a hidden remote branch turns
  remotes on and selects `remotes/origin/feature`; opening a label's menu sets its source.

### 6.2 Gaps, with the test to add

Unless stated: `setupWebviewTest()`, `resetGraphRequests()`, `vi.clearAllMocks()`, populated
stores as in §4 (`/repo`, `commitList` `[]`, `maxCommits` 600, view mode `"filter"`, remotes on,
`repoStates` `{}`), and "messages" = the commands posted through `vscodeApi.postMessage`.

1. **`selectBranch` of the current branch is a no-op.** Setup: selection `main`, rows `[]`.
   Call `selectBranch("main")`. Expect no message; `commitList` is the same array; `maxCommits` 600.
2. **`selectBranch` without a repository.** Setup: `selectedRepo` `undefined`, selection `"*"`.
   Call `selectBranch("topic")`. Expect no message; selection `topic`; `commitList` `undefined`;
   `maxCommits` 300.
3. **Re-selecting a remote branch while remotes are off reloads without resetting.** Setup:
   selection `remotes/origin/main`, remotes off, rows `[]`. Call
   `selectBranch("remotes/origin/main")`. Expect remotes on; `commitList` the same array; messages
   `loadBranches` then `loadCommits` with `branchName: "remotes/origin/main"`, `maxCommits: 600`,
   `showRemoteBranches: true`, then `saveRepoState { graphPreferences }` (the record held no
   preferences yet).
4. **Revealing persists the remaining hidden list first.** Setup: `repoStates` `{ "/repo": {
columnWidths: [1,2,3,4], hiddenRemotes: ["origin","team/mirror"] } }`, selection `"*"`. Call
   `selectBranch("remotes/origin/main")`. Expect message commands in order `saveRepoState`
   (`state: { hiddenRemotes: ["team/mirror"] }`), `loadBranches`, `loadCommits`, `saveRepoState`
   (`graphPreferences`); record keeps `columnWidths: [1,2,3,4]`.
5. **`setBranchDisplay` of the current mode is a no-op.** Call `setBranchDisplay("filter")`.
   Expect no message and unchanged stores.
6. **`setBranchDisplay` fallback chain.** Setup: selection `"*"`, `headBranch` `null`,
   `branchList` `["dev","main"]`. Call `setBranchDisplay("focus")`: selection `dev`. Reset to
   `"filter"`/`"*"` with `branchList` `[]`, call again: selection `"*"`.
7. **`setBranchDisplay` with no selection yet.** Setup: selection `undefined`, rows `undefined`.
   Call `setBranchDisplay("focus")`. Expect no message; selection `undefined`; mode `"focus"`.
8. **`focusBranchInGraph` from a filtered branch resets and reloads.** Setup: selection `main`,
   `expandedCommit` `"abc"`. Call `focusBranchInGraph("topic")`. Expect mode `"focus"`;
   `commitList` `undefined`; `maxCommits` 300; `expandedCommit` `null`; a `loadCommits` with
   `branchName: ""`, `maxCommits: 300`; no Git command.
9. **`focusBranchInGraph` without a repository.** Setup: no repository, rows `undefined`. Call
   `focusBranchInGraph("topic")`. Expect no message; mode `"focus"`; selection `topic`.
10. **Width functions without a repository.** Setup: no repository; keep `const before =
repoStates.value`. Call `setColumnWidths([1])` and `saveColumnWidths([1])`. Expect
    `repoStates.value` to be `before` and no message.
11. **`setColumnWidths` stores the array itself and leaves other records alone.** Setup:
    `repoStates` `{ "/repo": { columnWidths: null, hiddenRemotes: ["x"] }, "/other": R }`. Call
    `setColumnWidths(w)`. Expect `repoStates.value["/repo"].columnWidths` to be `w` (identity),
    `hiddenRemotes` `["x"]`, `repoStates.value["/other"]` to be `R`, no message. Then
    `saveColumnWidths(w2)`: exactly one message `{ command: "saveRepoState", repo: "/repo", state:
{ columnWidths: w2 } }`.
12. **`setShowRemoteBranch` of the current value is a no-op.** Call `setShowRemoteBranch(true)`.
    Expect no message.
13. **Turning remotes off with a remote branch selected.** Setup: selection
    `remotes/origin/main`, `focusPaused` true, `historyOffset` 7, rows `[]`. Call
    `setShowRemoteBranch(false)`. Expect selection `"*"`, `focusPaused` false, `historyOffset` 0,
    `commitList` the same array, `maxCommits` 600; messages `loadBranches`
    (`showRemoteBranches: false`, `visibilityKey: "[false,[]]"`) then `loadCommits`
    (`branchName: ""`).
14. **Remote switches without a repository.** Setup: no repository, remotes off. Call
    `setRemoteVisible("origin", true)`. Expect no message, `repoStates` `{}`, remotes on. Then
    `setShowRemoteBranch(false)`: no message.
15. **Hidden list is sorted and deduplicated.** Setup: `repoStates` `{ "/repo": { columnWidths:
null } }`. Call `setRemoteVisible("zeta", false)`, `setRemoteVisible("alpha", false)`,
    `setRemoteVisible("alpha", false)`. Expect the last `saveRepoState` to carry
    `hiddenRemotes: ["alpha","zeta"]` and the stored list to be `["alpha","zeta"]`.
16. **`receiveRepoState` with nothing new posts nothing.** Setup: selection `main`,
    `repoStates` `{ "/repo": { columnWidths: null, hiddenRemotes: ["o"], graphPreferences: P } }`.
    Call it with `{ columnWidths: [9,9,9,9], hiddenRemotes: ["o"], graphPreferences: Q }`. Expect
    no message; stored `columnWidths` `null`, `graphPreferences` `P`.
17. **`loadMoreCommits` without a repository or branch.** Setup: selection `undefined`. Call.
    Expect `maxCommits` 700, no message. Same with no repository.
18. **`refresh` without a repository, and its order.** No repository: no message,
    `repositoryRevision` unchanged. With `/repo` and selection `main`: message commands (leaving
    out any `cancelRepositoryQuery`) in order `loadBranches`, `repositoryQuery`, `loadCommits`;
    `repositoryRevision` +1; rows and `expandedCommit` unchanged.
19. **`toggleCommitDetails` without a repository.** Setup: no repository. Call
    `toggleCommitDetails("h")`. Expect `expandedCommit` `"h"`, `commitDetails` `null`, no message.
20. **`viewDiff`.** With `/repo`: call with `{ oldFilePath: "a", newFilePath: "b", type: "R",
additions: 1, deletions: 2 }`. Expect exactly `{ command: "viewDiff", repo: "/repo",
commitHash, oldFilePath: "a", newFilePath: "b", type: "R" }` and `dialog` `null`. Without a
    repository: no message.
21. **`selectRepo` resets and orders its messages.** Setup: populated, an error dialog and a
    context menu open, `expandedCommit` `"abc"`. Call `selectRepo("/b")`. Expect `dialog` `null`,
    `contextMenu` still set, `branchList` / `commitList` / `selectedBranch` `undefined`,
    `headBranch` / `commitHead` / `expandedCommit` `null`, `maxCommits` 300; message commands end
    with `selectRepo`, `loadBranches`, `repositoryQuery`, and include no `loadCommits`.
22. **`selectRepo` is one notification.** Setup: an effect reading `selectedRepo`, `branchList`,
    `commitList` and `dialog` (dialog open). Call `selectRepo("/b")`. Expect exactly one effect run
    for the call.
23. **`openContextMenu` stops the event.** A button listener calls `openContextMenu`; a
    `document.body` listener counts events. Dispatch a cancelable bubbling `contextmenu`. Expect
    `defaultPrevented` true and the body count 0.
24. **Keyboard anchoring uses the listening element.** A parent `div` (mocked rectangle `left 1,
bottom 4`) listens; dispatch a `click` with `detail` 0 on a child. Expect (1, 4). A listener on
    `window` receiving `contextmenu` at (0, 0): expect (0, 0). An undispatched `MouseEvent("click",
{ detail: 0, clientX: 11, clientY: 12 })`: expect (11, 12).
25. **Opening a dialog closes the menu in one notification.** Setup: menu open; effect reading
    `contextMenu` and `dialog`. Call `openErrorDialog("E")`. Expect one effect run, menu `null`,
    dialog `{ kind: "error", message: "E", reason: null }`.
26. **Dialog shapes and tokens.** Call `openRunningDialog("R")`: `Object.keys(dialog.value)`
    equals `["kind","message","token"]` in any order. `openContentDialog("T", "b")`: `wide:
false`. `openErrorDialog("E", undefined)`: `reason: null`. Two `openErrorDialog("same")` calls
    give different objects with different tokens.
27. **Form details.** `openFormDialog` with an `inputs` array `I` and no `destructive`: stored
    `inputs` equals `I` but is not `I`; `destructive` is `false`. Opened with no repository, then
    `selectedRepo` set to `/x`, stored `onSubmit([])`: callback not called, `dialog` `null`.
28. **Action ids.** With `/repo`: two `runAction` calls post `requestId`s that differ and both start
    with `action-`; a `requestId: "mine"` in the command is not posted. Without a repository:
    nothing posted and `activity` unchanged.

---

## 7. Questions

1. **Hiding the selected branch's remote keeps the old rows.** When turning remotes off, hiding a
   remote, or receiving a hidden list makes the selected remote branch invisible, the selection
   becomes `"*"` but the loaded history is not reset: the previous branch's rows, `commitHead`,
   `moreCommitsAvailable`, `uncommittedChanges`, the enlarged `maxCommits` and an open details
   view stay until the reply arrives. `selectBranch("*")` in `"filter"` mode resets all of these.
   Intended, or should the visibility reset behave like choosing Show All?
2. **Precedence in `receiveRepoState`.** The in-memory record wins for every field except
   `hiddenRemotes`. (a) If the in-memory record already exists with `columnWidths: null` (created
   by a preference or hidden-remote save before the extension's record arrived), persisted widths
   are ignored for the rest of the session. (b) If preferences arrive while a branch is already
   selected, they are stored but not applied, the graph reloads anyway, and the reload's
   preference save replaces the persisted preferences (in memory and on disk) with whatever is
   in memory, which may be defaults. The extension currently answers `selectRepo` before the
   branch list, so (b) needs unusual timing. Intended?
3. **Order-sensitive hidden lists.** The same set of hidden remotes in another order counts as a
   change and reloads the graph, and the message's order is stored as is, whereas
   `setRemoteVisible` always stores a sorted list. Should the comparison and the stored list be
   order-independent?
4. **`setRemoteVisible` without a change.** Hiding an already hidden remote or showing a visible
   one still saves the list and reloads both lists; showing any remote also turns the global
   switch on. The first part looks unintended; the second may be deliberate (the eye button of a
   remote implies remotes are wanted). Which?
5. **`historyOffset` on reveal.** Every remote-visibility change resets the history page offset to
   0, but revealing a remote by selecting or focusing one of its branches (which also changes what
   the history search covers) does not. Intended?
6. **`loadMoreCommits` without a request.** It grows `maxCommits` even when no repository or no
   branch is selected, so the next load asks for a larger page than the user saw. Should it do
   nothing in that case?
7. **Unconditional reload on configuration change.** `applyWebviewConfig` reloads branches,
   repository state and commits for any `config.changed`, including one whose values are
   identical or only affect rendering (date format, colours). Intended?
8. **`selectRepo` leaves the context menu open.** The dialog is closed on a switch but a context
   menu is not; its entries would then act on the newly selected repository (e.g. `runAction`
   reads the selection when clicked). The menu normally closes on window blur, so this needs a
   switch triggered while the page keeps focus. Should the switch close the menu too?
9. **Details without a repository.** `toggleCommitDetails` with no repository marks the commit
   expanded with `commitDetails` `null` and sends nothing, which would leave a loading view.
   Should it do nothing instead?
10. **Mode changes re-target and un-pause.** Switching between `"focus"` and `"ancestors"` while
    focus is cleared (`"*"`) targets HEAD again, and every mode change clears the pause. Is the
    cleared state meant to survive a mode change? (`docs/preferences.md` only says a clear
    survives returning to the repository.)
11. **Keyboard detection edge cases.** A non-`click` event at viewport (0, 0) — e.g. a real
    right-click on the top-left pixel — is treated as keyboard-initiated and anchored under the
    control; a keyboard `contextmenu` handled by a listener on `window` or `document` opens at
    (0, 0). Acceptable?
12. **Focus after one menu replaces another.** Opening a second menu while the first is open
    (the outside-press handler closes the first, then the second opens in the same task) leaves
    the first opener remembered, so closing the second returns focus to the first opener, not the
    second. This comes from `focus.ts`' "first capture wins" rule. Intended?
13. **What the form guard compares.** Only the repository at opening and at submitting are
    compared: a switch away and back passes, and a form opened with no repository is refused
    once one is selected. Since `selectRepo` closes the dialog anyway, the guard mainly matters
    for direct writes to `selectedRepo` (e.g. `main.tsx` clearing it when no repositories
    remain). Is that the intended scope?
14. **Calls before the configuration exists.** Only `applyWebviewConfig` tolerates an
    uninitialised configuration. `selectRepo`, `selectBranch`, `setBranchDisplay`,
    `focusBranchInGraph` (when they reset the history) and `loadMoreCommits` throw part-way
    through: `selectRepo` is left with `selectedRepo` changed, the old repository's preferences
    posted, and no `selectRepo` or `loadBranches` message. The extension waits for `viewReady`
    before sending `repo.select`, so this should not happen today. Should these calls be made
    safe the same way?
15. **`runAction` overwrites `requestId`.** `ActionCommand` still allows (and for
    `repositoryAction`, `pushBranch`, `pullBranch`, `fetchRemote`, requires) a `requestId`, which
    is silently replaced. Should the parameter type drop `requestId`, or should a supplied one be
    kept?
16. **Empty repository path.** `selectRepo("")` is accepted and posts `selectRepo`,
    `loadBranches` and `repositoryQuery` with `repo: ""`, and every other export treats `""` as a
    selected repository. Should an empty path be rejected?

---

## 8. Decisions on §7 (from the project maintainer's side)

These decisions replace the "current behaviour" wherever they differ. Build to these, and test the decided behaviour.

- **Q1: keep.** A visibility change keeps the loaded rows until the reply replaces them.
- **Q2: keep.**
- **Q3: hidden lists are sets.** Two hidden-remote lists with the same remotes in any order are equal: receiving the same set in another order is not a change and reloads nothing. Every stored hidden list is sorted and free of duplicates, whichever export or message it came from.
- **Q4: no effect without a change.** `setRemoteVisible(remote, visible)` does nothing at all (no store change, no message) when the remote's hidden state already matches `visible` and, for `visible` true, the remotes switch is already on. Showing a remote still turns the switch on.
- **Q5: keep.**
- **Q6: nothing without a request.** `loadMoreCommits` changes nothing and posts nothing when it cannot send a commit-list request (no repository, or no selected branch).
- **Q7: keep.**
- **Q8: a repository switch closes the menu too.** `selectRepo` to another repository closes an open context menu as well as the dialog, in the same notification as its other store changes.
- **Q9: nothing without a repository.** `toggleCommitDetails` changes nothing and posts nothing when no repository is selected.
- **Q10: keep.**
- **Q11: keep.**
- **Q12: out of scope.** Focus return belongs to `focus.ts`.
- **Q13 – Q16: keep.**
