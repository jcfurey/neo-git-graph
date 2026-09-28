# Clean-room specification: `src/webview/lib/menus.tsx`

This module supplies the context menus of the history graph: the menu of a commit row, and the
menus of branch and tag labels (on commit rows and in the Branches pane). Each menu entry either
acts at once or opens a dialog, and several dialogs end by sending a command to the extension.
The module also supplies the keys that tell an on-screen element that its own menu (or a dialog
started from that menu) is open, and the "check out this branch" action that double-clicks and
inline buttons use.

## 0. How the observations were made

- Read the module's callers, its dependencies, the types it uses, the tests listed in §6, and the
  UI harness `tests-ext/ui/history.test.cjs`.
- Ran the existing tests (`vitest run --project webview` on the files in §6: 9 files, 78 tests,
  all pass) and the coverage run (`pnpm run test:coverage` equivalent).
- Ran scratch Vitest files outside the repository in two setups: with the tests' l10n stand-in
  (every `window.l10n.<key>` returns the key's own name, e.g. `addTag`), and with the real English
  strings (the extension's l10n table evaluated with a translation function that returns its
  argument). Every entry of every menu was clicked; each dialog was captured (message rendered to
  HTML, inputs, submit label, destructive flag, source key), submitted with sample values, and the
  resulting messages to the extension were recorded. Follow-up flows (remote picker, rebase
  confirmation, worktree form, copy failure) were driven by feeding back the responses the
  extension would send. The scratch files have been deleted.

Terms used below:

- **Title**: the visible text of a menu entry.
- **Separator**: a divider between groups of entries (a `null` entry, see §1.2).
- **Short hash**: the first 8 characters of a full commit hash (what `abbrevCommit` returns).
- **Emphasised name**: a hash or ref name shown inside a bold element that contains an italic
  element (observed HTML: `<b><i>01234567</i></b>`).
- **Bold phrase**: text inside a bold element only (observed HTML: `<b>the current branch</b>`).
- **Explanation line**: an `Explain` element placed after the question; it renders as a small,
  muted block under the dialog's message.
- **Source key**: the string that identifies which on-screen element owns an open menu or form
  dialog (see §3.2).
- **Ellipsis**: the single character U+2026 `…`, appended directly (no space) after a localized
  string.

---

## 1. Interface

### 1.1 Module path

`src/webview/lib/menus.tsx`, imported everywhere as `@/webview/lib/menus`. The file must keep this
name and the `.tsx` extension: `vitest.config.ts` names `src/webview/lib/menus.tsx` explicitly in
its coverage settings (see §5.6).

### 1.2 Exports

All six exports must exist with these names and signatures. Nothing else is exported today;
exporting more is harmless.

| Export                  | Signature                                                                      | Meaning                                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CommitMessages` (type) | `type CommitMessages = ReadonlyMap<string, string>`                            | Lookup from a full commit hash to that commit's message text, for the commits currently loaded in the graph. Used only to describe the parents of a merge commit in the cherry-pick and revert dialogs. A parent missing from the map is still listed, by short hash alone. The history table fills it with every loaded commit's `message` field. |
| `commitMenuSource`      | `(hash: string) => string`                                                     | Source key of a commit row.                                                                                                                                                                                                                                                                                                                        |
| `refMenuSource`         | `(gitRef: GitRef) => string`                                                   | Source key of a branch or tag label.                                                                                                                                                                                                                                                                                                               |
| `commitMenu`            | `(commit: GitCommitNode, messages: CommitMessages) => Array<ContextMenuEntry>` | Builds the menu of one commit row.                                                                                                                                                                                                                                                                                                                 |
| `checkoutBranchAction`  | `(gitRef: GitRef) => void`                                                     | Checks out a local branch at once, or starts the remote-branch checkout flow; does nothing for a tag.                                                                                                                                                                                                                                              |
| `refMenu`               | `(gitRef: GitRef, isHeadBranch: boolean) => Array<ContextMenuEntry>`           | Builds the menu of one ref label. `isHeadBranch` is `true` only when `gitRef` is the local branch that is currently checked out.                                                                                                                                                                                                                   |

Types referenced by the signatures (defined elsewhere, not to be changed):

- `ContextMenuEntry` (`@/webview/types`): either `{ title: string; onClick: () => void }` or `null`.
  `null` is drawn as a separator by the context-menu component. The return value of `onClick` is
  ignored.
- `GitRef` (`@/backend/types`): `{ hash: string; name: string; type: "head" | "tag" | "remote" }`.
  `"head"` is a local branch (`name` is its short name such as `main` or `feature/x`); `"remote"` is
  a remote-tracking branch (`name` includes the remote, such as `origin/topic`); `"tag"` is a tag.
  `hash` is the commit the ref points at.
- `GitCommitNode` (`@/backend/types`): `{ hash, parentHashes, author, email, date, message, refs }`.
  Only `hash` and `parentHashes` affect the menu.

### 1.3 Who uses what

| User                                                                                                                                                                                      | Uses                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/webview/components/commit/CommitRow.tsx`                                                                                                                                             | `commitMenu`, `commitMenuSource`, type `CommitMessages`. Builds the menu each time it opens (right-click, the row's "actions" button, or the ContextMenu / Shift+F10 key), and appends a separator plus file entries of its own when the row belongs to a file history. Never opens a menu for the uncommitted-changes row.                                           |
| `src/webview/components/commit/RefLabel.tsx`                                                                                                                                              | `refMenu` (with `isHeadBranch` = the label is a local branch whose name equals the checked-out branch), `refMenuSource`, `checkoutBranchAction` (on double-click of any label, including tags and the current branch).                                                                                                                                                |
| `src/webview/components/repository/RefsPane.tsx`                                                                                                                                          | `refMenu` (local rows: `isHeadBranch` = the row is the repository's HEAD branch; remote and tag rows: always `false`), `refMenuSource` (every row), `checkoutBranchAction` (the inline "Checkout" button on remote rows and on local rows that are neither current nor checked out in another worktree). The menu is passed as a function and built only when opened. |
| `tests/webview/lib/menus.test.ts`                                                                                                                                                         | `commitMenu`, `checkoutBranchAction`                                                                                                                                                                                                                                                                                                                                  |
| `tests/webview/lib/menu-actions.test.ts`                                                                                                                                                  | `commitMenu`, `refMenu` (and `ReturnType<typeof commitMenu>` as a type)                                                                                                                                                                                                                                                                                               |
| `tests/webview/components/ui/Dialog.test.ts`                                                                                                                                              | `commitMenu`, `refMenu` (and `ReturnType<typeof commitMenu>`)                                                                                                                                                                                                                                                                                                         |
| `tests/webview/lib/actions/clipboard.test.ts`                                                                                                                                             | `commitMenu`                                                                                                                                                                                                                                                                                                                                                          |
| `tests/webview/lib/remote-actions.test.ts`                                                                                                                                                | `refMenu`                                                                                                                                                                                                                                                                                                                                                             |
| `tests/webview/lib/branch-focus.test.ts`                                                                                                                                                  | `refMenu`                                                                                                                                                                                                                                                                                                                                                             |
| `tests/webview/components/commit/CommitRow.test.ts`, `tests/webview/components/repository/RefsPane.test.ts`, `RefsScale.test.ts`, `RefsTiming.test.ts`, `tests/webview/lib/hints.test.ts` | Indirectly: they rely on the exact source-key formats (§3.2).                                                                                                                                                                                                                                                                                                         |
| `tests-ext/ui/history.test.cjs` (UI harness)                                                                                                                                              | Clicks menu items by their exact English text (§6.1).                                                                                                                                                                                                                                                                                                                 |

Other modules that do not import this one but depend on its key format: `src/webview/lib/hints.ts`
(treats a context menu whose source starts with `commit:` as "the commit menu was opened"),
`src/webview/lib/remote-actions.tsx` (gives its dialogs the keys `ref:head:<branch>` and
`ref:remote:<ref>`), and `src/webview/components/repository/RemoteManager.tsx` (the upstream
dialog uses `ref:head:<branch>`).

---

## 2. Dependencies the implementation must use

### 2.1 Imports

| Import path                                       | Name                                                 | Contract (what the module relies on)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@/webview/lib/actions`                           | `openFormDialog`                                     | Opens a form dialog. Options: `message` (any Preact children, shown as the dialog's question), `inputs` (array of `DialogInput`, below), `action` (text of the submit button), `source` (source key of the element the dialog belongs to, or `null`), `onSubmit(values)` (called with one value per input, in input order: `boolean` for a checkbox, `string` for every other kind), `destructive` (optional; when `true` the dialog opens with focus on Cancel so a held or stray Enter cannot confirm). Opening a dialog closes the open context menu. The dialog remembers which repository was selected when it opened; if the selection changed before submit, it closes itself and `onSubmit` is not called. With an empty `inputs` array the dialog is a plain confirmation. |
| `@/webview/lib/actions`                           | `runAction`                                          | Sends one git command to the extension for the selected repository. Takes the command object without `repo`; adds `requestId` (`"action-<n>"`) and `repo`, shows a "running" dialog titled after the command, and posts the message. Does nothing when no repository is selected.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `@/webview/lib/actions`                           | `focusBranchInGraph`                                 | View-only action: makes the given branch the focus of the graph (switches the "filter" display to "focus", resumes a paused focus, reveals a hidden remote when the argument names a remote branch, reloads commits only when needed). Never checks anything out. Takes a local branch name as is, or a remote-tracking branch as `remotes/<remote>/<branch>`.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `@/webview/lib/actions/clipboard`                 | `copyToClipboard`                                    | `(type: string, data: string)`. Asks the extension (RPC method `clipboard.copy`, params = `data`) to copy the text. On failure opens an error dialog whose message is the `unableToCopyToClipboard` template with `{0}` replaced by `type`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `@/webview/lib/remote-actions`                    | `openRemoteAction`                                   | `(action, branchName = "", remoteRef?)`. Starts a flow that first loads the repository's remotes (posts `loadRemotes`, shows a "Loading remotes" running dialog), then shows a form. The menus use the actions `"push"`, `"pull"`, `"fetch"`, `"checkout"`, `"tagPush"`, `"tagDelete"`, `"branchDelete"`. `branchName` is a local branch name for push/pull and the tag name for the two tag actions; it must be `""` for the three remote-ref actions, which pass the remote ref name (e.g. `origin/topic`) as `remoteRef`. See §2.3 for what follows.                                                                                                                                                                                                                             |
| `@/webview/components/history/HistoryTools`       | `openCompare`                                        | `(left = "HEAD", right = "HEAD")`. Opens the wide content dialog "Compare Revisions" comparing two revisions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `@/webview/components/history/HistoryTools`       | `openFixup`                                          | `(target: string)`. Asks the extension for the staged-changes plan against `target` (`repositoryQuery` with `{ kind: "stagedPlan", target }`), then opens the "Create Fixup Commit" dialog. No-op without a repository.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `@/webview/components/repository/BisectView`      | `chooseBisectCommit`                                 | `(kind: "good" \| "bad", hash: string)`. Records the hash as the good or bad candidate of the selected repository's bisect draft, then opens the "Find a Regression (Bisect)" dialog. No-op without a repository.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `@/webview/components/repository/RebaseEditor`    | `openInteractiveRebase`                              | `(base: string, autosquash = false)`. Asks the extension for a rebase plan (`repositoryQuery` with `{ kind: "rebasePlan", base, autosquash }`) and opens the "Interactive Rebase" editor. No-op without a repository.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `@/webview/components/repository/RebaseEditor`    | `openRebase`                                         | `(onto: string)`. Opens a confirmation "Rebase <current branch> onto <onto>? …" with submit "Start Rebase" (source `null`), which sends `repositoryAction` `{ kind: "rebase", branch, onto, expectedHead }`. When HEAD is detached, shows the error dialog "Unable to complete Git operation" / "Detached HEAD" instead.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `@/webview/components/repository/RemoteManager`   | `openTracking`                                       | `(branch: string)`. Loads the repository state (`repositoryQuery` `{ kind: "state" }`), then opens "Configure Upstream: <branch>" with an "Upstream Branch" select, submit "Save", source `ref:head:<branch>`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `@/webview/components/repository/WorktreeManager` | `openAddWorktree`                                    | `(startPoint = "HEAD", repo = selected)`. Opens the "Create Worktree" form: text "Absolute Folder Path" (empty), ref "Branch" (empty), checkbox "Create a new branch" (checked), text "Start Point (for a new branch)" prefilled with `startPoint`; submit "Create Worktree"; source `null`; sends `repositoryAction` `{ kind: "addWorktree", path, branch, newBranch, startPoint }`.                                                                                                                                                                                                                                                                                                                                                                                               |
| `@/webview/components/ui/Explain`                 | `Explain`                                            | Preact component taking `children`; renders them as the explanation line.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `@/webview/utils/format`                          | `format`                                             | `(template: string, ...parts)`. Splits a localized template at `{0}`, `{1}`, … and returns an array of children in which each placeholder is replaced by the matching part (which may be a Preact element). No markup is parsed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `@/backend/utils/string`                          | `abbrevCommit`                                       | `(hash: string) => string`: the first 8 characters.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `@/backend/types`                                 | `GitCommitNode`, `GitRef`, `GitResetMode` (types)    | See §1.2. `GitResetMode` is `"soft" \| "mixed" \| "hard"`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `@/webview/types`                                 | `ContextMenuEntry` (type)                            | See §1.2.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `preact`                                          | JSX runtime; optionally the `ComponentChildren` type | Dialog messages contain elements (emphasis, explanation line).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

Global: `window.l10n` (typed as `LocalizedStrings`, declared in `src/webview/global.d.ts`). All
visible text comes from it. The keys used are listed in §2.4.

### 2.2 Commands sent through `runAction`

Payload fields as defined in `src/backend/types/actions.types.ts`. `runAction` adds `requestId`
and `repo`.

| `command`          | Fields supplied by this module                                                     |
| ------------------ | ---------------------------------------------------------------------------------- |
| `addTag`           | `tagName: string`, `commitHash: string`, `lightweight: boolean`, `message: string` |
| `createBranch`     | `branchName: string`, `commitHash: string`                                         |
| `checkoutCommit`   | `commitHash: string`                                                               |
| `cherrypickCommit` | `commitHash: string`, `parentIndex: number`                                        |
| `revertCommit`     | `commitHash: string`, `parentIndex: number`                                        |
| `mergeCommit`      | `commitHash: string`, `createNewCommit: boolean`                                   |
| `resetToCommit`    | `commitHash: string`, `resetMode: "soft" \| "mixed" \| "hard"`                     |
| `checkoutBranch`   | `branchName: string`, `remoteBranch: null` (local checkout only)                   |
| `renameBranch`     | `oldName: string`, `newName: string`                                               |
| `deleteBranch`     | `branchName: string`, `forceDelete: boolean`                                       |
| `mergeBranch`      | `branchName: string`, `createNewCommit: boolean`                                   |
| `deleteTag`        | `tagName: string`                                                                  |

### 2.3 What the remote flow does after a menu hands over (for orientation; implemented in `remote-actions.tsx`, not here)

Observed with remotes `["origin", ...]`, no upstream, no push remote.

| Menu passes                                 | `loadRemotes` request's `branchName` | Form that follows                                                                                                                                                                                                                                           | Command on submit                                                                             |
| ------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `("tagPush", "<tag>")`                      | `null`                               | "Push Tag: **<tag>**"; select "Remote"; submit "Push Tag"; source `null`                                                                                                                                                                                    | `pushTag` `{ remote, tagName }`                                                               |
| `("tagDelete", "<tag>")`                    | `null`                               | "Delete Remote Tag: **<tag>**"; select "Remote"; submit "Delete Remote Tag"; then a destructive confirmation "Delete **<tag>** from remote **<remote>**? …"                                                                                                 | `repositoryAction` `{ kind: "deleteRemoteRef", remote, name, refType: "tag" }`                |
| `("branchDelete", "", "<remote>/<branch>")` | `null`                               | "Delete Remote Branch: **<branch>**", remote preselected to the ref's own remote; then a destructive confirmation. Error "The remote for '<ref>' is no longer configured." when no configured remote owns the ref                                           | `repositoryAction` `{ kind: "deleteRemoteRef", remote, name: "<branch>", refType: "branch" }` |
| `("fetch", "", "<remote>/<branch>")`        | `null`                               | "Fetch updates from a remote:"; select "Remote" (first option "All Remotes" = `""`, then each remote; preselected to the ref's remote); checkbox "Prune deleted remote branches" (off); submit "Fetch"; source `null`                                       | `fetchRemote` `{ remote: <name> or null for "All Remotes", prune }`                           |
| `("checkout", "", "<remote>/<branch>")`     | `null`                               | "Enter a local branch name for **<ref>**. …:"; ref input prefilled with the ref minus its remote; checkbox "Fetch the latest remote revision before checkout" (on when the ref's remote is configured); submit "Checkout Branch"; source `ref:remote:<ref>` | `checkoutBranch` `{ branchName, remoteBranch: "<ref>", fetch }`                               |
| `("push", "<branch>")`                      | `"<branch>"`                         | "Push branch **<branch>** to a remote:"; Remote, Remote Branch, "Set as upstream branch", "Force with lease …"; submit "Preview Push"; source `ref:head:<branch>`                                                                                           | opens a push preview                                                                          |
| `("pull", "<branch>")`                      | `"<branch>"`                         | "Pull into branch **<branch>** (fast-forward only):"; Remote, Remote Branch; submit "Fetch & Preview Pull"; source `ref:head:<branch>`                                                                                                                      | fetches, then opens a pull preview                                                            |

With no remotes configured, every action except `"checkout"` ends in the error dialog "No remotes
configured. Add a remote to this repository first."

### 2.4 Localized strings

All keys already exist; the implementation must not need new ones (adding keys would require
regenerating `l10n/bundle.l10n.json`, which `pnpm run l10n:check` verifies). English text is the
source string in the named file under `src/old-extension/l10n/`; the same text is the key in
`l10n/bundle.l10n.json`. `webviewL10n.ts` merges the other three files into `window.l10n`.

Menu titles:

| Key                  | English                                            | Defined in        |
| -------------------- | -------------------------------------------------- | ----------------- |
| `addTag`             | Add Tag                                            | webviewL10n.ts    |
| `createBranch`       | Create Branch                                      | webviewL10n.ts    |
| `checkout`           | Checkout                                           | webviewL10n.ts    |
| `cherryPick`         | Cherry Pick                                        | webviewL10n.ts    |
| `revert`             | Revert                                             | webviewL10n.ts    |
| `merge`              | Merge into current branch                          | webviewL10n.ts    |
| `reset`              | Reset current branch to this Commit                | webviewL10n.ts    |
| `interactiveRebase`  | Edit commits after this (interactive rebase)       | repositoryL10n.ts |
| `createFixupMenu`    | Fold staged changes into this commit (fixup)       | historyL10n.ts    |
| `compareWith`        | Compare with… (the ellipsis is part of the string) | historyL10n.ts    |
| `bisectChooseGood`   | Use as Good Bisect Commit                          | workflowL10n.ts   |
| `bisectChooseBad`    | Use as Bad Bisect Commit                           | workflowL10n.ts   |
| `copyCommitHash`     | Copy Commit Hash to Clipboard                      | webviewL10n.ts    |
| `focusThisBranch`    | Focus this branch                                  | webviewL10n.ts    |
| `configureUpstream`  | Configure Upstream                                 | repositoryL10n.ts |
| `addWorktree`        | Create Worktree                                    | repositoryL10n.ts |
| `rebaseOnto`         | Move the current branch onto this (rebase)         | repositoryL10n.ts |
| `checkoutBranch`     | Checkout Branch                                    | webviewL10n.ts    |
| `pushBranch`         | Push Branch                                        | webviewL10n.ts    |
| `pullBranch`         | Pull Branch                                        | webviewL10n.ts    |
| `renameBranch`       | Rename Branch                                      | webviewL10n.ts    |
| `deleteBranch`       | Delete Branch                                      | webviewL10n.ts    |
| `copyBranchName`     | Copy Branch Name to Clipboard                      | webviewL10n.ts    |
| `deleteRemoteBranch` | Delete Remote Branch                               | repositoryL10n.ts |
| `fetch`              | Fetch                                              | webviewL10n.ts    |
| `deleteTag`          | Delete Tag                                         | webviewL10n.ts    |
| `pushTag`            | Push Tag                                           | webviewL10n.ts    |
| `deleteRemoteTag`    | Delete Remote Tag                                  | repositoryL10n.ts |
| `copyTagName`        | Copy Tag Name to Clipboard                         | webviewL10n.ts    |

Dialog text:

| Key                           | English                                                                                                                                                  | Defined in        |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `dialogAddTagTitle`           | Add tag to commit {0}                                                                                                                                    | webviewL10n.ts    |
| `dialogAddTagName`            | Name                                                                                                                                                     | webviewL10n.ts    |
| `dialogAddTagType`            | Type                                                                                                                                                     | webviewL10n.ts    |
| `dialogAddTagTypeAnnotated`   | Annotated                                                                                                                                                | webviewL10n.ts    |
| `dialogAddTagTypeLightweight` | Lightweight                                                                                                                                              | webviewL10n.ts    |
| `dialogAddTagMessage`         | Message                                                                                                                                                  | webviewL10n.ts    |
| `dialogAddTagOptional`        | Optional                                                                                                                                                 | webviewL10n.ts    |
| `dialogAddTagSubmit`          | Add Tag                                                                                                                                                  | webviewL10n.ts    |
| `dialogCreateBranchTitle`     | Enter the name of the branch {0}                                                                                                                         | webviewL10n.ts    |
| `dialogCreateBranchSubmit`    | Create Branch                                                                                                                                            | webviewL10n.ts    |
| `dialogCheckoutConfirm`       | Are you sure you want to checkout commit {0}? This will result in a 'detached HEAD' state.                                                               | webviewL10n.ts    |
| `explainDetachedHead`         | You can build and test here. Create a branch from this commit to keep new work, or check out a branch to return.                                         | repositoryL10n.ts |
| `dialogYes`                   | Yes                                                                                                                                                      | webviewL10n.ts    |
| `dialogCherryPickConfirm`     | Are you sure you want to cherry pick commit {0}?                                                                                                         | webviewL10n.ts    |
| `dialogYesCherryPick`         | Yes, cherry pick commit                                                                                                                                  | webviewL10n.ts    |
| `dialogRevertConfirm`         | Are you sure you want to revert commit {0}?                                                                                                              | webviewL10n.ts    |
| `dialogYesRevert`             | Yes, revert commit                                                                                                                                       | webviewL10n.ts    |
| `dialogMergeConfirm`          | Are you sure you want to merge {0} into {1}?                                                                                                             | webviewL10n.ts    |
| `labelCurrentBranch`          | the current branch                                                                                                                                       | webviewL10n.ts    |
| `dialogMergeNoFastForward`    | Create a new commit even if fast-forward is possible                                                                                                     | webviewL10n.ts    |
| `dialogYesMerge`              | Yes, merge                                                                                                                                               | webviewL10n.ts    |
| `dialogResetConfirm`          | Are you sure you want to reset {0} to commit {1}?                                                                                                        | webviewL10n.ts    |
| `explainReset`                | Soft and mixed keep your files. Hard discards uncommitted changes. The previous position stays in the reflog, so Recover lost commits can bring it back. | repositoryL10n.ts |
| `dialogResetSoft`             | Soft - Keep all changes, but reset head                                                                                                                  | webviewL10n.ts    |
| `dialogResetMixed`            | Mixed - Keep working tree, but reset index                                                                                                               | webviewL10n.ts    |
| `dialogResetHard`             | Hard - Discard all changes                                                                                                                               | webviewL10n.ts    |
| `dialogYesReset`              | Yes, reset                                                                                                                                               | webviewL10n.ts    |
| `dialogDeleteConfirm`         | Are you sure you want to delete {0} {1}?                                                                                                                 | webviewL10n.ts    |
| `labelTag`                    | the tag                                                                                                                                                  | webviewL10n.ts    |
| `labelBranch`                 | the branch                                                                                                                                               | webviewL10n.ts    |
| `explainDeleteBranch`         | The commits stay in the repository for a while. Recover lost commits lists the branch tip if you need it back.                                           | repositoryL10n.ts |
| `dialogDeleteForceDelete`     | Force Delete                                                                                                                                             | webviewL10n.ts    |
| `dialogRenameBranchTitle`     | Enter the new name for the branch {0}:                                                                                                                   | webviewL10n.ts    |
| `dialogRenameBranchSubmit`    | Rename Branch                                                                                                                                            | webviewL10n.ts    |
| `typeCommitHash`              | Commit Hash                                                                                                                                              | webviewL10n.ts    |
| `typeBranchName`              | Branch Name                                                                                                                                              | webviewL10n.ts    |
| `typeTagName`                 | Tag Name                                                                                                                                                 | webviewL10n.ts    |

(`unableToCopyToClipboard` = "Unable to Copy {0} to Clipboard" is used by `copyToClipboard`, not
by this module directly.)

---

## 3. Behaviour

### 3.1 General rules

1. **Titles.** A title is the localized string of its key. An ellipsis is appended to every entry
   that opens a dialog or a follow-up flow, with these exact exceptions: `compareWith` (its string
   already ends in an ellipsis; nothing is added), `bisectChooseGood` and `bisectChooseBad` (open
   the bisect dialog but get no ellipsis), and the local-branch `checkoutBranch` entry (acts at
   once, no ellipsis). `focusThisBranch` and the three copy entries get none. The tables in §3.3
   and §3.4 give every title exactly.
2. **Titles come from `window.l10n` when the menu is built**, and dialog text when the entry is
   clicked. The tests replace `window.l10n` with an object that answers every key with the key's
   own name, so under test the titles are e.g. `addTag…`, `checkoutBranch`, `compareWith`.
3. **Separators** are `null` entries placed exactly where §3.3/§3.4 show them. No menu starts or
   ends with a separator, and no two separators are adjacent.
4. **Hashes in dialogs** are shown as the short hash; **hashes in commands** are always the full
   hash.
5. **Emphasis.** In dialog questions, the commit's short hash and ref names are emphasised names
   (bold containing italic). The phrase "the current branch" (`labelCurrentBranch`) is a bold
   phrase. The words "the branch" / "the tag" in delete confirmations are plain text.
6. **Dialog source keys.** Every form dialog opened directly by this module carries the source key
   of the element whose menu started it: the commit key for commit-menu dialogs, the ref key for
   ref-menu dialogs. Dialogs opened by the shared openers carry whatever those openers choose
   (§2.1, §2.3).
7. **Only the dialogs named "destructive" below pass `destructive: true`**; all other form dialogs
   opened by this module are not destructive (the flag is absent or false).
8. **Building a menu has no effect**: no message to the extension, no dialog, no change to any
   store. Effects happen only when an entry's `onClick` runs.
9. Entries do not need to close the context menu: the context-menu component closes itself when an
   entry is chosen, and opening any dialog closes it too.

### 3.2 Source keys

| Function                 | Result                                                                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `commitMenuSource(hash)` | `"commit:" + hash` (full hash as given), e.g. `commit:abc123456789`                                                                       |
| `refMenuSource(ref)`     | `"ref:" + ref.type + ":" + ref.name`, e.g. `ref:head:main`, `ref:remote:origin/feature/x`, `ref:tag:v1.0`. `hash` is not part of the key. |

A branch and a tag with the same name get different keys. Two labels that show the same ref (for
example one on a commit row and one in the Branches pane) get the same key, so both show their
"menu open" state together. The
formats are fixed: they are hard-coded in other modules and tests (§1.3), and
`src/webview/lib/stores.ts` compares them for equality to decide which element shows its
"menu open" state (the open context menu's source, or else the open form dialog's source).

### 3.3 Commit menu (`commitMenu`)

The same 13 entries and 3 separators, in this order, for every commit: root commits, ordinary
commits and merge commits get identical menus. Only the cherry-pick and revert dialogs depend on
the number of parents.

| #   | Title (English)                               | Key + suffix                  | On click                                                                     |
| --- | --------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------- |
| 1   | Add Tag…                                      | `addTag` + …                  | Form dialog C1                                                               |
| 2   | Create Branch…                                | `createBranch` + …            | Form dialog C2                                                               |
| —   | separator                                     |                               |                                                                              |
| 3   | Checkout…                                     | `checkout` + …                | Form dialog C3                                                               |
| 4   | Cherry Pick…                                  | `cherryPick` + …              | Form dialog C4                                                               |
| 5   | Revert…                                       | `revert` + …                  | Form dialog C5                                                               |
| —   | separator                                     |                               |                                                                              |
| 6   | Merge into current branch…                    | `merge` + …                   | Form dialog C6                                                               |
| 7   | Reset current branch to this Commit…          | `reset` + …                   | Form dialog C7 (destructive)                                                 |
| —   | separator                                     |                               |                                                                              |
| 8   | Edit commits after this (interactive rebase)… | `interactiveRebase` + …       | `openInteractiveRebase(<full hash>)` (autosquash left at its default, false) |
| 9   | Fold staged changes into this commit (fixup)… | `createFixupMenu` + …         | `openFixup(<full hash>)`                                                     |
| 10  | Compare with…                                 | `compareWith` (nothing added) | `openCompare("HEAD", <full hash>)`                                           |
| 11  | Use as Good Bisect Commit                     | `bisectChooseGood`            | `chooseBisectCommit("good", <full hash>)`                                    |
| 12  | Use as Bad Bisect Commit                      | `bisectChooseBad`             | `chooseBisectCommit("bad", <full hash>)`                                     |
| 13  | Copy Commit Hash to Clipboard                 | `copyCommitHash`              | `copyToClipboard(<typeCommitHash>, <full hash>)`                             |

(The returned array has 16 items: 13 entries and 3 `null` separators.)

All commit-menu form dialogs carry the source key `commit:<full hash>`.

**C1 Add Tag**

- Question: `dialogAddTagTitle` with `{0}` = emphasised short hash.
- Inputs, in order:
  1. `ref`, label `dialogAddTagName` ("Name"), initial `""`.
  2. `select`, label `dialogAddTagType` ("Type"), initial `"annotated"`, options in order:
     `dialogAddTagTypeAnnotated` → `"annotated"`, `dialogAddTagTypeLightweight` → `"lightweight"`.
  3. `text`, label `dialogAddTagMessage` ("Message"), initial `""`, placeholder
     `dialogAddTagOptional` ("Optional").
- Submit button: `dialogAddTagSubmit` ("Add Tag"). Not destructive.
- On submit: `addTag` with `tagName` = input 1, `commitHash` = full hash, `lightweight` = (input 2
  is `"lightweight"`), `message` = input 3 exactly as entered (also when lightweight is chosen).

**C2 Create Branch**

- Question: `dialogCreateBranchTitle` with `{0}` = emphasised short hash.
- Inputs: one `ref` input without a label, initial `""`.
- Submit button: `dialogCreateBranchSubmit` ("Create Branch"). Not destructive.
- On submit: `createBranch` with `branchName` = input, `commitHash` = full hash.

**C3 Checkout (detached)**

- Question: `dialogCheckoutConfirm` with `{0}` = emphasised short hash, followed by an explanation
  line `explainDetachedHead`.
- Inputs: none.
- Submit button: `dialogYes` ("Yes"). Not destructive.
- On submit: `checkoutCommit` with `commitHash` = full hash.

**C4 Cherry Pick** and **C5 Revert**

|               | Cherry Pick                                              | Revert                                               |
| ------------- | -------------------------------------------------------- | ---------------------------------------------------- |
| Question      | `dialogCherryPickConfirm`, `{0}` = emphasised short hash | `dialogRevertConfirm`, `{0}` = emphasised short hash |
| Submit button | `dialogYesCherryPick` ("Yes, cherry pick commit")        | `dialogYesRevert` ("Yes, revert commit")             |
| Command       | `cherrypickCommit`                                       | `revertCommit`                                       |

Neither is destructive. Inputs depend on the commit's parent count:

- **Fewer than two parents** (root or ordinary commit): no inputs. On submit the command is sent
  with `commitHash` = full hash and `parentIndex: 0`.
- **Two or more parents** (merge, including octopus merges): exactly one `select` input with **no
  label** (the dialog then names it by its question), initial value `"1"`, and one option per
  parent in `parentHashes` order:
  - value: the parent's 1-based position as a decimal string (`"1"`, `"2"`, `"3"`, …);
  - label: the parent's short hash, followed by `": "` and the parent's text from `messages` when
    `messages` has an entry for the parent's full hash (the text is used as is, even if it
    contains colons); otherwise the short hash alone.
    On submit the command is sent with `commitHash` = full hash and `parentIndex` = the chosen value
    as a number (1-based).

**C6 Merge commit**

- Question: `dialogMergeConfirm` with `{0}` = emphasised short hash, `{1}` = bold
  `labelCurrentBranch`.
- Inputs: one `checkbox`, label `dialogMergeNoFastForward`, initial `true`.
- Submit button: `dialogYesMerge` ("Yes, merge"). Not destructive.
- On submit: `mergeCommit` with `commitHash` = full hash, `createNewCommit` = the checkbox.

**C7 Reset (destructive)**

- Question: `dialogResetConfirm` with `{0}` = bold `labelCurrentBranch`, `{1}` = emphasised short
  hash, followed by an explanation line `explainReset`.
- Inputs: one `select` with **no label**, initial `"mixed"`, options in order:
  `dialogResetSoft` → `"soft"`, `dialogResetMixed` → `"mixed"`, `dialogResetHard` → `"hard"`.
- Submit button: `dialogYesReset` ("Yes, reset"). **Destructive.**
- On submit: `resetToCommit` with `commitHash` = full hash, `resetMode` = the chosen value.

### 3.4 Ref menus (`refMenu`)

The menu depends on `gitRef.type`. `isHeadBranch` only matters for local branches; it is ignored
for remote branches and tags (the same menu is returned for `true` and `false`).

Two entries are shared:

- **Focus this branch** (`focusThisBranch`, no suffix): `focusBranchInGraph(<name>)` for a local
  branch, `focusBranchInGraph("remotes/" + <name>)` for a remote branch. Not offered for tags.
- **Compare with…** (`compareWith`, nothing added): `openCompare("HEAD", gitRef.hash)`, i.e. the
  ref's commit hash, not its name.

#### 3.4.1 Tag (`type: "tag"`)

| #   | Title (English)            | Key + suffix          | On click                                     |
| --- | -------------------------- | --------------------- | -------------------------------------------- |
| 1   | Compare with…              | `compareWith`         | `openCompare("HEAD", <ref hash>)`            |
| —   | separator                  |                       |                                              |
| 2   | Delete Tag…                | `deleteTag` + …       | Form dialog T1 (destructive)                 |
| 3   | Push Tag…                  | `pushTag` + …         | `openRemoteAction("tagPush", <tag name>)`    |
| 4   | Delete Remote Tag…         | `deleteRemoteTag` + … | `openRemoteAction("tagDelete", <tag name>)`  |
| —   | separator                  |                       |                                              |
| 5   | Copy Tag Name to Clipboard | `copyTagName`         | `copyToClipboard(<typeTagName>, <tag name>)` |

**T1 Delete Tag (destructive)**

- Question: `dialogDeleteConfirm` with `{0}` = `labelTag` as plain text, `{1}` = emphasised tag
  name. No explanation line.
- Inputs: none.
- Submit button: `dialogYes` ("Yes"). **Destructive.** Source `ref:tag:<name>`.
- On submit: `deleteTag` with `tagName` = the tag's name.

#### 3.4.2 Local branch that is not checked out (`type: "head"`, `isHeadBranch: false`)

| #   | Title (English)                             | Key + suffix                 | On click                                                                                                          |
| --- | ------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | Focus this branch                           | `focusThisBranch`            | `focusBranchInGraph(<name>)`                                                                                      |
| 2   | Compare with…                               | `compareWith`                | `openCompare("HEAD", <ref hash>)`                                                                                 |
| —   | separator                                   |                              |                                                                                                                   |
| 3   | Configure Upstream…                         | `configureUpstream` + …      | `openTracking(<name>)`                                                                                            |
| 4   | Create Worktree…                            | `addWorktree` + …            | `openAddWorktree("refs/heads/" + <name>)`                                                                         |
| 5   | Move the current branch onto this (rebase)… | `rebaseOnto` + …             | `openRebase("refs/heads/" + <name>)`                                                                              |
| 6   | Checkout Branch                             | `checkoutBranch` (no suffix) | Same as `checkoutBranchAction(gitRef)` for a local branch: sends `checkoutBranch` at once, no confirmation (§3.5) |
| 7   | Push Branch…                                | `pushBranch` + …             | `openRemoteAction("push", <name>)`                                                                                |
| 8   | Rename Branch…                              | `renameBranch` + …           | Form dialog B1                                                                                                    |
| 9   | Delete Branch…                              | `deleteBranch` + …           | Form dialog B2 (destructive)                                                                                      |
| 10  | Merge into current branch…                  | `merge` + …                  | Form dialog B3                                                                                                    |
| —   | separator                                   |                              |                                                                                                                   |
| 11  | Copy Branch Name to Clipboard               | `copyBranchName`             | `copyToClipboard(<typeBranchName>, <name>)`                                                                       |

#### 3.4.3 The checked-out local branch (`type: "head"`, `isHeadBranch: true`)

Compared with §3.4.2: Rebase, Checkout Branch, Delete Branch and Merge are removed, and Pull Branch
is added right after Push Branch.

| #   | Title (English)               | Key + suffix            | On click                                    |
| --- | ----------------------------- | ----------------------- | ------------------------------------------- |
| 1   | Focus this branch             | `focusThisBranch`       | `focusBranchInGraph(<name>)`                |
| 2   | Compare with…                 | `compareWith`           | `openCompare("HEAD", <ref hash>)`           |
| —   | separator                     |                         |                                             |
| 3   | Configure Upstream…           | `configureUpstream` + … | `openTracking(<name>)`                      |
| 4   | Create Worktree…              | `addWorktree` + …       | `openAddWorktree("refs/heads/" + <name>)`   |
| 5   | Push Branch…                  | `pushBranch` + …        | `openRemoteAction("push", <name>)`          |
| 6   | Pull Branch…                  | `pullBranch` + …        | `openRemoteAction("pull", <name>)`          |
| 7   | Rename Branch…                | `renameBranch` + …      | Form dialog B1                              |
| —   | separator                     |                         |                                             |
| 8   | Copy Branch Name to Clipboard | `copyBranchName`        | `copyToClipboard(<typeBranchName>, <name>)` |

**B1 Rename Branch**

- Question: `dialogRenameBranchTitle` with `{0}` = emphasised current name (the string ends with a
  colon).
- Inputs: one `ref` input without a label, initial value = the current name.
- Submit button: `dialogRenameBranchSubmit` ("Rename Branch"). Not destructive. Source
  `ref:head:<name>`.
- On submit: `renameBranch` with `oldName` = current name, `newName` = input. Sent even when the
  input is unchanged.

**B2 Delete Branch (destructive)**

- Question: `dialogDeleteConfirm` with `{0}` = `labelBranch` as plain text, `{1}` = emphasised
  branch name, followed by an explanation line `explainDeleteBranch`.
- Inputs: one `checkbox`, label `dialogDeleteForceDelete` ("Force Delete"), initial `false`.
- Submit button: `deleteBranch` ("Delete Branch", no ellipsis). **Destructive.** Source
  `ref:head:<name>`.
- On submit: `deleteBranch` with `branchName` = name, `forceDelete` = the checkbox.

**B3 Merge branch**

- Question: `dialogMergeConfirm` with `{0}` = emphasised branch name, `{1}` = bold
  `labelCurrentBranch`.
- Inputs: one `checkbox`, label `dialogMergeNoFastForward`, initial `true`.
- Submit button: `dialogYesMerge` ("Yes, merge"). Not destructive. Source `ref:head:<name>`.
- On submit: `mergeBranch` with `branchName` = name, `createNewCommit` = the checkbox.

#### 3.4.4 Remote-tracking branch (`type: "remote"`), including a remote's HEAD

The module does not treat a remote's HEAD (a ref named like `origin/HEAD`) differently: it gets
exactly this menu, with `HEAD` in place of the branch part (observed).

| #   | Title (English)                             | Key + suffix             | On click                                                                                              |
| --- | ------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------- |
| 1   | Focus this branch                           | `focusThisBranch`        | `focusBranchInGraph("remotes/" + <name>)`                                                             |
| 2   | Compare with…                               | `compareWith`            | `openCompare("HEAD", <ref hash>)`                                                                     |
| —   | separator                                   |                          |                                                                                                       |
| 3   | Move the current branch onto this (rebase)… | `rebaseOnto` + …         | `openRebase("refs/remotes/" + <name>)`                                                                |
| 4   | Create Worktree…                            | `addWorktree` + …        | `openAddWorktree("refs/remotes/" + <name>)`                                                           |
| 5   | Delete Remote Branch…                       | `deleteRemoteBranch` + … | `openRemoteAction("branchDelete", "", <name>)`                                                        |
| 6   | Fetch…                                      | `fetch` + …              | `openRemoteAction("fetch", "", <name>)`                                                               |
| 7   | Checkout Branch…                            | `checkoutBranch` + …     | Same as `checkoutBranchAction(gitRef)` for a remote branch (§3.5)                                     |
| —   | separator                                   |                          |                                                                                                       |
| 8   | Copy Branch Name to Clipboard               | `copyBranchName`         | `copyToClipboard(<typeBranchName>, <name>)` (the full name including the remote, e.g. `origin/topic`) |

`<name>` is always the ref's full name as given (e.g. `origin/feature/x`); the module never splits
off the remote itself.

### 3.5 `checkoutBranchAction(gitRef)`

| `gitRef.type` | Effect                                                                                                                                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `"head"`      | Immediately `runAction` `checkoutBranch` with `branchName` = the name and `remoteBranch: null`. No confirmation, no `fetch` field. This happens even when the branch is already checked out (callers decide whether to offer it).          |
| `"remote"`    | `openRemoteAction("checkout", "", <full remote ref name>)`. Nothing is checked out until the user submits the follow-up form (§2.3), whose submit sends `checkoutBranch` with `remoteBranch` = the ref name and `fetch` from its checkbox. |
| `"tag"`       | Nothing: no message, no dialog, no store change.                                                                                                                                                                                           |

With no repository selected nothing is sent and no dialog opens (both dependencies are no-ops
then).

---

## 4. Concrete examples (observed)

Values used: selected repository `/repo`; commit hash
`0123456789abcdef0123456789abcdef01234567` (short hash `01234567`); parents
`aaaaaaaa11111111aaaaaaaa11111111aaaaaaaa` (message "First parent msg" in `messages`) and
`bbbbbbbb22222222bbbbbbbb22222222bbbbbbbb` (not in `messages`). `requestId` values are shown as
`<id>`; the observed ones were `action-<n>` for `runAction` and `remote-<n>` for the remote flow.

### 4.1 Titles in order (`---` = separator)

Ordinary commit, root commit, and merge commit (all identical):

```
Add Tag… | Create Branch… | --- | Checkout… | Cherry Pick… | Revert… | --- |
Merge into current branch… | Reset current branch to this Commit… | --- |
Edit commits after this (interactive rebase)… | Fold staged changes into this commit (fixup)… |
Compare with… | Use as Good Bisect Commit | Use as Bad Bisect Commit | Copy Commit Hash to Clipboard
```

Local branch `topic`, not checked out:

```
Focus this branch | Compare with… | --- | Configure Upstream… | Create Worktree… |
Move the current branch onto this (rebase)… | Checkout Branch | Push Branch… | Rename Branch… |
Delete Branch… | Merge into current branch… | --- | Copy Branch Name to Clipboard
```

Local branch `main`, checked out:

```
Focus this branch | Compare with… | --- | Configure Upstream… | Create Worktree… | Push Branch… |
Pull Branch… | Rename Branch… | --- | Copy Branch Name to Clipboard
```

Remote branch `origin/topic` (same for `isHeadBranch` `true`, and for `origin/HEAD`):

```
Focus this branch | Compare with… | --- | Move the current branch onto this (rebase)… |
Create Worktree… | Delete Remote Branch… | Fetch… | Checkout Branch… | --- |
Copy Branch Name to Clipboard
```

Tag `v1.0` (same for `isHeadBranch` `true`):

```
Compare with… | --- | Delete Tag… | Push Tag… | Delete Remote Tag… | --- | Copy Tag Name to Clipboard
```

Under the tests' l10n stand-in the same lists read `addTag…`, `createBranch…`, …, `compareWith`,
`bisectChooseGood`, `bisectChooseBad`, `copyCommitHash`; `focusThisBranch`, `configureUpstream…`,
…, `checkoutBranch` (local) / `checkoutBranch…` (remote), `copyBranchName`, `copyTagName`.

### 4.2 Source keys

| Call                                                                | Result                                            |
| ------------------------------------------------------------------- | ------------------------------------------------- |
| `commitMenuSource("0123456789abcdef0123456789abcdef01234567")`      | `commit:0123456789abcdef0123456789abcdef01234567` |
| `refMenuSource({ type: "head", name: "feature/x", hash })`          | `ref:head:feature/x`                              |
| `refMenuSource({ type: "remote", name: "origin/feature/x", hash })` | `ref:remote:origin/feature/x`                     |
| `refMenuSource({ type: "tag", name: "v1.0", hash })`                | `ref:tag:v1.0`                                    |

### 4.3 Dialog messages as rendered HTML

| Entry                    | Rendered question                                                                                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Add Tag…                 | `Add tag to commit <b><i>01234567</i></b>`                                                                                                                                                                               |
| Create Branch…           | `Enter the name of the branch <b><i>01234567</i></b>`                                                                                                                                                                    |
| Checkout…                | `Are you sure you want to checkout commit <b><i>01234567</i></b>? This will result in a 'detached HEAD' state.` + explanation line (`<span class="mt-2 block text-xs text-muted">You can build and test here. …</span>`) |
| Cherry Pick…             | `Are you sure you want to cherry pick commit <b><i>01234567</i></b>?`                                                                                                                                                    |
| Merge (commit)           | `Are you sure you want to merge <b><i>01234567</i></b> into <b>the current branch</b>?`                                                                                                                                  |
| Reset…                   | `Are you sure you want to reset <b>the current branch</b> to commit <b><i>01234567</i></b>?` + explanation line (`Soft and mixed keep your files. …`)                                                                    |
| Rename Branch… (`topic`) | `Enter the new name for the branch <b><i>topic</i></b>:`                                                                                                                                                                 |
| Delete Branch… (`topic`) | `Are you sure you want to delete the branch <b><i>topic</i></b>?` + explanation line (`The commits stay in the repository for a while. …`)                                                                               |
| Merge (branch `topic`)   | `Are you sure you want to merge <b><i>topic</i></b> into <b>the current branch</b>?`                                                                                                                                     |
| Delete Tag… (`v1.0`)     | `Are you sure you want to delete the tag <b><i>v1.0</i></b>?`                                                                                                                                                            |

The explanation line's class names come from the `Explain` component; only the use of `Explain`
matters here.

### 4.4 Inputs and payloads

Merge commit, **Cherry Pick…**: inputs
`[{ kind: "select", value: "1", options: [{ label: "aaaaaaaa: First parent msg", value: "1" }, { label: "bbbbbbbb", value: "2" }] }]`.
Submitting `["2"]` sends
`{ command: "cherrypickCommit", commitHash: "0123…4567", parentIndex: 2, requestId: <id>, repo: "/repo" }`.

Octopus commit with a third parent `cccccccc…` whose message is "Third: with colon": options
labels `aaaaaaaa: First`, `bbbbbbbb`, `cccccccc: Third: with colon`, values `"1"`, `"2"`, `"3"`;
submitting `["3"]` sends `parentIndex: 3`.

Ordinary or root commit, **Cherry Pick…** / **Revert…**: no inputs; submit sends
`{ command: "cherrypickCommit" | "revertCommit", commitHash, parentIndex: 0, requestId, repo }`.

| Entry                    | Submitted values                       | Message posted to the extension                                                                                                         |
| ------------------------ | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Add Tag…                 | `["v2", "annotated", "Release notes"]` | `{ command: "addTag", tagName: "v2", commitHash: "0123…4567", lightweight: false, message: "Release notes", requestId, repo: "/repo" }` |
| Add Tag…                 | `["v3", "lightweight", "ignored?"]`    | `{ command: "addTag", tagName: "v3", commitHash, lightweight: true, message: "ignored?", requestId, repo }`                             |
| Create Branch…           | `["feature/new"]`                      | `{ command: "createBranch", branchName: "feature/new", commitHash, requestId, repo }`                                                   |
| Checkout…                | `[]`                                   | `{ command: "checkoutCommit", commitHash, requestId, repo }`                                                                            |
| Merge (commit)           | `[true]` / `[false]`                   | `{ command: "mergeCommit", commitHash, createNewCommit: true / false, requestId, repo }`                                                |
| Reset…                   | `["soft"]`, `["mixed"]`, `["hard"]`    | `{ command: "resetToCommit", commitHash, resetMode: "soft" / "mixed" / "hard", requestId, repo }`                                       |
| Rename Branch… (`topic`) | `["topic2"]`                           | `{ command: "renameBranch", oldName: "topic", newName: "topic2", requestId, repo }`                                                     |
| Delete Branch… (`topic`) | `[false]` / `[true]`                   | `{ command: "deleteBranch", branchName: "topic", forceDelete: false / true, requestId, repo }`                                          |
| Merge (branch `topic`)   | `[true]`                               | `{ command: "mergeBranch", branchName: "topic", createNewCommit: true, requestId, repo }`                                               |
| Delete Tag… (`v1.0`)     | `[]`                                   | `{ command: "deleteTag", tagName: "v1.0", requestId, repo }`                                                                            |

After each submit the form was replaced by the "running" dialog of that command.

### 4.5 Entries that act without their own form

| Entry                                                       | First message posted (or effect)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Checkout Branch (local `topic`)                             | `{ command: "checkoutBranch", branchName: "topic", remoteBranch: null, requestId, repo: "/repo" }`; running dialog "Checkout Branch"                                                                                                                                                                                                                                                                                                                                                                                                      |
| Checkout Branch… (remote `origin/topic`)                    | `{ command: "loadRemotes", repo: "/repo", requestId: "remote-<n>", branchName: null }`; running dialog "Loading remotes". After remotes `["origin"]` arrive: form with `[{ kind: "ref", value: "topic" }, { kind: "checkbox", label: "Fetch the latest remote revision before checkout", value: true }]`, submit "Checkout Branch", source `ref:remote:origin/topic`; submitting `["topic", false]` sends `{ command: "checkoutBranch", branchName: "topic", remoteBranch: "origin/topic", fetch: false, requestId: "remote-<n>", repo }` |
| Push Branch… (`topic`)                                      | `loadRemotes` with `branchName: "topic"`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Pull Branch… (`main`, checked out)                          | `loadRemotes` with `branchName: "main"`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Delete Remote Branch…, Fetch… (remote)                      | `loadRemotes` with `branchName: null`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Push Tag…, Delete Remote Tag… (`v1.0`)                      | `loadRemotes` with `branchName: null`; the follow-up forms read "Push Tag: **v1.0**" / "Delete Remote Tag: **v1.0**"                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Fetch… then submit `["origin", true]`                       | `{ command: "fetchRemote", remote: "origin", prune: true, … }`; `["", false]` gives `remote: null, prune: false`                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Focus this branch (local `topic`)                           | focus target becomes `topic`, display switches from "filter" to "focus"; no checkout                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Focus this branch (remote `origin/topic`)                   | focus target becomes `remotes/origin/topic`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Compare with… (any)                                         | wide content dialog "Compare Revisions" with left `HEAD`, right = the commit's or ref's full hash                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Edit commits after this (interactive rebase)…               | `{ command: "repositoryQuery", query: { kind: "rebasePlan", base: <full hash>, autosquash: false }, … }`                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Fold staged changes into this commit (fixup)…               | `{ command: "repositoryQuery", query: { kind: "stagedPlan", target: <full hash> }, … }`                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Configure Upstream…                                         | `{ command: "repositoryQuery", query: { kind: "state" }, … }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Create Worktree… (local `topic` / remote `origin/topic`)    | form whose "Start Point (for a new branch)" is `refs/heads/topic` / `refs/remotes/origin/topic`; submitting sends `repositoryAction` `{ kind: "addWorktree", path, branch, newBranch, startPoint }`                                                                                                                                                                                                                                                                                                                                       |
| Move the current branch onto this (rebase)… (HEAD = `main`) | confirmation "Rebase **main** onto **refs/heads/topic**? …" (or `refs/remotes/origin/topic`), submit "Start Rebase"; submit sends `repositoryAction` `{ kind: "rebase", branch: "main", onto: "refs/heads/topic", expectedHead: <HEAD hash> }`. With detached HEAD: error dialog "Unable to complete Git operation"                                                                                                                                                                                                                       |
| Use as Good / Bad Bisect Commit                             | content dialog "Find a Regression (Bisect)"; nothing posted                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Copy … to Clipboard                                         | RPC request `{ kind: "rpc.request", method: "clipboard.copy", params: <full hash / "topic" / "origin/topic" / "v1.0">, id }`. When the extension answers `false`, error dialog "Unable to Copy Commit Hash to Clipboard" / "Unable to Copy Branch Name to Clipboard" / "Unable to Copy Tag Name to Clipboard"                                                                                                                                                                                                                             |
| `checkoutBranchAction` on tag `v1.0`                        | nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

---

## 5. Non-functional requirements

### 5.1 Building menus is pure

Building any menu (`commitMenu`, `refMenu`) must not post a message, open or close a dialog,
change a store, or touch the clipboard. Observed: building a merge commit's menu, both local-branch
variants, a remote menu and a tag menu posted nothing and left the dialog and context-menu stores
`null`. Callers build menus lazily at the moment the menu opens, and may build them repeatedly.

### 5.2 Fresh results

Each call returns a new array; callers append entries to the commit menu (a separator and file
entries) and must be able to do so without affecting later calls.

### 5.3 Source keys are cheap and pure

`commitMenuSource` and `refMenuSource` are called during rendering for every commit row and every
ref label (thousands in `RefsScale.test.ts` / `RefsTiming.test.ts`). They must be pure string
functions with no store reads.

### 5.4 Loading the module

Importing the module must have no side effects and must not read `window.l10n`: several tests
import it before they install `window.l10n` (`clipboard.test.ts`, `branch-focus.test.ts` import
it statically; `remote-actions.test.ts` installs `window.l10n` in `beforeEach`, after the import).
Strings must be read when a menu is built or an entry is clicked.

### 5.5 Stable titles

Tests find entries by exact title (`key` or `key…` under the stand-in) and the UI harness finds
menu items by their trimmed English text. Titles must match §3.3/§3.4 character for character,
including U+2026.

### 5.6 Repository checks the file must pass

- `pnpm run test:coverage` enforces at least 80% **function** coverage of
  `src/webview/lib/menus.tsx` from the webview test project (currently about 95%; not reached by
  any test: the tag's copy entry, the tag case of `checkoutBranchAction`, and the rendering of
  emphasis, since no webview test renders a menu dialog's question to the DOM). Every function the
  new file defines counts, including every entry's click handler, so an implementation with many
  untested handlers can fail the threshold; adding the tests in §6.2
  keeps it safe.
- `pnpm run lint` (oxlint), including the custom rule in `oxlint/webview-text.cjs` that rejects
  user-visible text not taken from `window.l10n` (text with no letters, such as `…` or `: `, is
  allowed) and the alphabetised, grouped import-order rule.
- `pnpm run typecheck`, which also type-checks the tests: they use `typeof import(...)` on the
  exports and `ReturnType<typeof commitMenu>`.

### 5.7 Other things callers rely on

- Dialog source keys (§3.1 rule 6) keep the originating row or label highlighted while its dialog
  is open.
- Destructive dialogs (Reset, Delete Branch, Delete Tag) must pass the destructive flag: the Dialog
  tests and the UI harness hold Enter on these menu items and expect focus on Cancel and nothing
  sent.
- The selects of Reset and of the merge-parent choice have no label, so the dialog names them by
  its question (checked by `Dialog.test.ts`).
- No entry throws, for any `GitRef` or `GitCommitNode` shape the types allow.

---

## 6. Test coverage

### 6.1 What the existing tests check

`tests/webview/lib/menus.test.ts`

- Cherry-pick and revert on a commit with 0 or 1 parents: form has no inputs; submit sends the
  command with `commitHash` and `parentIndex: 0` (full payload compared with `toEqual`).
- Cherry-pick and revert on a two-parent commit with an empty `messages` map: exactly one select
  `{ kind: "select", value: "1", options: [{ label: "parent-1", value: "1" }, { label: "parent-2", value: "2" }] }`
  with no label; submitting `["2"]` sends `parentIndex: 2`.
- `checkoutBranchAction` on remote refs (`origin/main`, `origin/feature/navigation`,
  `team/origin/feature/navigation`): posts `loadRemotes`, and the resulting form and submit payload
  (mostly behaviour of `remote-actions`).

`tests/webview/lib/menu-actions.test.ts`

- Add Tag: lightweight vs annotated payloads (`lightweight`, `message`, `tagName`, `commitHash`).
- Create Branch, Checkout (commit), Merge (checkbox initially `true`; `createNewCommit: false`),
  Reset (select initially `"mixed"`, destructive, `resetMode` soft/hard) payloads.
- Commit entries `interactiveRebase…`, `createFixupMenu…`, `compareWith`, `bisectChooseGood`,
  `bisectChooseBad`, `copyCommitHash` each post something or open a dialog (does not check what).
- Tag: `deleteTag…` destructive with `deleteTag` payload; `pushTag…` and `deleteRemoteTag…` post
  `loadRemotes`.
- Local branch: rename, delete (checkbox initially `false`, destructive, `forceDelete: true`),
  merge (`mergeBranch`), `checkoutBranch` (sends `checkoutBranch` with `remoteBranch: null`).
- Checked-out branch lacks `checkoutBranch`, `merge…`, `deleteBranch…` and has `pullBranch…`.
- Branch tools `focusThisBranch`, `configureUpstream…`, `addWorktree…`, `rebaseOnto…`,
  `pushBranch…`, `pullBranch…` (current), `compareWith`, `copyBranchName` each do something.
- Remote branch: `checkoutBranch…`, `deleteRemoteBranch…`, `fetch…` post `loadRemotes`;
  `rebaseOnto…`, `addWorktree…`, `compareWith`, `focusThisBranch`, `copyBranchName` do something.

`tests/webview/lib/actions/clipboard.test.ts`

- `copyCommitHash` sends the RPC `clipboard.copy` with the full hash; a `false` answer opens the
  error dialog.

`tests/webview/lib/remote-actions.test.ts`

- `pushBranch…` on local branches whether current or not; `pullBranch…` only on the current one.

`tests/webview/lib/branch-focus.test.ts`

- `focusThisBranch` on a local branch sets the focus target to its name without checking out; the
  tag menu has no `focusThisBranch`; on a remote branch the target is `remotes/origin/topic` and a
  hidden remote is revealed.

`tests/webview/components/ui/Dialog.test.ts`

- The unlabelled selects of Reset (ordinary commit) and of Cherry Pick / Revert (merge commit) are
  named by text inside the dialog.
- Holding Enter on `deleteTag…`, `deleteBranch…` and `reset…` opens a destructive form with focus
  on Cancel and sends nothing; a fresh submit sends exactly one message.

Source-key formats: `CommitRow.test.ts` (`commit:abc123456789`), `RefsPane.test.ts`
(`ref:head:main`), `RefsScale.test.ts` / `RefsTiming.test.ts` (hard-coded `ref:head:branch-3`,
`ref:tag:tag-7`, `ref:tag:tag-<n>`), `hints.test.ts` (`commit:` prefix).

UI harness `tests-ext/ui/history.test.cjs` (real English text, needs a VS Code run): clicks "Focus
this branch", "Push Tag…", "Delete Remote Tag…", "Delete Tag…" (then the "Yes" button),
"Merge into current branch…" (then "Yes, merge"), "Edit commits after this (interactive rebase)…",
"Fold staged changes into this commit (fixup)…", "Push Branch…", "Pull Branch…", "Use as Good
Bisect Commit"; holds Enter on "Delete Tag…", "Delete Branch…", "Reset current branch to this
Commit…", "Delete Remote Branch…" and expects Cancel to be focused. It also reaches "Yes" from
Cancel in the Delete Tag dialog with eight Tab presses, which assumes the dialog adds no focusable
elements of its own (no inputs).

### 6.2 Gaps, with the test to add

Each case assumes the tests' stand-in l10n (titles are key names) unless it says otherwise,
selected repository `/repo`, and a 40-character hash `H` (short hash = first 8 characters).

1. **Full commit-menu order.** Input: `commitMenu({ …, hash: H, parentHashes: ["p"] }, new Map())`.
   Expected titles (null as `null`): `addTag…, createBranch…, null, checkout…, cherryPick…,
revert…, null, merge…, reset…, null, interactiveRebase…, createFixupMenu…, compareWith,
bisectChooseGood, bisectChooseBad, copyCommitHash`. Same list for 0 and 2 parents.
2. **Local-branch order.** `refMenu({ type: "head", name: "topic", hash: H }, false)` →
   `focusThisBranch, compareWith, null, configureUpstream…, addWorktree…, rebaseOnto…,
checkoutBranch, pushBranch…, renameBranch…, deleteBranch…, merge…, null, copyBranchName`.
3. **Checked-out branch order.** `refMenu({ type: "head", name: "main", hash: H }, true)` →
   `focusThisBranch, compareWith, null, configureUpstream…, addWorktree…, pushBranch…,
pullBranch…, renameBranch…, null, copyBranchName`.
4. **Remote order, `isHeadBranch` ignored.** `refMenu({ type: "remote", name: "origin/topic", hash: H }, b)`
   for `b` = false and true → `focusThisBranch, compareWith, null, rebaseOnto…, addWorktree…,
deleteRemoteBranch…, fetch…, checkoutBranch…, null, copyBranchName`.
5. **Tag order, `isHeadBranch` ignored.** `refMenu({ type: "tag", name: "v1", hash: H }, b)` →
   `compareWith, null, deleteTag…, pushTag…, deleteRemoteTag…, null, copyTagName`.
6. **Building sends nothing.** Build all menus of cases 1–5 → `postMessage` not called, `dialog`
   and `contextMenu` stores still `null`.
7. **Dialog source keys.** Click Add Tag / Create Branch / Checkout / Cherry Pick / Revert / Merge /
   Reset on the commit → each form's `source` is `commit:H`. Rename / Delete / Merge on local
   `topic` → `ref:head:topic`. Delete Tag on `v1` → `ref:tag:v1`.
8. **Destructive flags are exact.** Add Tag, Create Branch, Checkout, Cherry Pick, Revert, Merge
   (commit and branch), Rename → `destructive` false; Reset, Delete Branch, Delete Tag → true.
9. **Submit labels.** Forms' `action`: Add Tag → `dialogAddTagSubmit`; Create Branch →
   `dialogCreateBranchSubmit`; Checkout → `dialogYes`; Cherry Pick → `dialogYesCherryPick`;
   Revert → `dialogYesRevert`; Merge (both) → `dialogYesMerge`; Reset → `dialogYesReset`; Rename →
   `dialogRenameBranchSubmit`; Delete Branch → `deleteBranch`; Delete Tag → `dialogYes`.
10. **Add Tag inputs.** Expected exactly:
    `[{ kind: "ref", label: "dialogAddTagName", value: "" }, { kind: "select", label: "dialogAddTagType", value: "annotated", options: [{ label: "dialogAddTagTypeAnnotated", value: "annotated" }, { label: "dialogAddTagTypeLightweight", value: "lightweight" }] }, { kind: "text", label: "dialogAddTagMessage", value: "", placeholder: "dialogAddTagOptional" }]`.
11. **Create Branch / Rename inputs.** Create Branch → `[{ kind: "ref", value: "" }]`; Rename on
    `topic` → `[{ kind: "ref", value: "topic" }]`.
12. **Reset options.** Options values in order `soft, mixed, hard` with labels
    `dialogResetSoft, dialogResetMixed, dialogResetHard`; no `label` on the select. Also submit
    `["mixed"]` → `resetMode: "mixed"`.
13. **Merge-parent labels from `messages`.** Commit with parents `P1`, `P2`, `P3`; `messages` =
    `{ P1: "First", P3: "Third: x" }` → option labels: the first 8 characters of `P1` followed by `: First`; the first 8
    characters of `P2` alone; the first 8 characters of `P3` followed by `: Third: x`; values `"1"`, `"2"`, `"3"`; submitting `["3"]` → `parentIndex: 3`.
14. **Messages render with emphasis.** Render the Reset form's `message` into a DOM node (real
    English strings or the stand-in) → contains a `b > i` element whose text is the short hash, a
    `b` element (without `i`) whose text is `labelCurrentBranch`, and the `explainReset` text after
    the question. Similarly: Delete Branch contains `b > i` = `topic`, plain `labelBranch`, and
    `explainDeleteBranch`; Checkout contains `explainDetachedHead`; Delete Tag has `b > i` = `v1`
    and no explanation line.
15. **Tool arguments.** With a selected repository: Interactive Rebase posts `repositoryQuery`
    `{ kind: "rebasePlan", base: H, autosquash: false }`; Fixup posts `{ kind: "stagedPlan",
target: H }`; Compare opens a content dialog whose content has `left: "HEAD"`, `right: H`
    (and `right` = the ref's `hash` for ref menus); Create Worktree on `topic` / `origin/topic`
    prefills the start point with `refs/heads/topic` / `refs/remotes/origin/topic`; with
    `headBranch = "main"` and a `commitHead`, Rebase on `topic` / `origin/topic` opens a form whose
    submit sends `repositoryAction` with `onto: "refs/heads/topic"` / `"refs/remotes/origin/topic"`.
16. **Remote-flow arguments.** Push Branch on `topic` → `loadRemotes` with `branchName: "topic"`;
    Pull Branch on current `main` → `branchName: "main"`; after answering `loadRemotes` with
    `["origin", "upstream"]`: Fetch on `origin/topic` preselects `origin` and the form's `source`
    is `null`; Push Tag on `v1` shows a form whose message text contains `v1`; Delete Remote
    Branch on `origin/topic` preselects `origin` and the confirmation deletes name `topic`.
17. **Copy entries.** Copy on remote `origin/topic` → RPC params `"origin/topic"`; Copy Tag Name
    on `v1` → params `"v1"`; a `false` answer to each opens the error dialog (with real English
    strings: "Unable to Copy Branch Name to Clipboard" / "Unable to Copy Tag Name to Clipboard").
18. **`checkoutBranchAction` on a tag** → no message posted, `dialog` stays `null`.
19. **`checkoutBranchAction` on a local branch** → exactly one message
    `{ command: "checkoutBranch", branchName: "topic", remoteBranch: null, repo: "/repo", requestId: any string }`
    and no `fetch` field.
20. **Repository changes while a dialog is open.** Open Create Branch, change the
    selected repository, submit → nothing posted and the dialog closes (guards the use of
    `openFormDialog` rather than sending directly).
21. **English titles.** With real English strings, the five lists in §4.1 match exactly (guards
    the ellipsis rules: none on `compareWith` beyond its own, none on the bisect, focus, copy and
    local checkout entries).

---

## 7. Questions

1. **Remote branches cannot be merged from their menu.** Local branches offer "Merge into current
   branch…", remote-tracking branches do not, although merging e.g. `origin/main` after a fetch is
   common and `mergeBranch` takes a branch name. Intended omission, or should the remote menu
   offer Merge too?
2. **Remote HEAD refs are not distinguished.** A ref such as `origin/HEAD` would get "Delete Remote
   Branch…", "Checkout Branch…" (suggesting a local branch named `HEAD`) and "Rebase". Whether such
   refs ever reach the menu depends on the backend; if they can, should they get a reduced menu?
3. **Branches checked out in another worktree.** The Branches pane hides its inline Checkout button
   for them, but the menu still offers "Checkout Branch", "Delete Branch…" and "Rename Branch…",
   which Git refuses or which affect the other worktree. Should the menu know about worktrees?
4. **`checkoutBranchAction` on the checked-out branch** (reachable by double-clicking the current
   branch's label) sends `checkoutBranch` anyway. Should it do nothing in that case, or is that
   the caller's job?
5. **Inconsistent ellipsis convention.** "Use as Good/Bad Bisect Commit" open a dialog but have no
   ellipsis; "Compare with…" carries its ellipsis inside the translated string while every other
   entry has it appended, so a translation that drops it would lose it. Intended?
6. **Different order of the shared entries.** Local menu: Configure Upstream, Create Worktree,
   Rebase, Checkout, …; remote menu: Rebase, Create Worktree, Delete, Fetch, Checkout. Rebase and
   Create Worktree swap places and Checkout sits in different positions. Deliberate?
7. **Lightweight tags still send the message field.** With "Lightweight" chosen, whatever was typed
   in "Message" is sent (`lightweight: true, message: "…"`); the dialog neither clears nor
   disables it. Should the message be sent empty (or the field hidden) for lightweight tags?
8. **Create Branch question wording.** "Enter the name of the branch 01234567" reads as if the
   branch were called by the hash; it looks like a shortened form of "…the branch to create at
   commit {0}". The rename question ends with a colon, this one does not. Text problem only (the
   key lives in the l10n files), but worth confirming.
9. **Confirmation button labels differ between similar dialogs.** Delete Tag and Checkout confirm
   with a bare "Yes"; Delete Branch confirms with "Delete Branch"; others say "Yes, merge",
   "Yes, reset", …. Intended?
10. **Rename sends unchanged names.** Submitting the rename form without editing sends
    `renameBranch` with `oldName` = `newName`, whereas the Configure Upstream dialog skips an
    unchanged submit. Should an unchanged rename be a no-op?
11. **Compare uses the ref's hash, not its name.** "Compare with…" on a branch or tag opens the
    comparison with the 40-character hash on the right, not `topic` or `v1.0`, so the comparison
    view does not show the ref's name and will not follow the branch if it moves. For an annotated
    tag, whether `hash` is the tag object or the commit depends on the backend. Intended?
12. **Rebase confirmation shows full ref names** ("onto refs/heads/topic",
    "refs/remotes/origin/topic") where every other dialog uses short names. Deliberate
    disambiguation, or should the short name be shown while the full ref is sent?
13. **Dialogs that lose the row highlight.** Dialogs opened directly by this module keep their
    element highlighted through the source key, but the Create Worktree, Rebase, Push Tag, Delete
    Remote Tag, Delete Remote Branch and Fetch dialogs (opened by shared openers) carry no source,
    so the label stops showing its "menu open" state, while Configure Upstream, Push, Pull and
    remote Checkout keep it. Should all dialogs started from a ref menu carry the ref's key?
14. **Commit actions ignore HEAD state.** "Merge into current branch…" and "Reset current branch to
    this Commit…" are offered on every commit, including HEAD itself and when HEAD is detached
    (the question still says "the current branch"); Rebase alone reports a detached HEAD. Should
    the commit menu hide or adjust these entries in those states?
15. **Fetch on a remote branch fetches the whole remote.** The entry sits on one branch but the
    form preselects the branch's remote and fetches all of it (or all remotes). Is a
    single-branch fetch intended, or is the label enough?

---

## 8. Decisions on §7 (from the project maintainer's side)

These decisions replace the "current behaviour" wherever they differ. Build to these, and test the decided behaviour.

- **Q1: keep.** Remote-tracking branches get no Merge entry.
- **Q2: a remote's HEAD gets a reduced menu.** A remote ref whose name ends in `/HEAD` (such as `origin/HEAD` or `team/origin/HEAD`) is the remote's symbolic default-branch pointer, not a branch; the branch lists never include it, but commit-row labels can. Its menu is, in order: Compare with…, separator, Move the current branch onto this (rebase)…, Create Worktree…, Fetch…, separator, Copy Branch Name to Clipboard. It has no Focus this branch, Delete Remote Branch… or Checkout Branch… entry, and `checkoutBranchAction` does nothing for it, as for a tag. A remote branch whose last segment merely contains `HEAD` (such as `origin/HEADS` or `origin/x-HEAD`) is an ordinary remote branch.
- **Q3: keep.** The menu does not know about worktrees.
- **Q4: keep.** `checkoutBranchAction` on a local branch always sends the checkout; callers decide whether to offer it.
- **Q5: keep.** Titles stay exactly as §3.3, §3.4 and §4.1 give them.
- **Q6: keep.** Entry order stays as given.
- **Q7: lightweight tags send an empty message.** When the tag type is lightweight, `message` is `""` whatever was typed; an annotated tag sends the message as entered. The inputs are unchanged.
- **Q8: out of scope.** Localized text is not changed here.
- **Q9: keep.** Submit labels stay as given.
- **Q10: an unchanged rename sends nothing.** When the submitted name equals the current name exactly, the dialog closes (with `closeDialog` from `@/webview/lib/actions`) and no command is sent. Any other value is sent as entered.
- **Q11: keep.** Compare uses the ref's hash.
- **Q12: out of scope.** The rebase confirmation belongs to `RebaseEditor`.
- **Q13: out of scope.** The shared openers choose their own source keys.
- **Q14: keep.** Merge and Reset are offered on every commit.
- **Q15: keep.** Fetch fetches the whole remote.
