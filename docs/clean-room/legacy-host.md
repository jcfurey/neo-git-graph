# Clean-room specification: legacy host modules

This document states what four extension-host modules of Branchwise must do, as seen from outside them. It is written for an engineer who will write replacements without seeing the current files. It was derived from the modules' callers, the tests that load or replace them, the shared types, the modules they depend on, VS Code's documented API behaviour, and behaviour observed by running the current code.

| Section | Module                                | Question / gap prefix      |
| ------- | ------------------------------------- | -------------------------- |
| A       | `src/old-extension/messageHandler.ts` | `handler Q1`, `handler G1` |
| B       | `src/old-extension/webviewBridge.ts`  | `bridge Q1`, `bridge G1`   |
| C       | `src/old-extension/repoManager.ts`    | `manager Q1`, `manager G1` |
| D       | `src/old-extension/extensionState.ts` | `state Q1`, `state G1`     |

Every section has the same seven parts: Interface, Dependencies, Behaviour, Examples, Non-functional requirements, Test coverage (gaps written as test cases), and Questions.

---

## 0. Common ground

### 0.1 How the behaviour was observed

- Repository at commit `1873460`, Node v22.22.2, Vitest 4.1.11, Git 2.43.0, simple-git 3.x, Linux.
- The existing tests that touch the four modules were run through a Vitest configuration kept outside the repository (same aliases as `vitest.config.ts`, cache and coverage directed to a scratch folder). All 17 related files (85 tests) pass; the whole `extension` project (53 files, 489 tests) passes. V8 coverage of the four modules was taken from the whole `extension` project run to find what the tests never execute.
- Further behaviour was recorded with throw-away Vitest files in a scratch directory outside the repository, with `vscode`, the Git client factory, the backend functions and the watcher replaced by recorders. Those files and all scratch output were deleted afterwards. No repository file was changed.
- The VS Code integration suite (`tests-ext/`, `pnpm run test:ext`) and the UI harness (`tests-ext/ui/history.test.cjs`) were not run here; what they check is taken from their source.

### 0.2 Harness facts that constrain all four modules

- The `extension` Vitest project aliases `vscode` to `tests/extension/__mocks__/vscode.ts`. That default stand-in has only `workspace.{getConfiguration, workspaceFolders, createFileSystemWatcher, onDidChangeWorkspaceFolders, onDidChangeConfiguration}`, `commands.registerCommand` and `window.showErrorMessage`. With it, `vscode.l10n` is `undefined`, so calling `vscode.l10n.t` throws a `TypeError`.
- Many test files replace `vscode` again with `vi.mock("vscode", factory)`. **Reading any member that the factory did not define throws** (Vitest: "No "x" export is defined on the "vscode" mock"). So none of the four modules may touch any `vscode` member at import time, and at run time each code path may touch only the members listed for it in A.5.
- Tests also replace backend modules with factories that define only some exports (for example `@/backend/queries/repository` is replaced by a factory that has **only** `repositoryQuery` in `tests/extension/workspace-rows.test.ts`, and `@/backend/gitClient` by one that has **only** `gitClientFactory`). A replacement must import exactly the names listed in its "Dependencies" part, from exactly those module paths, or those tests break.
- `vi.mock` is keyed by the resolved file, so `@/x/y` and a relative path to the same file are the same mock. Re-exports through another module are not.
- `pnpm run typecheck` checks `src/` and `tests/` with `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` and `isolatedModules`; type-only imports must be written `import type`. `tests-ext/tsconfig.json` compiles `src/` again as CommonJS (`module: node18`), so the modules must not use ESM-only constructs such as `import.meta` or top-level `await`.
- Many tests hand the modules partial objects through `as unknown as` casts (a `config` with only `gitPath`, a `repoManager` with only `getRepos`, a bridge with only `post` and `onMessage`, deps with extra fields such as `gitClient`, `extensionState` or `repoFileWatcher`). Extra fields must be ignored, and members must be read only on the paths that need them (see A.5).

### 0.3 The message channel

The graph page (a webview) and the extension exchange "command messages": plain objects with a string `command`. Page-to-extension messages are typed `RequestMessage`, extension-to-page messages `ResponseMessage`, both in `src/types/legacy.ts` (re-exported from `@/types`). The action and query members come from `src/backend/types` (`ActionRequest`, `ActionResponse`, `QueryRequest`, `QueryResponse`, `QueryResult`, `GraphQueryCommand`). The same webview also carries RPC traffic (`{ kind: "rpc.request", ... }`, no `command`), handled by other listeners; module B must ignore it. `{ command: "viewReady" }` is also read by another listener (`src/extension/repoSelection.ts`) and has no handler here.

### 0.4 Localized strings (hard constraint from `pnpm run l10n:check`)

`l10n:check` regenerates `l10n/bundle.l10n.json` from the source with `vscode-l10n-dev export` and fails if the file changes (`git diff --exit-code`), then checks that the zh-cn and zh-tw bundles translate every key. It was confirmed by regenerating the bundle from a scratch copy of `src/` that:

- the bundle lists keys in order of first appearance, file by file, and the twelve keys of module A currently sit together, directly after `"View Graph"` and before `"Select a workspace file to view its history."`;
- swapping the first appearance of two of module A's keys changes the bundle, so `l10n:check` fails.

Therefore module A must call `vscode.l10n.t` with exactly these twelve English strings (as plain string literals, the first argument of a `vscode.l10n.t(...)` call), must make their **first appearances in `src/old-extension/messageHandler.ts` in this order**, and must not introduce any other `l10n.t` key in the four files:

1. `Added in {0}`
2. `Deleted in {0}`
3. `Another Git operation is running in this repository. Wait for it to finish.`
4. `The Git operation was cancelled.`
5. `Undo Restore`
6. `Restored {0}. Its previous contents are kept in Git until its next garbage collection.`
7. `Save or revert the unsaved changes to {0} in the editor first; saving them later would undo the restore.`
8. `The preview shows unsaved changes to {0}. Save or revert them before restoring.`
9. `Open Its Graph`
10. `{0} is a separate Git repository inside this one, so its files are not changes of this repository.`
11. `Staged Changes`
12. `Working Tree Changes`

Arguments must be passed positionally (`vscode.l10n.t(message, value)`), because several test mocks implement `t` as "replace `{0}` with the second argument" (one of them handles only a single argument). Modules B, C and D have no user-visible strings.

### 0.5 No Git command lines here

None of the four modules starts a process. Git runs only inside the backend functions module A calls (listed in A.2), through the client module A obtains from `gitClientFactory`. The Git command lines are those backend modules' business and are specified with them (`docs/clean-room/backend-actions.md`, `backend-queries.md`). What module A controls is which backend function runs, with which arguments, which client (repository folder, Git executable and abort signal), and what is posted afterwards.

---

## A. `src/old-extension/messageHandler.ts`

In one sentence: it answers every command message the graph page sends (Git actions, repository reads, graph reads, repository selection, saved view state and commit diffs), serializing Git actions per repository, cancelling superseded reads, and opening the editors that actions ask for.

### A.1 Interface

One runtime export, no default export, no other exports.

```ts
export function registerMessageHandlers(
  bridge: WebviewBridge,
  deps: { config: Config; repoManager: RepoManager }
): { dispose: () => void; onPanelShown: () => void };
```

- `bridge` — the page connection from module B (`WebviewBridge`). Only `bridge.onMessage(command, handler)` and `bridge.post(message)` are used; `bridge.dispose` is never called by this module.
- `deps.config` — the settings object (`Config`, the type of `extConfig` in `src/extension/config.ts`). Only `gitPath()`, `dateType()`, `showUncommittedChanges()` and `maxDepthOfRepoSearch()` are read, each at the moment it is needed (never cached at registration), so a changed setting applies to the next request.
- `deps.repoManager` — the saved per-repository state (module C). Only `getRepos()`, `setRepoState()`, `updateHiddenRemotes()` and `pruneMissing()` are used, each only on the path that needs it.
- `deps` may carry other fields in tests (`gitClient`, `extensionState`, `repoFileWatcher`); they must be ignored.
- The returned object:
  - `dispose()` — stops every graph read and repository read still running for this registration (their signals abort, and they post nothing). Safe to call more than once. It does not stop actions or `loadRemotes` reads (see `handler Q1`).
  - `onPanelShown()` — forgets which repository the page last showed, so the next `selectRepo` or graph read, even for the same repository, counts as a new selection (A.3.7).

The type must accept, without a cast, a bridge written as an object literal `{ post, onMessage: (name, handler) => { ... }, dispose }` (as `tests/extension/remote-preferences.test.ts` and `view-preferences.test.ts` do), which is the case when the first parameter is typed `WebviewBridge` from module B.

**Commands registered.** Registration calls `bridge.onMessage` exactly once for each of these 27 commands, and nothing else (no posts, no reads of `config` or `repoManager`, no `vscode` calls, no Git):

- 17 actions: `repositoryAction`, `addTag`, `deleteTag`, `pushTag`, `createBranch`, `deleteBranch`, `renameBranch`, `checkoutBranch`, `checkoutCommit`, `cherrypickCommit`, `revertCommit`, `resetToCommit`, `mergeBranch`, `mergeCommit`, `pushBranch`, `pullBranch`, `fetchRemote`;
- 2 cancellations: `cancelAction`, `cancelRepositoryQuery`;
- 2 repository reads: `repositoryQuery`, `loadRemotes`;
- 3 graph reads: `loadCommits`, `loadBranches`, `commitDetails`;
- 3 others: `selectRepo`, `saveRepoState`, `viewDiff`.

`viewReady` is not registered. Registration order is not observable through the real bridge.

**Messages posted** (all through `bridge.post`, shapes from `@/types` and `@/backend/types`):

| Posted `command`               | Shape                                                                                                            |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| each of the 17 action commands | `{ command, status }` plus `requestId` and `repo` when the request had a `requestId` property                    |
| `repositoryQuery`              | `{ command, repo, requestId, data, status }`                                                                     |
| `loadRemotes`                  | `{ command, repo, requestId, remotes, upstream, pushRemote, status }` (plus any extra field the backend returns) |
| `loadCommits`                  | `command`, `repo`, `requestId`, `branchName`, `visibilityKey` and every field of the backend result              |
| `loadBranches`                 | `command`, `repo`, `requestId`, `visibilityKey` and every field of the backend result                            |
| `commitDetails`                | `{ command, repo, requestId, commitDetails }`                                                                    |
| `graphQueryError`              | `{ command: "graphQueryError", query, repo, requestId, message }`                                                |
| `repoState`                    | `{ command: "repoState", repo, state }`                                                                          |
| `viewDiff`                     | `{ command: "viewDiff", success }`                                                                               |
| `refresh`                      | `{ command: "refresh" }` (only after an Undo Restore, A.3.2)                                                     |

**Who uses what.**

| User                                         | What it uses                                                                                                                                                                                                                                  |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/extension/legacy.ts`                    | `registerMessageHandlers(bridge, { config: extConfig, repoManager })` once per panel attachment; calls `onPanelShown()` when a hidden panel becomes visible (just before posting `refresh`), and `dispose()` when the attachment is disposed. |
| `tests/extension/action-dispatch.test.ts`    | registration; the 16 plain actions and `repositoryAction` dispatch; the lock (same repository, submodule trees, view-only actions)                                                                                                            |
| `tests/extension/message-echoes.test.ts`     | echo fields of actions without `requestId`, `loadRemotes`, `loadBranches` (`visibilityKey`), `repositoryQuery`                                                                                                                                |
| `tests/extension/restore-undo.test.ts`       | `restoreFile` refusal over unsaved editors, `previewFileRestore` warning and diff, Undo Restore offer and `refresh` (real Git)                                                                                                                |
| `tests/extension/graph-queries.test.ts`      | latest-wins graph reads, cancellation on repository change and `dispose`, `graphQueryError`, client-creation failure                                                                                                                          |
| `tests/extension/remote-preferences.test.ts` | hidden-remote updates after `renameRemote`/`removeRemote`, reconciliation after a `state` query, the "record changed meanwhile" guard, `selectRepo` (real Git, real module C)                                                                 |
| `tests/extension/view-preferences.test.ts`   | `saveRepoState` merging and `selectRepo` after re-creation (real modules C and D)                                                                                                                                                             |
| `tests/extension/view-diff.test.ts`          | `viewDiff` success/failure (deps has **no** `repoManager`)                                                                                                                                                                                    |
| `tests/extension/workspace-rows.test.ts`     | the `repos` option of a `workspace` repository query                                                                                                                                                                                          |
| `tests/extension/query-cancellation.test.ts` | `cancelRepositoryQuery` matching, `dispose` aborting repository queries, actions unaffected                                                                                                                                                   |
| `tests/extension/action-cancel.test.ts`      | `cancelAction` on a stalled real `git push`, busy refusal, release afterwards                                                                                                                                                                 |
| `tests/extension/action-repository.test.ts`  | an action runs in its own repository whatever is selected; watcher mute/unmute; view-only actions do not mute                                                                                                                                 |
| `tests/extension/nested-repository.test.ts`  | the nested-repository message and its "Open Its Graph" button                                                                                                                                                                                 |
| `tests/extension/legacy-types.test.ts`       | `selectRepo` for an unsaved repository; compile-time shape of `Parameters<typeof registerMessageHandlers>`                                                                                                                                    |
| `tests/extension/message-protocol.test.ts`   | replaces the whole module with a factory exporting only `registerMessageHandlers`                                                                                                                                                             |

### A.2 Dependencies the implementation must use

Import exactly these names from exactly these paths (tests replace most of them with partial factories):

| Import path                                            | Names                                                                                                                                                                                                                        | Purpose                                                                                                                                                                                                                                                              |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vscode` (namespace import)                            | `l10n.t`, `workspace.textDocuments`, `workspace.openTextDocument`, `window.showInformationMessage`, `window.showWarningMessage`, `window.showErrorMessage`, `window.showTextDocument`, `commands.executeCommand`, `Uri.file` | messages, dirty-editor check, opening editors and diffs. Read members lazily, only on the paths in A.5.                                                                                                                                                              |
| `simple-git`                                           | type `SimpleGit`                                                                                                                                                                                                             | type of the client handed to backend functions (type-only)                                                                                                                                                                                                           |
| `node:path`                                            | `join` (default or namespace import)                                                                                                                                                                                         | building the absolute path of a restore target for the dirty-editor check                                                                                                                                                                                            |
| `@/backend/gitClient`                                  | `gitClientFactory`                                                                                                                                                                                                           | `gitClientFactory(repo, config.gitPath(), signal).getInstance()` gives the client for every Git call. It throws synchronously when the folder does not exist. Do not import anything else from this module.                                                          |
| `@/backend/actions/branch`                             | `checkoutBranch`, `createBranch`, `deleteBranch`, `renameBranch`                                                                                                                                                             | action bodies, called `f(git, message)`                                                                                                                                                                                                                              |
| `@/backend/actions/commit`                             | `checkoutCommit`, `cherrypickCommit`, `resetToCommit`, `revertCommit`                                                                                                                                                        | action bodies, `f(git, message)`                                                                                                                                                                                                                                     |
| `@/backend/actions/merge`                              | `mergeBranch`, `mergeCommit`                                                                                                                                                                                                 | action bodies, `f(git, message, config.gitPath())`                                                                                                                                                                                                                   |
| `@/backend/actions/remote`                             | `fetchRemote`, `pullBranch`, `pushBranch`                                                                                                                                                                                    | action bodies, `f(git, message)`                                                                                                                                                                                                                                     |
| `@/backend/actions/tag`                                | `addTag`, `deleteTag`, `pushTag`                                                                                                                                                                                             | action bodies, `f(git, message)`                                                                                                                                                                                                                                     |
| `@/backend/actions/repository`                         | `runRepositoryAction`                                                                                                                                                                                                        | `runRepositoryAction(git, message.action, config.gitPath())` resolves to a `RepositoryEffect` (the exported type of the same module; a type-only import of it is allowed) or `undefined`                                                                             |
| `@/backend/queries/repository`                         | `repositoryQuery` (only this name)                                                                                                                                                                                           | `repositoryQuery(git, message.query, { repos, binary: config.gitPath(), signal })`. Call it through the import at call time: `remote-preferences.test.ts` replaces it with `vi.spyOn` on the module namespace, which a reference captured at import time would miss. |
| `@/backend/queries/loadRemotes`                        | `loadRemotes`                                                                                                                                                                                                                | `loadRemotes(git, message.branchName)`                                                                                                                                                                                                                               |
| `@/backend/queries/loadCommits`                        | `loadCommits`                                                                                                                                                                                                                | graph read                                                                                                                                                                                                                                                           |
| `@/backend/queries/loadBranches`                       | `loadBranches`                                                                                                                                                                                                               | graph read                                                                                                                                                                                                                                                           |
| `@/backend/queries/commitDetails`                      | `commitDetails`                                                                                                                                                                                                              | graph read                                                                                                                                                                                                                                                           |
| `@/backend/types`                                      | types `ActionRequest`, `GitFileChangeType`, `GraphQueryCommand`, `QueryResult`, `RestoreBackup` (as needed)                                                                                                                  | message and result types (type-only)                                                                                                                                                                                                                                 |
| `@/backend/utils/remoteVisibility`                     | `remoteForRef`                                                                                                                                                                                                               | which remote a remote-tracking ref name belongs to (longest configured remote name that prefixes it, else the first segment)                                                                                                                                         |
| `@/backend/utils/repoPath`                             | `isRepoWithinPath`, `normalizeRepoPath`                                                                                                                                                                                      | path containment for submodule locks; path comparison for the dirty-editor check                                                                                                                                                                                     |
| `@/backend/utils/string`                               | `abbrevCommit`                                                                                                                                                                                                               | 8-character commit label in `viewDiff` titles                                                                                                                                                                                                                        |
| `@/extension/config`                                   | type `Config` (type-only; importing the value would read settings)                                                                                                                                                           | type of `deps.config`                                                                                                                                                                                                                                                |
| `@/extension/conflicts`                                | `openConflict`                                                                                                                                                                                                               | `openConflict(path, status)` for a `conflict` effect                                                                                                                                                                                                                 |
| `@/extension/util/logger`                              | `logger` (`error`, `debug`)                                                                                                                                                                                                  | two log lines (A.3.8, A.3.10)                                                                                                                                                                                                                                        |
| `@/extension/watchers/git-repo.watcher`                | `selectWatchedRepo`, `muteGitRepoWatcher`, `unmuteGitRepoWatcher` (only these)                                                                                                                                               | retarget the repository file watcher; silence it while an action changes a repository                                                                                                                                                                                |
| `@/extension/workspace-scan`                           | `listRepos`, `invalidateWorkspaceScan` (only these)                                                                                                                                                                          | picker rows for a `workspace` query; drop the cached scan after a submodule action                                                                                                                                                                                   |
| `@/old-extension/diffDocProvider`                      | `encodeDiffDocUri`, `encodeDiffBlobUri`                                                                                                                                                                                      | build every `branchwise:` URI this module opens. **Required**: the document provider serves a repository only if a URI for it was built with these functions in this session (or it has saved state), so hand-built URIs would open empty documents.                 |
| `@/types`                                              | types `RequestMessage`, `ResponseMessage`                                                                                                                                                                                    | message types (type-only)                                                                                                                                                                                                                                            |
| `./repoManager` (or `@/old-extension/repoManager`)     | type `RepoManager` (type-only)                                                                                                                                                                                               | type of `deps.repoManager`                                                                                                                                                                                                                                           |
| `./webviewBridge` (or `@/old-extension/webviewBridge`) | type `WebviewBridge` (type-only)                                                                                                                                                                                             | type of `bridge`                                                                                                                                                                                                                                                     |

The encoding functions produce: `encodeDiffDocUri(repo, path, commit)` → `branchwise:` URI with path `path` and query `commit=<enc(commit)>&repo=<enc(repo)>`; `encodeDiffBlobUri(repo, path, blob | null)` → the same with the blob id (40 zeros for `null`) and `&blob=1` appended. A commit or blob of 40 zeros yields an empty document.

### A.3 Behaviour

State kept per registration (per panel attachment): the repository the page currently shows (initially none), the set of repositories with an exclusive action running (each marked "whole tree" or not), the running actions that have a `requestId` (with their repository and abort signal), the running repository reads by `requestId`, the running graph read of each of the three graph commands, and a counter for Undo Restore request ids. Nothing is shared between registrations except what the imported modules keep (the watcher's mutes, the workspace scan cache, the diff-provider's repository list).

Error text: wherever this section says "the error's text", it means `error.message` for an `Error`, otherwise `String(error)`.

#### A.3.1 The 16 plain actions

`addTag`, `deleteTag`, `pushTag`, `createBranch`, `deleteBranch`, `renameBranch`, `checkoutBranch`, `checkoutCommit`, `cherrypickCommit`, `revertCommit`, `resetToCommit`, `mergeBranch`, `mergeCommit`, `pushBranch`, `pullBranch`, `fetchRemote`. For a request message `m` (fields per `ActionRequest`):

1. **Lock check.** The request is refused if an exclusive action is already running (in this registration) for a repository `r` that is the same string as `m.repo`, or that is marked "whole tree" while `m.repo` lies inside it (as `isRepoWithinPath(m.repo, r)` decides). A refused request runs nothing (no client, no mute, no backend call) and gets the status `Another Git operation is running in this repository. Wait for it to finish.` (localized).
2. **Acquire.** Otherwise `m.repo` is marked busy (not "whole tree") and `muteGitRepoWatcher(m.repo)` is called.
3. **Register for cancellation.** If `m` has a `requestId` **property** (its presence counts, even when its value is `undefined`), the action is recorded under that id together with `m.repo` and a fresh abort signal. A second running action with the same id replaces the first record (`handler Q3`).
4. **Run.** The client is `gitClientFactory(m.repo, config.gitPath(), signal).getInstance()` (always the request's own repository, never the selected one). Then the backend function of the same name is called with `(client, m)` — the whole request message, including `command`, `repo` and `requestId` — and, for `mergeBranch` and `mergeCommit` only, a third argument `config.gitPath()`.
5. **Status.** `null` when the backend resolves (whatever it resolves to, and even if a cancel arrived meanwhile). If it rejects: `The Git operation was cancelled.` (localized) when the abort signal has fired, otherwise the error's text. If creating the client throws (for example "Cannot use simple-git on a directory that does not exist"), the status is that error's text.
6. **Release** (always, success or failure, before posting): the cancellation record is removed, and if step 2 happened, `m.repo` stops being busy and `unmuteGitRepoWatcher(m.repo)` is called. Mute and unmute are always paired, with the same string.
7. **Answer.** Post `{ command: m.command, status }`, plus `requestId: m.requestId, repo: m.repo` if `m` had a `requestId` property. Exactly one answer per request.
8. The handler registered on the bridge resolves after the answer is posted; it does not reject for Git failures.

#### A.3.2 `repositoryAction`

Same frame as A.3.1 with these differences.

**View-only kinds.** When `m.action.kind` is `viewWorkingTreeFile`, `viewRangeFile`, `viewHistoricalFile` or `previewFileRestore`, steps 1, 2 and the release part of 6 are skipped: the request is never refused by the lock, does not mark the repository busy, and does not mute the watcher. Such requests run alongside each other and alongside a running exclusive action. They are still registered for cancellation.

**Whole-tree kinds.** When `m.action.kind` is `submodule` or `submodulePointer`, the lock check additionally refuses the request if any busy repository lies inside `m.repo` (`isRepoWithinPath(r, m.repo)`, which includes `m.repo` itself), and on acquiring, `m.repo` is marked "whole tree", so while it runs every request for a repository inside it (at any depth) is refused, as well as other whole-tree requests for any repository containing it. Plain requests for a repository that _contains_ a whole-tree repository are not refused.

**Before Git runs** (after acquiring the lock, for the kinds that take it):

- For `restoreFile` (target `m.action.plan.destination`) and `undoRestore` (target `m.action.backup.path`): if VS Code has an open text document that is dirty, whose URI scheme is `file`, and whose `uri.fsPath` normalizes (with `normalizeRepoPath`) to the same string as the normalized path of `target` joined onto `m.repo`, the action fails with the status `Save or revert the unsaved changes to {0} in the editor first; saving them later would undo the restore.` with `{0}` = the target as given. Git is not run. (The target is repository-relative; `sub/../sub/f.txt` and `./sub/f.txt` match `sub/f.txt` because of normalization.)
- For `previewFileRestore`: if the same check matches `m.action.plan.destination`, show (without waiting) the warning `The preview shows unsaved changes to {0}. Save or revert them before restoring.` with `vscode.window.showWarningMessage` (message only, no buttons), then continue normally.
- No other kind reads `vscode.workspace.textDocuments`.

**Run:** `runRepositoryAction(client, m.action, config.gitPath())` → effect.

**After success, in this order:**

1. **Hidden remotes follow a remote rename or removal.** For `renameRemote` and `removeRemote` only: take the `hiddenRemotes` of `m.repo`'s saved record as `repoManager.getRepos()` reports it (an empty list when there is no record or no field), replace each entry exactly equal to `m.action.name` by `m.action.newName` (rename) or drop it (remove), keep all other entries, and pass the result to `repoManager.updateHiddenRemotes(m.repo, list)`. If that returns a record, post `{ command: "repoState", repo: m.repo, state: <that record> }` — before the action's own answer. Only exact name matches change. Nothing of this happens if Git failed.
2. **Open what the effect asks for** (each awaited unless stated; a rejection here fails the action, with the status worked out as in A.3.1 step 5):

   | Effect `kind`       | What happens                                                                                                                                                                                                                                                                                                                                                 |
   | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
   | `worktree`          | `executeCommand("vscode.openFolder", Uri.file(path), true)` — the folder opens in a new window.                                                                                                                                                                                                                                                              |
   | `conflict`          | `openConflict(path, status)`.                                                                                                                                                                                                                                                                                                                                |
   | `nestedRepository`  | `showInformationMessage("{0} is a separate Git repository inside this one, so its files are not changes of this repository." with {0} = path, "Open Its Graph")`, **not awaited**. If the user picks the button, `executeCommand("branchwise.view", { rootUri: Uri.file(path) })` (not awaited).                                                             |
   | `document`          | `workspace.openTextDocument({ language: "diff", content: text })`, then `window.showTextDocument(thatDocument, { preview: true })`.                                                                                                                                                                                                                          |
   | `diff`              | `vscode.diff` with left = `encodeDiffDocUri(m.repo, before, <left, or 40 zeros when null>)`, right = `encodeDiffDocUri(m.repo, after, <right, or 40 zeros when null>)`, title `<after> (<L> ↔ <R>)` where `L`/`R` are the first 8 characters of `left`/`right`, or `∅` when that side is `null`, options `{ preview: true }`.                                |
   | `workingTreeDiff`   | `vscode.diff` with left = `encodeDiffBlobUri(m.repo, before, left)`; right = `Uri.file(workingPath)` when `workingPath` is not `null`, otherwise `encodeDiffBlobUri(m.repo, after, right)`; title `<after> (<S>)` where `S` is the localized `Staged Changes` when `staged` is true, else the localized `Working Tree Changes`; options `{ preview: true }`. |
   | `historicalFile`    | `executeCommand("vscode.open", encodeDiffDocUri(m.repo, path, hash), { preview: true })`.                                                                                                                                                                                                                                                                    |
   | `restoreDiff`       | `vscode.diff` with left = `Uri.file(destination)` when `exists`, otherwise `encodeDiffDocUri(m.repo, sourcePath, <40 zeros>)` (an empty document); right = `encodeDiffDocUri(m.repo, sourcePath, hash)`; title `<destination> ↔ <first 12 characters of hash>`; options `{ preview: true }`. `destination` is an absolute path here.                         |
   | `restored`          | nothing now; see "Undo Restore" below (only when `backup` is not `null`).                                                                                                                                                                                                                                                                                    |
   | `undefined` / other | nothing.                                                                                                                                                                                                                                                                                                                                                     |

   The lock and the watcher mute are held until the awaited editor call settles.

3. **Workspace scan.** For `submodule` only, call `invalidateWorkspaceScan()` (not after a failure).

Then release and answer as in A.3.1 (steps 6–7).

**Undo Restore.** When the effect is `{ kind: "restored", backup }` with a non-null `backup`, then _after_ the answer has been posted (and the lock released), without making the bridge handler wait:

1. Show `showInformationMessage("Restored {0}. Its previous contents are kept in Git until its next garbage collection." with {0} = backup.path, "Undo Restore")`.
2. If the user does not pick "Undo Restore" (dismissed, or anything else), nothing more happens.
3. If they pick it, run a new request through the same `repositoryAction` path — lock, mute, dirty-editor check on `backup.path`, cancellation record, answer — as if the page had sent `{ command: "repositoryAction", repo: <same repo>, requestId: "undo-restore-<n>", action: { kind: "undoRestore", backup } }`, where `<n>` counts Undo requests of this registration from 1. Its answer is posted to the page like any other (with that `requestId`).
4. Then post `{ command: "refresh" }` (whether the undo succeeded or not).
5. If the undo's status is not `null`, show it with `showErrorMessage(status)` (not awaited). A busy repository gives the busy message here.

#### A.3.3 Cancellation messages

- `cancelAction { repo, requestId }`: if a running action is recorded under `requestId` **and** its repository is exactly `repo`, its abort signal fires (the client's Git processes are killed by simple-git, and the action then answers with the cancelled status, A.3.1 step 5). Otherwise nothing. No answer is posted.
- `cancelRepositoryQuery { repo, requestId }`: the same for a running repository read; the aborted read then posts nothing at all. No answer is posted.

Both handlers act synchronously and touch neither `vscode` nor `config`.

#### A.3.4 `repositoryQuery { repo, requestId, query }`

1. Record the read under `requestId` with a fresh abort signal (replacing, without aborting, an earlier running read with the same id — `handler Q3`).
2. If the query kind is `state`, remember the repository's saved record from `repoManager.getRepos()` _as an object reference_ (it may be absent).
3. Create the client `gitClientFactory(repo, config.gitPath(), signal).getInstance()`.
4. Work out `repos`: for the query kind `workspace`, first await `repoManager.pruneMissing()`, then call `listRepos(config.gitPath(), config.maxDepthOfRepoSearch())` and await it. `repos` is that list unchanged if it contains `repo` (exact string); otherwise it is `repo` followed by the whole list in the order `listRepos` gave. For every other kind, `repos` is `[]`.
5. `data = await repositoryQuery(client, query, { repos, binary: config.gitPath(), signal })`.
6. Any failure in steps 3–5 (including a synchronous throw from the client factory or a rejection of `pruneMissing`/`listRepos`) gives `data = null` and `status` = the error's text; success gives `status = null`.
7. Remove the record of step 1.
8. If the signal has fired (cancel or `dispose`), stop: post nothing.
9. **Reconcile hidden remotes** when all hold: the data kind is `state`; no exclusive action of this registration is running for exactly `repo`; and the record `repoManager.getRepos()` now reports for `repo` is still the very same object remembered in step 2, or both are absent. Any `setRepoState` or `updateHiddenRemotes` for that repository in the meantime therefore cancels the reconciliation. Then:
   - the configured remote names are `data.state.remotes[].name`;
   - a hidden name is kept if it is one of them, or if `remoteForRef(ref.name, configuredNames)` equals it for at least one `ref` of `data.state.remoteBranches` (a remote that is no longer configured but still has remote-tracking refs stays hidden);
   - call `repoManager.updateHiddenRemotes(repo, keptNames)` (keptNames in the saved order, from the record of step 2, empty if none); if it returns a record, post `{ command: "repoState", repo, state: <record> }`.
     A remote renamed outside Branchwise therefore loses its hidden status (its old name disappears, the new name was never hidden).
10. Post `{ command: "repositoryQuery", repo, requestId, data, status }`.

#### A.3.5 `loadRemotes { repo, requestId, branchName }`

Client `gitClientFactory(repo, config.gitPath()).getInstance()` — no abort signal; the read is not recorded, cannot be cancelled, and is not stopped by `dispose`. `loadRemotes(client, branchName)` gives `{ remotes, upstream, pushRemote }`; the answer carries `command: "loadRemotes"`, `repo`, `requestId`, every field of that result, and `status: null`. On any failure (including the client factory throwing): `{ command: "loadRemotes", repo, requestId, remotes: [], upstream: null, pushRemote: null, status: <error text> }`.

#### A.3.6 Graph reads: `loadCommits`, `loadBranches`, `commitDetails`

Each command runs latest-wins, independently of the other two, except that a change of repository stops all three. For a request `m` (always with `repo` and `requestId`):

1. **Select the repository.** If `m.repo` differs from the repository this registration currently shows (or none is recorded, e.g. after `onPanelShown`): abort the running read of _every_ graph command, record `m.repo` as current, then call `selectWatchedRepo(m.repo, config.gitPath())`. If `m.repo` is already current, nothing happens in this step.
2. Abort the running read of the same command, if any, and make this one the running read of its command.
3. Client: `gitClientFactory(m.repo, config.gitPath(), signal).getInstance()`.
4. Backend call:
   - `loadCommits(client, options)` with options `branchName`, `maxCommits`, `showRemoteBranches` and `hard` copied from the request, `hiddenRemotes` from the request or `[]` when absent, `dateType` = `config.dateType()`, `showUncommittedChanges` = `config.showUncommittedChanges()`;
   - `loadBranches(client, options)` with options `showRemoteBranches`, `hard` and `repo` from the request, `hiddenRemotes` from the request or `[]`, `gitPath` = `config.gitPath()`;
   - `commitDetails(client, options)` with options `commitHash` from the request and `dateType` = `config.dateType()`.
5. On success, if this read's signal has not fired, post:
   - `loadCommits`: `command`, the request's `repo`, `requestId`, `branchName` and `visibilityKey`, plus every field of the backend result (a backend field named `branchName` or `visibilityKey` would win over the request's; `repo` and `requestId` always come from the request);
   - `loadBranches`: `command`, the request's `visibilityKey`, every field of the backend result, and the request's `repo` and `requestId` (which win over the result's `repo`);
   - `commitDetails`: `command`, every field of the backend result (`commitDetails`), and the request's `repo` and `requestId`.
     `visibilityKey` is copied as is: when the request had none, the property is present with value `undefined` (it disappears on the wire).
6. On any failure in steps 1–4 (including the client factory or `selectWatchedRepo` throwing), if the signal has not fired, post `{ command: "graphQueryError", query: m.command, repo: m.repo, requestId: m.requestId, message: <error text> }`.
7. A read whose signal fired posts nothing, whether its backend call later resolves or rejects.
8. When the read ends it stops being "the running read" of its command only if no newer read replaced it.

A failure of `selectWatchedRepo` in step 1 leaves `m.repo` recorded as current, so the watcher is not retried for that repository until another repository is selected (`handler Q6`).

#### A.3.7 `selectRepo { repo }`

1. Post `{ command: "repoState", repo, state }` synchronously, where `state` is the repository's saved record from `repoManager.getRepos()`, or `{ columnWidths: null }` when it has none. This does not create a record.
2. Then do step 1 of A.3.6 for `repo` (abort all graph reads and retarget the watcher if it is a different repository). If that throws, call `logger.debug` with the text `Unable to select repository: <repo>` and the error as second argument, and swallow it; the handler never rejects.
3. `config.gitPath()` is read only when the repository changed. The handler is synchronous (returns `undefined`).

After `onPanelShown()`, the next `selectRepo` or graph read for any repository, including the one shown before, aborts the graph reads still running and calls `selectWatchedRepo` again.

#### A.3.8 `saveRepoState { repo, state }`

Calls `repoManager.setRepoState(repo, record)` once, where `record` is a new object holding `columnWidths: null`, overwritten by every field of the saved record (if any), overwritten in turn by every field present in the message's `state`. So the fields in the message replace the saved ones, all other saved fields stay, and a repository without a record gets one (even when `state` is `{}`). Values are stored as sent (no sorting or de-duplication of `hiddenRemotes`, no validation). Nothing is posted. Synchronous.

#### A.3.9 `viewDiff { repo, commitHash, oldFilePath, newFilePath, type }`

1. `h` = `abbrevCommit(commitHash)` (first 8 characters). `name` = the part of `newFilePath` after its last `/` (the whole string if it has none).
2. Title: `<name> (<X>)` where `X` is the localized `Added in {0}` with `{0}` = `h` when `type` is `A`, the localized `Deleted in {0}` when `type` is `D`, otherwise `<h>^ ↔ <h>`. `l10n.t` is called only for `A` and `D`.
3. Run `vscode.diff` with left = `encodeDiffDocUri(repo, oldFilePath, <commitHash followed by ^>)`, right = `encodeDiffDocUri(repo, newFilePath, commitHash)`, the title, and options `{ preview: true }`. The left side is always the old path at the first parent, the right side the new path at the commit (for an added file the left document is empty, for a deleted file the right one).
4. Post `{ command: "viewDiff", success: true }` when the command resolves. When it rejects, call `logger.error` with the text `Unable to open the diff of <newFilePath> at <h>` and the error as second argument, and post `{ command: "viewDiff", success: false }`.
5. `viewDiff` ignores the lock, the watcher, the current repository, `config` and `repoManager`.

#### A.3.10 `dispose()` and `onPanelShown()`

- `dispose()`: abort every running graph read and repository read of this registration and forget them. Idempotent. Actions (and their pending Undo offers) and `loadRemotes` reads keep running and still post their answers to the bridge (`handler Q1`). Handlers stay registered on the bridge; module B's own `dispose` stops delivery.
- `onPanelShown()`: forget the current repository (nothing is aborted or posted at that moment).

#### A.3.11 What is never done

No handler throws for a Git or editor failure; no handler posts twice for one request, except that a `repositoryAction` whose effect is `restored` is followed later by the Undo request's own answer and `refresh`. No timers, debounces or timeouts exist in this module; cancellation happens only through `cancelAction`, `cancelRepositoryQuery`, a newer graph read, a repository change, and `dispose`.

### A.4 Examples

All observed with recorders; `H` = `0123456789abcdef0123456789abcdef01234567`, `Z` = 40 zeros, gitPath `/bin/git`.

| Request(s)                                                                                                                                          | Observed effects and posts (in order)                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `{command:"deleteTag", repo:"/r", tagName:"v"}` (no requestId), backend resolves                                                                    | mute `/r`; client `("/r", "/bin/git", signal)`; unmute `/r`; post `{command:"deleteTag", status:null}`                                                                                                                                                                                                                                                 |
| same, backend rejects `Error("boom")`                                                                                                               | post `{command:"deleteTag", status:"boom"}`                                                                                                                                                                                                                                                                                                            |
| `{command:"deleteTag", repo:"/r", tagName:"v", requestId: undefined}`                                                                               | post `{command:"deleteTag", status:null, requestId: undefined, repo:"/r"}`                                                                                                                                                                                                                                                                             |
| `{command:"deleteTag", repo:"/missing", requestId:"m", ...}`, folder absent (real simple-git message)                                               | mute/unmute `/missing`; post `{command:"deleteTag", status:"Cannot use simple-git on a directory that does not exist", requestId:"m", repo:"/missing"}`                                                                                                                                                                                                |
| `resetToCommit` running on `/repo`; then `deleteTag` on `/repo`                                                                                     | second answer `{command:"deleteTag", status:"Another Git operation is running in this repository. Wait for it to finish.", requestId:…, repo:"/repo"}`; backend not called                                                                                                                                                                             |
| `deleteTag` running on `/repo`; then `deleteTag` on `/repo/`, `/repo/sub`; `repositoryAction` `submodule` on `/`                                    | `/repo/` and `/repo/sub` run (status `null`); the submodule action on `/` is refused with the busy message                                                                                                                                                                                                                                             |
| `submodule` action running on `/repo`; `deleteTag` on `/repo/sub`, `/repo/sub/nested`, `/repository-sibling`                                        | first two refused, the sibling runs                                                                                                                                                                                                                                                                                                                    |
| `pushBranch` stalled on a real SSH remote, requestId `push`; `cancelAction {repo, requestId:"other"}`; then `cancelAction {repo, requestId:"push"}` | first cancel does nothing; after the second, within seconds: `{command:"pushBranch", requestId:"push", repo, status:"The Git operation was cancelled."}`; a following `deleteTag` succeeds                                                                                                                                                             |
| `repositoryAction` `renameRemote team/upstream → team/mirror`, saved hidden `["origin","origin2","team/upstream"]`                                  | posts `repoState` with `hiddenRemotes:["origin","origin2","team/mirror"]`, then `{command:"repositoryAction", status:null, …}`                                                                                                                                                                                                                         |
| saved hidden `["a","b","c"]`; `renameRemote a → c`                                                                                                  | `updateHiddenRemotes("/repo", ["c","b","c"])` (module C then stores `["b","c"]`); `repoState` post; action answer                                                                                                                                                                                                                                      |
| saved hidden `["a","b","c"]`; `removeRemote b`                                                                                                      | `updateHiddenRemotes("/repo", ["a","c"])`; `repoState` post; action answer                                                                                                                                                                                                                                                                             |
| effect `{kind:"diff", left:H, right:null, before:"a.txt", after:"b.txt"}`                                                                           | `vscode.diff` with left `branchwise:a.txt?commit=H&repo=%2Frepo`, right `branchwise:b.txt?commit=Z&repo=%2Frepo`, title `b.txt (01234567 ↔ ∅)`, `{preview:true}`                                                                                                                                                                                       |
| effect `{kind:"workingTreeDiff", before:"o.txt", after:"n.txt", left:null, right:null, workingPath:"/repo/n.txt", staged:false}`                    | `vscode.diff` with left `branchwise:o.txt?commit=Z&repo=%2Frepo&blob=1`, right `file:///repo/n.txt`, title `n.txt (Working Tree Changes)`                                                                                                                                                                                                              |
| effect `{kind:"workingTreeDiff", …, left:H, right:H, workingPath:null, staged:true}`                                                                | both sides blob URIs (`…&blob=1`), title `n.txt (Staged Changes)`                                                                                                                                                                                                                                                                                      |
| effect `{kind:"restoreDiff", hash:H, sourcePath:"s.txt", destination:"/repo/d.txt", exists:false}`                                                  | `vscode.diff` left `branchwise:s.txt?commit=Z…`, right `branchwise:s.txt?commit=H…`, title `/repo/d.txt ↔ 0123456789ab`                                                                                                                                                                                                                                |
| effect `{kind:"historicalFile", hash:H, path:"dir/h.txt"}`                                                                                          | `vscode.open` of `branchwise:dir/h.txt?commit=H&repo=%2Frepo`, `{preview:true}`                                                                                                                                                                                                                                                                        |
| effect `{kind:"worktree", path:"/wt"}`                                                                                                              | `executeCommand("vscode.openFolder", Uri.file("/wt"), true)`                                                                                                                                                                                                                                                                                           |
| effect `historicalFile` but `vscode.open` rejects `Error("editor refused")`                                                                         | answer `{command:"repositoryAction", status:"editor refused", …}`                                                                                                                                                                                                                                                                                      |
| `restoreFile` succeeds with a backup of `f.txt`; user picks "Undo Restore"; the undo fails with "undo failed"                                       | answer `{…requestId:"restore", status:null}`; info message `Restored f.txt. Its previous contents are kept in Git until its next garbage collection.` with button `Undo Restore`; answer `{command:"repositoryAction", status:"undo failed", requestId:"undo-restore-1", repo:"/repo"}`; post `{command:"refresh"}`; `showErrorMessage("undo failed")` |
| dirty editor on `/repo/sub/f.txt`; `restoreFile` with destination `sub/f.txt`                                                                       | answer status `Save or revert the unsaved changes to sub/f.txt in the editor first; saving them later would undo the restore.`; backend not called                                                                                                                                                                                                     |
| `repositoryQuery {query:{kind:"state"}}`, saved hidden `["gone","origin","team/x"]`, remotes `origin`,`team`, remote branch `team/x/main`           | `updateHiddenRemotes("/repo", ["origin"])` (`team/x/main` belongs to `team`), post `repoState`, then the `repositoryQuery` answer with `status:null`                                                                                                                                                                                                   |
| `repositoryQuery {kind:"workspace"}` for `/ws/opened`, config gitPath `git` and depth 2, `listRepos` → `["/ws/a","/ws/b"]`                          | `pruneMissing()` then `listRepos("git", 2)`; `repositoryQuery` receives `repos: ["/ws/opened","/ws/a","/ws/b"]`                                                                                                                                                                                                                                        |
| `repositoryQuery` for a deleted folder                                                                                                              | `{command:"repositoryQuery", repo, requestId, data:null, status:"Cannot use simple-git on a directory that does not exist"}`                                                                                                                                                                                                                           |
| `loadCommits` A (requestId `first`) then B (`second`) for the same repo; B resolves, then A resolves                                                | A's signal aborted at once; only B is posted: `{command:"loadCommits", repo:"/repo", requestId:"second", branchName:"", visibilityKey:"visible", commits:[], head:null, moreCommitsAvailable:false, hard:true, uncommittedChanges:0}`                                                                                                                  |
| `loadBranches` on `/one` running; `loadCommits` on `/two`                                                                                           | the branch read is aborted and never posts; `selectWatchedRepo("/one", …)` then `selectWatchedRepo("/two", …)`                                                                                                                                                                                                                                         |
| `commitDetails` rejects `Error("Git read failed")`                                                                                                  | `{command:"graphQueryError", query:"commitDetails", repo:"/repo", requestId:"first", message:"Git read failed"}`                                                                                                                                                                                                                                       |
| `selectRepo "/r"` twice, `onPanelShown()`, `selectRepo "/r"`                                                                                        | three `repoState` posts; `selectWatchedRepo("/r", "/bin/git")` called twice (first and third)                                                                                                                                                                                                                                                          |
| `selectRepo "/never"` with no saved record                                                                                                          | `{command:"repoState", repo:"/never", state:{columnWidths:null}}`                                                                                                                                                                                                                                                                                      |
| `saveRepoState {repo:"/new", state:{}}`                                                                                                             | `setRepoState("/new", {columnWidths:null})`                                                                                                                                                                                                                                                                                                            |
| saved `/r` = `{columnWidths:[1,2], hiddenRemotes:["x"]}`; `saveRepoState {state:{hiddenRemotes:["z","a","a"]}}`                                     | `setRepoState("/r", {columnWidths:[1,2], hiddenRemotes:["z","a","a"]})`                                                                                                                                                                                                                                                                                |
| `viewDiff` `type:"A"`, `newFilePath:"dir/new.txt"`                                                                                                  | title `new.txt (Added in 01234567)`; left `branchwise:dir/new.txt?commit=H%5E&repo=%2Frepo`; answer `{command:"viewDiff", success:true}`                                                                                                                                                                                                               |
| `viewDiff` `type:"R"`, old `a/from.txt`, new `b/to.txt`                                                                                             | title `to.txt (01234567^ ↔ 01234567)`; left path `a/from.txt` at `H^`, right `b/to.txt` at `H`                                                                                                                                                                                                                                                         |
| `viewDiff`, `vscode.diff` rejects                                                                                                                   | `logger.error("Unable to open the diff of a at 01234567", error)`; `{command:"viewDiff", success:false}`                                                                                                                                                                                                                                               |

### A.5 Non-functional requirements

- **Import time:** no `vscode` member access, no Git, no timers, no module-level state that outlives a registration other than what the imported modules keep.
- **`vscode` members per path** (anything else must not be touched, because test mocks omit it):
  - registration, `selectRepo`, `saveRepoState`, cancellations, all reads (`repositoryQuery`, `loadRemotes`, graph reads), and the success/failure path of every action without effects: **none**;
  - busy refusal and cancelled status: `l10n.t` only;
  - `restoreFile`, `undoRestore`, `previewFileRestore`: `workspace.textDocuments`, `l10n.t`, and for the preview warning `window.showWarningMessage`;
  - effects: `commands.executeCommand`, `Uri.file`, `workspace.openTextDocument`, `window.showTextDocument`, `window.showInformationMessage`, `l10n.t`, plus what `encodeDiffDocUri`/`encodeDiffBlobUri` use (`Uri.from`, `uri.with`);
  - Undo: `window.showInformationMessage`, `window.showErrorMessage`, `l10n.t`;
  - `viewDiff`: `commands.executeCommand`, `l10n.t` (types `A`/`D` only), `Uri.from` via `encodeDiffDocUri`.
- **`config`/`repoManager` members per path:** as in A.1; `viewDiff` and registration read neither (a test passes no `repoManager` at all). A `repoManager` with only `getRepos` must suffice for `selectRepo`, reads other than `workspace` and `state`-with-reconciliation, and plain actions; `updateHiddenRemotes` is needed only after `renameRemote`/`removeRemote` success and in `state` reconciliation; `pruneMissing` only for `workspace` reads; `setRepoState` only for `saveRepoState`.
- **Ordering callers rely on:** mute before the client is created; unmute before the answer is posted; a `repoState` post before the answer or read result it accompanies; the answer before the Undo offer; for `selectRepo`, the `repoState` post happens synchronously inside the handler.
- **Synchronous start:** each handler starts its work (client creation, backend call, abort of the superseded read) synchronously when the bridge calls it, so two graph reads delivered back to back are ordered, and a test can check `signal.aborted` immediately after delivering the newer message.
- **Resources:** every cancellation record is removed when its request settles; no listeners are added to VS Code events; aborting uses the signal given to `gitClientFactory`, which makes simple-git kill the child processes.
- **Errors:** every failure is reported through the answer (status, `graphQueryError`, `success:false`), a log line, or a VS Code message; the only rejections that can escape are programming errors (for example a synchronous throw from `bridge.post`).
- **Performance:** no work proportional to history size happens here; `repoManager.getRepos()` (a sorted copy) is called once or twice per request that needs it.

### A.6 Test coverage

**Already checked** (files under `tests/extension/` unless noted):

- dispatch of the 16 plain actions and `repositoryAction` with the right arguments and Git path, answers with echoes, failure as status — `action-dispatch`, `message-echoes`;
- lock: same repository refused, other repository allowed, release after failure, whole-tree locks both directions, view-only kinds never locked — `action-dispatch`;
- cancellation of a real stalled push, busy refusal meanwhile, release afterwards — `action-cancel`;
- action uses its own repository despite a `selectRepo`; mute/unmute pairing; view-only actions do not mute — `action-repository`;
- `restoreFile` refusal over a dirty editor, `previewFileRestore` warning plus diff, Undo Restore success and dismissal — `restore-undo`;
- nested repository message and "Open Its Graph" — `nested-repository`;
- hidden-remote rename/remove updates with `repoState` before the answer, no change on Git failure, `state` reconciliation keeping configured and ref-bearing names, no re-save when unchanged, guard against records changed during the read, failure keeps preferences — `remote-preferences`;
- `saveRepoState` merging across re-creation — `view-preferences`;
- workspace `repos` option and `pruneMissing` call — `workspace-rows`;
- `cancelRepositoryQuery` repo matching, silent aborted reads, `dispose` aborting repository reads, actions finishing — `query-cancellation`;
- graph latest-wins, cross-repository cancellation, `dispose`, independence of branch and commit reads, `graphQueryError` for all three, client-creation failure and retry — `graph-queries`;
- echoes of `loadRemotes`, `loadBranches` `visibilityKey`, `repositoryQuery` — `message-echoes`;
- `viewDiff` success/failure — `view-diff`; `selectRepo` minimal record — `legacy-types`;
- the UI harness (`tests-ext/ui/history.test.cjs`) opens staged, unstaged and untracked diffs through `workingTreeDiff` and checks both sides' contents and that the unstaged/untracked right side is a `file` URI; it also creates and removes a worktree and stages a merge-conflict resolution through the UI (none of which produces an effect).

**Not checked by Vitest (V8 coverage never executes them):** the `worktree`, `conflict`, `document`, `diff` (range) and `historicalFile` effects; `workingTreeDiff` (only the UI harness); the Undo failure message; the debug log when `selectRepo` cannot retarget the watcher; `onPanelShown`. Gaps, as test cases:

- **handler G1 — worktree effect.** Setup: `runRepositoryAction` mocked to resolve `{kind:"worktree", path:"/wt"}`; `vscode.commands.executeCommand` and `Uri.file` recorded. Call: `repositoryAction` `{kind:"openWorktree", path:"/wt"}` on `/repo`, requestId `w` (the backend produces this effect for `openWorktree`). Expect: `executeCommand("vscode.openFolder", Uri.file("/wt"), true)`, then `{command:"repositoryAction", status:null, requestId:"w", repo:"/repo"}`.
- **handler G2 — conflict effect.** Setup: effect `{kind:"conflict", path:"/repo/c.txt", status:"UU"}`, `@/extension/conflicts` mocked. Expect `openConflict("/repo/c.txt", "UU")` once, status `null`.
- **handler G3 — document effect.** Setup: effect `{kind:"document", text:"diff text"}`. Expect `openTextDocument({language:"diff", content:"diff text"})`, then `showTextDocument(<that document>, {preview:true})`, then the answer.
- **handler G4 — range diff effect.** Setup: effect `{kind:"diff", left:H, right:null, before:"a.txt", after:"b.txt"}`, `Uri.from` recorded. Expect `vscode.diff` with left `{scheme:"branchwise", path:"a.txt", query:"commit=H&repo=%2Frepo"}`, right query `commit=<40 zeros>&repo=%2Frepo`, title `b.txt (01234567 ↔ ∅)`, options `{preview:true}`.
- **handler G5 — working-tree diff effect.** Setup: effect `{kind:"workingTreeDiff", before:"o.txt", after:"n.txt", left:null, right:null, workingPath:"/repo/n.txt", staged:false}`. Expect `vscode.diff` with left query ending `&blob=1` and commit 40 zeros, right `Uri.file("/repo/n.txt")`, title `n.txt (Working Tree Changes)`. Repeat with `staged:true, workingPath:null, left:H, right:H`: right is a blob URI, title `n.txt (Staged Changes)`.
- **handler G6 — historical file effect.** Effect `{kind:"historicalFile", hash:H, path:"dir/h.txt"}`. Expect `executeCommand("vscode.open", <branchwise dir/h.txt at H>, {preview:true})`.
- **handler G7 — editor failure becomes status.** Effect `historicalFile`, `executeCommand` rejects `Error("editor refused")`. Expect answer status `"editor refused"` and the watcher unmuted.
- **handler G8 — Undo failure.** Setup: real or mocked `restoreFile` resolving `{kind:"restored", backup:{path:"f.txt", …}}` then `undoRestore` rejecting `Error("undo failed")`; info message answers `"Undo Restore"`. Expect, in order: answer for the restore, info message, answer `{command:"repositoryAction", status:"undo failed", requestId:"undo-restore-1", repo}`, `{command:"refresh"}`, `showErrorMessage("undo failed")`.
- **handler G9 — Undo while busy.** Setup: as G8 but the info message resolves only after a `deleteTag` on the same repository has started and is held. Expect the undo's answer carries the busy message, `refresh` is posted, `showErrorMessage` shows the busy message, and the held `deleteTag` then succeeds.
- **handler G10 — Undo ids count per registration.** Two restores in a row with Undo chosen both times. Expect requestIds `undo-restore-1` and `undo-restore-2`.
- **handler G11 — `selectRepo` swallows a watcher failure.** Setup: `selectWatchedRepo` throws `Error("watch fail")`, logger mocked. Call `selectRepo "/q"`. Expect the `repoState` post, no rejection, and `logger.debug("Unable to select repository: /q", error)`.
- **handler G12 — `onPanelShown` re-selects.** Setup: `selectRepo "/r"`, then a held `loadCommits` for `/r`. Call `onPanelShown()`, then `selectRepo "/r"`. Expect the held read's signal aborted, `selectWatchedRepo("/r", …)` called a second time, and no post from the held read. Without `onPanelShown`, the same `selectRepo` aborts nothing.
- **handler G13 — submodule actions drop the scan cache.** Setup: `@/extension/workspace-scan` mocked. Call `repositoryAction` `{kind:"submodule", …}` succeeding, then one rejecting. Expect `invalidateWorkspaceScan` called exactly once.
- **handler G14 — cancel needs the matching repository.** Setup: held `pushBranch` on `/a`, requestId `p`. Call `cancelAction {repo:"/b", requestId:"p"}`. Expect the signal not aborted; then `cancelAction {repo:"/a", requestId:"p"}` aborts it.
- **handler G15 — cancel after the backend resolved.** Held action, `cancelAction`, then the backend resolves anyway. Expect status `null` (the cancelled message is used only for rejections).
- **handler G16 — action on a missing folder.** Real `gitClientFactory`, repository path that does not exist. Expect status `"Cannot use simple-git on a directory that does not exist"`, mute and unmute each called once, and a following action on the same path is not refused as busy.
- **handler G17 — refusal does not mute.** Held action on `/repo`; second action on `/repo`. Expect `muteGitRepoWatcher` called once in total.
- **handler G18 — graph read options.** Config `dateType → "Commit Date"`, `showUncommittedChanges → false`. `loadCommits` without `hiddenRemotes`. Expect `loadCommits` options `{branchName, maxCommits, hiddenRemotes:[], showRemoteBranches, hard, dateType:"Commit Date", showUncommittedChanges:false}`; `loadBranches` options include `repo` and `gitPath`; `commitDetails` options `{commitHash, dateType:"Commit Date"}`.
- **handler G19 — a graph read on another repository cancels the other kinds.** Held `loadBranches` on `/one`; `loadCommits` on `/two`. Expect the branch read's signal aborted and nothing posted for it.
- **handler G20 — watcher failure in a graph read.** `selectWatchedRepo` throws once. Two `loadCommits` for `/w`. Expect `graphQueryError` with the watcher's message for the first, a normal answer for the second, and `selectWatchedRepo` called once.
- **handler G21 — `viewDiff` titles.** Types `A`, `D`, `M`, `R` with nested paths. Expect titles `new.txt (Added in 01234567)`, `old.txt (Deleted in 01234567)`, `m.txt (01234567^ ↔ 01234567)`, `to.txt (01234567^ ↔ 01234567)`, left commit `H^` (query `commit=H%5E…`), right commit `H`.
- **handler G22 — `saveRepoState` creates a record.** `saveRepoState {repo:"/new", state:{}}` with no saved record. Expect `setRepoState("/new", {columnWidths:null})` and no post.
- **handler G23 — `dispose` leaves actions and `loadRemotes` running** (only if the current behaviour is kept, see `handler Q1`). Held `deleteTag` and held `loadRemotes`; call `dispose()`; resolve both. Expect the action's signal not aborted and both answers posted.

### A.7 Questions

- **handler Q1 — `dispose` does not stop actions or `loadRemotes`.** Current: after `dispose()`, running actions keep their Git processes, still post their answers to the (possibly disposed) page, and a pending Undo offer can still run an undo; `loadRemotes` still posts. `docs/clean-room/extension-core.md` describes `dispose` as aborting "in-flight queries and actions", which is not what happens. Intended: perhaps let mutating actions finish (killing a push or rebase mid-way is risky) but not post, or abort them too.
- **handler Q2 — posts are fire-and-forget.** Current: the value returned by `bridge.post` is ignored everywhere in this module. If the page is gone and `postMessage` rejects, the rejection is unhandled (`legacy.ts` guards its own `refresh` post; this module guards none of its posts). Intended: probably ignore such rejections explicitly.
- **handler Q3 — duplicate `requestId`s.** Current: a second running action (or repository read) with the same id replaces the first's cancellation record without aborting it; `cancelAction` for the first repository then matches nothing (the record names the second repository), and when the first finishes it removes the record, so the second can no longer be cancelled either. For repository reads, a cancel reaches only the newer read, and the older one still answers. Intended: ids are expected to be unique per page; possibly key by `repo` and id, or keep a list.
- **handler Q4 — lock identity by exact string.** Current: "same repository" is exact string equality, while whole-tree checks use normalized path containment. `/repo` and `/repo/` (or, on Windows, differently cased paths) do not block each other for plain actions. Intended: probably compare normalized paths everywhere.
- **handler Q5 — lock per panel.** Current: the lock lives in each registration. An action still running from a closed panel does not block the same repository in a newly opened panel, and a `state` read in the new panel may reconcile hidden remotes while it runs. Intended: possibly a lock shared by the whole extension.
- **handler Q6 — watcher failures.** Current: in a graph read, a throwing `selectWatchedRepo` turns into a `graphQueryError` for that read (the read itself never runs), and because the repository is recorded as current before the watcher is retargeted, later reads for the same repository neither retry the watcher nor fail. In `selectRepo` the same failure is only logged at debug level. Intended: probably never fail a read because of the watcher, and retry the watcher on the next selection.
- **handler Q7 — cancelled status only for rejections.** Current: after `cancelAction`, a backend that still resolves reports `status: null`; a backend that rejects for an unrelated reason after the cancel reports "The Git operation was cancelled.". Intended: probably fine; confirm.
- **handler Q8 — Undo side effects on the page.** Current: the page receives a `repositoryAction` answer for `undo-restore-<n>`, an id it never sent, and then `refresh`, also when the undo failed; the counter restarts at 1 for each panel registration. Intended: possibly no answer for the internal request, or a documented id namespace.
- **handler Q9 — `saveRepoState` is unchecked.** Current: every field the page sends is stored as sent (no sorting or de-duplication of `hiddenRemotes`, unlike `updateHiddenRemotes`, and no type validation), and an empty `state` creates a record. A later `state` read may then rewrite an unsorted list and post `repoState` although nothing changed. Intended: possibly normalize `hiddenRemotes` here too.
- **handler Q10 — selected repository placed first.** Current: in a `workspace` read, a selected repository missing from the scan is put first, ahead of the sorted scan results, not sorted in. Intended: possibly sort it in.
- **handler Q11 — `workspace` reads prune saved state.** Current: every `workspace` read calls `pruneMissing()`, so opening the picker while a network share or removable drive is unavailable forgets that repository's saved column widths, hidden remotes and graph preferences. Intended: probably acceptable; confirm.
- **handler Q12 — reconciliation guard is broad.** Current: any change to the repository's record during a `state` read (for example a column-width save) skips reconciliation for that read, and so does any exclusive action running on exactly that repository string (view-only actions do not count). Intended: conservative on purpose, per the test; confirm that skipping is preferred over merging.
- **handler Q13 — `requestId: undefined`.** Current: an action message with a `requestId` property whose value is `undefined` is answered with `requestId: undefined, repo` (only `repo` survives serialization), and a `cancelAction` for the same repository whose `requestId` is also `undefined` cancels it. Intended: probably treat it as absent.
- **handler Q14 — backend result fields override request echoes.** Current: in `loadCommits` answers, a `branchName` or `visibilityKey` in the backend result would override the request's; in `loadRemotes` answers, extra backend fields pass through. The current backend returns no such fields, so nothing observable changes today. Intended: echo from the request only.

---

## B. `src/old-extension/webviewBridge.ts`

In one sentence: it listens to one webview, routes each incoming command message to the single handler registered for its `command`, and posts messages back.

### B.1 Interface

Two exports: a function and a type. No default export.

```ts
export function webviewBridgeFactory(webview: vscode.Webview): {
  dispose: () => void;
  post: (msg: ResponseMessage) => Thenable<boolean>;
  onMessage: <T extends RequestMessage["command"]>(
    command: T,
    handler: (msg: Extract<RequestMessage, { command: T }>) => void | Promise<void>
  ) => void;
};

export type WebviewBridge = /* exactly the return type of webviewBridgeFactory */;
```

- `webview` — the panel's webview; only `onDidReceiveMessage(listener)` and `postMessage(message)` are used.
- `dispose()` — ends the subscription made on `webview.onDidReceiveMessage` (calls that subscription's `dispose()` each time it is called).
- `post(msg)` — hands `msg` unchanged to `webview.postMessage` and returns exactly what that returns (VS Code: a `Thenable<boolean>`).
- `onMessage(command, handler)` — makes `handler` the handler for `command`, replacing any earlier one. Returns `undefined`.

`WebviewBridge` must stay structurally this three-member object type (no further required members): tests build bridges as object literals with only `post`, `onMessage` and `dispose` (or fewer, through casts), and `registerMessageHandlers` accepts one without a cast.

Who uses what:

| User                                       | Uses                                                                                                                                                                                                            |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/extension/legacy.ts`                  | `webviewBridgeFactory(panel.webview)` inside `attach`, before `registerMessageHandlers`; `bridge.post({ command: "refresh" })` wrapped in `Promise.resolve(...).catch(() => {})`; `bridge.dispose()` on detach. |
| `src/old-extension/messageHandler.ts`      | type `WebviewBridge`; calls `onMessage` and `post`.                                                                                                                                                             |
| `tests/extension/webviewBridge.test.ts`    | `webviewBridgeFactory` with a fake webview: `dispose` disposes the listener once; a handler's rejection propagates out of the listener; a handler that stays pending does not disturb the repository watcher.   |
| `tests/extension/legacy-types.test.ts`     | type `WebviewBridge` (a cast target).                                                                                                                                                                           |
| `tests/extension/message-protocol.test.ts` | real module through `legacy.ts`: the listener is registered before the handlers; a rejected `postMessage` for `refresh` must be catchable (no unhandled rejection); one `dispose` per attachment.               |

### B.2 Dependencies the implementation must use

- `vscode`: type `Webview` only (type-only import). No runtime use of the `vscode` module (the test mocks for this module lack `EventEmitter`, `Disposable` and `window`).
- `@/types`: types `RequestMessage`, `ResponseMessage` (type-only).
- Nothing else. In particular no logging: the logger mock in `webviewBridge.test.ts` has only `debug` and `warn`.

### B.3 Behaviour

1. **Creation.** `webviewBridgeFactory(webview)` subscribes exactly once, synchronously, with `webview.onDidReceiveMessage(listener)` (one argument; no `thisArgs`, no disposables array). It posts nothing and calls nothing else.
2. **Incoming message.** For each message `msg` delivered to the listener:
   - if a handler is registered for `msg.command` (an own registration, so names such as `toString` or `constructor` never match, and messages without `command`, such as RPC traffic, never match), that handler is called **synchronously**, within the listener call, with `msg` itself; the listener returns a promise that settles when the handler's result settles: it resolves with `undefined` when the handler returns or resolves, and rejects with the same error when the handler throws synchronously or rejects;
   - otherwise the listener returns a promise resolving to `undefined` and nothing happens.
   - A `null` or `undefined` message makes the listener's promise reject with a `TypeError` (reading `command`); see `bridge Q4`.
3. **Registration.** `onMessage(command, handler)` stores the handler; a later call for the same command replaces the earlier handler (only the latest runs). Handlers registered after messages arrived apply to later messages only; there is no buffering.
4. **Posting.** `post(msg)` calls `webview.postMessage(msg)` once and returns its result unchanged, so a rejection reaches the caller. It works whether or not `dispose` was called (the webview decides).
5. **Disposal.** `dispose()` calls `dispose()` on the subscription from step 1. Calling it twice calls the subscription's `dispose` twice (VS Code disposables tolerate this). It does not clear handlers; with a real webview no further messages arrive after disposal.

There are no timers, queues or retries.

### B.4 Examples

| Setup / call                                                                                              | Observed                                                                                                     |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `webviewBridgeFactory(fake)`                                                                              | `fake.onDidReceiveMessage` called once with one function; nothing posted                                     |
| `post({command:"refresh"})`, fake `postMessage` returns `P`                                               | `postMessage` called with `{command:"refresh"}`; `post` returns `P` (same object)                            |
| `onMessage("selectRepo", h1)`, `onMessage("selectRepo", h2)`, deliver `{command:"selectRepo", repo:"/a"}` | only `h2` runs, with that object, before the listener call returns; listener promise resolves to `undefined` |
| deliver `{command:"nope"}`, `{kind:"rpc.request"}`, `{command:"toString"}`                                | each resolves to `undefined`; no handler runs                                                                |
| handler `async () => { throw failure }`, deliver `selectRepo`                                             | the listener's promise rejects with `failure` (same object)                                                  |
| handler that throws synchronously                                                                         | the listener's promise rejects with that error (the listener itself does not throw)                          |
| `dispose(); dispose()`                                                                                    | subscription `dispose` called twice                                                                          |

### B.5 Non-functional requirements

- Import time: nothing runs; no `vscode` runtime access.
- Exactly one subscription per bridge; nothing else to release.
- The listener must return the handler's promise (or a promise tied to it) rather than swallowing its outcome: `webviewBridge.test.ts` asserts the rejection.
- Handler lookup must use own registrations only (a `Map` or a null-prototype table), not a plain object's prototype chain.
- No per-message allocation beyond the returned promise; no logging.

### B.6 Test coverage

**Checked:** listener disposal (`webviewBridge.test.ts`, single call); rejection propagation (`webviewBridge.test.ts`); subscription made at creation before handlers register, and a rejected `post` being catchable by the caller (`message-protocol.test.ts`, through `legacy.ts`); the routing itself is exercised indirectly by the UI harness.

**Not checked** (V8 shows the "no handler" branch never runs):

- **bridge G1 — unknown and non-command messages are ignored.** Setup: bridge with a `selectRepo` handler. Call: deliver `{command:"nope"}`, `{kind:"rpc.request", id:1}`, `{command:"toString"}`, `{command:"constructor"}`. Expect: each listener call resolves to `undefined`; the handler never runs; `postMessage` never called.
- **bridge G2 — latest registration wins.** Register `h1` then `h2` for `selectRepo`; deliver one message. Expect `h2` called once with the same object, `h1` never.
- **bridge G3 — synchronous dispatch.** Register a handler that records a flag; call the listener without awaiting. Expect the flag set when the listener call returns.
- **bridge G4 — `post` passes through.** Fake `postMessage` returning a sentinel. Expect `post(msg)` returns the sentinel and `postMessage` got `msg` (same object).
- **bridge G5 — synchronous throw becomes a rejection.** Handler throwing synchronously. Expect the listener call returns a promise that rejects with that error.
- **bridge G6 — one subscription.** Expect `onDidReceiveMessage` called exactly once per factory call, with a single argument.

### B.7 Questions

- **bridge Q1 — handler failures surface as unhandled rejections.** Current: a failing handler rejects the listener's promise. VS Code ignores what event listeners return, so in the extension host the failure becomes an unhandled promise rejection rather than a log line. The existing test requires the rejection to reach the listener's caller. Intended: keep propagating (tests demand it); possibly also log.
- **bridge Q2 — silent replacement.** Current: registering a second handler for a command silently drops the first. Intended: probably fine, since each command has one owner; alternatively reject duplicates.
- **bridge Q3 — `dispose` only unsubscribes.** Current: handlers remain registered and `post` keeps forwarding after `dispose`. Intended: probably fine because the owner disposes everything together.
- **bridge Q4 — non-object messages.** Current: a `null` or `undefined` message rejects with a `TypeError`. The page never sends one. Intended: probably ignore anything that is not an object with a string `command`.

---

## C. `src/old-extension/repoManager.ts`

In one sentence: it keeps, for the life of the extension, the saved view state of each repository (column widths, hidden remotes, graph preferences) keyed by repository path, and writes every change through to workspace storage.

### C.1 Interface

Two exports: a function and a type. No default export.

```ts
export function createRepoManager(extensionState: ExtensionState): {
  getRepos: () => GitRepoSet;
  pruneMissing: () => Promise<string[]>;
  setRepoState: (repo: string, state: GitRepoState) => void;
  updateHiddenRemotes: (repo: string, names: string[]) => GitRepoState | undefined;
};

export type RepoManager = /* exactly the return type of createRepoManager */;
```

- `extensionState` — the storage (module D). Only `getRepos()` (once, at creation) and `saveRepos(set)` are used. Tests pass structural fakes cast to `ExtensionState`.
- `getRepos()` — every saved record, keyed by repository path.
- `pruneMissing()` — removes the records of repository paths that are gone from disk and resolves to those paths.
- `setRepoState(repo, state)` — stores `state` as the record of `repo` (replacing any earlier one) and persists.
- `updateHiddenRemotes(repo, names)` — sets the record's `hiddenRemotes` to `names` sorted and without repeats; returns the new record, or `undefined` when nothing changed.
- Types `GitRepoSet` (`{ [repo: string]: GitRepoState }`) and `GitRepoState` (`{ columnWidths: number[] | null; hiddenRemotes?: string[]; graphPreferences?: GraphPreferences }`) come from `@/types` (`src/types/legacy.ts`).
- The members must work when called as methods; they should not depend on `this`.

Who uses what:

| User                                                             | Uses                                                                                                                                                                                                   |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/extension/legacy.ts`                                        | `createRepoManager(new ExtensionState(ctx))` once per activation; `Object.hasOwn(repoManager.getRepos(), repo)` for the diff-document provider; passes the manager to every `registerMessageHandlers`. |
| `src/old-extension/messageHandler.ts`                            | type `RepoManager`; `getRepos`, `setRepoState`, `updateHiddenRemotes`, `pruneMissing` (A.3).                                                                                                           |
| `tests/extension/repo-manager.test.ts`                           | `createRepoManager`, `pruneMissing`, `getRepos`.                                                                                                                                                       |
| `tests/extension/remote-preferences.test.ts`                     | `createRepoManager`, `setRepoState` (record identity), through module A: `getRepos`, `updateHiddenRemotes`.                                                                                            |
| `tests/extension/view-preferences.test.ts`                       | `createRepoManager` over a real `ExtensionState`, `updateHiddenRemotes(repo, [])`, `getRepos`.                                                                                                         |
| `tests/extension/legacy-types.test.ts`                           | type `RepoManager` (cast target).                                                                                                                                                                      |
| `tests-ext/repoManager.test.ts` (VS Code host)                   | `createRepoManager`, `setRepoState`, `getRepos` key order.                                                                                                                                             |
| `tests/extension/message-protocol.test.ts`, `activation.test.ts` | real module through `legacy.ts`.                                                                                                                                                                       |

### C.2 Dependencies the implementation must use

- `node:fs/promises` — an asynchronous existence check (`access` with its default mode, or an equivalent that follows symbolic links and treats any error as "missing").
- `@/old-extension/extensionState` — `ExtensionState` (as the parameter type; may be a type-only import).
- `@/types` — types `GitRepoSet`, `GitRepoState` (type-only).
- No `vscode` import at all.

### C.3 Behaviour

1. **Creation.** Reads `extensionState.getRepos()` exactly once. No other I/O, no Git, no pruning at creation. What it obtains is the manager's working set for the rest of its life; later changes made to storage by anyone else are not seen (`manager Q3`). Observed: the object obtained from storage is itself modified and is the object passed to `saveRepos`; no caller or test relies on that, so working on a copy is equally acceptable.
2. **`getRepos()`** returns a **new** object on every call, containing every record, with keys in ascending JavaScript default sort order (UTF-16 code units: `"/A" < "/a-b" < "/a/b" < "/z" < "/ä"`). The values are the stored record objects themselves (not copies). Adding or removing keys on the returned object does not affect the manager.
3. **`setRepoState(repo, state)`** stores `state` (the same object, not a copy) under `repo`, then calls `extensionState.saveRepos(<all records>)` once. It saves on every call, even if the record did not change.
4. **`updateHiddenRemotes(repo, names)`**:
   - `wanted` = `names` without repeats, sorted by JavaScript default sort (`["x","B","a"]` → `["B","a","x"]`);
   - `current` = the record's `hiddenRemotes`, or `[]` when there is no record or no field;
   - if `current` and `wanted` are equal element by element in order, return `undefined` and do not save (so an unsorted saved list is treated as different and gets rewritten sorted);
   - otherwise build a **new** record: all fields of the saved record (or `{ columnWidths: null }` when there is none) with `hiddenRemotes: wanted` — an empty list is stored as `hiddenRemotes: []`, the field is not removed — store it as in `setRepoState` (one save), and return it.
   - For a repository without a record, `names = []` returns `undefined` and creates nothing.
5. **`pruneMissing()`**: checks every saved path concurrently; a path counts as present when the existence check succeeds (a directory, a regular file, or a symbolic link whose target exists); any failure (missing, dangling link, permission denied, relative path not found from the process's working directory, empty string) counts as missing. Missing paths are removed, and if at least one was removed `saveRepos` is called once with the remaining records. Resolves to the removed paths in the order the records were first stored (not sorted); `[]` (and no save) when nothing is missing or nothing is saved. It never rejects for file-system reasons.

### C.4 Examples

| Setup                                                                                                                                   | Call                                              | Observed                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| stored `{"/z":…, "/a":…, "/m":…}`                                                                                                       | `Object.keys(getRepos())`                         | `["/a","/m","/z"]`                                                                                            |
| stored `{"/z", "/a-b", "/a/b", "/A", "/ä", <tmp>/missing2, <tmp>/file, <tmp>/missing1, <tmp>}` (`<tmp>` exists, `<tmp>/file` is a file) | `pruneMissing()`                                  | `["/z","/a-b","/a/b","/A","/ä","<tmp>/missing2","<tmp>/missing1"]`; one save; remaining `<tmp>`, `<tmp>/file` |
| same manager, nothing missing any more                                                                                                  | `pruneMissing()`                                  | `[]`, no save                                                                                                 |
| stored `{"/r": {columnWidths:[1], hiddenRemotes:["b","a"]}}`                                                                            | `updateHiddenRemotes("/r", ["b","a"])`            | returns `{columnWidths:[1], hiddenRemotes:["a","b"]}` (new object), one save                                  |
| then                                                                                                                                    | `updateHiddenRemotes("/r", ["a","b","b"])`        | `undefined`, no save                                                                                          |
| then                                                                                                                                    | `updateHiddenRemotes("/r", [])`                   | `{columnWidths:[1], hiddenRemotes:[]}`, one save                                                              |
| no record for `/none`                                                                                                                   | `updateHiddenRemotes("/none", [])`                | `undefined`; `/none` not created                                                                              |
| no record for `/none`                                                                                                                   | `updateHiddenRemotes("/none", ["x","B","a"])`     | `{columnWidths:null, hiddenRemotes:["B","a","x"]}`                                                            |
| `rec = {columnWidths:null}`                                                                                                             | `setRepoState("/set", rec)` twice                 | `getRepos()["/set"] === rec`; two saves                                                                       |
| stored `{ "/ws/a": {columnWidths:null} }`                                                                                               | `setRepoState("/ws/a", {columnWidths:[100,200]})` | saved set holds `"/ws/a": {columnWidths:[100,200]}`                                                           |

### C.5 Non-functional requirements

- Import time: nothing runs; no `vscode`.
- Creation must be cheap and must not touch the file system or Git (activation creates the manager; `activation.test.ts` asserts no Git runs even when a saved repository was deleted).
- Record identity matters: `setRepoState` must keep the given object (`remote-preferences.test.ts` checks `toBe`), `updateHiddenRemotes` must create a new object when it changes something, and unchanged records must keep their identity, because module A detects "the record changed during a read" by identity.
- `getRepos` must return a fresh object each call; it is called for every diff document VS Code asks for and on several message paths, so it should stay proportional to the number of saved repositories.
- Only JSON-compatible data is stored.

### C.6 Test coverage

**Checked:** `pruneMissing` removes only missing folders, returns them, saves once, and does not save again when nothing is missing (`repo-manager.test.ts`); `setRepoState` persistence and `getRepos` key order (`tests-ext/repoManager.test.ts`, VS Code host only); record identity after `setRepoState` and hidden-remote rewriting through module A (`remote-preferences.test.ts`); `updateHiddenRemotes(repo, [])` keeping other fields, and write-through across re-creation (`view-preferences.test.ts`).

**Not checked in Vitest** (V8 shows the "no record" defaults never taken):

- **manager G1 — sorted copy.** Stored `{"/z", "/a", "/m"}`. Expect `Object.keys(getRepos())` `["/a","/m","/z"]`, two calls return different objects with identical values (`toBe` per record), and deleting a key from a returned object leaves the next `getRepos()` unchanged.
- **manager G2 — storage read once.** Fake `ExtensionState.getRepos` counting calls. Create, call `getRepos()` three times. Expect exactly one read.
- **manager G3 — `updateHiddenRemotes` normalizes and reports changes.** Stored `{"/r": {columnWidths:[1], hiddenRemotes:["b","a"]}}`. Calls: `["b","a"]` → returns `{columnWidths:[1], hiddenRemotes:["a","b"]}`; `["a","b","b"]` → `undefined`; `[]` → `{columnWidths:[1], hiddenRemotes:[]}`. Expect saves after the first and third only, and a new record object each time something changed.
- **manager G4 — unknown repository.** `updateHiddenRemotes("/none", [])` → `undefined` and `"/none" in getRepos()` false; `updateHiddenRemotes("/none", ["x","B","a"])` → `{columnWidths:null, hiddenRemotes:["B","a","x"]}`.
- **manager G5 — prune keeps files and reports insertion order.** Stored paths: a missing path, an existing file, another missing path, an existing directory. Expect the two missing paths in stored order and the file kept.
- **manager G6 — prune with nothing stored.** Expect `[]` and no save.

### C.7 Questions

- **manager Q1 — sort order.** Current: keys are sorted by UTF-16 code units, case-sensitively, on every `getRepos()` call. Only the VS Code-host test depends on the order. Intended: confirm whether callers need any order at all.
- **manager Q2 — what counts as missing.** Current: any error from the existence check (permission denied, an unavailable network drive, a dangling symbolic link) counts as missing and permanently forgets the record; a path that is now a regular file counts as present. Intended: possibly forget only on "does not exist".
- **manager Q3 — one read, in-place writes.** Current: the storage is read once at creation, then the same object is mutated and saved; state saved by another VS Code window for the same workspace is overwritten by this window's next save. Intended: probably acceptable for workspace-scoped state; confirm.
- **manager Q4 — empty list kept.** Current: `updateHiddenRemotes(repo, [])` stores `hiddenRemotes: []`, while the `GitRepoState` type documents the field as left out when there are none. Intended: possibly delete the field.
- **manager Q5 — unsorted lists count as changes.** Current: a stored unsorted list with the same names is rewritten and reported as a change (module A then posts `repoState`). Intended: probably fine; compare as sets if not.
- **manager Q6 — prune races.** Current: a record saved for a path while `pruneMissing` is checking it is still deleted if the check had failed. Intended: probably irrelevant in practice.

---

## D. `src/old-extension/extensionState.ts`

In one sentence: it reads and writes the saved repository records in workspace storage (key `repoStates`), and when constructed it removes leftover avatar data from older releases (a global-state key and a folder).

### D.1 Interface

One export, a class. No default export.

```ts
export class ExtensionState {
  constructor(context: ExtensionContext);
  getRepos(): GitRepoSet;
  saveRepos(gitRepoSet: GitRepoSet): void;
}
```

- `context` — the `vscode.ExtensionContext`. Only `context.workspaceState` (a `Memento`), `context.globalState` (a `Memento`) and `context.globalStoragePath` (a string) are read.
- `getRepos()` — the stored records.
- `saveRepos(gitRepoSet)` — stores the records; returns `undefined`.
- It must remain a **class** (a value export): `legacy.ts` and `view-preferences.test.ts` construct it with `new`, `tests-ext/repoManager.test.ts` imports it with a plain (non-type) import, and several tests cast fakes `as unknown as ExtensionState`. Whether it has private members is not observable; tests never read any other member.

Who uses what:

| User                                                                                                  | Uses                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/extension/legacy.ts`                                                                             | `new ExtensionState(ctx)` once per activation (inside `createMessageProtocol`, which `createViewCommand` calls during activation).            |
| `src/old-extension/repoManager.ts`                                                                    | parameter type; `getRepos()` once, `saveRepos()` on every change.                                                                             |
| `tests/extension/view-preferences.test.ts`                                                            | `new ExtensionState(context)` with a JSON-copying `workspaceState`; asserts `globalState.update` is never called when no avatar cache exists. |
| `tests/extension/activation.test.ts`                                                                  | through `activate`: `globalState.update("avatarCache", undefined)` and removal of `<globalStoragePath>/avatars`.                              |
| `tests/extension/message-protocol.test.ts`                                                            | through `legacy.ts`: records under `repoStates` in `workspaceState` are served.                                                               |
| `tests/extension/repo-manager.test.ts`, `remote-preferences.test.ts`, `tests-ext/repoManager.test.ts` | type only (cast target).                                                                                                                      |

### D.2 Dependencies the implementation must use

- `node:fs/promises` — recursive, forced removal (`rm` with `{ recursive: true, force: true }`).
- `node:path` — joining `globalStoragePath` and `avatars`.
- `vscode` — types `ExtensionContext`, `Memento` only (type-only import); no runtime use of the `vscode` module.
- `@/types` — type `GitRepoSet` (type-only).

### D.3 Behaviour

1. **Construction**, synchronously:
   - `context.globalState.get("avatarCache")` (one argument). If the result is not `undefined` (any value, including `null` or `{}`), call `context.globalState.update("avatarCache", undefined)`, which VS Code documents as removing the key. The returned promise is not awaited.
   - Start removing `path.join(context.globalStoragePath, "avatars")` recursively (a folder, or a file of that name), ignoring every error, including "does not exist". Not awaited: the folder still exists when the constructor returns and disappears shortly after. Nothing else in the storage folder is touched.
   - Nothing else: `workspaceState` is not read, no key other than `avatarCache` is changed.
   - If `globalStoragePath` is not a string, `path.join` throws a `TypeError` synchronously from the constructor (VS Code always provides it).
2. **`getRepos()`** returns `context.workspaceState.get("repoStates", {})`: the stored value as the `Memento` returns it (no copy, no validation), or a new empty object when nothing is stored (a different `{}` on each call).
3. **`saveRepos(set)`** calls `context.workspaceState.update("repoStates", set)` and returns `undefined` without waiting for the update.

### D.4 Examples

| Setup                                                                                           | Call                                                     | Observed                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `globalState` holds `avatarCache: {}`; `<storage>/avatars/x.png` and `<storage>/keep.txt` exist | `new ExtensionState(ctx)`                                | `globalState.get("avatarCache")`, then `globalState.update("avatarCache", undefined)`; `avatars` still present on return, gone shortly after; `keep.txt` kept |
| `avatarCache: null` stored, storage folder missing                                              | construct                                                | `update("avatarCache", undefined)` called; no error                                                                                                           |
| no `avatarCache`                                                                                | construct                                                | only the `get`; no `update`                                                                                                                                   |
| `globalState.update` rejects                                                                    | construct                                                | constructor returns normally; the rejection is unhandled (`state Q1`)                                                                                         |
| `<storage>/avatars` is a file                                                                   | construct                                                | the file is removed                                                                                                                                           |
| nothing stored under `repoStates`                                                               | `getRepos()` twice                                       | `{}` both times, different objects; `workspaceState.get("repoStates", {})` each time                                                                          |
| `repoStates` holds object `S`                                                                   | `getRepos()`                                             | returns `S` itself                                                                                                                                            |
|                                                                                                 | `saveRepos({"/x":{columnWidths:null}})`                  | `workspaceState.update("repoStates", {"/x":{columnWidths:null}})`; returns `undefined`                                                                        |
| `repoStates` holds `null`                                                                       | `getRepos()`; then `createRepoManager(state).getRepos()` | `null`; the manager's `getRepos()` throws `TypeError: Cannot convert undefined or null to object` (`state Q3`)                                                |

### D.5 Non-functional requirements

- Import time: nothing runs.
- Construction must not block: the removal runs in the background and its failure is ignored; the constructor must not throw for missing folders.
- No `vscode` module access at runtime (the `message-protocol` and `activation` test mocks lack most of it).
- Keys are exactly `"avatarCache"` (global state) and `"repoStates"` (workspace state); stored data written by earlier versions under `repoStates` must keep loading.

### D.6 Test coverage

**Checked:** avatar cache key cleared and folder removed (`activation.test.ts`); no `globalState.update` without a cache (`view-preferences.test.ts`); `repoStates` read and written through the manager and message handler (`view-preferences.test.ts`, `message-protocol.test.ts`).

**Not checked** (V8 shows the error-ignoring callback never runs):

- **state G1 — removal errors are ignored.** Setup: `globalStoragePath` pointing into a folder where removal fails (for example a read-only parent, skipped on Windows), or `rm` mocked to reject. Call: construct. Expect: no throw, no unhandled rejection.
- **state G2 — defaults.** Empty `workspaceState`. Expect `getRepos()` equals `{}`, and `workspaceState.get` was called with `("repoStates", {})`.
- **state G3 — save key and return value.** Expect `saveRepos(S)` calls `workspaceState.update("repoStates", S)` once and returns `undefined`.
- **state G4 — other storage untouched.** Storage folder with `avatars/` and `keep.txt`; `globalState` without the cache. Expect `avatars` removed, `keep.txt` kept, `globalState.update` not called, `workspaceState` untouched by construction.

### D.7 Questions

- **state Q1 — unhandled update rejections.** Current: neither the `globalState.update("avatarCache", undefined)` promise nor the `workspaceState.update("repoStates", …)` promise is awaited or given a rejection handler, so a failing update becomes an unhandled rejection in the extension host. Intended: probably attach a handler that ignores or logs the failure.
- **state Q2 — deprecated storage path.** Current: the avatar folder is located through `context.globalStoragePath` (deprecated in favour of `globalStorageUri`), and construction throws if it is missing. Intended: possibly use `globalStorageUri.fsPath`; tests provide only `globalStoragePath`.
- **state Q3 — no validation of stored records.** Current: whatever is stored under `repoStates` is returned as is. A stored `null` makes the manager's `getRepos()` throw a `TypeError` (and with it every `selectRepo` and diff document); other non-object values (an array, a string, a number) are not rejected either and yield meaningless or no keys. Intended: probably treat anything that is not a plain object as `{}`.
- **state Q4 — older keys left behind.** Current: only `avatarCache` is cleaned; `activation.test.ts` shows earlier versions also kept `lastActiveRepo` in workspace state, which nothing reads or removes any more. Intended: possibly clear it too.
- **state Q5 — cleanup on every activation.** Current: the avatar folder removal is attempted on every activation, forever. Intended: cheap enough; confirm.

---

## Decisions

These decisions are the maintainer's answers to the questions above. Where they differ from "current behaviour" elsewhere in this specification, they win.

### messageHandler

- **Q1.** Keep: `dispose` leaves running actions, `loadRemotes` and a pending Undo to finish. (The reviewer corrects the extension-core specification's statement.)
- **Q2.** Guard every post to the page: a post that throws or rejects (for example after the panel closed) is caught and logged at debug level, never left unhandled.
- **Q3, Q5, Q7, Q8, Q9, Q10, Q12, Q13.** Keep the current behaviour.
- **Q4.** The repository lock compares normalized repository paths (`normalizeRepoPath` from `@/backend/utils/repoPath`), as the submodule checks do, so `/repo` and `/repo/` are the same repository.
- **Q6.** A watcher failure during a graph read is logged at debug level (as `selectRepo` already does) and does not fail the read.
- **Q11.** See repoManager Q2: pruning during workspace reads removes only records whose folder is definitely missing.
- **Q14.** The fields the handler echoes from the request (`command`, `repo`, `requestId` and any other echoed field) always win over fields of the same name in the backend's result.

### webviewBridge

- **Q1.** A handler that throws or rejects is caught; the failure is logged at warn level with the command name, and nothing is left unhandled. Dispatch stays synchronous.
- **Q2, Q3.** Keep the current behaviour.
- **Q4.** A message that is not an object with a string `command` (including `null`) is ignored without an error, like an unknown command.

### repoManager

- **Q1, Q3, Q4, Q5, Q6.** Keep the current behaviour.
- **Q2.** Only a folder that is definitely missing (the check fails with `ENOENT` or `ENOTDIR`) counts as missing for pruning. Any other access error (permission denied, an offline or unavailable drive, `EIO`, and so on) keeps the record.

### extensionState

- **Q1.** Handle both storage update promises: a rejection is caught and logged at warn level.
- **Q2, Q4, Q5.** Keep the current behaviour.
- **Q3.** When reading stored repository records, skip any entry whose value is not a plain object (for example `null`), so a damaged record cannot make the manager throw. Valid entries are returned unchanged.
