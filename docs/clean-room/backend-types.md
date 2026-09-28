# Clean-room specification: the backend message and Git data types

Modules covered, one top-level section each:

- **A.** `src/backend/types/actions.types.ts`
- **B.** `src/backend/types/git.types.ts`
- **C.** `src/backend/types/queries.types.ts`

This document is for an engineer who will write replacements for these three files without seeing them. All three hold TypeScript types only. None of them runs anything. Together they define:

- the records the backend builds from Git output (commits, ref labels, changed files, commit details) and a few closed sets of string literals (change kinds, date kinds, reset modes);
- the messages that the webview and the extension host exchange for Git actions and for the older ("legacy") read queries: what the webview asks for and what the extension answers.

The replacement must state exactly the same shapes. Most of this document therefore says, field by field, what goes into each value in practice, who fills it in, who reads it, and which compile-time properties the rest of the code depends on.

---

## 0. How the behaviour was observed

- Repository at commit `937fcf8`, on Linux, with Git 2.43.0, Node 22.22.2, TypeScript 7.0.2 (the repository's own `tsc`), simple-git 3.36.0 and Vitest 4.1.11.
- The five type-check projects run by `pnpm typecheck` all pass (root, `src/webview`, `tests`, `tests/webview`, `tests-ext`).
- A scratch file, compiled with the repository's base compiler options, checked each compile-time claim below, including every "is a compile error" claim.
- The producers (`loadCommits`, `loadBranches`, `commitDetails`, `loadRemotes`, `parseLog`, the history parser) were bundled with esbuild and run against temporary repositories. The legacy message handler (`src/old-extension/messageHandler.ts`) was also bundled, with a stub `vscode` module, and fed requests so that the exact messages it posts could be recorded. All scratch files and repositories were deleted afterwards.
- These test files were run and pass: `tests/extension/{graph-queries,action-dispatch,query-cancellation,remote-preferences,view-diff,action-cancel}.test.ts` (41 tests); `tests/webview/lib/{graph-requests,remote-actions,menu-actions,menus,cancel-action,actions}.test.ts` and `tests/webview/components/commit/{FileTree,RefLabel}.test.ts` (194 tests); `tests/backend/queries/{commitDetails,loadCommits,loadBranches}/**`, `tests/backend/actions/remote.test.ts` and `tests/backend/actions/commit/**` (181 tests).

---

## S. Context shared by all three modules

### S.1 How the modules are reached

- The barrel `src/backend/types/index.ts` re-exports all three files with the plain (non-`type`) `export *` form, together with `repository.types.ts`. It re-exports `history.types.ts`, `workflow.types.ts` and `workingTree.types.ts` with `export type *`. The barrel is not part of this rewrite.
- Every importer outside `src/backend/types/` imports these names from `@/backend/types` and never from the file paths directly. All 60 such import statements are `import type`. No value is imported from these modules anywhere.
- Inside the folder, files import each other by relative path. `actions.types.ts` imports from `./git.types` and `./repository.types`. `queries.types.ts` imports from `./git.types` and `./repository.types`. `history.types.ts` imports `GitCommitNode` from `./git.types`. The three file names and locations must therefore stay as they are.

### S.2 Compiler settings that shape the types

`tsconfig.base.json` enables, among others, `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `isolatedModules`, `noUnusedLocals` and `moduleDetection: "force"`. What this means for the replacement:

- **`exactOptionalPropertyTypes`.** A property declared `name?: T` may be left out, but it may not be set to `undefined` unless `T` itself includes `undefined`. Several fields below are optional in one of these two ways, and the difference matters to callers (see C.3.1). The spec gives each optional field's exact form.
- **`verbatimModuleSyntax`.** Imports of types must be written as type-only imports.
- **`noUnusedLocals`.** A non-exported type alias that nothing uses is a compile error.

### S.3 Projects that compile these files

These files are compiled by the extension project (`tsconfig.json`: Node and VS Code typings, no DOM), by the webview project (`src/webview/tsconfig.json`: DOM library and Preact JSX, no Node or VS Code typings), and by the three test projects. So they must not refer to any Node, DOM or VS Code type.

### S.4 The wire between webview and extension

Requests and responses travel by `postMessage` and are serialised as JSON. Two effects were observed and are relied on:

- A property whose value is `undefined` is dropped in transit, so the receiver sees it as missing.
- `NaN` arrives as `null`. The webview's date formatting handles `null` for exactly this reason (see B.3.3).

Neither side checks incoming message shapes at run time. The extension's handlers trust the declared types. The webview's dispatcher checks only that `command` is a string.

### S.5 The legacy protocol in brief

The webview posts a request carrying a `command` name. The extension host (`src/old-extension/messageHandler.ts`, registered through `src/old-extension/webviewBridge.ts`) handles it and posts a response carrying the same `command` name. The webview's dispatcher (`src/webview/lib/dispatcher.ts`) routes each response to its handler by `command`.

`src/types/legacy.ts` builds the full unions. `RequestMessage` contains `ActionRequest`, `QueryRequest`, and requests defined in `legacy.ts` itself: `cancelAction`, `cancelRepositoryQuery`, `viewReady`, `selectRepo`, `saveRepoState` and `viewDiff`. `ResponseMessage` contains `ActionResponse`, `QueryResponse`, and responses defined in `legacy.ts`: `repoState`, `graphQueryError`, `fileHistory`, `viewDiff` and `refresh`. The command names in modules A and C must not collide with those names or with each other. Currently they do not.

### S.6 Provenance bookkeeping

`scripts/provenance-baseline.json` records 18, 41 and 32 inherited lines for `actions.types.ts`, `git.types.ts` and `queries.types.ts`. A rewrite lowers those numbers as `docs/provenance.md` describes. Because every exported name, field name and literal value must stay exactly the same, some short lines of the new files may match old lines word for word. Any such coincidence that survives review goes into `scripts/provenance-reviewed.json`, as that document explains.

---

## A. `src/backend/types/actions.types.ts`

### A.1 Interface

Module path: `src/backend/types/actions.types.ts`, reached as `@/backend/types`. There is no default export and no runtime value. The module has exactly four exports:

| Export             | Kind                                                 | Meaning                                                                                                                                                                                                            |
| ------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GitCommandStatus` | type alias, exactly `string \| null`                 | The result of one Git action: `null` for success, otherwise a readable failure message.                                                                                                                            |
| `ActionRequest`    | union of 17 object types, discriminated by `command` | A request from the webview to run one Git action in one repository.                                                                                                                                                |
| `ActionResponse`   | union of 17 object types, discriminated by `command` | The extension's answer to one `ActionRequest`.                                                                                                                                                                     |
| `ActionPayload<T>` | generic type alias with one parameter `T`            | The fields that belong to action `T` alone, without the envelope (A.1.2). `T` is constrained to exactly the 17 command names, the same set as `ActionRequest["command"]`. Using any other name is a compile error. |

#### A.1.1 The command names

There are exactly 17: `repositoryAction`, `addTag`, `checkoutBranch`, `checkoutCommit`, `cherrypickCommit`, `createBranch`, `deleteBranch`, `deleteTag`, `mergeBranch`, `mergeCommit`, `pushTag`, `pushBranch`, `pullBranch`, `fetchRemote`, `renameBranch`, `resetToCommit`, `revertCommit`.

`ActionRequest["command"]` and `ActionResponse["command"]` are both exactly this union. `src/webview/lib/handler/action-result.ts` declares a `Record` keyed by `ActionResponse["command"]` that lists all 17. Adding or removing a name therefore breaks the webview build.

#### A.1.2 The request envelope

Every member of `ActionRequest` has these fields, plus its payload fields (A.1.3):

| Field       | Type                      | Presence                                                                                                                       | Meaning                                                                                                                                        |
| ----------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `command`   | the member's literal name | required                                                                                                                       | Which action to run.                                                                                                                           |
| `repo`      | `string`                  | required                                                                                                                       | The repository to act in: the root path the webview has selected, the same string that keys the extension's saved repository state.            |
| `requestId` | `string`                  | optional; **required** for `repositoryAction`, `pushBranch`, `pullBranch` and `fetchRemote`, because their payloads require it | A correlation id chosen by the sender, unique within one webview session. Being optional, it may be left out but not set to `undefined` (S.2). |

#### A.1.3 Payload fields: `ActionPayload<T>` for each command

Every field is required unless marked optional. For each command, `ActionPayload<T>` is exactly the fields listed here, and nothing else. It never contains `command` or `repo`. It contains `requestId` only where this table lists it.

| `T`                | Fields of `ActionPayload<T>`                                                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `repositoryAction` | `requestId: string`; `action: RepositoryAction`                                                                                                       |
| `addTag`           | `tagName: string`; `commitHash: string`; `lightweight: boolean`; `message: string`                                                                    |
| `checkoutBranch`   | `branchName: string`; `remoteBranch: string \| null`; `fetch?: boolean` (optional); `requestId?: string` (optional)                                   |
| `checkoutCommit`   | `commitHash: string`                                                                                                                                  |
| `cherrypickCommit` | `commitHash: string`; `parentIndex: number`                                                                                                           |
| `createBranch`     | `commitHash: string`; `branchName: string`                                                                                                            |
| `deleteBranch`     | `branchName: string`; `forceDelete: boolean`                                                                                                          |
| `deleteTag`        | `tagName: string`                                                                                                                                     |
| `mergeBranch`      | `branchName: string`; `createNewCommit: boolean`                                                                                                      |
| `mergeCommit`      | `commitHash: string`; `createNewCommit: boolean`                                                                                                      |
| `pushTag`          | `tagName: string`; `remote: string`; `requestId?: string` (optional)                                                                                  |
| `pushBranch`       | `requestId: string`; `branchName: string`; `remote: string`; `remoteBranch: string`; `setUpstream: boolean`; `expectedRemoteHash?: string` (optional) |
| `pullBranch`       | `requestId: string`; `branchName: string`; `remote: string`; `remoteBranch: string`                                                                   |
| `fetchRemote`      | `requestId: string`; `remote: string \| null`; `prune: boolean`                                                                                       |
| `renameBranch`     | `oldName: string`; `newName: string`                                                                                                                  |
| `resetToCommit`    | `commitHash: string`; `resetMode: GitResetMode`                                                                                                       |
| `revertCommit`     | `commitHash: string`; `parentIndex: number`                                                                                                           |

`RepositoryAction` is defined in `repository.types.ts`, and `GitResetMode` in `git.types.ts` (module B). Optional fields here, like `requestId`, may be omitted but not set to `undefined`.

#### A.1.4 The response

Every member of `ActionResponse` has exactly these fields:

| Field       | Type                                       | Presence | Meaning                                                                  |
| ----------- | ------------------------------------------ | -------- | ------------------------------------------------------------------------ |
| `command`   | the literal name of the request it answers | required |                                                                          |
| `status`    | `GitCommandStatus`                         | required | `null` when the action succeeded. Otherwise the failure message (A.3.3). |
| `repo`      | `string`                                   | optional | The request's `repo`, echoed back.                                       |
| `requestId` | `string`                                   | optional | The request's `requestId`, echoed back.                                  |

The 17 members differ only in the literal type of `command`.

#### A.1.5 Who uses what

| Export             | Source files                                                                                                                                                                                                                                                                                                                                                                                                                                   | Test files                                                                                                                                                                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GitCommandStatus` | none outside this module; it appears only inside `ActionResponse`                                                                                                                                                                                                                                                                                                                                                                              | none                                                                                                                                                                                                                                                |
| `ActionRequest`    | `src/types/legacy.ts` (part of `RequestMessage`); `src/old-extension/messageHandler.ts` (`ActionRequest["command"]`, and extracting one member by command); `src/webview/types.ts` (`ActionCommand`: every member with `repo` removed, member by member)                                                                                                                                                                                       | none import it directly. Request objects in `tests/webview/lib/{actions,menus,menu-actions,remote-actions,cancel-action,unseen-failures,workflows,history-tools}.test.ts` are type-checked against it through `ActionCommand` and `RequestMessage`. |
| `ActionResponse`   | `src/types/legacy.ts` (part of `ResponseMessage`); `src/webview/lib/activity.ts`; `src/webview/lib/handler/action-result.ts` (`ActionResponse["command"]` as a `Record` key); `src/webview/lib/remote-actions.tsx`                                                                                                                                                                                                                             | none directly. Response objects passed to `handleActionResult` and `acceptRemoteActionResult` in `tests/webview/lib/{remote-actions,workflows,history-tools,unseen-failures}.test.ts` are type-checked against it.                                  |
| `ActionPayload`    | parameter types in `src/backend/actions/branch.ts` (`createBranch`, `deleteBranch`, `renameBranch`, `checkoutBranch`), `commit.ts` (`checkoutCommit`, `cherrypickCommit`, `revertCommit`, `resetToCommit`), `merge.ts` (`mergeBranch`, `mergeCommit`), `remote.ts` (`pushBranch`, `fetchRemote`, `pullBranch`) and `tag.ts` (`addTag`, `deleteTag`, `pushTag`). `src/backend/actions/workflows.ts` calls `fetchRemote` with a literal payload. | none directly. Every call to those backend functions in `tests/backend/actions/**` and `tests/backend/utils/validation.test.ts` is type-checked against it.                                                                                         |

### A.2 Dependencies the implementation must use

- `GitResetMode`, type-only, from `./git.types` (module B), for `resetToCommit.resetMode`.
- `RepositoryAction`, type-only, from `./repository.types`, for `repositoryAction.action`.

Nothing else: no packages, and no other repository modules.

### A.3 Behaviour

The module runs nothing. Its behaviour is (1) what the compiler accepts and rejects, and (2) the meaning that producers and consumers give to each field.

#### A.3.1 Compile-time properties that callers rely on

1. Selecting the member whose `command` is `K` (with `Extract`, or by narrowing on `command`) gives exactly the envelope plus that command's payload. `messageHandler.ts` hands such a selected request straight to the backend function whose parameter is `ActionPayload<K>`. This works because the request has every payload field; its extra envelope fields are allowed.
2. A request object literal without `requestId` compiles for 13 commands. It is a compile error for `repositoryAction`, `pushBranch`, `pullBranch` and `fetchRemote`.
3. `requestId: undefined` is a compile error everywhere (S.2). The same goes for `fetch: undefined`, `expectedRemoteHash: undefined`, and `repo: undefined` or `requestId: undefined` on a response.
4. `ActionPayload<"pushBranch">`, `<"pullBranch">`, `<"fetchRemote">` and `<"repositoryAction">` require `requestId`. A backend call without it does not compile. `ActionPayload<"checkoutBranch">` and `<"pushTag">` accept `requestId` but do not need it. No other payload has it.
5. Removing `repo` from every member (the webview's `ActionCommand`) keeps the union discriminated. It also keeps `requestId` required for the four commands in item 2.
6. An `ActionResponse` needs only `command` and `status`. Leaving out `status` is a compile error, as is a `command` outside the 17.

#### A.3.2 What the webview puts in a request

- **`requestId` values.** Every request the current webview sends has one. Formats in use: `action-<n>` (every request sent through `runAction`, which replaces any `requestId` the caller supplied), `remote-<n>` (remote dialogs), `repository-action-<n>` and `workspace-action-<n>` (repository actions). The extension also creates `undo-restore-<n>` for a follow-up action it starts itself. The id is used to match the response to its request, as the key for cancelling (A.3.3), and as the id of the entry in the Git Activity list.
- **`repo`** is the repository currently selected in the webview. The one exception is actions allowed to target a different repository, such as submodule actions, which name that repository instead.
- **`addTag`.** `tagName` is what the user typed. `commitHash` is the full hash of the commit row. The user picks annotated or lightweight: `lightweight: true` sends `message: ""` whatever was typed, and `lightweight: false` sends the typed text, which may be empty.
- **`checkoutBranch`.**
  - For a local branch: `remoteBranch: null`, and no `fetch` key at all (a test checks the exact object).
  - For a remote-tracking branch: `remoteBranch` is its short name `<remote>/<branch>` with no `refs/remotes/` prefix, and the remote name may contain slashes. `branchName` is the local name the user accepted. `fetch` is `true` or `false` from a checkbox.
- **`cherrypickCommit` and `revertCommit`.** `parentIndex` is `0` for a commit with fewer than two parents. For a merge, it is the 1-based number of the parent the user chose (default `1`), in the order of the commit's `parentHashes`.
- **`mergeBranch` and `mergeCommit`.** `createNewCommit` comes from a checkbox that defaults to `true`.
- **`resetToCommit`.** `resetMode` is one of `"soft"`, `"mixed"` (the default) or `"hard"`. It is taken from a select control and cast, not validated.
- **`deleteBranch`.** `forceDelete` comes from a checkbox.
- **`fetchRemote`.** `remote` is `null` when the user picks "all remotes", otherwise a configured remote name. `prune` comes from a checkbox that defaults to `false`.
- **`pushTag`.** `remote` is the chosen remote name.
- **`pushBranch` and `pullBranch`.** No code in the current webview sends these two commands: push and pull go through a `repositoryAction` with a `sync` workflow. The extension still handles them, and tests call them.

#### A.3.3 What the extension does with a request, and what the response carries

The action functions in `src/backend/actions/*.ts` own the details. They are listed here only to fix what each field means. The Git arguments are shown exactly as run:

| Command            | Effect in the repository                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `addTag`           | Checks the tag name. Then `git tag -a -m <message> -- <tagName> <commitHash>` when `lightweight` is false, or `git tag -- <tagName> <commitHash>` when it is true. An empty message makes an annotated tag with an empty message.                                                                                                                                                                                                                                                                                                                                                                                          |
| `deleteTag`        | `git tag -d -- <tagName>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `pushTag`          | Checks the remote and the tag name, then `git push -- <remote> refs/tags/<tagName>:refs/tags/<tagName>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `createBranch`     | Checks the branch name, then `git branch -- <branchName> <commitHash>`. It does not switch to the new branch.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `deleteBranch`     | `git branch -d -- <branchName>`, or `-D` in place of `-d` when `forceDelete` is true                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `renameBranch`     | Checks `newName`, then `git branch -m -- <oldName> <newName>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `checkoutBranch`   | With `remoteBranch` null: `git checkout <branchName>`. Otherwise, when `fetch` is true, first `git fetch --no-tags -- <remote> +refs/heads/<branch>:refs/remotes/<remoteBranch>`. Then either create the branch with `git checkout --track -b <branchName> refs/remotes/<remoteBranch>` (`--no-track` when the ref's remote cannot be identified, such as a removed remote; with `fetch` true, such a ref makes the action fail instead), or, if the local branch already exists, run `git checkout <branchName>` and then `git merge --ff-only refs/remotes/<remoteBranch>`. When `fetch` is missing, it counts as false. |
| `checkoutCommit`   | `git checkout <commitHash>` (detaches HEAD)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `cherrypickCommit` | `git cherry-pick <commitHash>`, with `-m <parentIndex>` before the hash when `parentIndex > 0`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `revertCommit`     | `git revert --no-edit <commitHash>`, with `-m <parentIndex>` before the hash when `parentIndex > 0`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `resetToCommit`    | `git reset --<resetMode> <commitHash>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `mergeBranch`      | `git merge [--no-ff] --no-edit --end-of-options <branch>`. `--no-ff` is present when `createNewCommit` is true. The branch argument becomes `refs/heads/<branchName>` when the short name would resolve to something else.                                                                                                                                                                                                                                                                                                                                                                                                 |
| `mergeCommit`      | `git merge [--no-ff] --no-edit --end-of-options <commitHash>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `pushBranch`       | Checks the remote and both branch names. Then `git push [--set-upstream] [--force-with-lease=refs/heads/<remoteBranch>:<expectedRemoteHash>] -- <remote> refs/heads/<branchName>:refs/heads/<remoteBranch>`. When `expectedRemoteHash` is present, it must be a full object ID (40 or 64 lowercase hex digits), or the push fails before Git runs.                                                                                                                                                                                                                                                                         |
| `pullBranch`       | Checks the remote and both branch names, and requires `branchName` to be the checked-out branch. Then `git pull --ff-only --no-rebase -- <remote> refs/heads/<remoteBranch>`.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `fetchRemote`      | `git fetch --all <p>` when `remote` is null, or `git fetch <p> -- <remote>` after checking the remote. `<p>` is `--prune` when `prune` is true and `--no-prune` when it is false.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `repositoryAction` | Runs `action` (defined outside this spec).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

How the handler responds:

- **Exactly one response per request.** It is posted after the Git work succeeds or fails. Its `command` is the request's `command`.
- **`status`.** `null` on success. On failure it is the message of whatever was thrown: `Error.message`, or `String(value)` if a non-`Error` was thrown. It is used as it is. Often it is Git's own error output, in the user's Git locale, and it may span several lines and end with a newline. For example, deleting a tag that does not exist gave `"error: tag 'missing' not found.\n"`.
- **Messages the extension layer produces itself** (English source strings, localised when shown):
  - `Another Git operation is running in this repository. Wait for it to finish.` A second mutating action started in the same repository (or in a nested one, for submodule actions) while one is still running. The second action does not run. Four `repositoryAction` kinds only open views and never wait for or block other actions: `viewWorkingTreeFile`, `viewRangeFile`, `viewHistoricalFile` and `previewFileRestore`.
  - `The Git operation was cancelled.` The webview sent `cancelAction` with the same `repo` and `requestId` while the action ran. The action's Git processes are stopped. A request without a `requestId` cannot be cancelled.
- **Messages from the action functions** that can show up as `status`, among others:
  - `Fetch and inspect the remote branch before a force-with-lease push.`
  - `Check out branch '{0}' before pulling it.`
  - `The merge stopped on conflicts. Resolve and stage the conflicted files, then continue or abort the merge from the status strip.`
  - `Save or revert the unsaved changes to {0} in the editor first; saving them later would undo the restore.`
- **`repo` and `requestId` on the response.** Both are present, copied from the request, exactly when the request object had a `requestId` property. Otherwise both are missing. They never appear one without the other.

#### A.3.4 What the webview reads from a response

- The dispatcher sends all 17 response commands to one handler.
- **Response without `requestId`.** The webview reloads the graph: it re-requests the branches and the repository state, and the commits when a branch filter is set. It then treats the response as belonging to whatever dialog is open: `status: null` closes the dialog, and a string opens an error dialog. The error dialog's title depends on the command: `repositoryAction` → `unableToRunGitAction`, `addTag` → `unableToAddTag`, and so on, with one title per command. The `reason` is the status text.
- **Response with `requestId`.** The webview looks up the pending request by `requestId`. If that request was sent for a different `repo`, the response is ignored. Otherwise the Activity entry with the same `requestId` and `repo` is marked finished, with `error: status`. After that, a background request reports a failure separately. A response whose dialog has since been replaced, or whose repository is no longer selected, is recorded as an unseen failure instead of changing the screen. Only then does `status` close the dialog or open the error dialog.
- The webview offers a Cancel button only for network commands: `pushBranch`, `pullBranch`, `fetchRemote`, `pushTag`, `checkoutBranch` with a non-null `remoteBranch` and `fetch === true`, and some `repositoryAction` kinds.

### A.4 Concrete examples

Observed with the real handler and Git. Paths are shortened.

1. Request `{command: "deleteTag", repo: "/r", requestId: "r1", tagName: "v2"}`, where the tag exists. Response `{command: "deleteTag", status: null, requestId: "r1", repo: "/r"}`.
2. Request `{command: "deleteTag", repo: "/r", tagName: "v1"}`, with no `requestId`. Response `{command: "deleteTag", status: null}`, with no `repo` or `requestId` key.
3. Request `{command: "deleteTag", repo: "/r", requestId: "r2", tagName: "missing"}`. Response `{command: "deleteTag", status: "error: tag 'missing' not found.\n", requestId: "r2", repo: "/r"}`.
4. From `tests/extension/action-dispatch.test.ts`: a second action in `/repo` while a reset still runs there gets `status: "Another Git operation is running in this repository. Wait for it to finish."`. The same action in `/other` runs.
5. Webview fetch of all remotes with pruning, from `tests/webview/lib/remote-actions.test.ts`: `{command: "fetchRemote", repo: "/repo", requestId: "remote-<n>", remote: null, prune: true}`.
6. Local branch checkout from a ref label, after `repo` and `requestId` are removed: exactly `{command: "checkoutBranch", branchName: "topic", remoteBranch: null}`.
7. Remote-tracking checkout: `{command: "checkoutBranch", repo, requestId, branchName: "topic", remoteBranch: "team/mirror/topic", fetch: true}`.
8. Cherry-picking the second parent's side of a merge: `{command: "cherrypickCommit", commitHash: <merge hash>, parentIndex: 2}` runs `git cherry-pick -m 2 <merge hash>`.
9. `ActionPayload<"pushBranch">` value from `tests/backend/actions/repository.test.ts`: `{requestId: "push", remote: "backup", branchName: "main", remoteBranch: "main", setUpstream: false, expectedRemoteHash: <40 hex>}`.
10. Compile-time: `ActionPayload<"checkoutBranch">` accepts `{branchName: "b", remoteBranch: null}`. `ActionPayload<"pushBranch">` without `requestId` is rejected. `ActionRequest` `{command: "repositoryAction", repo: "/r", action: …}` without `requestId` is rejected.

### A.5 Non-functional requirements

- **Types only.** The compiled module has no statements and no side effects. It must still be an ES module, so that the barrel's `export *` works under `isolatedModules` and esbuild bundles it to nothing.
- **Stable names and path.** All four export names, all 17 command names, every field name and every field type stay exactly as given. No export may be added that another module would have to import.
- **JSON-safe shapes.** Only strings, numbers, booleans, `null`, arrays and plain objects, because every value crosses `postMessage` as JSON (S.4).
- **Checks.** The file must pass `oxlint` (for example: sibling-only relative imports, no `any`, alphabetised import groups) and `oxfmt --check`. It must also type-check in all five projects (S.3).

### A.6 Test coverage

**What existing tests already check:**

- `tests/extension/action-dispatch.test.ts`
  - Each of the 16 non-`repositoryAction` commands reaches its backend function with the whole request object. The two merge commands also receive the Git path.
  - Success posts exactly `{command, status: null, requestId, repo}`.
  - A thrown error's message becomes `status`.
  - The busy-lock message is sent, and the lock covers submodules and nested repositories.
  - The four view-only kinds do not take the lock.
- `tests/extension/action-cancel.test.ts`: `cancelAction` stops only the matching `requestId` and `repo`, and the cancelled push answers `status: "The Git operation was cancelled."`.
- `tests/extension/query-cancellation.test.ts` and `tests/extension/remote-preferences.test.ts`: `status: null` and non-null statuses for `pushBranch` and `repositoryAction`.
- `tests/backend/actions/**`: the Git effect of each payload field (tags, branches, checkout with and without fetch, merges with and without `--no-ff`, push with `setUpstream` and with `expectedRemoteHash`, pull, fetch with `prune`, reset modes).
- `tests/webview/lib/menus.test.ts` and `menu-actions.test.ts`: the request payloads the menus build (`addTag` lightweight with `message: ""`, reset modes, local `checkoutBranch` with no `fetch` key, parent choices for merges).
- `tests/webview/lib/remote-actions.test.ts`: `fetchRemote` with `remote: null`; ignoring late or stale results by `requestId` and `repo`.
- `tests/webview/lib/actions.test.ts`: `runAction` assigns `action-<n>` and `repo`.
- `tests/webview/lib/cancel-action.test.ts`: which commands offer Cancel, and the `cancelAction` message posted.
- `tests/webview/lib/unseen-failures.test.ts`, `workflows.test.ts` and `history-tools.test.ts`: response handling.
- `pnpm typecheck` compiles every producer, consumer and test above against these shapes.

**Gaps, each with a test to add:**

1. **A response without `requestId` carries neither echo field.**
   - Setup: register the handlers as `tests/extension/action-dispatch.test.ts` does, with `deleteTag` mocked to resolve.
   - Call: the `deleteTag` handler with `{command: "deleteTag", repo: "/repo", tagName: "v1"}` (no `requestId`).
   - Expected: `post` receives an object strictly equal to `{command: "deleteTag", status: null}`. With the mock rejecting `new Error("boom")`: strictly `{command: "deleteTag", status: "boom"}`.
2. **The webview's handling of a response without `requestId`.**
   - Setup: a webview test with `/repo` selected, a branch filter selected, and a running dialog open.
   - Call: `handleActionResult({command: "deleteTag", status: null})`.
   - Expected: a new `loadBranches` request, a `repositoryQuery` for `{kind: "state"}` and a new `loadCommits` request are posted, and `dialog` becomes `null`.
   - Call again with `status: "boom"`. Expected: `dialog` is `{kind: "error", message: <unableToDeleteTag text>, reason: "boom"}`.
3. **Compile-time shape**, in a file under `tests/` checked by `tsc -p tests`, using `@ts-expect-error` as `tests/extension/rpc-notify.test.ts` does:
   - an `ActionRequest` literal without `requestId` is rejected for `repositoryAction`, `pushBranch`, `pullBranch` and `fetchRemote`, and accepted for `addTag`;
   - `requestId: undefined` is rejected;
   - `ActionPayload<"fetchRemote">` without `requestId` is rejected;
   - `ActionPayload<"addTag">` with a `requestId` field is rejected as an excess property;
   - a `Record<ActionResponse["command"], true>` listing the 17 names compiles, and an 18th key is rejected;
   - `ActionResponse` without `status` is rejected.
4. **`parentIndex` above zero on a merge.**
   - Setup: a repository where `main` has commit P1 and `side` has commit P2 that adds file `s`. On `main`, `git merge --no-ff side` makes merge M. Branch `target` starts at P1.
   - Call: with `target` checked out, `cherrypickCommit(git, {commitHash: M, parentIndex: 1})`.
   - Expected: a new commit on `target` that adds `s`, with M's message.
   - Also: the same call with `parentIndex: 0` rejects (Git refuses a merge without `-m`). `revertCommit(git, {commitHash: M, parentIndex: 1})` on `main` makes a commit that removes `s`.

### A.7 Questions

- **actions Q1.** `requestId` is declared twice: optional on every request, and again in some payloads (required for `repositoryAction`, `pushBranch`, `pullBranch` and `fetchRemote`; optional for `checkoutBranch` and `pushTag`). As a result, `ActionPayload` for those commands contains a correlation id that the backend functions never read, and `src/backend/actions/workflows.ts` passes `requestId: ""` only to satisfy the type. The intent may be that `requestId` belongs to the envelope alone, perhaps required everywhere, since the webview always sends one.
- **actions Q2.** `pushBranch` and `pullBranch` have no sender in the current webview; push and pull go through the `sync` repository action. They remain in the protocol, the dispatcher, the error-title table and the Activity titles. Should they stay part of the public protocol?
- **actions Q3.** `ActionResponse` declares `repo` and `requestId` as two independent optional fields, but they are always present or missing together. When they are missing, the webview refreshes and then closes or replaces whatever dialog is open, which may belong to a different action. Is a request without `requestId` meant to be supported at all?
- **actions Q4.** `status` carries raw error text, often Git's stderr with a trailing newline and in Git's locale, not the extension's. Should it be normalised (trimmed, for instance), or is the raw text intended?
- **actions Q5.** `parentIndex` is a plain `number`. Nothing rejects negative, fractional or out-of-range values: a fraction reaches Git as, for example, `-m 1.5`, which Git rejects, and a negative value is silently treated as 0. The webview sends only 0 or 1..n. Should the type or the backend restrict it?
- **actions Q6.** `addTag.message` is required even when `lightweight` is true, in which case it is ignored. `resetToCommit.resetMode` reaches the extension without validation (it is cast from a select value). The same applies to every field, since messages are not validated at run time (S.4). Is it enough to trust the webview here?

---

## B. `src/backend/types/git.types.ts`

### B.1 Interface

Module path: `src/backend/types/git.types.ts`, reached as `@/backend/types`, and as `./git.types` by `actions.types.ts`, `queries.types.ts` and `history.types.ts`. There is no default export and no runtime value. The module has exactly nine exported types. Every field is required; no field is optional.

| Export              | Shape                                                                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GitRef`            | `hash: string`; `name: string`; `type: "head" \| "tag" \| "remote"`                                                                                         |
| `GitRefData`        | `head: string \| null`; `refs: GitRef[]`                                                                                                                    |
| `GitLogEntry`       | `hash: string`; `parentHashes: string[]`; `author: string`; `email: string`; `date: number`; `message: string`                                              |
| `GitCommitNode`     | the six `GitLogEntry` fields with the same types, plus `refs: GitRef[]`                                                                                     |
| `GitFileChange`     | `oldFilePath: string`; `newFilePath: string`; `type: GitFileChangeType`; `additions: number \| null`; `deletions: number \| null`                           |
| `GitCommitDetails`  | `hash: string`; `parents: string[]`; `author: string`; `email: string`; `date: number`; `committer: string`; `body: string`; `fileChanges: GitFileChange[]` |
| `GitFileChangeType` | exactly `"A" \| "M" \| "D" \| "R"`                                                                                                                          |
| `DateType`          | exactly `"Author Date" \| "Commit Date"`                                                                                                                    |
| `GitResetMode`      | exactly `"soft" \| "mixed" \| "hard"`                                                                                                                       |

Structural facts callers rely on:

- A `GitLogEntry` with a `refs: GitRef[]` added is a `GitCommitNode`. `loadCommits` turns log entries into graph nodes exactly this way.
- A `GitCommitNode` is assignable to `GitLogEntry`.
- `history.types.ts` defines `HistoryEntry` as `GitCommitNode` plus three optional fields, so a `HistoryEntry` is a `GitCommitNode`.
- `queries.types.ts` uses `GitCommitNode[]` and `GitCommitDetails | null` in its responses (module C).

#### B.1.1 Who uses what

| Export              | Source files                                                                                                                                                                                                                                        | Test files                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GitRef`            | `src/backend/queries/loadCommits.ts` (produces labels); `src/webview/components/commit/RefLabel.tsx`, `CommitRow.tsx`; `src/webview/components/repository/RefsPane.tsx` (builds `GitRef` values from repository state); `src/webview/lib/menus.tsx` | `tests/webview/components/commit/RefLabel.test.ts`, `tests/webview/components/ui/Dialog.test.ts`, `tests/webview/lib/{menus,menu-actions,menu-text}.test.ts`, `tests/webview/lib/actions/clipboard.test.ts`                                                                                                                                                                                                                                  |
| `GitRefData`        | none                                                                                                                                                                                                                                                | none                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `GitLogEntry`       | `src/backend/queries/loadCommits.ts` (return type of `parseLog`)                                                                                                                                                                                    | none directly; `tests/backend/queries/loadCommits/content.test.ts` and `records.test.ts` check `parseLog` values                                                                                                                                                                                                                                                                                                                             |
| `GitCommitNode`     | `src/backend/queries/loadCommits.ts`; `src/backend/types/history.types.ts`; `src/backend/types/queries.types.ts`; `src/webview/graph/layout.ts`, `focus.ts`; `src/webview/lib/menus.tsx`, `stores.ts`                                               | `tests/backend/queries/loadCommits/labels.test.ts`; `tests/webview/components/commit/CommitRow.test.ts`; `tests/webview/components/ui/Dialog.test.ts`; `tests/webview/graph/{fixtures,layoutDrawing,layout.test,layout.rules.test,layout.examples.test,focus.test}.ts`; `tests/webview/lib/{actions,config-changed,menus,menu-actions,menu-text}.test.ts`; `tests/webview/lib/actions/clipboard.test.ts`; `tests/webview/utils/date.test.ts` |
| `GitFileChange`     | `src/backend/queries/commitDetails.ts`; `src/webview/components/commit/FileTree.tsx`; `src/webview/lib/actions.ts` (`viewDiff`); `src/webview/utils/fileTree.ts`                                                                                    | `tests/webview/components/commit/FileTree.test.ts`, `FileTreeView.test.ts`; `tests/webview/utils/fileTree.test.ts`                                                                                                                                                                                                                                                                                                                           |
| `GitCommitDetails`  | `src/backend/queries/commitDetails.ts`; `src/backend/types/queries.types.ts`; `src/webview/components/commit/CommitDetails.tsx`; `src/webview/lib/stores.ts`                                                                                        | `tests/webview/components/commit/FileTree.test.ts`; `tests/webview/lib/graph-requests.test.ts`                                                                                                                                                                                                                                                                                                                                               |
| `GitFileChangeType` | `src/backend/queries/commitDetails.ts`; `src/old-extension/messageHandler.ts` (diff title); `src/types/legacy.ts` (`viewDiff` request `type`)                                                                                                       | none directly                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `DateType`          | `src/backend/queries/commitDetails.ts`, `loadCommits.ts`; `src/extension/config.ts` (`dateType()`)                                                                                                                                                  | `tests/backend/queries/commitDetails/repo.ts`                                                                                                                                                                                                                                                                                                                                                                                                |
| `GitResetMode`      | `src/backend/types/actions.types.ts`; `src/webview/lib/menus.tsx`                                                                                                                                                                                   | `tests/backend/actions/commit/reset.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                 |

### B.2 Dependencies the implementation must use

None. This module imports nothing and depends on nothing.

### B.3 Behaviour: what each type holds in practice

The module runs nothing. The following describes what producers put in each field and what consumers read from it.

#### B.3.1 `GitRef`: one branch, tag or remote-tracking label

- **`type`.**
  - `"head"` is a local branch (a ref under `refs/heads/`). It does not mean HEAD.
  - `"tag"` is a tag (under `refs/tags/`).
  - `"remote"` is a remote-tracking branch (under `refs/remotes/`).
  - No other namespace (stash, notes, and so on) ever produces a `GitRef`.
- **`name`.** The short name, with the namespace prefix removed: `main`, `feature/x`, `v1.0`, and for remote-tracking branches `<remote>/<branch>`, such as `origin/main` or `team/mirror/topic`. Remote names may contain slashes. The graph labels include a remote's symbolic default ref, such as `origin/HEAD`, as a `"remote"` label. Consumers recognise it by a name ending in `/HEAD` and offer no branch actions on it. Branch names may be any Unicode Git allows.
- **`hash`.** The full, lowercase object ID (40 hex digits for SHA-1 repositories, 64 for SHA-256) of the commit the ref finally points to:
  - Annotated tags, and chains of them, are peeled to their commit.
  - A symbolic ref points to its target's commit.
  - Tags that point at trees or blobs produce no label.
  - In graph data, a label's `hash` always equals the `hash` of the `GitCommitNode` whose `refs` hold it.
- **Consumers.**
  - Context menus are keyed by the string `ref:<type>:<name>`.
  - A tag gets a tag icon; everything else gets a branch icon.
  - A `"head"` whose `name` equals the current branch is shown as active.
  - A `"remote"` label is used as a branch filter by adding `remotes/` in front of its `name`.
  - Tracking and worktree details are looked up by `name` for `"head"` labels.

#### B.3.2 `GitRefData`

Nothing in the repository produces or reads it. Its fields suggest HEAD's commit (or `null`) plus a list of labels. It is kept only because it is exported (see git Q1).

#### B.3.3 `GitLogEntry`: one commit record from the graph's log

Produced by `parseLog` in `src/backend/queries/loadCommits.ts`.

- **`hash`**: the commit's full lowercase object ID (40 or 64 hex digits).
- **`parentHashes`**: full IDs of the parents in Git's order, first parent first. It is empty for a root commit and for the boundary commits of a shallow clone.
- **`author`** and **`email`**: the author's name and email exactly as recorded, with no mailmap applied. Either may be empty, and either may contain tabs, carriage returns, quotes or any Unicode.
- **`date`**: a Unix timestamp in whole seconds. It is the author time when the date setting is `"Author Date"` and the committer time when it is `"Commit Date"`. When Git gives no usable timestamp (an empty field, or anything that is not all ASCII digits), the value is `NaN`, and the commit is still kept. After the trip to the webview, `NaN` arrives as `null` (S.4). The webview's date formatting shows an "unknown date" placeholder for `null`, `NaN` and out-of-range values.
- **`message`**: the subject only, as Git prints it for the subject placeholder: the first paragraph of the message, with its lines joined. It may be empty and may contain any characters.

#### B.3.4 `GitCommitNode`: one row of the graph

Everything in B.3.3, plus:

- **`refs`**: the labels that point at this commit, in byte order of their full ref names. That puts local branches (`refs/heads/…`) first, then remote-tracking branches, then tags. Often empty.
  - Remote-tracking labels appear only when the request asked for remote branches, and never for a remote the user has hidden.
  - A label whose commit is not on the loaded page appears nowhere.

**The placeholder row for uncommitted changes.** When the working tree has changes and HEAD's commit is on the loaded page, `loadCommits` puts one placeholder `GitCommitNode` at index 0 of `commits`. It is never anywhere else. Its fields:

| Field          | Value                                            |
| -------------- | ------------------------------------------------ |
| `hash`         | `"*"`                                            |
| `parentHashes` | `[<HEAD's commit hash>]`                         |
| `author`       | `"*"`                                            |
| `email`        | `""`                                             |
| `date`         | the current time, in whole seconds, rounded down |
| `message`      | `""`                                             |
| `refs`         | `[]`                                             |

The webview recognises the row by `hash === "*"` (the constant `UNCOMMITTED_CHANGES` in `src/webview/constants.ts`). It hides the author and hash cells, puts the row's graph node on top, and never requests commit details for it.

**History entries.** `src/backend/utils/history.ts` also builds `GitCommitNode` values, as `HistoryEntry`. For these:

- `refs` is always `[]`.
- `date` is always the author timestamp, whatever the date setting.
- A timestamp that is empty gives `0`, not `NaN` (see git Q2).

**Consumers.**

- The graph layout reads `hash` and `parentHashes`. Parents that are not on the page are allowed.
- Branch focus compares `parentHashes[0]`.
- The commit row reads `message`, `date`, `author`, `email`, `hash` and `refs`.
- The commit menu treats a commit with two or more `parentHashes` as a merge and asks which parent to use (A.3.2).

#### B.3.5 `GitFileChange`: one changed path in a commit's details

Produced only by `src/backend/queries/commitDetails.ts`. The diff is taken against the commit's first parent, or against the empty tree for a commit with no parents.

- **`type`**: see B.3.7.
- **`oldFilePath`** and **`newFilePath`**: repository-relative paths with `/` separators, exactly as Git names them. Names may contain tabs, newlines, leading dashes and non-ASCII characters.
  - For `"R"`, the source path and the destination path.
  - For every other type, both fields hold the same path. For `"A"` that is the added path, not an empty string. For `"D"` it is the deleted path.
- **`additions`** and **`deletions`**: non-negative whole numbers of lines added and removed.
  - Both are `null` when Git counts the content as binary. Git's attributes in the working tree decide what counts as binary.
  - Both are also `null` if no line count could be matched to the entry's path (see git Q5).
  - A mode-only change counts `0`/`0`.
  - A submodule that is added or moved counts one line.
- The list is in Git's path order. A file replaced by a directory appears as a deletion plus additions.

**Consumers.**

- The file tree groups entries by the segments of `newFilePath`.
- If either count is `null`, the entry is treated as binary: it cannot be clicked open and gets a "binary file" tooltip.
- Line counts are shown only for `"M"` and `"R"`. An `"R"` entry shows a marker whose tooltip names both paths.
- A `"D"` entry changes the file's context menu.
- Opening a diff sends `oldFilePath`, `newFilePath` and `type` to the extension in a `viewDiff` request. The extension titles the diff `Added in <abbrev>` for `"A"`, `Deleted in <abbrev>` for `"D"`, and `<abbrev>^ ↔ <abbrev>` for `"M"` and `"R"`.

#### B.3.6 `GitCommitDetails`: the details panel for one commit

Produced only by `src/backend/queries/commitDetails.ts`.

- **`hash`**: the full lowercase ID of the commit that was resolved. It may differ in spelling from the revision requested, for example when an abbreviation or an upper-case ID was sent.
- **`parents`**: the full IDs of all parents, in order. It is empty for a root or shallow-boundary commit.
- **`author`** and **`email`**: the author's name and email as recorded, re-encoded to UTF-8, with no mailmap.
- **`date`**: a Unix timestamp in whole seconds, following the date setting as in B.3.3. Here it is always a real number, because the details request fails as a whole when the timestamp is not all digits.
- **`committer`**: the committer's name only. The committer's email and time are not included.
- **`body`**: the full commit message. Every CRLF or lone CR becomes LF, and all trailing newlines are removed. Blank lines inside the message, and lines holding only spaces or tabs, are kept.
- **`fileChanges`**: as in B.3.5.
  - For a merge, it lists what the merge brought in relative to its first parent. That list is empty when the merge kept its first parent's tree.
  - For an octopus merge, it is likewise taken against the first parent.
  - An empty commit gives `[]`.

**Consumers.** The panel shows `hash`, `parents` joined by `", "`, author with email as a `mailto:` link, the formatted `date`, `committer` and `body` (whitespace preserved), and a file tree built from `fileChanges`. The webview drops a details response whose `hash` differs from the hash of the row that is currently expanded.

#### B.3.7 `GitFileChangeType`

| Value | Meaning                                                                                                                                           |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"A"` | added                                                                                                                                             |
| `"M"` | modified. This includes type changes (for example a file that became a symlink) and mode-only changes.                                            |
| `"D"` | deleted                                                                                                                                           |
| `"R"` | renamed, as detected by Git's default rename detection (at least 50% similar). When Git's rename limit is exceeded, only exact renames are found. |

Copies are never reported. Git's own `T` (type change) is reported as `"M"`, and `C`, `U`, `X` and `B` never appear.

#### B.3.8 `DateType`

These are the two values of the setting `branchwise.dateType` (default `"Author Date"`). The extension reads the setting through `extConfig.dateType()` in `src/extension/config.ts`, which does not validate the value. Producers treat exactly `"Author Date"` as "use the author timestamp" and every other value as "use the committer timestamp".

It affects `date` in the graph's commits and in commit details. It does not change the graph's order, which always follows commit dates.

#### B.3.9 `GitResetMode`

These are the reset strengths offered by the commit menu's reset dialog, where `"mixed"` is preselected. The extension passes the mode to Git as `--soft`, `--mixed` or `--hard` (A.3.3).

### B.4 Concrete examples

These were observed from the real producers. The author date was fixed at `1700000000` and the committer date at `1700000100`.

1. **A graph page.** The request asked for all branches with `maxCommits: 1`, remote branches shown, the author date, and the placeholder row enabled. One untracked file was present. The `commits` were:
   - `{hash: "*", parentHashes: ["9d24…c72a"], author: "*", email: "", date: <now, e.g. 1790571321>, message: "", refs: []}`
   - `{hash: "9d24…c72a", parentHashes: ["7169…2955"], author: "Ada", email: "ada@example.test", date: 1700000000, message: "Rename and more", refs: [{hash: "9d24…c72a", name: "feature", type: "head"}, {…, name: "main", type: "head"}, {…, name: "origin/main", type: "remote"}, {…, name: "light", type: "tag"}, {…, name: "v1", type: "tag"}]}`

   `light` is a lightweight tag and `v1` an annotated one; both carry the commit's hash.

2. **Commit details with the date setting `"Commit Date"`**, for a commit that renamed `a.txt` to `b.txt` and appended one line, deleted a binary `bin.dat`, and added `new.txt`:
   - `hash`, `parents: ["7169…2955"]`, `author: "Ada"`, `email: "ada@example.test"`, `date: 1700000100`, `committer: "Ada"`, `body: "Rename and more"`
   - `fileChanges: [{oldFilePath: "a.txt", newFilePath: "b.txt", type: "R", additions: 1, deletions: 0}, {oldFilePath: "bin.dat", newFilePath: "bin.dat", type: "D", additions: null, deletions: null}, {oldFilePath: "new.txt", newFilePath: "new.txt", type: "A", additions: 1, deletions: 0}]`
3. **A root commit** whose message was `"Initial commit\n\nBody line\r\n\n"`:
   - `parents: []`, `body: "Initial commit\n\nBody line"`
   - `fileChanges: [{"a.txt" → "a.txt", "A", 5, 0}, {"bin.dat" → "bin.dat", "A", null, null}]`
4. **From `tests/backend/queries/commitDetails/files.test.ts`.** A file that became a symlink is `{type: "M", …, additions: 1, deletions: 1}`. A mode change alone is `{type: "M", additions: 0, deletions: 0}`.
5. **Missing timestamps.** `parseLog` of one record with an empty timestamp gives `date: NaN`, which prints as `null` in JSON. The history parser, given the same empty timestamp, gives `date: 0`.

### B.5 Non-functional requirements

- **No dependencies, no runtime code, no side effects.** The module must stay an ES module (S.1, A.5).
- **Stable names and path.** All nine names, all field names, the exact literal members of the four string unions, and `null` (never `undefined`) in the nullable fields stay as given.
- **JSON-safe.** Everything is JSON-safe, with one exception: `date` may be `NaN` on the extension side and then becomes `null` on the wire (S.4).
- **Checks.** Same lint, format and type-check requirements as A.5.

### B.6 Test coverage

**What existing tests already check.** They check the producers' values, and so each field's meaning:

- `tests/backend/queries/commitDetails/{files,get,header,inputs,merges}.test.ts` cover:
  - change types, renames, the type change counted as `"M"`, binary `null` counts and submodule counts;
  - paths with unusual characters;
  - first-parent diffs for merges and octopus merges;
  - the author or committer timestamp;
  - author, committer and email without the mailmap;
  - body normalisation and UTF-8 re-encoding;
  - SHA-256 repositories;
  - `null` for revisions that are not a single commit.
- `tests/backend/queries/loadCommits/{content,labels,list,page,records,uncommitted}.test.ts` cover:
  - SHA-1 and SHA-256 hashes, empty parents for root and shallow commits, `NaN` dates;
  - names and subjects kept exactly as Git gives them;
  - label types and names, including `origin/HEAD` and peeled annotated tags, and label order;
  - the placeholder row's fields and position;
  - `date` following the date setting.
- `tests/webview/components/commit/{CommitRow,RefLabel,FileTree,FileTreeView}.test.ts`, `tests/webview/utils/{date,fileTree}.test.ts`, `tests/webview/graph/**` and `tests/webview/lib/menus.test.ts` cover how consumers read the fields. `date.test.ts` includes the case where `NaN` arrives as `null`.
- `tests/backend/actions/commit/reset.test.ts` covers each `GitResetMode`.
- `pnpm typecheck` covers the structural facts in B.1.

**Gaps, each with a test to add:**

1. **Closed literal sets, compile time**, in a `tests/` file checked by `tsc -p tests`:
   - Every member assigns: `"A"`, `"M"`, `"D"`, `"R"` to `GitFileChangeType`; `"head"`, `"tag"`, `"remote"` to `GitRef["type"]`; both `DateType` values; the three `GitResetMode` values.
   - Each of these is rejected with `@ts-expect-error`: `"T"` and `"C"` as `GitFileChangeType`, `"branch"` as `GitRef["type"]`, `"author"` as `DateType`, `"keep"` as `GitResetMode`.
2. **`GitRefData` is still exported.** Compile-only: `{head: null, refs: []}` and `{head: "<hash>", refs: [{hash: "<hash>", name: "main", type: "head"}]}` both assign to `GitRefData`. Nothing else would notice if it disappeared.
3. **`GitCommitNode` and `GitLogEntry` stay related.** Compile-only: a `GitCommitNode` value assigns to `GitLogEntry`, and a `GitLogEntry` value with `refs: []` added assigns to `GitCommitNode`.
4. **History entry date for a missing timestamp.** This pins the current behaviour, subject to git Q2.
   - Setup: none.
   - Call: `parseHistory` on one history record whose timestamp field is empty.
   - Expected: one entry with `date: 0` and `refs: []`.
5. **Rename detection limit.** Already covered ("keeps exact renames only when the rename limit is exceeded"). No gap.

### B.7 Questions

- **git Q1.** `GitRefData` is exported but neither produced nor read anywhere. Should it be kept for compatibility or dropped?
- **git Q2.** `date` in a `GitCommitNode` means different things depending on the producer:
  - graph rows follow the date setting;
  - history entries always use the author time;
  - the placeholder row uses "now".

  A missing timestamp gives `NaN` in graph rows (which reaches the webview as `null`, although the type says `number`) and `0` in history entries (shown as 1970). Should the producers agree, and should the type admit the value that is really received?

- **git Q3.** The placeholder row for uncommitted changes is an ordinary `GitCommitNode` marked by the strings `"*"` in `hash` and `author`, which the type cannot tell apart from a real commit. The webview also uses `"*"` to mean "show all branches". Is a separate row kind intended?
- **git Q4.** `GitFileChangeType` has no value for type changes or copies. Type changes are folded into `"M"`, and copies are never detected. The diff title for `"R"` is the same as for `"M"`. Is that the intended model?
- **git Q5.** `additions: null` or `deletions: null` makes the UI treat a file as binary, which disables opening its diff. But the producer also gives `null` when it merely failed to match a line count to a path. Should "binary" and "counts unknown" be distinguished?
- **git Q6.** The names are inconsistent between the two commit shapes: `parents` versus `parentHashes`, and `body` versus `message`. `committer` holds only a name, while `date` may be the committer's time. Keep as is?
- **git Q7.** `DateType`'s values are English display phrases that double as setting values. The setting is not validated, so any string can reach the producers at run time, where it is treated as `"Commit Date"`. Is that intended?

---

## C. `src/backend/types/queries.types.ts`

### C.1 Interface

Module path: `src/backend/types/queries.types.ts`, reached as `@/backend/types`. There is no default export and no runtime value. The module has exactly four exports:

| Export              | Kind                                                                     | Meaning                                                                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GraphQueryCommand` | type alias, exactly `"loadBranches" \| "loadCommits" \| "commitDetails"` | The three read queries that feed the graph view and are answered "latest request wins" (C.3.3).                                                                                              |
| `QueryRequest`      | union of 5 object types, discriminated by `command`                      | A read request from the webview.                                                                                                                                                             |
| `QueryResponse`     | union of 5 object types, discriminated by `command`                      | The extension's successful answer to a `QueryRequest`.                                                                                                                                       |
| `QueryResult<T>`    | generic type alias with one parameter `T`                                | What the backend query for `T` returns: the response's content fields (C.1.3). `T` is constrained to exactly the five command names. Any other name, such as `"addTag"`, is a compile error. |

The five command names are `repositoryQuery`, `loadRemotes`, `commitDetails`, `loadBranches` and `loadCommits`. `QueryRequest["command"]` and `QueryResponse["command"]` are exactly this union.

#### C.1.1 `QueryRequest` members

Every field is required unless marked optional. "Optional (plain)" means the field may be left out but not set to `undefined` (S.2).

| `command`         | Other fields                                                                                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `repositoryQuery` | `repo: string`; `requestId: string`; `query: RepositoryQuery`                                                                                                                                                             |
| `loadRemotes`     | `repo: string`; `requestId: string`; `branchName: string \| null`                                                                                                                                                         |
| `commitDetails`   | `repo: string`; `requestId: string`; `commitHash: string`                                                                                                                                                                 |
| `loadBranches`    | `repo: string`; `requestId: string`; `showRemoteBranches: boolean`; `hiddenRemotes?: string[]` (optional, plain); `visibilityKey?: string` (optional, plain); `hard: boolean`                                             |
| `loadCommits`     | `repo: string`; `requestId: string`; `branchName: string`; `maxCommits: number`; `showRemoteBranches: boolean`; `hiddenRemotes?: string[]` (optional, plain); `visibilityKey?: string` (optional, plain); `hard: boolean` |

`requestId` is required in all five members.

#### C.1.2 `QueryResponse` members

| `command`         | Other fields                                                                                                                                                                                                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `repositoryQuery` | `repo: string`; `requestId: string`; `data: RepositoryQueryData \| null`; `status: string \| null`                                                                                                                                                                                 |
| `loadRemotes`     | `repo: string`; `requestId: string`; `remotes: string[]`; `upstream: {remote: string; branchName: string} \| null`; `pushRemote: string \| null`; `status: string \| null`                                                                                                         |
| `commitDetails`   | `repo: string`; `requestId: string`; `commitDetails: GitCommitDetails \| null`                                                                                                                                                                                                     |
| `loadBranches`    | `repo: string`; `requestId: string`; `branches: string[]`; `head: string \| null`; `hard: boolean`; `isRepo: boolean`; `visibilityKey?: string \| undefined` (optional, **and** may be explicitly `undefined`)                                                                     |
| `loadCommits`     | `repo: string`; `requestId: string`; `branchName: string`; `commits: GitCommitNode[]`; `head: string \| null`; `moreCommitsAvailable: boolean`; `hard: boolean`; `uncommittedChanges: number`; `visibilityKey?: string \| undefined` (optional, and may be explicitly `undefined`) |

The `upstream` object has exactly the two required fields shown.

#### C.1.3 `QueryResult<T>`

`QueryResult<T>` is the corresponding `QueryResponse` member without `command`. For the three graph commands, it also lacks `requestId`, and for `commitDetails` it lacks `repo` as well:

| `T`               | Fields of `QueryResult<T>`                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `repositoryQuery` | `repo`, `requestId`, `data`, `status`                                                                                                |
| `loadRemotes`     | `repo`, `requestId`, `remotes`, `upstream`, `pushRemote`, `status`                                                                   |
| `commitDetails`   | `commitDetails` only                                                                                                                 |
| `loadBranches`    | `repo`, `branches`, `head`, `hard`, `isRepo`, `visibilityKey?: string \| undefined`                                                  |
| `loadCommits`     | `repo`, `branchName`, `commits`, `head`, `moreCommitsAvailable`, `hard`, `uncommittedChanges`, `visibilityKey?: string \| undefined` |

Types are as in C.1.2. The property this layout guarantees: for every graph command `K`, the object formed from `command: K`, then everything in a `QueryResult<K>`, then `repo` and `requestId`, is exactly a `QueryResponse` member. The extension's handler builds its responses that way.

#### C.1.4 Who uses what

| Export              | Source files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Test files                                                                                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GraphQueryCommand` | `src/old-extension/messageHandler.ts` (per-command cancellation, and the type of `graphQueryError.query`); `src/types/legacy.ts` (`graphQueryError.query`); `src/webview/lib/graph-requests.ts` (pending-request table); `src/webview/lib/actions.ts` (graph error slots, using it minus `"commitDetails"`)                                                                                                                                                                                                                                                    | `tests/webview/test-utils.ts` (`latestGraphRequest`)                                                                                                                 |
| `QueryRequest`      | `src/types/legacy.ts` (part of `RequestMessage`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `tests/webview/test-utils.ts`; `tests/webview/lib/graph-requests.test.ts`; `tests/webview/components/commit/WorkingTreeDetails.test.ts`, `WorkingTreeTiming.test.ts` |
| `QueryResponse`     | `src/types/legacy.ts` (part of `ResponseMessage`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `tests/webview/lib/graph-requests.test.ts`                                                                                                                           |
| `QueryResult`       | return types of `src/backend/queries/loadRemotes.ts` (a `Pick` of `remotes`, `upstream` and `pushRemote`), `loadBranches.ts` (the whole result), `loadCommits.ts` (the result minus `repo` and `branchName`) and `commitDetails.ts`; `src/old-extension/messageHandler.ts` (`QueryResult<"repositoryQuery">["data"]`, the same `Pick` for `loadRemotes`, and `Promise<QueryResult<K>>` for graph commands); `src/webview/lib/remote-actions.tsx` (`handleLoadRemotes` parameter); `src/webview/lib/repository-actions.tsx` (`handleRepositoryQuery` parameter) | `tests/extension/graph-queries.test.ts`; `tests/webview/lib/remote-actions.test.ts`                                                                                  |

In the webview, the response handlers in `src/webview/lib/handler/{load-branches,load-commits,commit-details}.ts` take the `QueryResponse` members, picked out of `ResponseMessage` by command.

### C.2 Dependencies the implementation must use

- `GitCommitDetails` and `GitCommitNode`, type-only, from `./git.types` (module B).
- `RepositoryQuery` and `RepositoryQueryData`, type-only, from `./repository.types`.

Nothing else.

### C.3 Behaviour

#### C.3.1 Compile-time properties callers rely on

1. Every `QueryRequest` member requires `requestId`. A `commitDetails` request without it is a compile error.
2. A `commitDetails` response requires `repo` and `requestId`. `QueryResult<"commitDetails">` rejects both as excess properties.
3. **Requests** declare `visibilityKey` and `hiddenRemotes` as plain optional, so `visibilityKey: undefined` in a request literal is a compile error. **Responses** and `QueryResult` declare `visibilityKey` as optional _including_ `undefined`. That is required: the extension's handler copies `visibilityKey` from a request where it may be missing, and under `exactOptionalPropertyTypes` that copy compiles only because the response type admits `undefined`. A replacement that makes the response field plain optional breaks `messageHandler.ts`.
4. `QueryResult<"loadRemotes">` must have `remotes`, `upstream` and `pushRemote`, because two modules `Pick` those three fields.
5. `QueryResult<"repositoryQuery">["data"]` is `RepositoryQueryData | null`.
6. `QueryResult<"loadCommits">` includes `repo` and `branchName`, because `loadCommits.ts` returns the result with those two left out and the handler adds them.
7. `QueryResult<"loadBranches">` includes `repo`, because `loadBranches.ts` returns it.
8. The `loadRemotes` member of `QueryResponse` must be assignable to `QueryResult<"loadRemotes">`, and likewise for `repositoryQuery`. The dispatcher passes one to a handler typed with the other.
9. `GraphQueryCommand` is exactly three names. `"loadRemotes"` and `"repositoryQuery"` are not in it.

#### C.3.2 `repositoryQuery` and `loadRemotes`: request and response

**`repositoryQuery`.**

- **Request.** The webview sends `requestId` values `repository-state-<n>`, `repository-query-<n>` and `repository-panel-<n>`. `query` describes what to read (defined outside this spec).
- **Handling.** The extension registers the request under `requestId` so that it can be cancelled. A `cancelRepositoryQuery` message with the same `repo` and `requestId`, or disposal of the panel, cancels it. A cancelled query posts **no response at all**.
- **Success.** The response is `{command, repo, requestId, data, status: null}`, and `data.kind` equals `query.kind`.
- **Failure.** The response is `{command, repo, requestId, data: null, status: <message>}`. Observed for a repository directory that no longer exists: `status: "Cannot use simple-git on a directory that does not exist"`.
- **State queries.** For `query.kind === "state"`, the extension may post a `repoState` message before the response.
- **Webview.** It matches responses by `requestId` and `repo`. It treats `status !== null` or `data === null` as a failure, with the error title `unableToLoadRepository`.

**`loadRemotes`.**

- **Request.** `requestId` is `remote-<n>`. `branchName` is:
  - the local branch name for push and pull dialogs;
  - `null` for the fetch, tag-push, remote-branch-delete and remote-checkout dialogs.
- **Handling.** There is no cancellation. Every request gets a response that echoes `repo` and `requestId`.
- **`remotes`**: the configured remote names, sorted by JavaScript's default string order. It is `[]` when there are none.
- **`upstream`.** It is non-null only when `branchName` is non-null, `branch.<branchName>.remote` is set, and `branch.<branchName>.merge` starts with `refs/heads/`. Its `remote` is that config value. Its `branchName` is the merge ref without `refs/heads/`, so slashes are kept. For a branch that tracks another local branch, the remote is `"."` (observed; see queries Q6).
- **`pushRemote`.**
  - With a `branchName`: the first that is set of `branch.<branchName>.pushRemote`, `remote.pushDefault`, and `upstream.remote`, otherwise `null`.
  - With `branchName: null`: `remote.pushDefault`, or `null`.
- **`status`.** `null` on success. On failure it is the error message, and the other fields are `remotes: []`, `upstream: null`, `pushRemote: null`.
- **Webview.**
  - It accepts only the response to the latest pending `loadRemotes` whose `requestId` and `repo` match. It ignores the response if the dialog changed in the meantime, and closes the dialog if the selected repository changed.
  - A non-null `status` shows `unableToLoadRemotes`.
  - `remotes: []` shows `noRemotesConfigured`, except for a remote checkout.
  - For push and tag push, `pushRemote` decides which remote is preselected; for the other dialogs, `upstream.remote` does. The fallbacks are a remote named `origin`, then the first remote.
  - `upstream.branchName` is suggested as the destination branch only when `upstream.remote` equals the chosen remote.

#### C.3.3 The graph queries (`GraphQueryCommand`)

**How the extension handles them:**

- Each graph command runs latest-wins. A new request for the same command cancels the one still running. Selecting a different repository cancels all three. Disposing the panel cancels everything.
- A cancelled query posts nothing, even if it completes anyway.
- **Success** posts the response `{command, …QueryResult, repo, requestId}`, with `repo` and `requestId` taken from the request.
- **A thrown error** posts, instead of a response, the separate message `{command: "graphQueryError", query: <command>, repo, requestId, message}`. That message is defined in `src/types/legacy.ts`.

**How the webview accepts a response.** It must have the latest `requestId` the webview sent for that command, a `repo` equal to the repository the request was sent for, and that repository must still be selected. In addition:

- `loadBranches` and `loadCommits` responses are ignored when `visibilityKey` is present and differs from the current key. A response without `visibilityKey` passes this check.
- `loadCommits` responses are also ignored when `branchName` differs from the branch filter currently displayed.

The webview's graph `requestId` values are `graph-<n>`.

**`loadBranches`.**

- **`showRemoteBranches`**: whether to list remote-tracking branches.
- **`hiddenRemotes`**: remote names, which may contain slashes and may include remotes that no longer exist, whose remote-tracking branches are left out. Missing means `[]`.
- **`visibilityKey`**: a string the webview builds from the remote choices and the extension treats as opaque. Currently it is the JSON text of `[showRemoteBranches, sortedHiddenRemotes]`, such as `[true,[]]` or `[true,["origin"]]`. The extension copies it into the response unchanged. If the request had no key, the response has the property with value `undefined`, which disappears on the wire.
- **`hard`**: the webview always sends `true`. The extension copies it into the response. Nothing reads it.
- **Response `branches`**, in this order:
  1. the checked-out branch, if HEAD is on a branch;
  2. the other local branches in ref-name order;
  3. when `showRemoteBranches` is true, remote-tracking branches as `remotes/<remote>/<branch>`, excluding symbolic refs such as `origin/HEAD` and branches of hidden remotes.

  An unborn repository gives `[]`.

- **Response `head`**: the checked-out branch's short name, or `null` when HEAD is detached, in a rebase or bisect, or unborn.
- **Response `isRepo`**: always `true`. A directory that is not a repository makes the query throw, which leads to `graphQueryError`. Nothing reads `isRepo`.
- **Webview.** It stores `branches` and `head`. If the selected branch filter is no longer in `branches`, it falls back to another choice.

**`loadCommits`.**

- **`branchName`**: `""` for all branches, meaning local branches, tags, visible remote-tracking branches, and HEAD's commit even when detached. Otherwise one entry of the `loadBranches` list: a local branch name, or `remotes/<remote>/<branch>`. Remote-tracking branches thus have two spellings: `origin/main` as a `GitRef.name` and `remotes/origin/main` here.
- **`maxCommits`**: the page size. The webview sends the setting `branchwise.initialLoadCommits` (default 300, a whole number of at least 1), and adds `branchwise.loadMoreCommits` (default 100) for each "load more". The producer rounds non-integers down and treats values below 1, or `NaN`, as 1.
- **`showRemoteBranches`, `hiddenRemotes`, `visibilityKey` and `hard`**: as for `loadBranches`. `showRemoteBranches` and `hiddenRemotes` control both the remote labels and which remote-tracking branches add history to the all-branches view.
- **Response `branchName`**: the request's value, echoed.
- **Response `commits`**: at most `maxCommits` real commits in graph order (date order, children before parents), with the placeholder row at index 0 when it applies (B.3.4).
- **Response `head`**: HEAD's **commit hash** (full), or `null` for an unborn HEAD. Unlike `loadBranches.head`, this is not a branch name.
- **Response `moreCommitsAvailable`**: `true` exactly when more commits than the page exist for the same selection.
- **Response `uncommittedChanges`**: how many entries `git status` (with all untracked files listed) reports. It is non-zero only when the placeholder row was added. It is `0` in all of these cases:
  - the setting `branchwise.showUncommittedChanges` is off;
  - HEAD's commit is not among the loaded commits (for example, a filter on another branch);
  - HEAD is unborn;
  - the repository has no working tree;
  - the working tree is clean.

  Equivalently: it is greater than 0 if and only if `commits[0].hash === "*"`.

- **Webview.** It stores `commits`, `head`, `moreCommitsAvailable` and `uncommittedChanges`. It closes the details panel if the expanded commit is no longer in `commits`.

**`commitDetails`.**

- **`commitHash`**: the full hash of the row the user expanded. It is never sent for the placeholder row.
- **Response `commitDetails`**: a `GitCommitDetails` (B.3.6). It is `null` when:
  - the revision does not name exactly one commit (a range, several revisions, a file name, an empty string, a tag object or another non-commit object);
  - Git fails;
  - Git's output is not what was expected.
- **Errors.** An exception outside the query itself, such as failing to create the Git client, produces `graphQueryError` instead.
- **Webview.** A `null` closes the panel and shows `unableToLoadCommitDetails`. A value whose `hash` differs from the expanded row's hash is ignored.

### C.4 Concrete examples

These were observed with the real handler, or come from `tests/extension/graph-queries.test.ts`.

1. **`loadCommits`.** Request `{command: "loadCommits", repo: "/repo", requestId: "second", branchName: "", maxCommits: 400, hiddenRemotes: [], showRemoteBranches: true, visibilityKey: "visible", hard: true}`, with an empty result. It posts exactly `{command: "loadCommits", repo: "/repo", requestId: "second", branchName: "", visibilityKey: "visible", commits: [], head: null, moreCommitsAvailable: false, hard: true, uncommittedChanges: 0}`. An older request `"first"` that was still running was cancelled and posted nothing.
2. **`commitDetails`.** Request `{command: "commitDetails", repo: "/repo", requestId: "second", commitHash: "new"}` posts exactly `{command: "commitDetails", requestId: "second", repo: "/repo", commitDetails: null}`. Against a real repository, `commitHash: "nope"` gives the same shape, with `commitDetails: null`.
3. **A graph query failure** posts `{command: "graphQueryError", query: "loadBranches", repo: "/repo", requestId: "first", message: "Git read failed"}`.
4. **`loadBranches`** with no `visibilityKey` in the request, on a repository with only `main` checked out: `{command: "loadBranches", visibilityKey: undefined, repo: "/r", branches: ["main"], head: "main", hard: true, isRepo: true, requestId: "b1"}`. The `visibilityKey` key vanishes on the wire.
5. **More `loadBranches` results** from the producer:
   - HEAD on `main`, with `feature` and a pushed `origin/main`: `branches: ["main", "feature", "remotes/origin/main"]`, `head: "main"`.
   - Detached HEAD, with remote branches off: `branches: ["feature", "main"]`, `head: null`.
   - Unborn repository: `branches: []`, `head: null`, `isRepo: true`.
6. **`loadRemotes`:**
   - For `"main"` tracking `origin/main`: `{remotes: ["origin"], upstream: {remote: "origin", branchName: "main"}, pushRemote: "origin"}`.
   - With `remote.pushDefault=backup`: `pushRemote: "backup"`, and a `branch.main.pushRemote=origin` then overrides it back to `"origin"`.
   - For `null` with no remotes: `{remotes: [], upstream: null, pushRemote: null}`.
   - For a branch set to track local `main`: `{remotes: [], upstream: {remote: ".", branchName: "main"}, pushRemote: "."}`.
7. **`loadRemotes` for a directory that no longer exists** posts `{command: "loadRemotes", repo, requestId: "q1", remotes: [], upstream: null, pushRemote: null, status: "Cannot use simple-git on a directory that does not exist"}`.
8. **`repositoryQuery` for a directory that no longer exists** posts `{command: "repositoryQuery", repo, requestId: "s1", data: null, status: "Cannot use simple-git on a directory that does not exist"}`.

### C.5 Non-functional requirements

- Types only, with the same module, naming, JSON-safety, lint, format and type-check requirements as A.5.
- The distinction in C.3.1 item 3 between plain-optional and `undefined`-admitting optional fields must be kept exactly.

### C.6 Test coverage

**What existing tests already check:**

- `tests/extension/graph-queries.test.ts` checks:
  - the exact shape of `loadCommits` and `commitDetails` responses, including echoed identity and `visibilityKey`;
  - latest-wins cancellation and cancellation on repository change or disposal;
  - identity on `loadBranches` responses (partial match);
  - the `graphQueryError` shape for all three commands;
  - recovery after a Git client that could not be created.
- `tests/extension/query-cancellation.test.ts`: a cancelled `repositoryQuery` posts nothing, and disposal cancels.
- `tests/extension/remote-preferences.test.ts`: a failed `repositoryQuery` posts `data: null` with a string `status`; a success posts `status: null`.
- `tests/webview/lib/graph-requests.test.ts` and `remote-visibility.test.ts`: stale replies are rejected by `requestId`, by repository, and by a differing `visibilityKey`.
- `tests/webview/lib/remote-actions.test.ts`: how `remotes`, `upstream` and `pushRemote` are consumed, `remotes: []`, and stale `loadRemotes` replies.
- `tests/backend/actions/remote.test.ts` (`describe("loadRemotes")`): `upstream` and `pushRemote` precedence, upstream branch names with slashes, unpublished branches, no remotes.
- `tests/backend/queries/loadBranches/list.test.ts`: branch order, detached HEAD, remote branches on and off, a non-repository throwing, `hard` echoed.
- The loadCommits and commitDetails backend tests listed in B.6: every response field, including `uncommittedChanges` and `moreCommitsAvailable`, and the result having exactly five keys.
- `pnpm typecheck` compiles every producer, consumer and test against these shapes.

**Gaps, each with a test to add:**

1. **`loadRemotes` through the extension handler.**
   - Setup: register handlers as in `tests/extension/graph-queries.test.ts`, with the backend `loadRemotes` mocked.
   - Call 1: the mock resolves `{remotes: ["origin"], upstream: null, pushRemote: "origin"}`, and the handler gets `{command: "loadRemotes", repo: "/repo", requestId: "r1", branchName: null}`. Expected: `post` receives exactly `{command: "loadRemotes", repo: "/repo", requestId: "r1", remotes: ["origin"], upstream: null, pushRemote: "origin", status: null}`.
   - Call 2: the mock rejects `new Error("no repo")`. Expected: exactly `{command: "loadRemotes", repo: "/repo", requestId: "r1", remotes: [], upstream: null, pushRemote: null, status: "no repo"}`.
2. **`visibilityKey` echo on `loadBranches`, and a missing key.**
   - Setup: as in gap 1, with `loadBranches` mocked to resolve `{repo: "/repo", branches: ["main"], head: "main", hard: true, isRepo: true}`.
   - Call: a `loadBranches` request with `visibilityKey: "k"`. Expected: the post includes `visibilityKey: "k"`.
   - Call: a request without `visibilityKey`. Expected: after a JSON round trip, the post has no `visibilityKey` key.
   - Webview side: `handleLoadBranches` with a current `requestId` and no `visibilityKey` is accepted (`branchList` updates), even after the remote visibility changed.
3. **`loadBranches` on an unborn repository.**
   - Setup: `git init` with no commits.
   - Call: `loadBranches(git, {showRemoteBranches: true, hard: true, repo, gitPath: "git"})`.
   - Expected: `{repo, branches: [], head: null, hard: true, isRepo: true}`.
4. **`loadRemotes` for a branch that tracks a local branch.** This pins the current behaviour, subject to queries Q6.
   - Setup: a repository with no remotes and branches `main` and `feature`; `git branch --set-upstream-to=main feature`.
   - Call: `loadRemotes(git, "feature")`.
   - Expected: `{remotes: [], upstream: {remote: ".", branchName: "main"}, pushRemote: "."}`.
5. **Compile-time shape**, in a `tests/` file checked by `tsc -p tests`:
   - Rejected with `@ts-expect-error`: a `commitDetails` `QueryRequest` without `requestId`; a `commitDetails` `QueryResponse` without `repo` or `requestId`; `QueryResult<"commitDetails">` with a `requestId`; `QueryResult<"addTag">`; `"loadRemotes"` as a `GraphQueryCommand`; a `loadBranches` request with `visibilityKey: undefined`.
   - Accepted: a `loadBranches` response with `visibilityKey: undefined`.
   - `Record<QueryRequest["command"], true>` with exactly the five names compiles.
6. **Exact successful `repositoryQuery` response.**
   - Setup: as in `tests/extension/query-cancellation.test.ts`, with `repositoryQuery` mocked to resolve `{kind: "stashes", stashes: []}`.
   - Call: the handler gets `{command: "repositoryQuery", repo: "/repo", requestId: "q", query: {kind: "stashes"}}`.
   - Expected: `post` receives exactly `{command: "repositoryQuery", repo: "/repo", requestId: "q", data: {kind: "stashes", stashes: []}, status: null}`.

### C.7 Questions

- **queries Q1.** `loadBranches` always answers `isRepo: true` (non-repositories fail through `graphQueryError`), and nothing reads the field. Keep it?
- **queries Q2.** `hard` is always sent as `true`, echoed back, and never read. Is it vestigial?
- **queries Q3.** `head` is a branch name in `loadBranches` responses but a commit hash in `loadCommits` responses. Is the shared name intentional?
- **queries Q4.** Identity is spread unevenly:
  - `loadBranches` and `loadCommits` carry `repo` in their own fields and again through the graph identity;
  - `commitDetails` gets `repo` and `requestId` only through the identity;
  - `loadRemotes` and `repositoryQuery` carry both in their own fields;
  - `QueryResult` therefore includes `repo` for four commands (plus `branchName` for `loadCommits`) but `requestId` only for the two non-graph ones.

  Is there a rule the new shapes should follow, given that the resulting shapes must stay the same?

- **queries Q5.** `visibilityKey` is optional in requests although the webview always sends it. A response without it passes the webview's staleness check whatever the current visibility, which weakens that check. Should it be required?
- **queries Q6.** A branch that tracks a local branch reports `upstream.remote` and `pushRemote` as `"."`, which is not in `remotes`. The webview then falls back to another remote. Intended?
- **queries Q7.** `commitDetails` has two failure paths: a `null` result (Git failed, or the revision is not a single commit), shown without a reason, and `graphQueryError` (for example, the client could not be created), shown with the message. Should they be unified?
- **queries Q8.** Orderings differ: `remotes` is sorted by JavaScript string order (UTF-16 code units), while `branches` and labels follow Git's byte order of ref names. Should they agree?
- **queries Q9.** Remote-tracking branches are spelled `origin/main` in `GitRef.name` but `remotes/origin/main` in `branches` and in `loadCommits.branchName`. Is the double convention meant to stay part of the protocol?

---

## Decisions (from the project maintainer's side)

These decisions replace the "current behaviour" wherever they differ. Build to these, and test the decided behaviour. Every question not listed as changed is **keep**: the shapes, names and optionality stay exactly as this specification states them, because the extension, the webview and the tests depend on them.

- **git Q1: drop `GitRefData`.** Nothing produces or reads it, so the replacement does not export it; the test gap that pins its export is dropped.
- Everything else: keep. In particular actions Q1 – Q6, git Q2 – Q7 and queries Q1 – Q9 stay as they are.

The replacement states the same shapes, so many declarations will read alike. Write the documentation comments afresh, and group and order the declarations as reads best to you.
