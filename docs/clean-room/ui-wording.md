# Clean-room specification: inherited UI wording

This document describes every piece of user-interface text that Branchwise still carries from the upstream projects, so that it can be written again in new words. It is written for an implementer who will never see the current wording. They will write new English text, and new Simplified Chinese (zh-cn) and Traditional Chinese (zh-tw) translations, from this document alone. It also specifies `scripts/check-l10n.js`, which the implementer will delete unread and write again.

The document never quotes an inherited string, in English or in Chinese. It says where each string appears, what it must tell the user, what fills its placeholders, and what constrains it. Strings that Branchwise wrote itself are quoted freely, as models of tone.

| Part | Content                                                                      |
| ---- | ---------------------------------------------------------------------------- |
| 0    | How this was derived                                                         |
| 1    | Overview, scope and rules                                                    |
| 2    | One entry per inherited string, grouped as the source file groups them       |
| 3    | Behaviour of `scripts/check-l10n.js`                                         |
| 4    | English style guide, from Branchwise's own strings                           |
| 5    | zh-cn and zh-tw glossary and conventions, from Branchwise's own translations |
| 6    | Every other file that quotes or depends on an inherited string               |
| 7    | Questions for the maintainer, numbered `wording Q1`, `wording Q2`, and so on |

---

## 0. How this was derived

- Repository at commit `99aa24b`, Node v22.22.2, Git 2.55 first in `PATH`.
- `node scripts/provenance.cjs --lines <file>` listed the inherited lines of each file in scope:

  | File                                    | Inherited lines | Of which strings                                                                                     |
  | --------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------- |
  | `src/old-extension/l10n/webviewL10n.ts` | 122             | 102 property entries (two of them span two lines); the other 18 lines are comments and the signature |
  | `package.nls.json`                      | 17              | 17 values                                                                                            |
  | `package.nls.zh-cn.json`                | 21              | the same 17, plus 4 whose English is Branchwise's own                                                |
  | `package.nls.zh-tw.json`                | 21              | as zh-cn                                                                                             |
  | `l10n/bundle.l10n.json`                 | 100             | see below                                                                                            |
  | `l10n/bundle.l10n.zh-cn.json`           | 100             | the translations of the same 100 keys                                                                |
  | `l10n/bundle.l10n.zh-tw.json`           | 100             | as zh-cn                                                                                             |
  | `scripts/check-l10n.js`                 | 52              | the whole script                                                                                     |

- The 102 webview entries hold 99 distinct English strings, because three pairs of keys share one string (§1.4). The bundles hold those 99 strings plus the two diff titles of `src/old-extension/messageHandler.ts` lines 54–55, which blame attributes to Branchwise in the `.ts` file but to upstream in the bundles. That makes 101 inherited bundle keys. Blame flags 100 of them: the key used by `tooltipDeletions` is not flagged in any bundle, presumably because its line now ends with a comma where upstream's did not. It is inherited all the same and is in scope.
- Where each string appears was established by reading the components and handlers that read `window.l10n` (`src/webview/**`) and the extension host code. Every key was searched for in `src/`, including computed lookups (`window.l10n[...]` in `lib/activity.ts` and `lib/handler/action-result.ts`).
- The behaviour of `scripts/check-l10n.js` was observed by running it on the real bundles (it prints two passing lines, 497 of 497 keys) and by running a scratch copy against hand-made bundles in a directory outside the repository.
- Files that quote inherited strings were found by searching the whole tree (except `CHANGELOG.md`, `node_modules`, `out`, `tests-ext/out`, `test-results`, `.vscode-test`) for each string, and each hit was then read to drop coincidences such as a fixture author called by a common word.
- No repository file other than this one was changed.

---

## 1. Overview, scope and rules

### 1.1 What is reworded, and why

Branchwise is replacing every line it inherited from Git Graph and asispts/neo-git-graph (see [docs/provenance.md](../provenance.md)). Code is replaced by clean-room rewrites. User-interface text cannot be "reimplemented" the same way, so it is reworded: the same information, in new words, with new translations. This covers:

1. The 102 inherited entries of the webview strings table, `src/old-extension/l10n/webviewL10n.ts` (§2.1 to §2.8).
2. The two diff-title strings in `src/old-extension/messageHandler.ts` lines 54–55 (§2.10).
3. The 17 inherited setting descriptions in `package.nls.json` and their translations, plus 4 zh-only settings translations (§2.9).
4. The matching entries of the three `l10n/bundle.l10n*.json` bundles, which follow from items 1 and 2.
5. `scripts/check-l10n.js` (§3), which is code, and is rewritten from the behaviour described here.
6. The 18 non-string lines of `webviewL10n.ts` (§1.7).

### 1.2 The files and how they relate

- `src/old-extension/l10n/webviewL10n.ts` exports `getWebviewLocalizedStrings()`, which returns one object: the entries of `repositoryL10n.ts`, `historyL10n.ts` and `workflowL10n.ts` spread first, then its own. Each entry is `key: vscode.l10n.t("English text")`. The extension host sends the object to the page in the answer to the `webview.initialize` RPC; the page stores it as `window.l10n`, and components read `window.l10n.<key>`. The type `LocalizedStrings` is the return type of the function.
- `l10n/bundle.l10n.json` is generated from the source by `pnpm run l10n:export` (`vscode-l10n-dev export`, then `oxfmt`). Its keys and values are the English strings, in order of first appearance. It is never edited by hand; CI fails if the committed file differs from a fresh export.
- `l10n/bundle.l10n.zh-cn.json` and `l10n/bundle.l10n.zh-tw.json` map each English string to its translation. They are edited by hand.
- `package.json` refers to setting descriptions as `%config.<name>%`; `package.nls.json` holds the English, and `package.nls.zh-cn.json` / `package.nls.zh-tw.json` the translations, all keyed by the same names.
- `src/old-extension/messageHandler.ts` calls `vscode.l10n.t` in the extension host for the two diff titles.

### 1.3 Rules for the new text

1. **Same information.** Each new string must tell the user everything the entry in §2 lists, and nothing that is false. Where §2 notes that the current text is imprecise, the entry says what is true; how far to follow it is a maintainer decision (§7).
2. **Placeholders.** Keep every `{0}`, `{1}` of a string, each exactly once unless §2 says otherwise, with the same meaning. They may move within the sentence, and translations may order them differently. No placeholder may be added.
3. **Keys unchanged.** Property keys of the strings table (for example `dialogResetSoft`) and `package.nls` keys (for example `config.dateFormat.dateTime`) stay exactly as they are. The webview code, already rewritten, reads the property keys, some of them through computed names (§1.6). The function name `getWebviewLocalizedStrings`, the type name `LocalizedStrings` and the three spread calls stay too.
4. **Literal form.** Each entry stays `key: vscode.l10n.t("…")` with a single, double-quoted string literal as the only argument. `vscode-l10n-dev export` extracts only plain literals, and the test `tests/webview/lib/menu-text.test.ts` builds its English table by matching exactly this pattern with a double-quoted literal, so an entry written with single quotes or a template literal would be missing from that test. Inside the literal, a double quote must be escaped. The messageHandler calls keep the form `vscode.l10n.t("…", hash)`: several test mocks of `t` replace `{0}` with the second argument and nothing else.
5. **No markup.** Strings are plain text. Bold and italic come from code (§1.5); HTML in a string would be shown literally.
6. **No trailing ellipsis on menu titles or running-status text.** Code appends `…` to menu entries that open a dialog, and ` ...` to the message of a running dialog (§1.5). The strings themselves must not end with an ellipsis.
7. **Bundle upkeep.** After changing the English, run `pnpm run l10n:export`, then in both zh bundles delete the entries whose keys are the old English strings and add entries for the new ones; `pnpm run l10n:check` must pass (§3).
8. **Collisions.** The bundles are keyed by the English text, so identical English strings share one translation (§1.4). A new English string that happens to equal one of Branchwise's own strings (for example `"Merge"`, `"Save"`, `"Remote"`) will share that string's translation in both locales; check that the translation fits every place it then appears.
9. **Coincidences.** A new line that happens to equal an upstream line exactly (a single common word is the likely case) is still counted as inherited by `pnpm run provenance`. See wording Q1.

### 1.4 Keys that share an English string

| English shared by                                      | Consequence                                                                                                                                                                       |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `addTag` and `dialogAddTagSubmit`                      | One bundle key and one translation today. If the new texts differ, each gets its own bundle key.                                                                                  |
| `createBranch` and `dialogCreateBranchSubmit`          | as above                                                                                                                                                                          |
| `renameBranch` and `dialogRenameBranchSubmit`          | as above                                                                                                                                                                          |
| `revert` and Branchwise's `revertOperation`            | `revertOperation` (repositoryL10n.ts) uses the same English today, so its bundle entry, and the inherited zh translations of it, stay after `revert` is reworded. See wording Q2. |
| `typeBranchName` and Branchwise's `recoveryBranchName` | as above (`recoveryBranchName` is in historyL10n.ts)                                                                                                                              |

### 1.5 How code fills and decorates the strings

The webview does not use `vscode.l10n.t` for placeholders; each caller fills them itself. The helpers differ, which matters for strings that repeat a placeholder or contain `$`:

| Helper                                                | Used for                                             | Behaviour                                                                                                                                                                                                     |
| ----------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `format(template, ...parts)` (`utils/format.ts`)      | dialog messages, `uncommittedChanges`, file tooltips | Every `{n}` becomes `parts[n]` as given: an element stays an element (bold, bold italic), a string is inserted literally. Parts no placeholder names are ignored; a placeholder without a part shows nothing. |
| `Fact` (`CommitDetails.tsx`)                          | the five commit-detail lines                         | Splits at `{0}`: the text before the first `{0}` is shown bold, then the value, then the text between the first and a second `{0}`. Anything after a second `{0}` is dropped.                                 |
| `replace("{0}", …)` in `Dialog.tsx`, `NoRepoPage.tsx` | `invalidCharacters`, `unableToInitializeRepo`        | Only the first `{0}` is replaced, literally.                                                                                                                                                                  |
| `replaceAll("{0}", …)` in `lib/actions/clipboard.ts`  | `unableToCopyToClipboard`                            | Every `{0}` is replaced, literally.                                                                                                                                                                           |
| `fill` in `Dropdown.tsx`                              | `filterPlaceholder`                                  | Every `{n}` is replaced by the n-th value; a `{n}` without a value stays as written.                                                                                                                          |

Decorations that code adds around the strings:

- **Menu titles.** `more(title)` in `lib/menus.tsx` appends `…` (U+2026) to every entry that opens a dialog. Entries that act at once get nothing.
- **Names in dialog questions.** Commit hashes and ref names are wrapped in `<b><i>…</i></b>` (bold italic) by `named()`; `labelCurrentBranch` is wrapped in `<b>` by `currentBranch()`. The strings around them are plain.
- **Explanations.** Some questions are followed by a muted line (`Explain`) holding one of Branchwise's own `explain…` strings; §2 says which.
- **Dropdown labels.** `Dropdown` shows its label followed by an ASCII colon, and uses it to name the trigger and the list.
- **Running dialogs.** `RunningBody` shows the message followed by a space and three ASCII full stops.
- **Error dialogs.** `ErrorBody` shows the title after a warning glyph; the reason, if any, follows in italics below; then the buttons Copy Error Details (Branchwise's `copyError`) and the dismiss button (`dialogDismiss`).

### 1.6 Where action labels reappear

The action labels of §2.3 are not only menu titles. `beginActivity` in `src/webview/lib/activity.ts` looks up a title for each Git action by key, and that title is shown:

- as the message of the running dialog while the action runs (followed by ` ...`),
- in the header's activity indicator while it runs,
- as the bold title of the entry in the Git Activity dialog, and as the first line of the text its Copy Error Details button copies.

The mapping, for inherited keys: `addTag`, `deleteTag`, `pushTag`, `createBranch`, `deleteBranch`, `renameBranch` and `checkoutBranch` title the commands of the same names; `checkout` titles `checkoutCommit`; `cherryPick` titles `cherrypickCommit`; `revert` titles `revertCommit`; `reset` titles `resetToCommit`; `merge` titles both `mergeBranch` and `mergeCommit`. So each of these labels must also read well standing alone as the name of an operation in progress or done.

The failure titles of §2.2 are looked up the same way, by `failureTitles` in `src/webview/lib/handler/action-result.ts`.

### 1.7 The other inherited lines of `webviewL10n.ts`

Eighteen lines of the file are not strings:

- The exported signature lines (`export function getWebviewLocalizedStrings() {`, `return {`, and the `export type LocalizedStrings = ReturnType<typeof getWebviewLocalizedStrings>;` line). Callers need them unchanged (`src/extension/handlers/initialize.ts`, `src/types/rpc.types.ts`, `src/webview/global.d.ts`, `lib/activity.ts`, `lib/handler/action-result.ts`, several tests). They will match upstream whatever the implementer does; see wording Q1.
- A block comment above the function about the table's purpose. Parts of it are out of date: it names files of the old page design that no longer exist. If the new file has such a comment, it should state the current facts: `vscode.l10n` is only available in the extension host, so the host resolves every page string and sends the object to the page in the answer to the `webview.initialize` RPC, where it becomes `window.l10n`; the three other tables are merged in first; `pnpm run l10n:export` finds the strings by their literals, so every string the page shows must be declared in one of the four tables.
- Short comments that head each group of entries, a note about relative dates, and a note on the commit-detail group. The facts behind the last two: relative dates are formatted in the page by `Intl.RelativeTimeFormat` (`src/webview/utils/date.ts`), so the table declares no time units; in a commit-detail string the value takes the place of `{0}` and the text before it is shown bold (§1.5). The implementer writes their own comments.

### 1.8 After the rewording

- Update the tests and documents listed in §6 that assert or quote the old wording.
- `pnpm run l10n:check`, `pnpm test`, `pnpm run test:ext` and the UI harness must pass.
- Record the lower counts with `pnpm run provenance --update` and log the change in [docs/provenance.md](../provenance.md), as for any rewrite.

---

## 2. The inherited strings

Groups follow the comments of `webviewL10n.ts` (UI labels, errors, actions, fragments, dialogs, status, commit details, file tooltips), then the settings descriptions and the diff titles. Each entry gives:

- **Where**: the file(s) that render it, the element, and when it shows.
- **Convey**: the facts the text must carry.
- **Placeholders**, **Composition** and **Constraints**, when there are any.
- **Now**: the capitalization and punctuation class of the current English, described without quoting it.

Unless an entry says otherwise, files are under `src/webview/`, and every key is read by the code named in **Where**. The unused keys are `portableGitHint`, `dialogPushTagConfirm` and, in practice, `pushingTag`.

### 2.1 UI labels (19 strings)

#### `repo`

- **Where**: `layout/MainHeader.tsx`, the first of the three pickers (`Dropdown`) in the header toolbar. It is the label shown before the picker's button, followed by a colon that the code adds, and it names the button and the list for assistive technology. The button shows the selected repository; the options are the repositories found in the workspace.
- **Convey**: this picker chooses which Git repository the page shows.
- **Composition**: it becomes `{0}` of `filterPlaceholder` in this picker.
- **Constraints**: a short noun, ideally one word. It never wraps (`whitespace-nowrap`) and shares one toolbar row with two other pickers and several buttons. It must read well both followed by a colon and inside `filterPlaceholder`. Named in bold by `walkthroughs/open-graph.md` line 12. `tests/extension/rpc-wire.test.ts` line 91 asserts the English.
- **Now**: one word with an initial capital. It is an abbreviation; Branchwise's own strings always spell the word out (22 strings, 0 abbreviations; wording Q9).

#### `branch`

- **Where**: (1) `layout/MainHeader.tsx`, the second header picker, with the same decorations as `repo`. Its options are `showAll` followed by every local branch and, when shown, every remote-tracking branch. (2) Branchwise's Create Worktree dialog (`components/repository/WorktreeManager.tsx`): the label of the branch-name field, which names the branch the new worktree checks out, or the branch it creates when Branchwise's "Create a new branch" box is ticked.
- **Convey**: a branch, as the name of a picker or of a field. Choosing one in the picker limits the graph to that branch's history.
- **Composition**: `{0}` of `filterPlaceholder` in the branch picker.
- **Constraints**: as `repo`. The UI harness finds the picker by this text plus a colon (`tests-ext/ui/history.test.cjs`, `headerChoice`, 6 places; `tests-ext/ui/benchmark.cjs` line 102). Named in bold by `walkthroughs/open-graph.md` line 12.
- **Now**: one word with an initial capital.

#### `showRemoteBranches`

- **Where**: (1) `layout/MainHeader.tsx`: an entry of the Settings & Tools menu (gear button). While remote branches are shown, the code puts a check mark and a space before the title. (2) `components/repository/RefsPane.tsx`: the `aria-label` of the eye button in the header of the Branches pane's Remotes section. Its pressed state (`aria-pressed`) carries the state, and its tooltip is Branchwise's `remoteBranchesShown` / `remoteBranchesHidden`.
- **Convey**: the name of the switch that makes remote-tracking branches, and the commits only they reach, appear in the graph. It names the switch, not its state: the state is shown by the check mark and the pressed state.
- **Constraints**: menu entry and accessible name of a toggle. Named by `docs/preferences.md` (lines 10 and 31) and by a comment at `src/webview/lib/stores.ts` line 82. The UI harness finds the eye button by this `aria-label` (6 places).
- **Now**: three words, each capitalized.

#### `refresh`

- **Where**: button text in four places: (1) `layout/MainHeader.tsx`, a toolbar button with a circular-arrow icon, which reloads the graph (branches, commits and repository state); (2) `components/commit/WorkingTreeDetails.tsx`, which reloads the list of changed files in the uncommitted-changes panel; (3) `components/history/WorkspacePane.tsx`, which reloads the Workspace overview; (4) `components/repository/RepositoryStatus.tsx`, beside Branchwise's "Unable to load repository details", to try that load again.
- **Convey**: read the shown information from Git again, now.
- **Constraints**: one short verb. Eleven of Branchwise's own messages tell the user to refresh something, with that verb, and at least six of them mean one of these buttons: "The branch changed. Refresh the graph and try again.", "The file's changes moved or disappeared. Refresh the graph and try again.", "This file is no longer conflicted. Refresh the graph.", "Branch focus unavailable. Refresh or select another branch.", "This submodule pointer changed or is conflicted. Refresh the workspace.", "The recorded submodule revision changed. Refresh the workspace overview.". The label should keep matching them (or they change with it). The UI harness presses the button by its text in 10 places and relies on the header's copy coming first in the page.
- **Now**: one word with an initial capital.

#### `close`

- **Where**: (1) `components/commit/CommitDetails.tsx`, `DetailsRow`: the tooltip (`title`) and `aria-label` of the icon-only X button at the top right of the panel that opens under a commit row or under the uncommitted-changes row. (2) `components/ui/Dialog.tsx`, `ContentBody`: the text of the button at the bottom of every content dialog (Git Activity, Compare Revisions, the reflog, the remote, stash and worktree managers, and others).
- **Convey**: close this panel or dialog.
- **Constraints**: one word; it is both a visible button text and an accessible name. The UI harness presses it by text in 7 places; `tests/webview/components/commit/CommitDetails.test.ts` asserts the English.
- **Now**: one word with an initial capital.

#### `loadMore`

- **Where**: (1) `layout/GraphView.tsx`: a button centred under the last commit row, shown when the repository has more commits than are loaded (and no larger page is already on its way). It loads `branchwise.loadMoreCommits` further commits (default 100). (2) `components/history/WorkflowTools.tsx`, in the push review ("Review Synchronization"): shown under the outgoing commits when they fill more than one page. It closes the dialog and shows the local branch's history in the graph.
- **Convey**: list more commits than are shown now (older ones in the graph; the rest of the outgoing commits in the review; wording Q22).
- **Constraints**: no ellipsis (it acts at once). The setting description `config.loadMoreCommits` names this button by its label in quotation marks, so the two must agree (§2.9). Named in bold by `walkthroughs/read-graph.md` line 9. `tests-ext/ui/benchmark.cjs` line 172 finds the button by exact text.
- **Now**: three words, each capitalized.

#### `showAll`

- **Where**: (1) `layout/MainHeader.tsx`: the first option of the branch picker (value `*`), which is also the picker's displayed value while chosen. (2) `components/repository/RefsPane.tsx`: the first row of the Branches pane's Local Branches section, shown while the pane's filter box is empty; selecting it does the same as the option.
- **Convey**: the choice "every branch": no branch filter and no focus.
- **Constraints**: an option text and a list row; short. Named in bold by `walkthroughs/branches-pane.md` line 5, `docs/git-actions.md` lines 13, 21 and 33 and `docs/preferences.md` line 27. The UI harness picks it by text in the branch picker and in the pane.
- **Now**: two words, each capitalized.

#### `filterPlaceholder`

- **Where**: `components/ui/Dropdown.tsx`: the placeholder of the text box at the top of an open picker list, in each of the three header pickers.
- **Convey**: typing here narrows this picker's options, and which options they are.
- **Placeholders**: `{0}` is the picker's own label: `repo`, `branch`, or Branchwise's `branchDisplay` ("View"), exactly as that string reads.
- **Composition**: `{0}` receives another localized string used as a noun. In zh, Branchwise leaves no space around a placeholder that receives localized text (§5.2).
- **Constraints**: a placeholder, so short. In the View picker the placeholder names the view modes. Tested in `tests/webview/components/ui/Dropdown.test.ts` lines 881 and 897.
- **Now**: a capitalized verb, then the placeholder, then three ASCII full stops. Branchwise's own placeholders end with the single character "…" instead: "Filter branches, tags and stashes…", "Filter repositories…", "Commit message or SHA…" (wording Q11).

#### `noResultsFound`

- **Where**: `components/ui/Dropdown.tsx`: an italic line shown instead of the option list when the filter matches no option.
- **Convey**: no option matches the typed text.
- **Constraints**: Branchwise's comparable messages are "Nothing matches this filter." (Branches pane) and "No commits match these filters." (history search).
- **Now**: a sentence ending with a full stop.

#### Column headers: `graph`, `description`, `date`, `author`, `commit`

Common to the five:

- **Where**: `components/commit/CommitTable.tsx`: the header cells of the commit table, in this order. Each header is bold, on one line, and cut off with an ellipsis when its column is too narrow.
- **Composition**: the first four also fill `{0}` of Branchwise's `resizeColumn` ("Resize {0} column"), the `aria-label` of the separator that resizes the column; zh-cn and zh-tw put the header straight into their sentence without spaces ("调整{0}列宽", "調整{0}欄寬"). So each must work as a bare noun naming the column. `commit` has no separator to its right and is not used there.
- **Constraints**: until the user resizes a column, the table sizes its columns to their contents, so a longer header makes its column wider. The narrowest a user can make a column is 40 px, or 64 px for the description column. One word each is the target. `tests/webview/components/commit/CommitTable.test.ts` lines 116–120 and 155–159 assert the English.
- **Now**: one word each, with an initial capital.

Per column:

| Key           | Column content                                                                                                                                                 | Named elsewhere                                                                                                                            |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `graph`       | The lanes and dots of the commit graph. The header cell also holds the lanes' horizontal scrollbar (Branchwise's "Scroll graph horizontally").                 | `docs/git-actions.md` line 37 ("… column", "… heading"); the UI harness (line 2307) checks that the separator's name contains the English. |
| `description` | Branch and tag labels, then the commit's summary line. The widest column. Its header holds Branchwise's "Reveal selected lane" button when the lanes overflow. | `docs/git-actions.md` line 41                                                                                                              |
| `date`        | The author date or the committer date (setting `branchwise.dateType`), formatted by `branchwise.dateFormat`; the tooltip always has day and 24-hour time.      | none                                                                                                                                       |
| `author`      | The author's name; the tooltip adds the e-mail address.                                                                                                        | none                                                                                                                                       |
| `commit`      | The first 8 characters of the commit ID, in a monospaced font; the tooltip is the full ID.                                                                     | none                                                                                                                                       |

#### `noCommits` and `createFirstCommit`

- **Where**: `pages/NoCommitsPage.tsx`, shown instead of the commit table when the selected repository has no commit yet (HEAD not born), outside history search. `noCommits` is the `h1` heading under an illustration; `createFirstCommit` is a muted paragraph under it.
- **Convey**: heading: this repository has no commits so far. Paragraph: once a first commit exists, the graph appears here. The commit is made elsewhere (for example in VS Code's Source Control view); the page has no button.
- **Constraints**: `docs/git-actions.md` line 45 names the heading in bold. The UI harness (line 1613) checks that the page does not show the heading while it shows a load error.
- **Now**: heading in sentence case without final punctuation; paragraph a sentence with a full stop.

#### `noRepo`, `initializeRepo` and `unableToInitializeRepo`

- **Where**: `pages/NoRepoPage.tsx`, the page shown when the workspace has no Git repository. `noRepo` is the `h1` heading. `initializeRepo` is the primary button (with a folder-and-plus icon); it asks the extension to run VS Code's own Git command `git.init`, which asks the user where to create the repository. The button is disabled while that runs, and the page gives way to the graph when the new repository appears. `unableToInitializeRepo` is a red paragraph with `role="alert"` under the button, shown when the request fails.
- **Convey**: heading: no Git repository was found in the open folders. Button: create a new Git repository. Alert: creating the repository failed, and why.
- **Placeholders**: `unableToInitializeRepo` `{0}` is the failure's message, not localized: for example VS Code's "command 'git.init' not found" when its Git extension is disabled, or Branchwise's "The extension did not answer in time: git.init". Only the first `{0}` is filled.
- **Constraints**: the button starts VS Code's own command, and the current button text equals that command's title in VS Code's Git extension, word for word (wording Q10). Code comments at `src/webview/pages/NoRepoPage.tsx` line 40 and `src/extension/handlers/initialize-repo.ts` line 4 quote that title.
- **Now**: heading in sentence case without final punctuation; button with each word capitalized; alert in sentence case with a colon before the placeholder and no final punctuation.

### 2.2 Errors (18 strings)

Error titles are passed to `openErrorDialog` (`lib/actions.ts`) and drawn by `ErrorBody` in `components/ui/Dialog.tsx` (§1.5): a warning glyph and the title, the reason in italics below when there is one, then Branchwise's "Copy Error Details" (only with a reason) and the `dialogDismiss` button.

#### `portableGitHint`

- **Unused**: no code reads it.
- **Convey**: advice for people who use a portable Git installation: point VS Code's `git.path` setting at that installation's Git executable. It includes a Windows example path under Program Files.
- **Now**: one long sentence with the setting name and the example path in double quotation marks (escaped in the literal). See wording Q12.

#### `unableToLoadCommitDetails`

- **Where**: `lib/handler/commit-details.ts` and `lib/handler/graph-query-error.ts`: error-dialog title when a commit's details cannot be loaded after the user opened them. The details panel closes. The first path has no reason; the second shows the extension's error message.
- **Convey**: the details (files and message) of the chosen commit could not be read.
- **Now**: sentence case, no final punctuation.

#### `unableToCopyToClipboard`

- **Where**: `lib/actions/clipboard.ts`: error-dialog title when copying to the clipboard fails. The reason is the request's error message, or nothing when the clipboard refused the text.
- **Convey**: copying the named thing to the clipboard failed.
- **Placeholders**: `{0}` is the localized name of what was being copied: `typeCommitHash`, `typeBranchName`, `typeTagName` (§2.3), or Branchwise's `errorDetails` ("Error Details") from the Copy Error Details buttons. Every `{0}` is replaced, literally.
- **Composition**: the fragments are noun phrases; in English they currently carry title-case capitals mid-sentence (Branchwise's "Error Details" too). See wording Q13.
- **Now**: each word capitalized, with the placeholder as the object.

#### `unableToViewDiff`

- **Where**: `lib/handler/view-diff.ts`: error-dialog title, with no reason, when the extension reports that it could not open the diff of a file that the user clicked in a commit's file list.
- **Convey**: the diff of that file could not be opened.
- **Now**: sentence case, no final punctuation.

#### Action failure titles

- **Where**: `lib/handler/action-result.ts`: the title of the error dialog that replaces the running dialog when a Git action fails and its running dialog is still the one shown. The reason is Git's error output or one of Branchwise's refusal messages. A failure that finishes while another dialog is shown is not shown here; it is kept in Git Activity under the action's label (§1.6) instead.
- **Convey**: which action failed. The title does not repeat the reason.
- **Now**: each word capitalized: an opening phrase of inability, then the action as a verb and its object.

| Key                      | Failed action (command)                                                                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unableToAddTag`         | Creating a tag on a commit (`addTag`)                                                                                                                                                       |
| `unableToCheckoutBranch` | Checking out a branch (`checkoutBranch`): switching to a local branch, or making a local branch from a remote-tracking branch (created, or fast-forwarded if it exists) and switching to it |
| `unableToCheckoutCommit` | Checking out a single commit, which detaches HEAD (`checkoutCommit`)                                                                                                                        |
| `unableToCherryPick`     | Cherry-picking a commit onto the current branch (`cherrypickCommit`), including when it stops on a conflict                                                                                 |
| `unableToCreateBranch`   | Creating a branch at a commit or at HEAD (`createBranch`)                                                                                                                                   |
| `unableToDeleteBranch`   | Deleting a local branch (`deleteBranch`), for example one not fully merged without the force option                                                                                         |
| `unableToDeleteTag`      | Deleting a local tag (`deleteTag`)                                                                                                                                                          |
| `unableToMergeBranch`    | Merging a local branch into what is checked out (`mergeBranch`); a conflict comes with Branchwise's "The merge stopped on conflicts. …" as the reason                                       |
| `unableToMergeCommit`    | Merging a commit into what is checked out (`mergeCommit`)                                                                                                                                   |
| `unableToPushTag`        | Pushing one tag to a remote (`pushTag`)                                                                                                                                                     |
| `unableToRenameBranch`   | Renaming a local branch (`renameBranch`)                                                                                                                                                    |
| `unableToReset`          | Resetting the current branch to a commit (`resetToCommit`)                                                                                                                                  |
| `unableToRevert`         | Reverting a commit, that is, committing its inverse (`revertCommit`)                                                                                                                        |

Branchwise's own failure titles for comparable actions are in sentence case: "Unable to fetch", "Unable to push branch", "Unable to pull branch", "Unable to complete Git operation" (wording Q5).

#### `invalidCharacters`

- **Where**: `components/ui/Dialog.tsx`, form dialogs: the tooltip of the disabled submit button, shown only while a ref-name field holds a name that Git would refuse (it is not shown while a field is merely empty). The tooltip sits on a wrapper because some browsers show none on a disabled button.
- **Convey**: the action cannot be done because the entered name is not valid. The check (`utils/ref.ts`) refuses more than characters: spaces and `~ ^ : ? * [ \ " < >`, control characters, `..`, `//`, `@{`, `/.`, a leading `-`, `/` or `.`, a trailing `.` or `/`, a component ending in `.lock`, and the names `@` and `HEAD`. The current text speaks only of characters (wording Q14).
- **Placeholders**: `{0}` is the dialog's submit-button text: inherited `dialogAddTagSubmit`, `dialogCreateBranchSubmit`, `dialogRenameBranchSubmit`, `checkoutBranch`, and Branchwise's "Create Worktree", "Add Remote", "Rename Remote", "Preview Push", "Fetch & Preview Pull" and "Create Recovery Branch". Only the first `{0}` is filled.
- **Composition**: `{0}` receives a button label (an imperative verb phrase, title case in English) and plays the role of the action that is impossible. zh: no spaces around it (§5.2).
- **Now**: sentence case with the placeholder after the opening words, a comma, a second clause, and a final full stop.

### 2.3 Actions (18 strings)

Common to the first fifteen: they are menu titles (the code adds `…` where the entry opens a dialog, §1.5) and, where §1.6 says so, the name of the running operation. Menus are built in `lib/menus.tsx` unless stated otherwise. "Commit menu" is the context menu of a commit row (right-click, the row's ⋯ button, or Shift+F10); "local-branch menu", "remote-branch menu" and "tag menu" are the menus of the labels on commit rows and of the rows of the Branches pane.

#### `addTag`

- **Where**: commit menu, with `…`: opens the tag dialog (§2.5). Also the name of a running or finished tag creation (§1.6).
- **Convey**: create a tag on this commit.
- **Constraints**: same English as `dialogAddTagSubmit` today (§1.4). Named loosely by `walkthroughs/act-on-commit.md` line 5.
- **Now**: two words, each capitalized.

#### `createBranch`

- **Where**: commit menu, with `…`: opens the branch dialog (§2.5). Also the name of a running or finished branch creation, whether started here or from the Branches pane (§1.6).
- **Convey**: create a new branch starting at this commit (without checking it out).
- **Constraints**: same English as `dialogCreateBranchSubmit` today.
- **Now**: two words, each capitalized.

#### `checkout`

- **Where**: (1) commit menu, with `…`: opens the confirmation for checking out the commit itself (§2.5, `dialogCheckoutConfirm`). (2) `components/repository/RefsPane.tsx`: the small inline button, visible on hover, on each local-branch row (not for the checked-out branch or one checked out in another worktree) and on each remote-branch row. The row's button checks out the branch, or opens the remote checkout dialog. Its `aria-label` is this text followed by a space and the full ref name (`refs/heads/<name>` or `refs/remotes/<name>`). (3) The name of a running or finished commit checkout (§1.6).
- **Convey**: check out (switch to) the thing it is attached to, which may be a commit or a branch. No object is named.
- **Constraints**: a bare verb, short enough for a compact inline button in a crowded row (`text-xs`, no wrapping; the ref name beside it is the part that gets cut). Must read well followed by a full ref name in the accessible name. Named in bold by `walkthroughs/branches-pane.md` lines 5 and 6, `walkthroughs/act-on-commit.md` line 6 and `docs/git-actions.md` line 27; `todo.md` lines 122 and 554 mention it.
- **Now**: one word with an initial capital, used as a verb. Branchwise writes the verb as two words and keeps the one-word form for the noun (§4.6, wording Q6).

#### `cherryPick`

- **Where**: commit menu, with `…`: opens the cherry-pick confirmation. Also the name of the running operation (§1.6).
- **Convey**: apply this commit's changes to the current branch as a new commit.
- **Now**: two capitalized words without a hyphen. Branchwise always hyphenates the term ("Cherry-pick", "Cherry-pick Selected"; wording Q6).

#### `revert`

- **Where**: commit menu, with `…`: opens the revert confirmation. Also the name of the running operation (§1.6).
- **Convey**: add a new commit that undoes this commit's changes.
- **Constraints**: the same English is Branchwise's `revertOperation` today (§1.4, wording Q2).
- **Now**: one word with an initial capital.

#### `merge`

- **Where**: commit menu, with `…`, and local-branch menu, with `…`, for branches other than the checked-out one. Opens the merge confirmation. Also the name of both merge operations (§1.6).
- **Convey**: merge this commit or branch into the branch that is checked out.
- **Constraints**: the target is stated because the menu belongs to the source. HEAD may be detached, in which case the merge goes into the detached HEAD (menus.md decided to keep offering it). Named loosely by `walkthroughs/act-on-commit.md` line 7.
- **Now**: sentence case (only the first word capitalized).

#### `reset`

- **Where**: commit menu, with `…`: opens the reset dialog. Also the name of the running operation (§1.6).
- **Convey**: move the current branch to this commit (the dialog then asks how to treat the files).
- **Constraints**: named loosely by `walkthroughs/act-on-commit.md` line 7.
- **Now**: mixed: the first and the last word capitalized, the words between in lower case.

#### `copyCommitHash`

- **Where**: commit menu, last entry, no `…` (acts at once): copies the commit's full ID (40 or 64 hexadecimal digits).
- **Convey**: copy this commit's full ID to the clipboard.
- **Constraints**: see `typeCommitHash` for the word used for the ID (wording Q7).
- **Now**: each word capitalized.

#### `copyTagName`

- **Where**: tag menu, last entry, no `…`: copies the tag's name.
- **Convey**: copy the tag's name to the clipboard.
- **Now**: each word capitalized.

#### `copyBranchName`

- **Where**: local-branch and remote-branch menus, last entry, no `…`: copies the branch's name (for a remote-tracking branch, `<remote>/<branch>`).
- **Convey**: copy the branch's name to the clipboard.
- **Now**: each word capitalized.

#### `deleteTag`

- **Where**: tag menu, with `…`: opens the tag deletion confirmation. Also the name of the running operation (§1.6).
- **Convey**: delete this tag from the local repository. Remote copies are not touched; Branchwise's separate "Delete Remote Tag" does that.
- **Now**: two words, each capitalized.

#### `pushTag`

- **Where**: (1) tag menu, with `…`: opens the push dialog. (2) That dialog (`lib/remote-actions.tsx`): its message is this text, a colon and a space added by code, then the tag name in bold; there is one select, labelled with Branchwise's `remote` ("Remote"), listing the remotes; the submit button is this text again. (3) The name of the running operation (§1.6).
- **Convey**: send this tag to a remote. The push never replaces a tag of the same name that already exists on the remote; it fails instead.
- **Constraints**: must work as a menu title, as the start of "text: name", and as a button. Must not end with its own colon.
- **Now**: two words, each capitalized.

#### `checkoutBranch`

- **Where**: (1) local-branch menu, no `…`, for branches other than the checked-out one: switches to the branch at once. (2) remote-branch menu, with `…`: opens the remote checkout dialog (Branchwise's `dialogCheckoutRemoteTitle` asks for the local branch name and offers to fetch first). (3) The submit button of that dialog. (4) The name of the running operation (§1.6).
- **Convey**: check out a branch; for a remote-tracking branch, through a local branch of the chosen name.
- **Constraints**: must work as an immediate menu entry, as a menu entry with `…`, and as a submit button.
- **Now**: two words, each capitalized, the first used as a verb (wording Q6).

#### `renameBranch`

- **Where**: local-branch menu, with `…` (also for the checked-out branch): opens the rename dialog. Also the name of the running operation (§1.6).
- **Convey**: give this branch a new name.
- **Constraints**: same English as `dialogRenameBranchSubmit` today.
- **Now**: two words, each capitalized.

#### `deleteBranch`

- **Where**: (1) local-branch menu, with `…`, for branches other than the checked-out one: opens the deletion dialog. (2) The submit button of that dialog (destructive). (3) The name of the running operation (§1.6).
- **Convey**: delete this local branch.
- **Now**: two words, each capitalized.

#### `typeCommitHash`, `typeTagName` and `typeBranchName`

- **Where**: never shown alone. `lib/menus.tsx` passes them to `copyToClipboard` as the name of what is being copied, and they appear only as `{0}` of `unableToCopyToClipboard`.
- **Convey**: respectively, a commit's full ID, a tag's name, a branch's name, as noun phrases.
- **Composition**: the object of the copy-failure title. They should match the words used by the three copy entries above.
- **Constraints**: `typeBranchName` has the same English as Branchwise's `recoveryBranchName` today (§1.4, wording Q2).
- **Now**: two words each, each capitalized.

### 2.4 Label fragments (3 strings)

#### `labelTag` and `labelBranch`

- **Where**: only as `{0}` of `dialogDeleteConfirm` (§2.5): `labelBranch` in the branch deletion question, `labelTag` in the tag deletion question. Plain text (not bold).
- **Convey**: the kind of ref being deleted, as a noun phrase that is followed directly by the ref's name (`{1}`, bold italic).
- **Composition**: the fragment is the head noun and the name stands in apposition to it. English needs its article inside the fragment; a language with articles or case marking gets no help from the code (wording Q8).
- **Now**: all lower case, an article and a noun.

#### `labelCurrentBranch`

- **Where**: (1) `lib/menus.tsx`: in bold (`<b>`) as `{1}` of `dialogMergeConfirm` (the merge target) and as `{0}` of `dialogResetConfirm` (the branch being moved). (2) `components/commit/RefLabel.tsx`: the second line of the tooltip of the checked-out branch's label on a commit row (after the branch name, before Branchwise's upstream and worktree lines).
- **Convey**: the branch that is checked out now. In the tooltip it tells the user that this label is that branch.
- **Composition**: a noun phrase in two roles: inside a sentence (object of "merge into", object of "reset"), and alone as a line of a tooltip. One text may not suit both, especially in zh (wording Q8). HEAD may be detached while the phrase is shown in the questions.
- **Now**: all lower case, an article, an adjective and a noun.

### 2.5 Dialogs (31 strings)

All dialogs here are form dialogs opened by `lib/menus.tsx` through `openFormDialog` and drawn by `components/ui/Dialog.tsx`. The message is the first paragraph and is also the dialog's accessible name; a field without its own label is named by the message. Fields with labels are laid out in two columns, label on the left. The buttons are the submit button (the dialog's action), then `dialogCancel`. In a dialog marked destructive, focus starts on the cancel button; otherwise it starts on the first text field or button. Hashes are the first 8 characters of the commit ID; hashes and ref names are shown bold italic (§1.5).

#### Tag dialog (commit menu, `addTag`)

- **`dialogAddTagTitle`**
  - **Where**: the dialog's message.
  - **Convey**: a tag is about to be created on this commit.
  - **Placeholders**: `{0}` is the commit's 8-character ID, bold italic.
  - **Now**: sentence case, no final punctuation.
- **`dialogAddTagName`**
  - **Where**: label of the first field, a ref-name field. The submit button stays disabled while it is empty or invalid (`invalidCharacters`).
  - **Convey**: the new tag's name.
  - **Now**: one word with an initial capital.
- **`dialogAddTagType`**
  - **Where**: label of the second field, a select.
  - **Convey**: which kind of tag to create.
  - **Now**: one word with an initial capital.
- **`dialogAddTagTypeAnnotated`**
  - **Where**: first option of that select, and the default.
  - **Convey**: an annotated tag: a tag object that records who tagged, when, and a message (the message may be empty).
  - **Now**: one word with an initial capital.
- **`dialogAddTagTypeLightweight`**
  - **Where**: second option.
  - **Convey**: a lightweight tag: only a name that points at the commit, with no message. Anything typed in the message field is not used for it.
  - **Now**: one word with an initial capital.
- **`dialogAddTagMessage`**
  - **Where**: label of the third field, a one-line text box, the annotated tag's message. The same key also labels the message field of Branchwise's Save Stash dialog (`components/repository/StashManager.tsx`) and is the `aria-label` of the message box of a "Reword" entry in the interactive rebase editor (`components/repository/RebaseEditor.tsx`).
  - **Convey**: a message, in a sense that fits a tag message, a stash message and a commit message.
  - **Now**: one word with an initial capital.
- **`dialogAddTagOptional`**
  - **Where**: placeholder of the message field.
  - **Convey**: the field may be left empty.
  - **Now**: one word with an initial capital.
- **`dialogAddTagSubmit`**
  - **Where**: the submit button. Its text also fills `invalidCharacters`.
  - **Convey**: create the tag.
  - **Constraints**: same English as `addTag` today (§1.4, wording Q3).
  - **Now**: two words, each capitalized.

#### Branch dialog (commit menu, `createBranch`)

- **`dialogCreateBranchTitle`**
  - **Where**: the dialog's message. The dialog has one field, without a label, so this text is also the field's accessible name.
  - **Convey**: type the name of a new branch, which will start at this commit. The branch is created but not checked out.
  - **Placeholders**: `{0}` is the commit's 8-character ID, bold italic.
  - **Constraints**: the current text can be read as if the hash were the branch's name (reported as `menus.md` Q8). It has no final colon, whereas the rename prompt has one (wording Q17). Branchwise's prompt for the same action from the Branches pane is "Create a branch at {0}".
  - **Now**: sentence case, no final punctuation.
- **`dialogCreateBranchSubmit`**
  - **Where**: the submit button of this dialog and of the Branches pane's New Branch dialog (whose message is Branchwise's `newBranchFrom`). Its text also fills `invalidCharacters`.
  - **Convey**: create the branch.
  - **Constraints**: same English as `createBranch` today (wording Q3).
  - **Now**: two words, each capitalized.

#### Commit checkout (commit menu, `checkout`)

- **`dialogCheckoutConfirm`**
  - **Where**: the dialog's message. It is followed by a muted line with Branchwise's `explainDetachedHead`: "You can build and test here. Create a branch from this commit to keep new work, or check out a branch to return." There are no fields; the submit button is `dialogYes`. Not destructive.
  - **Convey**: asks the user to confirm checking out this commit itself, and states that afterwards HEAD is detached: no branch is checked out, so new commits belong to no branch. Branchwise's explanation line then says what to do about it, so the question need not.
  - **Placeholders**: `{0}` is the commit's 8-character ID, bold italic.
  - **Now**: two sentences: a question in sentence case, then a statement that names the resulting state in single quotation marks.

#### Cherry-pick and revert (commit menu, `cherryPick` and `revert`)

- **`dialogCherryPickConfirm`**
  - **Where**: the dialog's message. For an ordinary or root commit there are no fields. For a merge commit, one select follows, without a label: one option per parent, reading "8-character ID: summary line", to choose the parent the changes are taken against (Git's mainline, counted from 1). The submit button is `dialogYesCherryPick`.
  - **Convey**: asks the user to confirm applying this commit's changes to the current branch as a new commit.
  - **Placeholders**: `{0}` is the commit's 8-character ID, bold italic.
  - **Now**: a question in sentence case.
- **`dialogRevertConfirm`**
  - **Where**: as `dialogCherryPickConfirm`; the submit button is `dialogYesRevert`.
  - **Convey**: asks the user to confirm adding a new commit to the current branch that undoes this commit's changes.
  - **Placeholders**: as above.
  - **Now**: a question in sentence case.

#### Merge (commit menu and local-branch menu, `merge`)

- **`dialogMergeConfirm`**
  - **Where**: the dialog's message. One checkbox follows (`dialogMergeNoFastForward`); the submit button is `dialogYesMerge`. Not destructive.
  - **Convey**: asks the user to confirm merging the source into the branch that is checked out.
  - **Placeholders**: `{0}` is the source: the commit's 8-character ID (commit menu) or the branch name (branch menu), bold italic. `{1}` is `labelCurrentBranch`, bold.
  - **Composition**: `{1}` receives a localized noun phrase (§2.4). In zh, no spaces around it (§5.2).
  - **Now**: a question in sentence case.
- **`dialogMergeNoFastForward`**
  - **Where**: the checkbox label; ticked by default.
  - **Convey**: when ticked, Git always records a merge commit, even when the checked-out branch could simply be moved forward to the source (`--no-ff`). When unticked, Git moves the branch forward when it can and records a merge commit only when it must. (The merge commit gets Git's default message; no editor opens.)
  - **Now**: sentence case, no final punctuation.

#### Reset (commit menu, `reset`)

- **`dialogResetConfirm`**
  - **Where**: the dialog's message. It is followed by a muted line with Branchwise's `explainReset`: "Soft and mixed keep your files. Hard discards uncommitted changes. The previous position stays in the reflog, so Recover lost commits can bring it back." Then one select without a label, with the three modes below; Mixed is preselected. Destructive: focus starts on the cancel button. The submit button is `dialogYesReset`.
  - **Convey**: asks the user to confirm moving the checked-out branch to this commit.
  - **Placeholders**: `{0}` is `labelCurrentBranch`, bold; `{1}` is the commit's 8-character ID, bold italic.
  - **Composition**: `{0}` receives a localized noun phrase (§2.4); zh: no spaces around it.
  - **Now**: a question in sentence case.
- **`dialogResetSoft`**, **`dialogResetMixed`**, **`dialogResetHard`**
  - **Where**: the three options of the select, in this order (values `soft`, `mixed`, `hard`).
  - **Convey**: each option must name its mode, because Branchwise's `explainReset` refers to the modes by name (Soft, mixed, Hard; zh-cn 软重置, 混合重置, 硬重置; zh-tw 軟重設, 混合重設, 硬重設), and so does the backend's refusal "Choose a soft, mixed or hard reset.". Then what the mode does with Git's `reset`:
    - Soft: the branch moves to the commit; the index and the working tree are left as they are, so the changes of the commits that are left behind appear as staged changes.
    - Mixed: the branch moves; the index is reset to the commit; the working tree is left as it is, so all those changes, and any that were staged, appear as unstaged changes.
    - Hard: the branch moves; the index and the working tree are reset to the commit, so every staged and unstaged change to tracked files is lost. Untracked files stay (wording Q15).
  - **Constraints**: option text in a select as wide as the dialog allows (up to 600 px); one line each is best.
  - **Now**: each is the mode's name with an initial capital, a spaced ASCII hyphen, then a short description in sentence case (two contrasting clauses for Soft and Mixed, one for Hard).

#### Deletion (local-branch menu, `deleteBranch`; tag menu, `deleteTag`)

- **`dialogDeleteConfirm`**
  - **Where**: the message of both deletion dialogs, both destructive (focus starts on the cancel button). For a branch it is followed by a muted line with Branchwise's `explainDeleteBranch` ("The commits stay in the repository for a while. Recover lost commits lists the branch tip if you need it back."), the checkbox `dialogDeleteForceDelete`, and the submit button `deleteBranch`. For a tag there are no fields and the submit button is `dialogYes`.
  - **Convey**: asks the user to confirm deleting the named local branch or tag.
  - **Placeholders**: `{0}` is `labelBranch` or `labelTag`, plain text; `{1}` is the ref's name, bold italic.
  - **Composition**: a verb, then the fragment, then the name in apposition (§2.4, wording Q8).
  - **Now**: a question in sentence case.
- **`dialogDeleteForceDelete`**
  - **Where**: the checkbox label in the branch deletion dialog; unticked by default.
  - **Convey**: when ticked, the branch is deleted even if its commits are not merged (`git branch -D`). When unticked, Git refuses to delete a branch that is not fully merged into its upstream or into HEAD (`-d`).
  - **Now**: two words, each capitalized.

#### Rename (local-branch menu, `renameBranch`)

- **`dialogRenameBranchTitle`**
  - **Where**: the dialog's message and the accessible name of its only field, which starts filled with the current name. Submitting the unchanged name closes the dialog without doing anything.
  - **Convey**: type a new name for this branch.
  - **Placeholders**: `{0}` is the current branch name, bold italic.
  - **Now**: sentence case, ending with a colon.
- **`dialogRenameBranchSubmit`**
  - **Where**: the submit button. Its text also fills `invalidCharacters`.
  - **Convey**: rename the branch.
  - **Constraints**: same English as `renameBranch` today (wording Q3).
  - **Now**: two words, each capitalized.

#### Unused question

- **`dialogPushTagConfirm`**
  - **Unused**: no code reads it; pushing a tag uses a form with a remote select instead (see `pushTag`).
  - **Convey**: a question asking whether to push the named tag.
  - **Placeholders**: `{0}` is the tag's name.
  - **Now**: a question in sentence case (wording Q12).

#### Buttons

- **`dialogYes`**
  - **Where**: the submit button of the commit checkout confirmation (not destructive, so it starts focused) and of the tag deletion confirmation (destructive; focus starts on the cancel button, and Shift+Tab reaches this one; the UI harness checks this at `history.test.cjs` line 909).
  - **Convey**: confirm and go ahead.
  - **Now**: one word with an initial capital. See wording Q4 on confirmation buttons.
- **`dialogYesCherryPick`**, **`dialogYesRevert`**, **`dialogYesMerge`**, **`dialogYesReset`**
  - **Where**: the submit buttons of the cherry-pick, revert, merge and reset confirmations. The UI harness presses the merge one by its text (line 924).
  - **Convey**: confirm, and name the action that follows (cherry-pick the commit; revert the commit; merge; reset).
  - **Now**: an affirmative word with an initial capital, a comma, then the action in lower case (verb and object for the first two, verb alone for the last two).
- **`dialogCancel`**
  - **Where**: the cancel button of every form dialog, Branchwise's included (it carries `data-dialog-cancel`). It closes the dialog and does nothing else. In destructive dialogs it has the initial focus; the UI harness checks that it is focused by its text (lines 882, 899, 907).
  - **Convey**: leave without doing anything.
  - **Now**: one word with an initial capital.
- **`dialogDismiss`**
  - **Where**: (1) the only fixed button of every error dialog, which closes it and has the initial focus; (2) `layout/GraphView.tsx`: the small button at the end of the one-time hint strip above the graph (Branchwise's "Right-click a commit, or use its ⋯ button, for actions. On the keyboard, press Shift+F10."), which hides the hint for good. The UI harness presses it by text (line 932).
  - **Convey**: acknowledge and close, with no other effect.
  - **Now**: one word with an initial capital.

### 2.6 Status (1 string)

#### `pushingTag`

- **Where**: `lib/remote-actions.tsx` passes it as the fallback title of a tag push. `beginActivity` (§1.6) prefers the `pushTag` label and uses the fallback only if that label is an empty string, so in practice it is never shown (wording Q12). Where it would show, the running dialog appends ` ...`.
- **Convey**: a tag is being pushed.
- **Now**: two words, each capitalized, a present participle then a noun.

### 2.7 Commit details (6 strings)

#### `detailCommit`, `detailParents`, `detailAuthor`, `detailDate` and `detailCommitter`

Common to the five:

- **Where**: `components/commit/CommitDetails.tsx`: the five lines at the top of the left column of the panel that opens under a commit row, in this order, above the full message. Each line is rendered by `Fact` (§1.5): the text before `{0}` in bold, then the value, then any text between `{0}` and a second `{0}`. Each line is cut off with an ellipsis if too long; the column is 45% of the panel's width. The text is selectable.
- **Placeholders**: exactly one `{0}` each. The text before it is the bold label and must include its own separator (the current ones end with a colon and a space); a translation that puts `{0}` first loses the bold label (reported as `commit-view.md` CommitDetails Q5).
- **Constraints**: short labels. `tests/webview/components/commit/CommitDetails.test.ts` asserts the English.
- **Now**: one capitalized word, a colon, a space, then the placeholder.

Per line:

| Key               | Value in `{0}`                                                                                                                                                                                                                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `detailCommit`    | The commit's full ID (40 or 64 hexadecimal digits).                                                                                                                                                                                                                                                   |
| `detailParents`   | The full IDs of all parent commits, separated by a comma and a space. Empty for a root commit (the label then stands alone). The label must suit one or several parents.                                                                                                                              |
| `detailAuthor`    | The author's name; when the commit has an e-mail address, a space and the address in angle brackets follow, as a `mailto:` link.                                                                                                                                                                      |
| `detailDate`      | The author date or the committer date, whichever `branchwise.dateType` selects, as a full date with a long time (weekday, day, month, year, time and time zone) in VS Code's display language; Branchwise's "Unknown date" if it is unusable. So the label must not say which of the two dates it is. |
| `detailCommitter` | The committer's name only (no e-mail address).                                                                                                                                                                                                                                                        |

#### `uncommittedChanges`

- **Where**: `components/commit/CommitRow.tsx`: the text of the top row of the commit table, the placeholder row for the working tree. The row is shown when `branchwise.showUncommittedChanges` is on, the working tree has changes, and HEAD's commit is among the loaded rows. The text is bold, is also the text cell's tooltip, and the row's own tooltip is Branchwise's "Click or press Enter to view uncommitted changes.". Clicking the row opens the panel of changed files grouped by Branchwise's "Conflicts", "Unstaged Changes", "Staged Changes" and "Untracked Files".
- **Convey**: this row stands for the changes not yet committed, and how many paths have them.
- **Placeholders**: `{0}` is a whole number, at least 1: the number of paths that `git status --untracked-files=all` lists (each changed, staged, untracked or conflicted path once; untracked files are counted one by one, not by folder).
- **Constraints**: the row name is used as the name of this row in `walkthroughs/read-graph.md` line 7, `README.md` line 45, `todo.md` line 462 and several clean-room specs (§6). The UI harness looks for the English with a count of 3 (line 712).
- **Now**: two words, each capitalized, then the count in parentheses.

### 2.8 File tooltips (6 strings)

All six are shown by `components/commit/FileTree.tsx` in the tree of changed files in a commit's details panel.

#### `tooltipBinaryFile`

- **Where**: the tooltip of a file entry for which Git gave no line counts. Such an entry is inert: a click opens nothing (its context menu still works).
- **Convey**: no text diff can be shown for this file, which is why clicking does nothing. Git gives no counts for binary files, and also for files that an attribute (`-diff`) marks as binary (wording Q16).
- **Now**: one sentence of two clauses joined by a comma, ending with a full stop.

#### `tooltipRenamedTo`

- **Where**: the tooltip of the small `R` marker after the name of a renamed file.
- **Convey**: this commit renamed the file from the first path to the second.
- **Placeholders**: `{0}` is the old path and `{1}` the new path, both relative to the repository root with `/` separators, inserted literally.
- **Now**: sentence case starting with the placeholder, no final punctuation.

#### `tooltipAddition`, `tooltipAdditions`, `tooltipDeletion` and `tooltipDeletions`

- **Where**: the tooltips of the two counts shown after a modified or renamed text file, `(+N|-M)`: the `+N` count (green) uses `tooltipAddition` when N is exactly 1 and `tooltipAdditions` otherwise, including 0; the `-M` count (red) uses `tooltipDeletion` / `tooltipDeletions` the same way.
- **Convey**: how many lines this commit added to, or removed from, the file.
- **Placeholders**: `{0}` is the count in plain ASCII digits (no locale grouping).
- **Composition**: a singular/plural pair chosen by `count === 1`. Chinese does not inflect for number, so each pair may share one translation (as Branchwise's own zh counts do, for example "已选择 {0} 个提交").
- **Now**: the placeholder, a space, then one lower-case noun (singular or plural), no final punctuation.

### 2.9 Settings descriptions (21 strings)

These are values of `package.nls.json` (English) and `package.nls.zh-cn.json` / `package.nls.zh-tw.json`, keyed by the names below and referenced from `contributes.configuration` in `package.json` as `%name%`. VS Code shows them in its Settings editor under the "Branchwise" section for the setting `branchwise.<name>`, and in `settings.json` hovers and completions:

- a **description** is shown under the setting's title;
- an **enum description** is shown for one value of a dropdown setting, while that value is highlighted in the dropdown (and in completions);
- a **deprecation message** is shown as a warning on a deprecated setting.

The setting values themselves (`"Date & Time"`, `"Author Date"`, `"rounded"`, `"colour"`, …) are stored in users' settings and are not part of this rewording (wording Q26).

#### Seventeen inherited in English and in both translations

| Key                                  | Kind                                                                                 | What it must convey                                                                                                                                                                                                                                                                             | Now (English)                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `config.autoCenterCommitDetailsView` | description of a boolean (default `true`)                                            | When a commit's details panel opens, the page scrolls so that the panel is centred vertically. When off, it scrolls only as far as needed to show the panel.                                                                                                                                    | one sentence with a full stop                                                               |
| `config.dateFormat.dateTime`         | enum description of the value `Date & Time` (the default) of `branchwise.dateFormat` | The date column shows the day and the time. May give an example; if it does, the example must look like real output: the day in the display language's short form (year, abbreviated month, day), then a 24-hour `HH:MM` time.                                                                  | an imperative clause and an example in double quotation marks, no final punctuation         |
| `config.dateFormat.dateOnly`         | enum description of `Date Only`                                                      | The date column shows the day only (same day format). An example, if any, as above.                                                                                                                                                                                                             | as above                                                                                    |
| `config.dateFormat.relative`         | enum description of `Relative`                                                       | The date column shows how long ago the commit was, as a phrase with a number (for example a count of minutes), from the display language's `Intl.RelativeTimeFormat`. The exact day and time stay in the cell's tooltip.                                                                        | as above                                                                                    |
| `config.dateType.authorDate`         | enum description of `Author Date` (the default) of `branchwise.dateType`             | The date column and the details panel use each commit's author date: when its changes were first recorded.                                                                                                                                                                                      | an imperative clause, no final punctuation                                                  |
| `config.dateType.commitDate`         | enum description of `Commit Date`                                                    | They use the committer date instead: when the commit itself was last made, which changes when commits are rebased, amended or cherry-picked.                                                                                                                                                    | as above                                                                                    |
| `config.fetchAvatars.deprecation`    | deprecation message of `branchwise.fetchAvatars`                                     | The setting is deprecated since version 0.6.0 (keep the number), has no effect, and may be removed in a later release. Branchwise's own description of the same setting already says why: "No effect. Earlier versions fetched commit author avatars; that feature has been removed."           | two sentences, each with a full stop                                                        |
| `config.graphColours`                | description of an array setting                                                      | The colours of the graph's lanes, in the order they are used (the graph cycles through them). The default has 12 colours.                                                                                                                                                                       | one sentence with a full stop                                                               |
| `config.graphColours.item`           | description of one array item                                                        | One colour, written as a hexadecimal code or an RGB function. The accepted forms (the setting's pattern) are `#RRGGBB`, `#RRGGBBAA`, and `rgb(r, g, b)` or `rgba(r, g, b)` with three numbers (wording Q21).                                                                                    | a noun and a parenthesis, no final punctuation                                              |
| `config.graphStyle`                  | description of `branchwise.graphStyle`                                               | How the lines of the graph are drawn.                                                                                                                                                                                                                                                           | one sentence with a full stop                                                               |
| `config.graphStyle.rounded`          | enum description of `rounded` (the default)                                          | A line that moves from one lane to another bends with a smooth curve.                                                                                                                                                                                                                           | an imperative clause, no final punctuation                                                  |
| `config.graphStyle.angular`          | enum description of `angular`                                                        | Such a line changes lanes with straight, angled segments.                                                                                                                                                                                                                                       | as above                                                                                    |
| `config.initialLoadCommits`          | description of an integer (minimum 1, default 300)                                   | How many commits are loaded when the graph first shows a repository or branch.                                                                                                                                                                                                                  | one sentence with a full stop                                                               |
| `config.loadMoreCommits`             | description of an integer (minimum 1, default 100)                                   | How many more commits are loaded each time the user presses the load-more button, and that the button appears only while more commits exist. It names the button by its label, `loadMore` (§2.1), which must match the new label exactly.                                                       | one sentence with the button's label in double quotation marks and a parenthesis, full stop |
| `config.maxDepthOfRepoSearch`        | description of an integer (minimum 0, default 0)                                     | How many levels of folders below each workspace folder are searched for Git repositories. With 0, only the workspace folders themselves count (a folder inside a repository yields that repository); initialized submodules of the repositories found are always listed.                        | one sentence with a full stop                                                               |
| `config.showUncommittedChanges`      | description of a boolean (default `true`)                                            | Whether the graph shows a top row for uncommitted changes (§2.7). Turning it off skips the working-tree scan, which makes loading faster in large repositories.                                                                                                                                 | a clause, then a parenthesis, full stop                                                     |
| `config.tabIconColourTheme.colour`   | enum description of `colour` (the default) of `branchwise.tabIconColourTheme`        | The Branchwise editor tab shows a coloured icon, which suits most VS Code colour themes. Its sibling, Branchwise's own `config.tabIconColourTheme.grey`, reads "Show a grey icon which suits Visual Studio Code colour themes that are predominantly grayscale"; the two should read as a pair. | an imperative clause, no final punctuation                                                  |

Their zh-cn and zh-tw values translate the new English. Examples, where kept, must look like the output in that language (Chinese short dates such as year, month and day with Chinese characters, and the zh relative phrase), not like the English example.

#### Four inherited only in zh-cn and zh-tw

The English of these is Branchwise's own and stays; only the Chinese is rewritten, as a translation of the English:

| Key                                 | English (Branchwise's, unchanged)                                                                  | Note                                                                                               |
| ----------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `config.dateFormat`                 | "Specifies the date format to be used in the date column of the graph."                            | The current zh names the view with the upstream product's name instead of the English "the graph". |
| `config.dateType`                   | "Specifies the date type to be displayed throughout Branchwise."                                   | The current zh does the same instead of "Branchwise".                                              |
| `config.showCurrentBranchByDefault` | "Show the current branch by default when Branchwise is opened. Default: false (show all branches)" | As above. Keep `false` as the literal setting value, and the parenthesis explaining it.            |
| `config.tabIconColourTheme`         | "Specifies the colour theme of the icon displayed on the Branchwise tab."                          | As above. The tab's icon, not the editor's colour theme, is what the setting chooses.              |

"Branchwise" stays in Latin letters in both locales (§5.2).

### 2.10 Diff titles (2 strings)

#### `addedIn` and `deletedIn` (`src/old-extension/messageHandler.ts`, lines 54–55)

- **Where**: extension host, `onViewDiff`: the title of the VS Code diff editor opened when the user clicks a file in a commit's file tree. The title is the file's name, a space, and in parentheses a change note. For a file the commit added (type `A`) the note is `addedIn`; for a file it deleted (type `D`) it is `deletedIn`. For modified and renamed files the note is not localized (`<hash>^ ↔ <hash>`). The title is shown on the editor tab.
- **Convey**: `addedIn`: this commit created the file (the left side of the diff is empty). `deletedIn`: this commit removed the file (the right side is empty).
- **Placeholders**: `{0}` is the commit's ID abbreviated to its first 8 characters.
- **Constraints**: short, because editor tabs truncate. Written `vscode.l10n.t("…", hash)` with exactly one `{0}` (§1.3). The entries of the `text` table in `messageHandler.ts` are kept in their order; `docs/clean-room/legacy-host.md` §0.4 lists the table's English strings in bundle order and must be updated with the new wording. `tests/extension/message-handler-graph.test.ts` lines 298–299 assert the English titles.
- **Now**: sentence case: a past participle, a preposition, then the placeholder.

---

## 3. `scripts/check-l10n.js`

The implementer deletes this file unread and writes a replacement with the same observable behaviour. Messages below are requirements: the new script prints them exactly.

### 3.1 Purpose

It verifies the hand-edited locale bundles against the generated English bundle: no locale may hold a key the English bundle does not have, none may lack a key it has, and every translation must use exactly the set of numbered placeholders its English string uses.

### 3.2 How it is run

- `package.json` script `l10n:check`: `pnpm run l10n:export && git diff --exit-code ./l10n/bundle.l10n.json && node scripts/check-l10n.js`. So by the time the script runs, the English bundle has been regenerated from the source and found identical to the committed one.
- CI (`.github/workflows/ci.yaml`, step "Check l10n") runs `pnpm run l10n:check`.
- `oxlint/restriction.config.json` allows `console` in exactly `scripts/check-l10n.js` (and `esbuild.js`); every other file is under `eslint/no-console`. The same rule set forbids relative parent imports (`import/no-relative-parent-imports`), which a `require("../…")` would be. Keep the path, or change the override and the `package.json` script with it.
- It is a CommonJS script for Node (the package has no `"type": "module"`), formatted by `oxfmt` (print width 100) and linted by `oxlint` like the rest.
- No test covers it.

### 3.3 Inputs

- The directory `l10n` beside the script's own parent directory (`<script dir>/../l10n`). It is found from the script's location, not from the current working directory.
- The English bundle `bundle.l10n.json` in that directory, read as UTF-8 JSON: an object whose keys are the English strings and whose values are, today, the same strings.
- Every other entry of the directory whose name matches `bundle.l10n.<tag>.json`, where `<tag>` is one or more characters of any kind (dots included). `bundle.l10n.json` itself does not match; neither does anything with a different ending, such as `bundle.l10n.zh-cn.json.bak`. Each match is read as UTF-8 JSON.
- `package.nls*.json` files are not read (wording Q24).

### 3.4 Checks, for each locale file

The locale files are processed in the order the directory listing returns them (on the current Linux checkout: zh-cn, then zh-tw). For each, three kinds of problem are collected, in this order:

1. **Stale keys**: every key of the locale file, in the file's key order, that is not a key of the English bundle. Today the membership test also accepts names that every JavaScript object inherits (a locale key `toString` or `constructor` is not reported); see wording Q25.
2. **Missing translations**: every key of the English bundle, in English order, that the locale file lacks.
3. **Placeholders**: for every English key the locale has, in English order: the set of placeholder tokens of the English value and of the locale value is compared. A token is `{`, one or more ASCII digits, `}` (`{0}`, `{12}`); other braces are ordinary text. First every English token absent from the translation is reported as dropped, in order of first appearance in the English value; then every token of the translation absent from the English value is reported as added, in order of first appearance in the translation. Only the sets are compared: a repeated token or a changed order is fine.

Not checked: whether a translation differs from the English, whether it is empty (an empty translation passes unless its English has placeholders, which are then reported as dropped), key order, duplicate keys in the JSON text (the last one wins when parsing), and formatting.

### 3.5 Output and exit code

- A locale with no problem prints one line to standard output: `✓ <file name> (<N>/<M> translated)`, where `<file name>` is the base name (for example `bundle.l10n.zh-cn.json`), `<N>` the number of keys in the locale file and `<M>` the number of keys in the English bundle. Today: `✓ bundle.l10n.zh-cn.json (497/497 translated)` and the same for zh-tw.
- A locale with problems prints to standard error the line `✗ <file name>`, then one line per problem, each starting with two spaces:
  - `  stale (not in English): "<key>"`
  - `  missing translation: "<key>"`
  - `  placeholder <token> dropped: "<key>"`
  - `  placeholder <token> added: "<key>"`

  `<key>` is the key exactly as it is, between plain double quotation marks, without escaping. `<token>` is the placeholder, braces included. The locale's lines are printed together, after all its checks.

- Every locale is checked and reported, even after one has failed.
- If any locale failed, standard error then receives an empty line followed by `l10n check failed.`, and the exit code is 1. Otherwise the exit code is 0 and nothing else is printed. With no locale files at all, nothing is printed and the exit code is 0.
- Malformed input is not handled: a missing directory or English bundle, a file that is not valid JSON, or a value that is not a string for a key present in both files (in either file; for example the `{ "message": …, "comment": … }` form that `vscode-l10n-dev` writes for strings with translator comments) ends the script with an uncaught exception, Node's stack trace on standard error, and exit code 1. Locales reported before that point keep their lines. See wording Q25.

### 3.6 Examples (observed)

English bundle `{"A {0}": "A {0}", "B": "B", "C {0} {1}": "C {0} {1}", "D": "D"}`:

- Locale `bundle.l10n.xx.json` = `{"A {0}": "a {0}", "B": "b", "C {0} {1}": "c {1} {0}", "D": "d"}`: standard output `✓ bundle.l10n.xx.json (4/4 translated)`, exit code 0.
- Adding `bundle.l10n.yy.json` = `{"A {0}": "a", "B": "b", "C {0} {1}": "c {0} {1} {2}", "E": "e", "toString": "t"}`: standard output as before; standard error

  ```text
  ✗ bundle.l10n.yy.json
    stale (not in English): "E"
    missing translation: "D"
    placeholder {0} dropped: "A {0}"
    placeholder {2} added: "C {0} {1}"

  l10n check failed.
  ```

  and exit code 1. (`toString` is not reported.)

- Locale `{"A {0}": "a {0} {0}", "B": "b", "C {0} {1}": "c {0}{1}", "D": "d", "B ": "x"}`: only `  stale (not in English): "B "` is reported.
- English `{"A {0}": "A {0}", "{10}": "{10}"}`, locale `{"A {0}": "a {0}", "{10}": "{1}{0}"}`: reports `placeholder {10} dropped: "{10}"`, then `placeholder {1} added: "{10}"`, then `placeholder {0} added: "{10}"`.
- Locale `{…, "D": ""}` with everything else correct: passes.

---

## 4. English style guide

Derived only from Branchwise's own strings: the non-inherited entries of `webviewL10n.ts`, `repositoryL10n.ts`, `historyL10n.ts` and `workflowL10n.ts`; the `l10n.t` calls in `src/backend/**`, `src/extension/**`, `src/main.ts`, `src/old-extension/fileHistoryCommand.ts` and the rest of `messageHandler.ts`; and the non-inherited `package.nls.json` entries. That is 424 distinct strings. Counts below are of distinct strings (or keys, where a key's element is what matters). Where Branchwise is not consistent, both usages are given; the choice is the maintainer's (wording Q18, Q19).

### 4.1 Capitalization by element

| Element                                                                 | Branchwise's usage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Buttons, including dialog submit buttons                                | Title case in 67 keys ("Save Stash", "Create Recovery Branch", "Open in New Window", "Update to Recorded Revision", "Apply Reviewed Fast-forward", "Fetch & Preview Pull", "Stop Git", "Try Again"). Sentence case in 3: "Pause focus", "Resume focus", "Clear focus". In title case, short prepositions and articles stay lower case ("Open in New Window", "Open File at This Revision"), and the second part of a hyphenated word too ("Cherry-pick Selected").                                                                                                                                                                                                                                                                              |
| Context-menu entries                                                    | Title case in 32 keys ("Configure Upstream", "Create Worktree", "Delete Remote Tag", "Use as Good Bisect Commit", "Open File at This Revision", "Workspace Fetch & Update", "Open Extension Settings"). Sentence case in 7: "Focus this branch", "Compare with…", "Move the current branch onto this (rebase)", "Edit commits after this (interactive rebase)", "Fold staged changes into this commit (fixup)", "Recover lost commits (reflog)", "Learn more".                                                                                                                                                                                                                                                                                  |
| Dialog, pane and section titles                                         | Title case ("Git Activity", "Compare Revisions", "Clean Up Merged Branches", "Find a Regression (Bisect)", "Review Synchronization", "Local Branches", "Conflicted Files", "Incoming Commits", "Unstaged Changes", "Staged Changes", "Untracked Files"). One sentence-case dialog title: "Recover lost commits (reflog)".                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Labels of text, select and ref-name fields                              | Title case in 9: "Fetch URLs (one per line)", "Push URLs (blank uses fetch URLs)", "Default Push Remote", "Upstream Branch", "Absolute Folder Path", "Start Point (for a new branch)", "Filter Name", "Remote Branch", and the name field of Create Recovery Branch (`recoveryBranchName`, not quoted here because its English equals the inherited `typeBranchName`). Sentence case in 11: "Remote name", "Restore to path", "Author name or email", "File or folder path", "From date", "Through date", "Left revision", "Right revision", "Known good commit", "Known bad commit", "Mainline parent for merge commits". One-word labels: "Remote", "URL".                                                                                    |
| Checkbox labels                                                         | Sentence case in all 13 ("Set as upstream branch", "Prune deleted remote branches", "Include untracked files", "Force with lease (replace rewritten history)", "Fetch the latest remote revision before checkout", "Show changes introduced since the common ancestor", "Follow file renames", "Compare staged pointer").                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Select options                                                          | Sentence case in 4 ("Use Git default", "Filter to branch", "Focus direct history", "Focus all ancestors"), title case in 1 ("All Remotes"); the rest are single words ("None", "Pick", "Reword", "Squash", "Drop", "Fixup", "Subtle", "Strong").                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Picker label                                                            | "View" (one word, capitalized; the code adds the colon).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Tooltips                                                                | A tooltip that is a sentence is in sentence case and ends with a full stop (5: "Remote branches are shown in the graph. Click to hide them.", "Remote branches are hidden from the graph. Click to show them.", "Click or press Enter to view uncommitted changes.", "Ctrl/Cmd-click to select commits; Shift-click to select a range.", "Searches repository history, including commits beyond the loaded graph."). A tooltip that names a state or a thing has no final punctuation ("Upstream no longer exists", "Checked out at {0}", "Focus: {0}", "Parent commit records {0}", "{0}: {1} ahead, {2} behind"). A tooltip that repeats a button's name keeps its title case ("New Branch", "Add Remote", "Save Stash", "Settings & Tools"). |
| Accessible names (`aria-label`) of icon buttons, regions and separators | Sentence case without final punctuation (8: "Scroll graph horizontally", "Reveal selected lane", "Resize {0} column", "Actions for {0}", "Actions for remote {0}", "Actions for commit {0}", "Show remote {0} in the graph", "Hide remote {0} from the graph"). The commit table's name is a three-sentence hint with full stops ("Arrow keys move between commits. Enter opens details. Shift+F10 opens actions.").                                                                                                                                                                                                                                                                                                                            |
| Bold status headings                                                    | Sentence case, no punctuation: "Bisect in progress", "First bad commit", "{0} in progress", "Filtered history".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Short state words                                                       | Sentence case, no punctuation: "Locked", "Missing worktree", "Current worktree", "Not initialized", "No upstream configured", "Queued", "Running", "Completed", "Failed", "Unknown date". "Detached HEAD" keeps HEAD in capitals.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Error titles                                                            | Sentence case, starting "Unable to", no final punctuation, in all 10: "Unable to load the graph", "Unable to load remotes", "Unable to fetch", "Unable to push branch", "Unable to pull branch", "Unable to complete Git operation", "Unable to load repository details", and, with the reason after a colon, "Unable to load repositories: {0}", "Unable to open the graph: {0}", "Unable to open file history: {0}". Title case: 0.                                                                                                                                                                                                                                                                                                           |
| Error messages (reasons)                                                | Full sentences with full stops. Usually what is wrong, then what to do, in the imperative: "The branch changed. Refresh the graph and try again.", "Commit or stash your changes before rebasing.", "Enter a valid branch name.", "Choose a file, not a directory.", "A merge cannot be skipped. Continue or abort it."                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Hints, explanations and empty states                                    | Full sentences with full stops ("No stashes saved.", "Nothing matches this filter.", "No uncommitted changes.", "A dropped stash is hard to recover. Apply it first if you are not sure."). Exception: the two focus legends, parts joined by " · " and no final punctuation ("Direct history: full colour · Merged history: muted · Other commits: gray").                                                                                                                                                                                                                                                                                                                                                                                     |
| Running-dialog messages                                                 | Sentence case, no punctuation, no ellipsis (the dialog adds ` ...`): "Loading remotes", "Fetching", "Loading repository details", "Running Git operation".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Prompts above form fields                                               | Sentence case ending with a colon in 4: "Fetch updates from a remote:", "Push branch {0} to a remote:", "Pull into branch {0} (fast-forward only):", "Enter a local branch name for {0}. Existing branches will be fast-forwarded when possible:". Without a colon in 1: "Create a branch at {0}" (wording Q17). A dialog whose message is simply its action uses the action's title-case label ("Add Remote", "Save Stash", "Create Worktree", "File History").                                                                                                                                                                                                                                                                                |

### 4.2 Ellipsis

- The single character `…` (U+2026) in 6 strings; three ASCII full stops in 0.
- It ends filter-box placeholders ("Filter branches, tags and stashes…", "Filter repositories…", "Commit message or SHA…") and in-page loading text ("Loading branch focus…", "Loading…").
- Menu entries that open a dialog get `…` from code. One Branchwise entry carries it in the string ("Compare with…"); `menus.md` Q5 decided to keep that.
- Running-dialog messages have none (code appends ` ...`).

### 4.3 Punctuation

- **Error titles**: no final punctuation; a reason shown in the same line follows a colon and a space.
- **Confirmations**: a question mark; any further sentence ends with a full stop.
- **Tooltips**: see §4.1.
- **Names in text**: in dialog questions, names are placeholders that code shows in bold, never quoted in the string. In error messages, a name is quoted with straight single quotation marks: "Check out branch '{0}' before pulling it.", "Remote '{0}' is not configured for this repository." (4 strings; double quotation marks in 0).
- **Ampersand** in short labels only: "Settings & Tools", "Fetch & Preview Pull", "Fetch & Refresh Preview", "Workspace Fetch & Update". Sentences use "and".
- **A Git term in parentheses** after a plain description: "Recover lost commits (reflog)", "Move the current branch onto this (rebase)", "Edit commits after this (interactive rebase)", "Fold staged changes into this commit (fixup)", "Find a Regression (Bisect)", "View Graph (git log)".
- **Serial comma**: used in 2 ("…, main, master, and remote default branches are protected.", "mark it good, bad, or untestable"), omitted in 6 ("Filter branches, tags and stashes…", "Choose a soft, mixed or hard reset.", and four walkthrough descriptions such as "branches, tags and remotes").
- **Middle dot** " · " separates parts of a legend or of a detail line.

### 4.4 Confirmations

Branchwise's 13 confirmation questions all start with the action's verb and name its object. None asks whether the user is sure:

- "Remove remote {0} and its remote-tracking references? The remote server and local branches will remain."
- "Delete {0} from remote {1}? This changes the remote repository for everyone using it."
- "Permanently drop stash {0}?"
- "Remove worktree {0}? Git will refuse if it contains uncommitted or untracked files. Its branch will remain."
- "Rebase {0} onto {1}? This rewrites commits on the current branch and preserves merge structure. Commit or stash your changes first."
- "{0} the current {1}? Abort restores the pre-operation state; Skip discards the current patch."
- "Mark {0} as resolved and stage its current contents?"
- "Restore {0} from {1}? Its working file will be replaced; staged contents stay as they are."
- "Replace the history of {0} on {1}? The push will succeed only if the remote still points to the last fetched commit {2}."
- "End this bisect and return to {0}?"
- "Sync URLs for {0} and its nested submodules from .gitmodules?"
- "{0} for {1} and its nested submodules? Update checks out revision {2} recorded in the parent index."
- "Commit these staged changes as a fixup for {0}?"

Eight of them add a sentence about the consequence; others are followed by a muted explanation line from code (for example "A dropped stash is hard to recover. Apply it first if you are not sure."). The confirm button always repeats the action's own label in title case: "Remove Remote", "Delete Remote Branch", "Drop Stash", "Remove Worktree", "Start Rebase", "Continue" / "Abort" / "Skip Commit", "Stage Resolution", "Restore File Contents", "Reset Bisect", "Update to Recorded Revision". No Branchwise confirmation uses a "yes" button (0). The cancel button everywhere is the inherited `dialogCancel`. See wording Q4.

### 4.5 Spelling

| Pair                 | Branchwise's usage                                                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| colour / color       | "colour" in 5 strings ("All colours restored. …", "full colour" twice, and the two tab-icon settings), "color" in 0. Setting keys also use "Colour" (`graphColours`, `tabIconColourTheme`). |
| grey / gray          | "grey" in 1 ("Show a grey icon …"); "gray" in 2 (the two focus legends); the same "grey" string also says "grayscale".                                                                      |
| -ize / -ise          | "-ize" in 4 ("Initialize Submodule", "Not initialized", "Initialize the submodule before inspecting its commits.", "Review Synchronization"); "-ise" in 0.                                  |
| cancelled / canceled | "cancelled" in 1 ("The Git operation was cancelled."), "canceled" in 0.                                                                                                                     |
| centre / center      | Neither appears in Branchwise's strings (its code comments write "centred"). The inherited `config.autoCenterCommitDetailsView` description is the only user text on this.                  |

### 4.6 Terminology

- **repository**: always spelled out (22 strings); "repo" never.
- **The commit identifier**: no Branchwise string says "hash" or "commit ID". The search placeholder says "SHA" ("Commit message or SHA…"), the restore-undo message says "Git object {0}", and 16 strings say "revision" for any commit-like thing ("Left revision", "Open File at This Revision", "Compare Revisions", "Update checks out revision {2}"). See wording Q7.
- **check out**: as a verb, two words (6: "check out a branch to return", "Check out branch '{0}' before pulling it.", "Check out branch '{0}' before running this operation.", "Git checks out candidates", "Update checks out revision {2}", "Checked out at {0}"); as a noun, one word (8, for example "Original checkout", "Child checkout", "Fetch the latest remote revision before checkout", "The checkout changed. Review the bisect range again."); as an adjective, hyphenated (1: "the checked-out branch is bold"). The verb as one word: 0.
- **cherry-pick**: always hyphenated (3: "Cherry-pick", "Cherry-pick Selected", and a walkthrough description).
- **fast-forward**: always hyphenated, as noun, adjective and verb (5: "(fast-forward only)", "A fast-forward update is unavailable.", "Apply Reviewed Fast-forward", "will be fast-forwarded", "cannot be fast-forwarded").
- **uncommitted changes**: lower case in running text (5: "Click or press Enter to view uncommitted changes.", "No uncommitted changes.", "Hard discards uncommitted changes.", …).
- **working tree**: "working tree" in 2 ("Working Tree Changes", "{0} is not in the working tree. …"); for one file, "working file" and "current working contents" (2). "work tree": 0. "worktree" is reserved for Git worktrees ("Worktrees", "Create Worktree", "Current worktree").
- **index / staged**: the user's index is always described as staged or unstaged changes (11 strings: "Staged Changes", "Unstaged Changes", "Restore staged changes as staged", "Fold staged changes into this commit (fixup)", …). "index" appears only for a parent repository's index in submodule texts (3: "Parent index", "Parent index records {0}", "… recorded in the parent index.").
- **HEAD**: in capitals, used as a noun ("this HEAD", "Detached HEAD", "Local branch and HEAD movements.").
- **remote**: "remote" for a configured remote; "remote branch" for a remote-tracking branch in labels ("Remote Branch", "Delete Remote Branch"); "remote-tracking references" once, in the removal question.
- **upstream**: "Configure Upstream", "Upstream Branch", "Upstream no longer exists", "No upstream configured".
- **the graph** for the view, **Branchwise** for the product, **Git** capitalized for the program ("Git Activity", "Git continues running when this dialog is hidden."), **Visual Studio Code** spelled out in settings.
- **Address**: second person ("You can build and test here.", "Commit or stash your changes first.").

### 4.7 Settings, commands and walkthrough

- **Setting descriptions** (Branchwise's own, English): "Specifies …" sentences with a full stop in 3 ("Specifies the date format to be used in the date column of the graph.", "Specifies the date type to be displayed throughout Branchwise.", "Specifies the colour theme of the icon displayed on the Branchwise tab."); an imperative for a boolean, with its default, no final full stop, in 1 ("Show the current branch by default when Branchwise is opened. Default: false (show all branches)"); a no-effect notice in 1 ("No effect. Earlier versions fetched commit author avatars; that feature has been removed.").
- **Enum descriptions**: an imperative clause without final punctuation ("Show a grey icon which suits Visual Studio Code colour themes that are predominantly grayscale").
- **Commands**: title case, verb first ("View Graph (git log)", "View File History", "Show the Branches Pane", "Open Documentation", "Open Getting Started Walkthrough").
- **Walkthrough**: step titles in sentence case, verb first ("Open the graph", "Read the graph", "Act on a commit", "Use the Branches pane", "Focus a branch and hide remotes", "Recover from a mistake"); descriptions are full sentences with full stops.

---

## 5. zh-cn and zh-tw glossary and conventions

Derived only from the Branchwise-authored translations: the entries of `l10n/bundle.l10n.zh-cn.json` and `l10n/bundle.l10n.zh-tw.json` whose keys are not inherited (396 keys; the entry for `tooltipDeletions` is excluded although blame does not flag it), and the non-inherited entries of `package.nls.zh-cn.json` and `package.nls.zh-tw.json` (24 keys; the four zh-only inherited keys of §2.9 are excluded). Where the translations are not consistent, both renderings are given with counts (wording Q20).

### 5.1 Terms

| Term                                                | zh-cn                                                                                         | zh-tw                                                                 | Example (English key)                                                                                                                                    |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| branch                                              | 分支                                                                                          | 分支                                                                  | "Push Branch" → 推送分支                                                                                                                                 |
| commit (noun)                                       | 提交                                                                                          | 提交                                                                  | "Known good commit" → 已知正常的提交                                                                                                                     |
| commit (verb)                                       | 提交                                                                                          | 提交                                                                  | "Commit or stash your changes before rebasing." → 变基前请先提交或暂存更改。                                                                             |
| tag                                                 | 标签                                                                                          | 標籤                                                                  | "Delete Remote Tag" → 删除远程标签 / 刪除遠端標籤                                                                                                        |
| remote (noun)                                       | 远程仓库                                                                                      | 遠端儲存庫                                                            | "Add Remote" → 添加远程仓库 / 新增遠端儲存庫                                                                                                             |
| remote (modifier)                                   | 远程                                                                                          | 遠端                                                                  | "Remote Branch" → 远程分支 / 遠端分支                                                                                                                    |
| remote-tracking reference                           | 远程跟踪引用                                                                                  | 遠端追蹤參照                                                          | "Remove remote {0} and its remote-tracking references? …"                                                                                                |
| repository                                          | 仓库                                                                                          | 儲存庫 (majority); 存放庫 in 1 ("Unable to load repositories: {0}")   | "Fetch All Repositories" → 获取所有仓库 / 擷取所有儲存庫                                                                                                 |
| stash (noun)                                        | 暂存记录                                                                                      | 暫存紀錄                                                              | "Save Stash" → 保存暂存记录 / 儲存暫存紀錄                                                                                                               |
| stash (verb)                                        | 暂存                                                                                          | 暫存                                                                  | "Commit or stash your changes first." (in "Rebase {0} onto {1}? …") → 请先提交或暂存更改                                                                 |
| merge                                               | 合并                                                                                          | 合併                                                                  | "Merge" (`mergeOperation`); "Clean Up Merged Branches" → 清理已合并分支                                                                                  |
| rebase                                              | 变基                                                                                          | 重定基底                                                              | "Start Rebase" → 开始变基 / 開始重定基底                                                                                                                 |
| interactive rebase                                  | 交互式变基                                                                                    | 互動式重定基底                                                        | "Interactive Rebase"                                                                                                                                     |
| cherry-pick                                         | 拣选                                                                                          | 揀選                                                                  | "Cherry-pick Selected" → 拣选所选提交 / 揀選所選提交                                                                                                     |
| revert                                              | 还原                                                                                          | 還原                                                                  | "Revert Selected" → 还原所选提交 / 還原所選提交                                                                                                          |
| reset                                               | 重置                                                                                          | 重設                                                                  | "Reset Bisect" → 重置二分查找 / 重設二分搜尋                                                                                                             |
| soft / mixed / hard reset                           | 软重置 / 混合重置 / 硬重置                                                                    | 軟重設 / 混合重設 / 硬重設                                            | "Choose a soft, mixed or hard reset." → 请选择软重置、混合重置或硬重置。                                                                                 |
| check out (verb)                                    | 检出                                                                                          | 簽出 (14 strings); 檢出 (1: "Enter a local branch name for {0}. …")   | "Check out branch '{0}' before pulling it." → 拉取前请先检出分支“{0}”。 / 拉取前請先簽出分支「{0}」。                                                    |
| checkout (noun)                                     | 检出版本, 检出内容                                                                            | 簽出版本, 簽出內容                                                    | "Original checkout" → 原来的检出版本 / 原來的簽出版本                                                                                                    |
| checked-out                                         | 已检出                                                                                        | 已簽出                                                                | `walkthrough.readGraph.description`                                                                                                                      |
| detached HEAD                                       | 分离的 HEAD                                                                                   | 分離的 HEAD                                                           | "Detached HEAD"                                                                                                                                          |
| fast-forward                                        | 快进 (5)                                                                                      | 快轉 (2); 快進 (3)                                                    | "Pull into branch {0} (fast-forward only):" → …（仅快进）： / …（僅快進）：; "Apply Reviewed Fast-forward" → …快轉更新                                   |
| uncommitted changes                                 | 未提交的更改                                                                                  | 未提交的變更                                                          | "No uncommitted changes." → 没有未提交的更改。                                                                                                           |
| working tree                                        | 工作区 (4; the same word as "workspace")                                                      | 工作樹 (1), 工作目錄 (1), 工作區 (2, for "working file/contents")     | "Working Tree Changes" → 工作区更改 / 工作目錄變更                                                                                                       |
| workspace                                           | 工作区                                                                                        | 工作區                                                                | "Workspace"                                                                                                                                              |
| worktree                                            | 工作树                                                                                        | 工作樹                                                                | "Worktrees", "Create Worktree" → 创建工作树 / 建立工作樹                                                                                                 |
| staged / unstaged                                   | 已暂存 / 未暂存                                                                               | 已暫存 / 未暫存                                                       | "Staged Changes" → 已暂存的更改 / 已暫存的變更                                                                                                           |
| stage (verb)                                        | 暂存 (the same word as "stash")                                                               | 暫存                                                                  | "Stage Resolution" → 暂存解决结果 / 暫存解決結果                                                                                                         |
| index                                               | 索引                                                                                          | 索引                                                                  | "Parent index" → 父仓库索引 / 父儲存庫索引                                                                                                               |
| untracked                                           | 未跟踪                                                                                        | 未追蹤                                                                | "Untracked Files" → 未跟踪的文件 / 未追蹤的檔案                                                                                                          |
| graph                                               | 分支图 (13), 图表 (4), 图形 (2), 提交图 (2), 图 (alone, several)                              | 分支圖 (13), 圖表 (4), 圖形 (2), 提交圖 (2), 圖                       | "Unable to load the graph" → 无法加载分支图; "Show in Graph" → 在图表中显示; "Scroll graph horizontally" → 水平滚动图形                                  |
| clipboard                                           | no Branchwise example                                                                         | no Branchwise example                                                 | —                                                                                                                                                        |
| copy                                                | 复制                                                                                          | 複製                                                                  | "Copy Error Details" → 复制错误详情 / 複製錯誤詳細資料                                                                                                   |
| commit ID / hash                                    | no example; "SHA" stays in Latin letters                                                      | as zh-cn                                                              | "Commit message or SHA…" → 提交消息或 SHA… / 提交訊息或 SHA…; "Git object {0}" → Git 对象 {0} / Git 物件 {0}                                             |
| author                                              | 作者                                                                                          | 作者                                                                  | "Author name or email" → 作者姓名或电子邮件 / 作者姓名或電子郵件                                                                                         |
| committer                                           | no Branchwise example                                                                         | no Branchwise example                                                 | —                                                                                                                                                        |
| parent (of a commit)                                | 父提交                                                                                        | 父提交                                                                | "Mainline parent for merge commits" → 合并提交的主线父提交                                                                                               |
| parent (repository of a submodule)                  | 父仓库                                                                                        | 父儲存庫                                                              | "Parent commit" → 父仓库提交                                                                                                                             |
| annotated / lightweight tag                         | no Branchwise example                                                                         | no Branchwise example                                                 | —                                                                                                                                                        |
| push                                                | 推送                                                                                          | 推送                                                                  | "Preview Push" → 预览推送 / 預覽推送                                                                                                                     |
| fetch                                               | 获取                                                                                          | 擷取                                                                  | "Fetch"                                                                                                                                                  |
| pull                                                | 拉取                                                                                          | 拉取                                                                  | "Pull Branch"                                                                                                                                            |
| upstream                                            | 上游                                                                                          | 上游                                                                  | "Configure Upstream" → 配置上游 / 設定上游                                                                                                               |
| diff                                                | no direct example; "differences" is 差异                                                      | 差異                                                                  | "No file differences between these revisions." → 这些版本之间没有文件差异。                                                                              |
| binary file                                         | no Branchwise example                                                                         | no Branchwise example                                                 | —                                                                                                                                                        |
| rename                                              | 重命名                                                                                        | 重新命名                                                              | "Rename Remote"; "Follow file renames" → 跟踪文件重命名 / 追蹤檔案重新命名                                                                               |
| addition / deletion (of lines)                      | no Branchwise example (for commits: "Added Commits" 添加的提交, "Removed Commits" 移除的提交) | no example ("Added Commits" 新增的提交)                               | —                                                                                                                                                        |
| add                                                 | 添加                                                                                          | 新增                                                                  | "Add Remote"                                                                                                                                             |
| create / new                                        | 创建 / 新建                                                                                   | 建立 / 新增                                                           | "Create Worktree"; "New Branch" → 新建分支 / 新增分支                                                                                                    |
| delete / remove / drop                              | 删除 / 移除 / 丢弃                                                                            | 刪除 / 移除 / 捨棄                                                    | "Delete Selected Branches", "Remove Worktree", "Drop Stash"                                                                                              |
| restore / recover / undo                            | 恢复 / 恢复, 找回 / 撤销                                                                      | 還原 (the same word as "revert") / 復原, 找回 / 復原                  | "Restore File Contents", "Create Recovery Branch", "Undo Restore"                                                                                        |
| name                                                | 名称                                                                                          | 名稱                                                                  | "Remote name" → 远程仓库名称; "Enter a valid branch name." → 请输入有效的分支名称。                                                                      |
| message                                             | 消息 (2), 说明 (3), 信息 (1)                                                                  | 訊息 (3), 說明 (3)                                                    | "Commit message or SHA…" → 提交消息 / 提交訊息; "Reword" → 改写说明 / 改寫說明; "Each reworded commit needs a nonempty message." → …提交信息 / …提交訊息 |
| file / folder / path                                | 文件 / 文件夹 / 路径                                                                          | 檔案 / 資料夾 / 路徑                                                  | "File or folder path"                                                                                                                                    |
| history                                             | 历史                                                                                          | 歷史                                                                  | "File History"                                                                                                                                           |
| view (verb) / open                                  | 查看 / 打开                                                                                   | 檢視 / 開啟                                                           | "View Graph" → 查看分支图 / 檢視分支圖; "Open Conflict"                                                                                                  |
| refresh                                             | 刷新                                                                                          | 重新整理                                                              | "Branch focus unavailable. Refresh or select another branch."                                                                                            |
| load                                                | 加载                                                                                          | 載入                                                                  | "Loading remotes" → 正在加载远程仓库 / 正在載入遠端儲存庫                                                                                                |
| filter                                              | 筛选                                                                                          | 篩選                                                                  | "Filter repositories…"                                                                                                                                   |
| click                                               | 点击 (6), 单击 (2)                                                                            | 點選 (6), 按一下 (1)                                                  | "Click or press Enter to view uncommitted changes." → 单击… / 按一下…                                                                                    |
| select / choose                                     | 选择                                                                                          | 選取 (8, selecting in the UI); 選擇 (13, mostly "Choose …" in errors) | "Select all available repositories" → 选择… / 選取…; "Choose a valid commit." → 请选择… / 請選擇…                                                        |
| retry                                               | 重试                                                                                          | 重試                                                                  | "Retry", "Try Again"                                                                                                                                     |
| cancelled                                           | 已取消                                                                                        | 已取消                                                                | "The Git operation was cancelled."                                                                                                                       |
| error / details                                     | 错误 / 详情                                                                                   | 錯誤 / 詳細資料                                                       | "Error Details"                                                                                                                                          |
| settings / extension                                | 设置 / 扩展                                                                                   | 設定 / 延伸模組 (1), 擴充功能 (1)                                     | "Open Extension Settings" → 打开扩展设置 / 開啟延伸模組設定; "The extension did not answer in time: {0}" → 扩展未及时响应 / 擴充功能未及時回應           |
| colour                                              | 颜色                                                                                          | 色彩 (1), 顏色 (1)                                                    | "All colours restored. …" → 已恢复所有颜色 / 已恢復所有色彩; `config.tabIconColourTheme.grey` → 颜色主题 / 顏色主題                                      |
| full colour / gray                                  | 原色 / 灰色                                                                                   | 原色 / 灰色                                                           | the focus legends                                                                                                                                        |
| grayscale / theme / icon                            | 灰度 / 主题 / 图标                                                                            | 灰階 / 主題 / 圖示                                                    | `config.tabIconColourTheme.grey`                                                                                                                         |
| pane                                                | 面板 (3), 窗格 (1)                                                                            | 面板 (3), 窗格 (1)                                                    | `command.showBranches` → 显示分支面板; link text in `walkthrough.focusAndRemotes.description` → 显示分支窗格                                             |
| status strip / dialog                               | 状态栏 / 对话框                                                                               | 狀態列 / 對話方塊                                                     | "Git continues running when this dialog is hidden."                                                                                                      |
| reflog                                              | 引用日志                                                                                      | 參照日誌                                                              | "Recover lost commits (reflog)" → 找回丢失的提交（引用日志）                                                                                             |
| conflict                                            | 冲突                                                                                          | 衝突                                                                  | "Conflicted Files" → 冲突文件 / 衝突檔案                                                                                                                 |
| submodule / bisect                                  | 子模块 / 二分查找                                                                             | 子模組 / 二分搜尋                                                     | "Initialize Submodule", "Start Bisect"                                                                                                                   |
| date                                                | 日期                                                                                          | 日期                                                                  | "Unknown date" → 未知日期                                                                                                                                |
| Branchwise, Git, HEAD, SHA, URL, Visual Studio Code | kept in Latin letters                                                                         | kept in Latin letters                                                 | "开始使用 Branchwise", "Git 活动", "分离的 HEAD"                                                                                                         |

No Branchwise-authored translation exists for: clipboard, commit ID or hash, committer, annotated tag, lightweight tag, binary file, line additions and deletions, and the words of the inherited buttons and labels (yes, cancel as a button, close, dismiss, optional, type).

### 5.2 Conventions

- **Full-width punctuation** in running text: `，` `。` `：` `；` `？` `（` `）`, and `、` between listed items ("Filter branches, tags and stashes…" → 筛选分支、标签和暂存记录… / 篩選分支、標籤和暫存紀錄…). A parenthesis after Latin text is full-width too ("Fetch URLs (one per line)" → 获取 URL（每行一个）). One exception: `command.view` keeps an ASCII parenthesis after a space (查看分支图 (git log)). Kept as in English: the ellipsis `…`, the middle dot `·` with its spaces, and the en dash in "{0}–{1}". A slash between words becomes full-width `／` ("Arrange Fixup / Squash Commits" → 排列修正／压缩提交).
- **Quotation marks**: zh-cn uses “ ” and zh-tw uses 「 」, both where English has straight single quotes around a name ("Check out branch '{0}' before pulling it." → …检出分支“{0}”。 / …簽出分支「{0}」。) and around a UI element's name mentioned in text, even when the English has no quotes ("… so Recover lost commits can bring it back." → …可通过“找回丢失的提交”恢复 / …可透過「找回遺失的提交」復原; "… the status strip offers Continue and Abort …" → …提供“继续”和“中止”… / …提供「繼續」和「中止」…). 9 strings in each locale.
- **Spacing**: a half-width space between Chinese characters and Latin letters, digits or a placeholder that receives Latin text or numbers ("Git 操作", "HEAD 的", "按 Enter 查看", "已恢复 {0}。", "将分支 {0} 推送到远程仓库："). No space between a placeholder and full-width punctuation ("聚焦：{0}", "“{0}”", "{0}：领先 {1} 个提交"). **No space around a placeholder that receives localized Chinese text**: "{0} in progress" → 正在进行{0}; "{0} the current {1}? …" → 对当前{1}执行{0}？…; "Resize {0} column" → 调整{0}列宽 / 調整{0}欄寬; in "{0} for {1} and its nested submodules? …" → 对 {1} 及其嵌套子模块执行{0}？… (the path `{1}` has spaces, the action `{0}` has none).
- **Placeholders** may move to where Chinese grammar puts them ("Delete {0} from remote {1}?" → 从远程仓库 {1} 删除 {0}？; "Replace the history of {0} on {1}? …" → 替换 {1} 上 {0} 的历史？…). Each appears as often as in English.
- **Counts** take a measure word: 个 / 個 ("{0} commits selected" → 已选择 {0} 个提交 / 已選取 {0} 個提交; "{0} candidate commits remain" → 剩余 {0} 个候选提交; "{0}–{1} of {2}. …" → 第 {0}–{1} 个，共 {2} 个。…). Chinese has no plural, so singular and plural English strings can share a translation.
- **Buttons and menu entries**: a verb and its object, without particles or punctuation ("Save Stash" → 保存暂存记录; "Start Rebase" → 开始变基 / 開始重定基底; "Delete Selected Branches" → 删除所选分支 / 刪除所選分支). Confirm buttons repeat the action; no Branchwise translation uses a "yes" or "OK" word.
- **Confirmations**: a verb-first question ending in `？`, without 吗 / 嗎 and without a "sure" word (0 of each): "Permanently drop stash {0}?" → 永久丢弃暂存记录 {0}？ / 永久捨棄暫存紀錄 {0}？; "End this bisect and return to {0}?" → 结束此次二分查找并返回 {0}？.
- **Error titles**: 无法… / 無法… ("Unable to load remotes" → 无法加载远程仓库 / 無法載入遠端儲存庫), with a reason after `：` ("Unable to open file history: {0}" → 无法打开文件历史：{0}).
- **Progress text**: 正在… ("Fetching" → 正在获取 / 正在擷取; "Loading…" → 正在加载… / 正在載入…).
- **Instructions and errors** use 请 / 請 (70 and 69 strings); the user is addressed as 你 (2 strings each), never 您 (0).
- **Labels and titles** have no final punctuation; sentences end with `。`.
- **Settings**: the only Branchwise-authored zh settings texts are `config.fetchAvatars` (无效。早期版本会获取提交作者头像；该功能已被移除。 / 無效。早期版本會擷取提交作者頭像；此功能已移除。) and `config.tabIconColourTheme.grey` (显示适合以灰度为主的 Visual Studio Code 颜色主题的灰色图标 / 顯示適合以灰階為主的 Visual Studio Code 顏色主題的灰色圖示): an enum description without final punctuation, like its English. There is no Branchwise example of a zh "Specifies …" description.

---

## 6. Everything else that quotes an inherited string

Paths are relative to the repository root. "Loose" means the file names the element in its own words rather than quoting the string, but would read wrongly if the label changed. `CHANGELOG.md`, `node_modules`, `out`, `tests-ext/out`, `test-results` and `.vscode-test` were not searched.

### 6.1 Tests that assert or copy the English

These fail, or test the old text, once the wording changes; they must be updated with it.

| File                                                           | Lines → keys                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/webview/lib/menu-text.test.ts`                          | 80–84 → `addTag`, `createBranch`, `checkout`, `cherryPick`, `revert`, `merge`, `reset`, `copyCommitHash`; 91–93 → `checkoutBranch`, `renameBranch`, `deleteBranch`, `merge`, `copyBranchName`; 100 → `renameBranch`, `copyBranchName`; 107–108 and 112 → `checkoutBranch`, `copyBranchName`; 115–116 → `deleteTag`, `pushTag`, `copyTagName`; 124 → `labelCurrentBranch`; 127 → `addTag`, `dialogAddTagTitle`; 129–131 → `createBranch`, `dialogCreateBranchTitle`; 134–136 → `checkout`, `dialogCheckoutConfirm`; 142–144 → `cherryPick`, `dialogCherryPickConfirm`; 147–149 → `revert`, `dialogRevertConfirm`; 152–154 and 178–180 → `merge`, `dialogMergeConfirm`; 157–159 → `reset`, `dialogResetConfirm`; 165–167 → `renameBranch`, `dialogRenameBranchTitle`; 170–172 → `deleteBranch`, `labelBranch`, `dialogDeleteConfirm`; 183–185 → `deleteTag`, `labelTag`, `dialogDeleteConfirm`; 203–214 → `copyCommitHash`, `copyBranchName`, `copyTagName`, `unableToCopyToClipboard` with `typeCommitHash`, `typeBranchName`, `typeTagName`. |
| `tests/webview/components/commit/CommitDetails.test.ts`        | 35–39, 279–283, 308, 317 → `detailCommit`, `detailParents`, `detailAuthor`, `detailDate`, `detailCommitter`; 40, 128–129 → `close`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `tests/webview/components/commit/CommitTable.test.ts`          | 116–120 and 155–159 → `graph`, `description`, `date`, `author`, `commit`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `tests/webview/components/commit/CommitRowInteraction.test.ts` | 509, 518–519 → `uncommittedChanges`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `tests/webview/components/commit/FileTreeView.test.ts`         | 36–41 → the six file tooltips; 316–319 → `tooltipAddition`, `tooltipAdditions`, `tooltipDeletion`, `tooltipDeletions`; 334, 336, 356–360 → `tooltipRenamedTo`; 338 → `tooltipBinaryFile`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `tests/webview/components/commit/RefLabelDetails.test.ts`      | 114 → `labelCurrentBranch`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `tests/webview/components/ui/Dropdown.test.ts`                 | 881, 897 → `filterPlaceholder`; 882, 899 → `noResultsFound`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `tests/webview/lib/actions/clipboard-outcomes.test.ts`         | 118, 124, 134, 200 → `unableToCopyToClipboard`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `tests/extension/message-handler-graph.test.ts`                | 298 → `addedIn`; 299 → `deletedIn`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `tests/extension/rpc-wire.test.ts`                             | 91 → `repo`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `tests-ext/ui/history.test.cjs`                                | `refresh` 379, 753, 921, 1138, 1404, 1603, 1678, 1760, 1820, 2458; `branch` (picker label) 688, 1828, 1903, 2141, 2204, 2382; `uncommittedChanges` 712; `close` 756, 1134, 1249, 1471, 1494, 1545, 1569; `pushTag` 782–783; `deleteTag` 876, 906; `deleteBranch` 877; `reset` 878; `dialogCancel` 882, 899, 907; `dialogYes` 909; `merge` 923; `dialogYesMerge` 924; `dialogDismiss` 932; `noCommits` 1613; `showRemoteBranches` 1727, 1754, 1788, 1793, 1937, 1942; `showAll` 1903, 2564, 2586; `graph` 2307                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `tests-ext/ui/benchmark.cjs`                                   | 102 → `branch`; 172 → `loadMore`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

### 6.2 Tests that use the same words only as sample data

They pass their own strings to the component under test and do not read the bundle, so they keep passing; they are listed because they contain the inherited English.

| File                                                                          | Lines → key whose English they reuse                                                                                                          |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/webview/components/ui/Dropdown.test.ts`                                | 76, 115, 229, 747, 773 → `branch`; 207 → `showAll`                                                                                            |
| `tests/webview/components/repository/RefsScale.test.ts`                       | 148 → `branch`                                                                                                                                |
| `tests/webview/components/repository/RefsTiming.test.ts`                      | 111 → `branch`                                                                                                                                |
| `tests/webview/components/ui/Dialog.behaviour.test.ts`                        | 501–503, 510, 519 → `dialogAddTagName`, `dialogAddTagType`, `dialogAddTagMessage`, `dialogAddTagOptional` (a copy of the tag dialog's fields) |
| `tests/webview/components/ui/Dialog.test.ts`                                  | 196 → `dialogAddTagName`                                                                                                                      |
| `tests/webview/components/ui/DialogRefNames.test.ts`                          | 23 → `dialogAddTagName`                                                                                                                       |
| `tests/webview/webview-types.test.ts`                                         | 53 → `dialogAddTagName`; 106 → `checkout`                                                                                                     |
| `tests/webview/lib/actions/clipboard-outcomes.test.ts`                        | 50, 71, 79, 86, 92 → `typeCommitHash`                                                                                                         |
| `tests/webview/utils/format.test.ts`                                          | 8 → `refresh`; 12 → `dialogAddTagTitle` (the whole template)                                                                                  |
| `tests/webview/utils/format.pieces.test.ts`                                   | 65 → `tooltipRenamedTo` (the whole template)                                                                                                  |
| `tests/webview/lib/repository-queries.test.ts`                                | 537 → `dialogYes`                                                                                                                             |
| `tests/webview/lib/actions.test.ts`, `tests/webview/lib/branch-focus.test.ts` | 79 and 132 → `showAll`, in a comment and a test name                                                                                          |
| `oxlint/webview-text.test.cjs`                                                | 49, 57 → `dialogAddTagName` (lint-rule samples)                                                                                               |

### 6.3 Tests that exercise the wording indirectly

- `tests/webview/lib/menu-text.test.ts` builds its English table by reading the four `src/old-extension/l10n/*.ts` files and matching `key: vscode.l10n.t("…")` with a double-quoted literal (§1.3). It then asserts whole menus and questions.
- `tests/extension/rpc-wire.test.ts` loads the real `getWebviewLocalizedStrings` with `vscode.l10n.t` returning its argument, and asserts one English value and that there are more than 100 keys.
- `tests/extension/message-handler-graph.test.ts` runs the real `messageHandler.ts` with a `t` that fills `{0}`, so it sees the real diff titles.
- `tests-ext/ui/history.test.cjs` and `tests-ext/ui/benchmark.cjs` drive the built extension in an English VS Code, so they see the real bundle.
- `pnpm run l10n:check` (CI) regenerates `l10n/bundle.l10n.json` from the source, fails if it differs from the committed file, and then runs `scripts/check-l10n.js`.
- `tests/extension/activation-wiring.test.ts` checks that the extension hands the loaded bundle to `@vscode/l10n`; it does not look at the wording.
- Most other webview tests install `window.l10n` as a proxy that returns each key's own name (`tests/webview/test-utils.ts`, `tests/webview/components/commit/commit-view-fixtures.ts`, `graph-view-harness.ts`, `tests/webview/main/page-harness.ts`), so they depend on the keys, not on the wording.

### 6.4 User documentation

| File                            | Lines → keys                                                                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md`                     | 45 → `uncommittedChanges` (the row's name). Lines 104–115, the settings table, describe the settings of §2.9 in their own words and should stay consistent with the new descriptions. |
| `walkthroughs/open-graph.md`    | 12 → `repo`, `branch`                                                                                                                                                                 |
| `walkthroughs/read-graph.md`    | 7 → `uncommittedChanges`; 9 → `loadMore`                                                                                                                                              |
| `walkthroughs/branches-pane.md` | 5 → `showAll`, `checkout`; 6 → `checkout`                                                                                                                                             |
| `walkthroughs/act-on-commit.md` | loose: 5 → `addTag`, `createBranch`; 6 → `checkout`, `cherryPick`, `revert`; 7 → `merge`, `reset`                                                                                     |
| `docs/git-actions.md`           | 13, 21, 33 → `showAll`; 27 → `checkout`; 37 → `graph`; 41 → `description`; 45 → `noCommits`                                                                                           |
| `docs/preferences.md`           | 10, 31 → `showRemoteBranches`; 27 → `showAll`                                                                                                                                         |
| `todo.md`                       | 122 → `checkoutBranch` (loose); 462 → `uncommittedChanges`; 554 → `checkout`                                                                                                          |

### 6.5 Source code outside the l10n files

| File                                        | Lines → keys                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/old-extension/messageHandler.ts`       | 54 → `addedIn`, 55 → `deletedIn` (the strings themselves, in scope)                         |
| `src/webview/lib/stores.ts`                 | 82 → `showRemoteBranches` (comment)                                                         |
| `src/webview/pages/NoRepoPage.tsx`          | 40–41 → `initializeRepo` (comment quoting VS Code's command title, which equals the string) |
| `src/extension/handlers/initialize-repo.ts` | 4 → `initializeRepo` (the same)                                                             |

`package.json` contains no inherited string of this scope: its descriptions are `%…%` references. Its setting values are inherited but out of scope (wording Q26).

### 6.6 Clean-room specifications

These describe modules that were already rewritten, and quote the current English (and in `ui-kit.md`, the current Chinese) as observed behaviour. See wording Q23.

| File                                    | Lines → keys                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/clean-room/menus.md`              | String tables at 172–248 (every key of §2.3 to §2.5 that the menus use, with its English). Elsewhere: `labelCurrentBranch` 32, 271, 592, 593, 596, 907; `checkout` 82, 178, 309, 347, 536, 590, 621, 735, 806, 809, 812, 829, 868, 878, 879, 887, 904; `checkoutBranch` 158, 193, 436, 446, 503, 546, 561, 635, 636, 866, 869, 920; `branch` 117; `pushTag` 154, 202, 413, 568, 640, 776, 841, 901; `addTag` / `dialogAddTagSubmit` 176, 217, 306, 327, 336, 536, 588, 618, 619, 734, 806, 809, 811, 815; `createBranch` / `dialogCreateBranchSubmit` 177, 219, 307, 340, 344, 536, 589, 620, 735, 806, 809, 811, 817, 850, 883; `cherryPick` 179, 310, 355, 357, 536, 591, 604, 613, 766, 806, 809, 812; `revert` 311, 355, 536, 613, 813; `merge` 181, 313, 440, 537, 547, 777, 905; `reset` 182, 314, 537; `copyCommitHash` / `typeCommitHash` 188, 244, 321, 539, 651; `renameBranch` / `dialogRenameBranchSubmit` 196, 243, 438, 458, 462, 467, 546, 554, 594, 624, 869; `deleteBranch` 197, 439, 446, 472, 477, 547, 595, 625, 708, 779, 810, 814, 828, 869, 888; `copyBranchName` / `typeBranchName` 198, 245, 442, 460, 505, 547, 554, 562, 651, 845, 920; `deleteTag` 201, 412, 418, 568, 597, 627, 708, 776, 779, 781, 808, 810, 814, 829, 887; `copyTagName` / `typeTagName` 204, 246, 416, 568, 651, 843, 845; `dialogAddTagTitle` 210, 588; `dialogAddTagName` 104, 211, 331; `dialogAddTagType` 212, 332; `dialogAddTagTypeAnnotated` 213; `dialogAddTagTypeLightweight` 214, 880; `dialogAddTagMessage` 215, 334, 616, 881; `dialogAddTagOptional` 216, 335; `dialogCreateBranchTitle` 218, 589, 883; `dialogCheckoutConfirm` 220, 590; `dialogYes` 222, 352, 423, 776, 780, 888; `dialogCherryPickConfirm` 223, 591; `dialogYesCherryPick` 224, 360; `dialogRevertConfirm` 225; `dialogYesRevert` 226, 360; `dialogMergeConfirm` 227, 592, 596; `dialogMergeNoFastForward` 229; `dialogYesMerge` 230, 382, 486, 777, 888; `dialogResetConfirm` 231, 593; `dialogResetSoft`, `dialogResetMixed`, `dialogResetHard` 233–235; `dialogYesReset` 236, 391, 889; `dialogDeleteConfirm` 237, 595, 597; `labelTag` 238, 272, 597; `labelBranch` 239, 272, 595; `dialogDeleteForceDelete` 241, 476; `dialogRenameBranchTitle` 242, 594; `unableToCopyToClipboard` 248, 651, 845 |
| `docs/clean-room/dialog.md`             | `dialogAddTagName` 70, 388, 391, 553; `invalidCharacters` 92, 238 (filled with `dialogCreateBranchSubmit`), 394 (filled with `dialogAddTagSubmit`); `dialogDismiss` 140, 264, 265, 453, 456, 457, 461, 462, 603; `dialogYes` 159, 347, 400–402, 405, 527; `dialogCancel` 183, 342, 392, 401–404, 412, 418, 487, 488; `unableToCopyToClipboard` 264, 456, 584; `close` 141, 273, 469; `addTag` / `dialogAddTagSubmit` 386, 388, 392, 394–396; `dialogAddTagTitle`, `dialogAddTagTypeAnnotated` 388; `dialogAddTagType`, `dialogAddTagMessage`, `dialogAddTagOptional` 388, 391, 553; `deleteTag` 398, 404; `labelTag`, `dialogDeleteConfirm` 400; `reset` 407; `labelCurrentBranch` 409, 416; `dialogResetConfirm` 409; `dialogResetSoft`, `dialogResetMixed`, `dialogResetHard` 410; `dialogYesReset` 412; `merge` 414; `dialogMergeConfirm` 416; `dialogMergeNoFastForward` 417; `dialogYesMerge` 418; `unableToMergeBranch` 450–451                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `docs/clean-room/commit-view.md`        | 33–37, 278 → the five `detail…` keys; 38, 166, 274, 294 → `close`; 39–43 → `graph`, `description`, `date`, `author`, `commit`; 48, 468, 611, 670, 719 → `uncommittedChanges`; 52, 975 → `labelCurrentBranch`; 496 → `graph`, `description`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `docs/clean-room/file-tree-view.md`     | 96–101 → the six file tooltips; 253, 286, 289, 290, 319–321, 323, 424, 477 → `tooltipAddition(s)`, `tooltipDeletion(s)`; 100, 322 → `tooltipBinaryFile`; 101, 286, 323, 324, 425, 447 → `tooltipRenamedTo`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `docs/clean-room/webview-state.md`      | 357, 1264 → `unableToMergeBranch`; 442 → `showRemoteBranches`; 1257–1272 → the thirteen action failure titles; 1775 → `unableToLoadCommitDetails`; 1876, 1891 → `unableToViewDiff`; 2000 → `typeCommitHash`, `typeTagName`, `typeBranchName`; 2023, 2046, 2059–2064, 2091, 2100, 2107–2109, 2155 → `unableToCopyToClipboard` with the `type…` and `copy…` keys                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `docs/clean-room/ui-kit.md`             | 534 → `merge`; 638, 674 → `initializeRepo` (as VS Code's command title); 643–645, 691 → `noRepo`, `initializeRepo`, `unableToInitializeRepo`; 647 → their zh-cn translations; 693–701 → `unableToInitializeRepo`; 745 → `noCommits`, `createFirstCommit` with their zh-cn and zh-tw translations; 770, 782 → `noCommits`, `createFirstCommit`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `docs/clean-room/app-shell.md`          | 45, 341, 430 → `showAll`; 65, 482 → `showRemoteBranches`; 95, 241, 245 → `loadMore`; 98, 241 → `noCommits`; 358 → `repo`; 359 → `branch`; 364, 431, 432, 546 → `refresh`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `docs/clean-room/dropdown.md`           | 57, 70, 749, 889 → `branch`; 70 → `repo`; 70, 117, 752, 966 → `showAll`; 87, 183, 596, 891 → `filterPlaceholder`; 88, 981 → `noResultsFound`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `docs/clean-room/legacy-host.md`        | 47–48 (the ordered list of `messageHandler.ts` strings in §0.4), 307, 357, 419 → `addedIn`, `deletedIn`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `docs/clean-room/shared-types.md`       | 602 → `unableToLoadCommitDetails`; sample data: 599 → `dialogAddTagName`, 603 → `checkout`, 1149 → `refresh`, 1150 → `dialogAddTagTitle`, 1189 → `tooltipRenamedTo`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `docs/clean-room/extension-core.md`     | 834 → `initializeRepo` (as VS Code's command title); 850 → `unableToInitializeRepo`; 928 → `repo`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `docs/clean-room/actions.md`            | 50 → `showRemoteBranches`; 1077, 1247 → `showAll`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `docs/clean-room/backend-queries.md`    | 996 → `addedIn`, `deletedIn`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `docs/clean-room/backend-types.md`      | 441 → `addedIn`, `deletedIn`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `docs/clean-room/commit-details.md`     | 78, 598 → `unableToLoadCommitDetails`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `docs/clean-room/column-resize.md`      | 338 → `graph`, `description`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `docs/clean-room/date.md`               | 40 → `detailDate`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `docs/clean-room/graph-utils.md`        | 11 → `uncommittedChanges`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `docs/clean-room/strokes.md`            | 13, 80 → `uncommittedChanges`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `docs/clean-room/repository-actions.md` | 972 → `dialogAddTagName`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

No file outside the l10n files quotes an inherited `package.nls` value (English or Chinese).

---

## 7. Questions

Each states the current behaviour; none is decided here.

- **wording Q1. Coincidences with upstream.** `pnpm run provenance` counts any line that equals an upstream line, however it was written. The signature lines of `webviewL10n.ts` (§1.7) must stay as they are. A single-word label whose natural new English is the same word (a column header, the cancel button), or a standard Chinese term that Branchwise's own glossary already uses for the concept (§5.1), would reproduce the old line exactly. Should such lines be avoided by choosing other words, or accepted and listed in `scripts/provenance-reviewed.json`?
- **wording Q2. Bundle entries shared with Branchwise's own keys.** The English of `revert` is also Branchwise's `revertOperation`, and that of `typeBranchName` is also `recoveryBranchName` (§1.4). After rewording, those bundle entries and their inherited zh translations remain, because Branchwise's keys still use them, and they are still counted. Reword the two Branchwise keys (and their translations) too, or accept?
- **wording Q3. Menu entry and submit button pairs.** `addTag` / `dialogAddTagSubmit`, `createBranch` / `dialogCreateBranchSubmit` and `renameBranch` / `dialogRenameBranchSubmit` share one English string, and so one translation. Must each pair stay identical?
- **wording Q4. Confirmation style.** The inherited confirmations ask whether the user is sure, and are confirmed with a yes-type button (`dialogYes`, `dialogYesCherryPick`, `dialogYesRevert`, `dialogYesMerge`, `dialogYesReset`). Branchwise's 13 confirmations start with the action's verb and are confirmed with the action's own label (§4.4). The branch deletion already confirms with `deleteBranch`. Should the new wording follow Branchwise's pattern (the keys stay; only their text changes)? `dialogYes` serves both a non-destructive and a destructive dialog. `menus.md` Q9 kept the current keys.
- **wording Q5. Capitalization of failure titles.** The 13 inherited action failure titles and `unableToCopyToClipboard` use title case; `unableToLoadCommitDetails` and `unableToViewDiff` use sentence case, as do all 10 of Branchwise's (§4.1). Which?
- **wording Q6. Spelling of Git verbs.** The inherited labels use the one-word form as a verb (`checkout`, `checkoutBranch`, the checkout failure titles and question) and an unhyphenated cherry-pick (`cherryPick`, its failure title, question and button). Branchwise writes the verb as two words and always hyphenates cherry-pick (§4.6). Follow Branchwise?
- **wording Q7. The word for a commit's identifier.** `copyCommitHash` and `typeCommitHash` need one. Branchwise's own strings never say "hash" or "commit ID"; they use "SHA" once and "Git object" once, and elsewhere "commit" or "revision". Which term?
- **wording Q8. Fragments.** `labelTag` and `labelBranch` are nouns spliced between a verb and a name, and `labelCurrentBranch` serves both inside two questions and alone as a tooltip line (§2.4). Such fragments cannot adapt to grammar (articles, case, word order), and in zh one noun phrase may not read well in both roles. Also, the merge and reset questions speak of the current branch even while HEAD is detached (`menus.md` Q14 kept offering the actions). Should the questions become whole sentences with separate keys (a code change), or stay composed?
- **wording Q9. The repository picker's label** is an abbreviation; Branchwise never abbreviates "repository" (22 strings). Spell it out, given the header's space?
- **wording Q10. `initializeRepo` equals VS Code's own command title** for the command it runs, word for word. Keep the wording aligned with VS Code (and accept the coincidence, Q1), or reword?
- **wording Q11. `filterPlaceholder`** ends with three ASCII full stops where Branchwise uses `…` (6 strings, 0 with three full stops), and for the View picker it names view modes as if they were things to filter. Use `…`? Should the placeholder name the picker at all?
- **wording Q12. Unused strings.** `portableGitHint` and `dialogPushTagConfirm` are read by no code; `pushingTag` is shown only if `pushTag` translates to an empty string. Reword them, or delete them (a code change for `pushingTag`, which `lib/remote-actions.tsx` references)?
- **wording Q13. Capitals inside the copy failure.** `unableToCopyToClipboard` receives `typeCommitHash`, `typeTagName`, `typeBranchName`, or Branchwise's "Error Details", mid-sentence. The three inherited fragments appear nowhere else, so their case is free; "Error Details" is also a label elsewhere. If the title becomes sentence case, should the fragments be lower case, and what of "Error Details"?
- **wording Q14. `invalidCharacters` speaks only of characters**, but it also appears for names that are invalid as a whole (`HEAD`, `@`, a leading `-`, a trailing `.`, `..`, a `.lock` ending). Should the new text say the name is not valid instead?
- **wording Q15. Precision of the reset modes.** The current Hard option claims more loss than Git causes: `git reset --hard` leaves untracked files in place; the Soft option describes its effect with the Git term for the current commit pointer. How exact should the options be, given the room in a select and the explanation line under the question?
- **wording Q16. `tooltipBinaryFile`** says the file is binary, but the same tooltip appears for text files that a `-diff` attribute marks as binary (`commit-details.md` records this case). Say instead that no text diff is available?
- **wording Q17. Prompts and colons.** `dialogRenameBranchTitle` ends with a colon, `dialogCreateBranchTitle` does not; Branchwise's prompts end with a colon in 4 strings and not in 1 ("Create a branch at {0}"). One rule for prompts that label a field?
- **wording Q18. Branchwise's own capitalization is mixed** (§4.1): menu entries 32 title case against 7 sentence case; field labels 9 against 11; buttons 67 against 3; select options 1 against 4. Which rule do the reworded menu entries, labels and options follow?
- **wording Q19. Spelling variety.** "colour" (5) and never "color"; "grey" (1) against "gray" (2, plus "grayscale" in the "grey" string); "-ize" (4) against "-ise" (0); "cancelled" (1). The inherited `config.autoCenterCommitDetailsView` uses the American "center". Which spelling for the rewording?
- **wording Q20. zh inconsistencies in Branchwise's own translations** (§5.1): zh-tw check out 簽出 (14) against 檢出 (1), fast-forward 快轉 (2) against 快進 (3), repository 儲存庫 against 存放庫 (1), local 本機 (5) against 本地 (3), extension 延伸模組 (1) against 擴充功能 (1), colour 色彩 (1) against 顏色 (1); zh-cn graph 分支图 (13) / 图表 (4) / 图形 (2) / 提交图 (2); message 消息 / 说明 / 信息 in zh-cn and 訊息 / 說明 in zh-tw; click 点击 (6) / 单击 (2) and 點選 (6) / 按一下 (1); pane 面板 (3) / 窗格 (1) in both. Collisions: zh-cn 工作区 for both working tree and workspace; 暂存 / 暫存 for both stage and stash; zh-tw 還原 for both revert and restore. Which renderings should the new translations use?
- **wording Q21. `config.graphColours.item`** names two colour notations, but the setting's pattern also accepts `#RRGGBBAA` and an `rgba(` prefix with only three numbers. Say exactly what is accepted?
- **wording Q22. `loadMore` in the push review** closes the dialog and shows the branch's history, which is not what the graph's button does. Keep one key for both (the new text must then fit both), or give the review its own string (a code change)?
- **wording Q23. Clean-room specifications quote the old wording** (§6.6) as observed behaviour. Update them to the new wording, or leave them as the record of the rewrites they specified?
- **wording Q24. `package.nls*.json` are not checked** by `scripts/check-l10n.js` (or by anything else): a missing or stale zh setting description goes unnoticed. The new script is specified to behave like the old one. Should it also check them?
- **wording Q25. Edge cases of `scripts/check-l10n.js`.** A locale key named like a built-in object member (`toString`) is not reported as stale; a non-string value, or the object form that translator comments produce, crashes the script with a stack trace instead of a message; empty translations pass. Keep this behaviour exactly, or tighten it?
- **wording Q26. Setting values in `package.json`** (`"Date & Time"`, `"Date Only"`, `"Relative"`, `"Author Date"`, `"Commit Date"`, `"rounded"`, `"angular"`, `"colour"`, `"grey"`) are inherited lines and appear in the Settings editor, but they are stored in users' settings, so this specification leaves them alone. Is that right, or should they get `enumItemLabels` with new display text?

---

## Decisions

These decisions are the maintainer's answers to the questions above. Where they differ from anything earlier in this specification, they win. "Code change" means an edit outside the l10n files, kept to what the decision needs.

- **Q1. Coincidences are accepted, not avoided.** Write the clearest text. When that is a generic word or a standard term that happens to equal an upstream line (a column header, a cancel button, a standard Chinese term), keep it; the reviewer lists such lines in `scripts/provenance-reviewed.json`. The signature lines of `webviewL10n.ts` stay as they are.
- **Q2. Shared bundle entries.** The English of Branchwise's `revertOperation` and `recoveryBranchName` stays. Their bundle entries get fresh zh-cn and zh-tw translations, written from the glossary like every other new translation, replacing the current values without reading them.
- **Q3. Pairs stay identical.** Each dialog's submit button repeats its menu entry's label (`addTag` / `dialogAddTagSubmit`, `createBranch` / `dialogCreateBranchSubmit`, `renameBranch` / `dialogRenameBranchSubmit`).
- **Q4. Branchwise's confirmation style.** Questions start with the action's verb and name its object; no question asks whether the user is sure. Confirm buttons carry the action's own label in title case: `dialogYesCherryPick`, `dialogYesRevert`, `dialogYesMerge` and `dialogYesReset` become the short action verbs. `dialogYes` is removed. Code change: the commit checkout dialog submits with `checkout` and the tag deletion dialog with `deleteTag`, as the branch deletion already submits with `deleteBranch`.
- **Q5. Failure titles use sentence case**, beginning "Unable to", like Branchwise's ten.
- **Q6. Follow Branchwise.** The verb is "check out" (two words; "Check Out" in title case), the noun "checkout", and "cherry-pick" is always hyphenated ("Cherry-pick" in title case).
- **Q7. "commit ID"** names a commit's identifier (VS Code's term). zh-cn and zh-tw: 提交 ID.
- **Q8. Fragments stay composed**, with one exception. `labelTag`, `labelBranch` and `labelCurrentBranch` keep their places in the deletion, merge and reset questions and are written for that role (lower case in English; in zh, a noun phrase that reads well where the question puts it). The tooltip line of `components/commit/RefLabel.tsx` gets its own key in `webviewL10n.ts`, written as a tooltip that names a state (sentence case). The questions keep speaking of the current branch while HEAD is detached, as `menus.md` Q14 left it.
- **Q9. Spell the word out** ("Repository"). If the header then overflows in the UI harness or at the widths it checks, report it rather than abbreviating.
- **Q10. Keep VS Code's wording** for `initializeRepo`, since the button runs that command; the coincidence is recorded (Q1).
- **Q11.** End with `…` (U+2026), keep the placeholder, and write the text so it reads well for each of the three pickers.
- **Q12. Delete the unused strings**: `portableGitHint`, `dialogPushTagConfirm` and `pushingTag`. Code change: `lib/remote-actions.tsx` no longer passes a fallback title for a tag push.
- **Q13. Lower-case fragments.** `typeCommitHash`, `typeTagName` and `typeBranchName` are lower-case noun phrases, and Branchwise's `errorDetails` becomes lower case too; it is only ever inserted into this title. Its zh translations keep their values under the new key.
- **Q14. Speak of the name**, not of characters: the text says the entered name is not valid, and that this is why the action cannot be done.
- **Q15. Exact within the space.** No option may claim more than Git does: Hard discards uncommitted changes to tracked files and leaves untracked files alone. Say "uncommitted changes" as `explainReset` does, and do not claim that untracked files are removed. Name the moved thing as the branch, without the term HEAD.
- **Q16. Say that no text diff is available**, which is true for binary files and for files that a `-diff` attribute marks as binary.
- **Q17. A prompt that labels a field ends with a colon**, as four of Branchwise's five do.
- **Q18. Capitalization by element.**
  - **Title case:** buttons, context-menu entries, dialog and pane titles, column headers and picker labels.
  - **Sentence case:** field labels, checkbox labels, select options, tooltips, accessible names, status and state text, error titles, hints and messages.
  - **Lower case:** fragments inserted mid-sentence (Q8, Q13).
  - Branchwise's own strings are not changed to fit, except as these decisions name.
- **Q19. Spelling.** Use colour, grey, centre, "-ize" and cancelled. Also change "gray" to "grey" in Branchwise's two focus legends (`focusDirectHint`, `focusAncestorsHint`); their zh translations keep their values under the new keys.
- **Q20. zh renderings for the new translations.** Branchwise's existing translations are not changed.

  | Term                        | zh-cn               | zh-tw               |
  | --------------------------- | ------------------- | ------------------- |
  | check out                   | 检出                | 簽出                |
  | fast-forward                | 快进                | 快轉                |
  | repository                  | 仓库                | 儲存庫              |
  | local                       | 本地                | 本機                |
  | extension                   | 扩展                | 擴充功能            |
  | colour                      | 颜色                | 色彩                |
  | graph                       | 分支图              | 分支圖              |
  | message                     | 消息                | 訊息                |
  | click                       | 点击                | 點選                |
  | pane                        | 面板                | 面板                |
  | working tree                | 工作区              | 工作目錄            |
  | stage / unstage             | 暂存 / 取消暂存     | 暫存 / 取消暫存     |
  | clipboard                   | 剪贴板              | 剪貼簿              |
  | committer                   | 提交者              | 提交者              |
  | annotated / lightweight tag | 附注标签 / 轻量标签 | 附註標籤 / 輕量標籤 |
  | binary file                 | 二进制文件          | 二進位檔案          |

  The conventions of §5.2 apply.

- **Q21. Name the accepted forms exactly**, as the setting's pattern in `package.json` intends: `#RRGGBB`, `#RRGGBBAA`, `rgb(r, g, b)` and `rgba(r, g, b)`.
- **Q22. The push review gets its own string.** Code change: `components/history/WorkflowTools.tsx` reads a new Branchwise key, added to the table that holds the review's other strings, saying that the button shows the branch's history in the graph. `loadMore` is then written for the graph's button alone.
- **Q23. Leave the earlier specifications as they are**: they record the wording their rewrites were specified against. This document and `docs/provenance.md` say where the wording changed.
- **Q24. Check the settings translations too.** The new `scripts/check-l10n.js` also checks each `package.nls.<locale>.json` against `package.nls.json` with the same three checks, and prints a line for each file in the same form as for the bundles.
- **Q25. Tighten the edge cases.** Keys are compared as own properties, so `toString` is reported like any other stale key. A value that is not a string, including the object form, is reported as a problem of that file instead of crashing. An empty translation is reported as missing. Locale files are processed in sorted order. Messages for the existing checks keep their form (§3.5).
- **Q26. Correct, out of scope.** Setting values are stored in users' settings. They are left to the configuration batch.
