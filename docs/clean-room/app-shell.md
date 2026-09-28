# Clean-room specification: the application shell

This document says what five Branchwise modules must do, as seen from outside them. It is written for an engineer who will replace them without seeing their current source. It is based on the modules' callers and dependencies, the tests that render or load them, the UI workflow tests and UI harness that drive the packaged extension, the stylesheet, and behaviour observed by running the current code.

| Section | Module                              | Short name used for questions and gaps |
| ------- | ----------------------------------- | -------------------------------------- |
| A       | `src/webview/layout/GraphView.tsx`  | `graph`                                |
| B       | `src/webview/layout/MainHeader.tsx` | `header`                               |
| C       | `src/webview/App.tsx`               | `app`                                  |
| D       | `src/webview/main.tsx`              | `webmain`                              |
| E       | `src/main.ts`                       | `extmain`                              |

Every section has the same seven parts: Interface, Dependencies, Behaviour, Examples, Non-functional requirements, Test coverage (with each gap written as a test case), and Questions. Questions are numbered per module (`graph Q1`, `header Q1`, …) and gaps the same way (`graph G1`, …).

---

## 0. Common ground

### 0.1 How the behaviour was observed

- Repository at commit `71f1e92`, Node v22.22.2, Vitest 4.1.11, jsdom 30, Preact 10.29, `@preact/signals` 2.11, Tailwind CSS 4.3, Git 2.43.0, Linux.
- The repository's own tests that reach these modules were run: `tests/webview/components/commit/GraphErrors.test.ts`, `tests/webview/utils/date.test.ts` (webview project) and `tests/extension/activation.test.ts` (extension project). All pass. V8 coverage from those runs was used to find what they do not execute.
- Extra observations used throw-away Vitest files in a scratch directory under `/tmp` (deleted afterwards). They rendered the components in jsdom with the repository's own webview test setup (`tests/webview/setup.ts`, `tests/webview/test-utils.ts`), loaded the webview entry module against a fake extension that answered RPC requests, and ran `activate` with `vscode` and every dependency of `src/main.ts` replaced by recording fakes.
- The VS Code integration suite (`tests-ext/extension.test.ts`), the UI workflow tests (`tests-ext/ui/history.test.cjs`, `tests-ext/ui/benchmark.cjs`), the UI harness (`scripts/test-ui-harness.cjs`) and the package smoke test (`scripts/package-smoke.cjs`) need a real VS Code and could not be run here. What they check is taken from their source.
- No repository file was changed.

### 0.2 Facts about the webview test harness that constrain modules A–D

- The webview Vitest project runs `tests/webview/setup.ts` first. It defines a global `acquireVsCodeApi` returning one shared fake (`getState`, `setState`, `postMessage`, all `vi.fn`). `getState` returns `undefined`.
- `setupWebviewTest()` (in `tests/webview/test-utils.ts`) initializes the webview configuration once (with `initialLoadCommits: 300`, `loadMoreCommits: 100`) and replaces `window.l10n` with a proxy that returns **the key name** for every string. So in Vitest, a button whose text is `window.l10n.retry` reads `retry`, and a template such as `window.l10n.branchFocus` has no `{0}` in it.
- jsdom has no `ResizeObserver` and no `Element.prototype.scrollIntoView`. Tests that need them stub them (`date.test.ts` stubs `ResizeObserver` for the commit table). `GraphErrors.test.ts` stubs nothing, so every state of the graph view it reaches (error, loading, "no commits") must render without either API.
- Components read `@preact/signals` signals while rendering and re-render when they change. Tests change signals directly (`stores.graphErrors.value = {}`), wrap renders in `act`, and expect the DOM to follow.
- The linter (`oxlint`, rule `webview/no-hard-coded-text`, applied to `src/webview/**/*.tsx`) rejects any user-visible text with letters in JSX text, string children, or the attributes `aria-label`, `aria-description`, `aria-roledescription`, `aria-valuetext`, `alt`, `placeholder` and `title` unless it comes from `window.l10n`. Text without letters (such as `✓ `) is allowed. `pnpm run package` runs the linter, so a replacement must pass it.

### 0.3 Localized strings used by these modules

The webview shows only strings from `window.l10n` (type `LocalizedStrings` from `@/old-extension/l10n/webviewL10n`), plus the three shell strings that the page's HTML carries on `<html>` (read through `shellText`). The English values below are what the UI workflow tests match against. `{0}` is a placeholder.

| Key                        | English text                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| `branchesPane`             | Branches                                                                                  |
| `workspaceOverview`        | Workspace                                                                                 |
| `repo`                     | Repo                                                                                      |
| `branch`                   | Branch                                                                                    |
| `showAll`                  | Show All                                                                                  |
| `branchDisplay`            | View                                                                                      |
| `filterToBranch`           | Filter to branch                                                                          |
| `focusDirectHistory`       | Focus direct history                                                                      |
| `focusAllAncestors`        | Focus all ancestors                                                                       |
| `historySearch`            | Search history                                                                            |
| `refresh`                  | Refresh                                                                                   |
| `fetch`                    | Fetch                                                                                     |
| `compareSubmit`            | Compare                                                                                   |
| `settingsTools`            | Settings & Tools                                                                          |
| `manageRemotes`            | Remotes                                                                                   |
| `stashes`                  | Stashes                                                                                   |
| `worktrees`                | Worktrees                                                                                 |
| `workspaceSync`            | Workspace Fetch & Update                                                                  |
| `cleanupBranches`          | Clean Up Merged Branches                                                                  |
| `bisectTitle`              | Find a Regression (Bisect)                                                                |
| `reflog`                   | Recover lost commits (reflog)                                                             |
| `fileHistory`              | File History                                                                              |
| `historyPath`              | File or folder path                                                                       |
| `operationActivity`        | Git Activity                                                                              |
| `showRemoteBranches`       | Show Remote Branches                                                                      |
| `gettingStarted`           | Getting Started                                                                           |
| `learnMore`                | Learn more                                                                                |
| `openSettings`             | Open Extension Settings                                                                   |
| `unableToLoad`             | Unable to load the graph                                                                  |
| `retry`                    | Retry                                                                                     |
| `branchFocus`              | Focus: {0}                                                                                |
| `branchFocusPaused`        | Focus paused: {0}                                                                         |
| `focusPausedHint`          | All colours restored. Resume to focus the same branch.                                    |
| `branchFocusUnavailable`   | Branch focus unavailable. Refresh or select another branch.                               |
| `loadingBranchFocus`       | Loading branch focus…                                                                     |
| `focusAncestorsHint`       | All ancestors: full colour · Other commits: gray                                          |
| `focusDirectHint`          | Direct history: full colour · Merged history: muted · Other commits: gray                 |
| `pauseBranchFocus`         | Pause focus                                                                               |
| `resumeBranchFocus`        | Resume focus                                                                              |
| `focusDimming`             | Dimming                                                                                   |
| `focusDimmingSubtle`       | Subtle                                                                                    |
| `focusDimmingStrong`       | Strong                                                                                    |
| `clearBranchFocus`         | Clear focus                                                                               |
| `historyAt`                | History at {0}                                                                            |
| `filteredHistory`          | Filtered history                                                                          |
| `filteredHistoryHint`      | Commits between matches may be hidden.                                                    |
| `selectedCount`            | {0} commits selected                                                                      |
| `compareSelected`          | Compare Selected                                                                          |
| `batchCherryPick`          | Cherry-pick Selected                                                                      |
| `batchRevert`              | Revert Selected                                                                           |
| `clearSelection`           | Clear Selection                                                                           |
| `noHistoryMatches`         | No commits match these filters.                                                           |
| `commitMenuHint`           | Right-click a commit, or use its ⋯ button, for actions. On the keyboard, press Shift+F10. |
| `dialogDismiss`            | Dismiss                                                                                   |
| `loadMore`                 | Load More Commits                                                                         |
| `unableToLoadRepositories` | Unable to load repositories: {0}                                                          |

Strings shown by components that these modules render (not by the modules themselves) include `copyError` ("Copy Error Details"), `previousPage` ("Previous"), `nextPage` ("Next"), `noCommits` ("No commits yet"), `viewFailed` ("This view could not be shown: {0}") and `retryView` ("Try Again").

Shell strings (attributes of `<html>` written by `src/extension/html.ts`, read with `shellText`): `loading` = "Loading…", `initFailed` = "Unable to open the graph: {0}", `rpcTimeout` = "The extension did not answer in time: {0}".

The extension host module (E) localizes exactly one string with `vscode.l10n.t`: "View Graph". It is the first key of `l10n/bundle.l10n.json`, which `pnpm run l10n:check` regenerates from `src` and compares with the committed file. A replacement must localize the same single string with exactly that text, and no other, or the check fails.

### 0.4 Terms

- **Selected repository**: the store `selectedRepo` (a path with forward slashes).
- **Graph mode / history mode**: history mode is on when the navigation store `historyActive` is true, which happens when any text field of `historyFilter` (`text`, `author`, `since`, `until`, `path`, `revision`) is non-empty. The boolean `follow` alone does not turn it on. Graph mode is everything else.
- **Rows**: in graph mode, the store `commitList` (it may start with the synthetic uncommitted-changes row whose hash is `*`); in history mode, the entries of the current history page.
- **Focus target**: the computed store `branchFocusTarget`. It is defined when the view mode (`branchDisplay`) is `focus` or `ancestors` and a branch other than `*` is selected. It stays defined while focus is paused.
- **Repository query**: a request made with the hook `useRepositoryQuery`. It posts `{ command: "repositoryQuery", repo, requestId: "repository-panel-<n>", query }` to the extension, posts `{ command: "cancelRepositoryQuery", repo, requestId }` for a superseded one, and is sent again whenever the query, the selected repository or the store `repositoryRevision` (bumped by `refresh`) changes. It returns `{ data, error, loading }`. `data` survives a revision bump of an unchanged query. `error` belongs to the latest request only. `loading` is true from the moment a query is due until its answer.

---

## A. `src/webview/layout/GraphView.tsx`

### A.1 Interface

Module path `src/webview/layout/GraphView.tsx`, imported as `@/webview/layout/GraphView` or `./layout/GraphView`. One named export, no default export.

| Export      | Signature                                                                 | Meaning                                                                                                                                                             |
| ----------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GraphView` | `function GraphView(): JSX.Element` (Preact function component, no props) | The main area beside the sidebar: the commit graph, or the filtered history, with the banners and controls above and below it. It reads all its inputs from stores. |

Users:

| User                                                          | Uses                                                                                                 |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/webview/App.tsx`                                         | Renders `<GraphView />` inside an error boundary in the graph column.                                |
| `tests/webview/components/commit/GraphErrors.test.ts`         | `GraphView`, rendered with `h(GraphView, {})`. Checks the graph-error view, its Retry, and recovery. |
| `tests/webview/utils/date.test.ts` ("graph rendering")        | `GraphView`, rendered with `h(GraphView, {})` after loaded commits. Checks that every row renders.   |
| `tests-ext/ui/history.test.cjs`, `tests-ext/ui/benchmark.cjs` | Through the DOM only (see A.3.9).                                                                    |

### A.2 Dependencies the implementation must use

| Import path                                  | Names                                                                                                                                                                                                                                      | What for                                                                                                                                                                                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `preact/hooks`                               | a layout-effect hook                                                                                                                                                                                                                       | Restoring the scroll position once rows are on screen (A.3.7).                                                                                                                                                                                                   |
| `@/backend/utils/refs`                       | `branchListRef`                                                                                                                                                                                                                            | Turning a branch-list name (`main`, `remotes/origin/x`) into a full ref (`refs/heads/main`, `refs/remotes/origin/x`) for the history query.                                                                                                                      |
| `@/webview/components/commit/CommitTable`    | `CommitTable`                                                                                                                                                                                                                              | The table and graph. Props: `commits`, `head`, `headBranch`, `focus` (`{ direct: string[]; merged: string[] } \| null`), `keepMergedBright` (boolean), `dimming` (`"subtle" \| "strong"`).                                                                       |
| `@/webview/components/history/HistoryTools`  | `openCompare`, `openBatch`                                                                                                                                                                                                                 | "Compare Selected" and the batch cherry-pick / revert dialogs.                                                                                                                                                                                                   |
| `@/webview/components/history/QueryControls` | `QueryStatus`, `PageControls`                                                                                                                                                                                                              | `QueryStatus({ loading, error })` renders a spinner, or a box with the error in a `role="alert"` paragraph and a "Copy Error Details" button, or nothing. `PageControls({ offset, count, more, change })` renders "first–last" and Previous/Next (steps of 100). |
| `@/webview/components/ui/Button`             | `Button`                                                                                                                                                                                                                                   | Every action button except the hint's dismiss button.                                                                                                                                                                                                            |
| `@/webview/components/ui/Loading`            | `Loading`                                                                                                                                                                                                                                  | The inline spinner (`role="status"`, text from the shell string `loading`).                                                                                                                                                                                      |
| `@/webview/components/ui/Select`             | `Select`                                                                                                                                                                                                                                   | The native dimming `<select>`. Props: `options`, `value`, `onChange`, `aria-label`.                                                                                                                                                                              |
| `@/webview/lib/actions`                      | `refresh`, `loadMoreCommits`, `selectBranch`, `toggleBranchFocus`, `setFocusDimming`                                                                                                                                                       | Retry, Load More, Clear focus (`selectBranch("*")`), Pause/Resume, dimming changes.                                                                                                                                                                              |
| `@/webview/lib/hints`                        | `commitMenuHintDismissed`, `dismissCommitMenuHint`                                                                                                                                                                                         | Whether to show the commit-menu hint, and dismissing it (the dismissal is saved in the webview state under `hints.commitMenu`).                                                                                                                                  |
| `@/webview/lib/navigation`                   | `historyActive`, `historyFilter`, `historyOffset`, `selectedCommits`, `restoreScroll`                                                                                                                                                      | History mode, its filter and page offset, the multi-selection, and the pending scroll position.                                                                                                                                                                  |
| `@/webview/lib/stores`                       | `commitList`, `commitHead`, `headBranch`, `graphErrors`, `maxCommits`, `moreCommitsAvailable`, `selectedRepo`, `branchDisplay`, `branchFocusTarget`, `displayedBranch`, `focusPaused`, `focusDimming`, `showRemoteBranch`, `hiddenRemotes` | Graph data and view preferences. `displayedBranch()` returns the branch the graph is filtered to, or `""` when it is not filtered.                                                                                                                               |
| `@/webview/lib/use-repository-query`         | `useRepositoryQuery`                                                                                                                                                                                                                       | The history query and the branch-focus query.                                                                                                                                                                                                                    |
| `@/webview/pages/NoCommitsPage`              | `NoCommitsPage`                                                                                                                                                                                                                            | The page for a repository without commits (its text includes `window.l10n.noCommits`).                                                                                                                                                                           |
| `@/webview/types`                            | `FocusDimming` (type)                                                                                                                                                                                                                      | The dimming value type.                                                                                                                                                                                                                                          |

### A.3 Behaviour

#### A.3.1 Queries the view makes

1. **History query**, only in history mode. Query object:
   `{ kind: "history", showRemoteBranches: <showRemoteBranch>, hiddenRemotes: <hiddenRemotes>, filter: <historyFilter with revision replaced as below>, offset: <historyOffset> }`.
   - `filter.revision` is the filter's own revision when non-empty. When empty, it is the full ref of the branch the graph is filtered to (`branchListRef(displayedBranch())`), or `""` when the graph is not filtered (view mode `focus` or `ancestors`, or branch `*`).
   - Example: filter `{ text: "needle", … }`, view mode `filter`, selected branch `feature` → posted query `{"kind":"history","showRemoteBranches":true,"hiddenRemotes":[],"filter":{"text":"needle","author":"","since":"","until":"","path":"","revision":"refs/heads/feature","follow":false},"offset":0}`.
   - In graph mode no history query exists (any outstanding one is cancelled).
2. **Branch-focus query**, only when a focus target exists **and** there is at least one row: `{ kind: "branchFocus", branch: <branchFocusTarget>, hashes: <hash of every row, in row order> }`. In graph mode the rows include the uncommitted row `*` when present; in history mode they are the page's entries. Example: target `remotes/origin/x`, rows `a`, `b` → `{"kind":"branchFocus","branch":"remotes/origin/x","hashes":["a","b"]}`.
   Both queries are re-sent on every `refresh` (the revision bump) and whenever their inputs change.

#### A.3.2 Which view is shown (first match wins)

1. **History status view**: history mode, and the history query has an error, or it is loading and has no data to show. Renders a `<main>` with 12 px padding containing `QueryStatus` with the query's `loading` and `error`. So: a spinner while loading, or the error box (`<p role="alert">` with the error text, and "Copy Error Details"). There is no Retry button here. Changing page (a new offset) discards the previous page's data, so a page change shows this spinner. A refresh of an unchanged query keeps the old rows on screen while it loads; a refresh after an error shows the spinner. An error answer replaces rows already shown.
2. **Graph error view**: graph mode, and `graphErrors.loadBranches` or `graphErrors.loadCommits` is not `undefined` (an empty string counts as an error). Renders `<main data-graph-error>` (Preact writes `data-graph-error="true"`) with 12 px padding and 12 px vertical spacing, containing in order:
   - an `<h2>` (semibold) with `unableToLoad`;
   - `QueryStatus` with `loading` false and `error` = the branch error if it is not `undefined`, else the commit error; when that message is empty, `unableToLoad` is shown instead;
   - a `Button` whose text is exactly `retry`, which calls `refresh()`.
     The graph error view replaces the table even when rows were loaded earlier. History mode ignores graph errors.
     The heading must not carry `role="alert"`: the first `[role="alert"]` in the view must be the message paragraph, whose text is exactly the message.
3. **Loading view**: no rows are known (graph mode: `commitList` is `undefined`; history mode: the query has no data, is not loading and has no error). Renders `<main>` as a grid that grows to fill its flex parent and centres its content, containing `<Loading />`.
4. **No commits view**: graph mode, zero rows, and `commitHead` is `null`. Renders `<NoCommitsPage />` (its own `<main>`).
5. **Graph view**: everything else (A.3.3).

#### A.3.3 The graph view

A `<main>` that is a positioning context (`position: relative`), containing, in this order, each only when its condition holds:

1. **Focus banner**, when a focus target exists (both modes). A `<div role="status">`: one wrapping row, items centred, 12 px between items horizontally and 4 px between wrapped lines, 12 px horizontal and 6 px vertical padding, a soft bottom border, 12 px text. Children in order:
   - a `<span title="<full target, e.g. remotes/origin/x>">`, at most 20 rem wide, one line with an ellipsis, text = `branchFocusPaused` when paused else `branchFocus`, with `{0}` replaced by the target without a leading `remotes/` (see `graph Q1` for `$` in names);
   - a `<span>` in the muted colour whose text is, first match wins: `focusPausedHint` if paused; `branchFocusUnavailable` if the branch-focus query has an error; `loadingBranchFocus` if it is loading; `focusAncestorsHint` if the view mode is `ancestors`; else `focusDirectHint`;
   - a `Button`: `resumeBranchFocus` when paused, else `pauseBranchFocus`; it calls `toggleBranchFocus()`;
   - a `<label>` (row, items centred, 8 px gap) holding the text `focusDimming` followed by a `Select` with `aria-label` = `focusDimming`, options `[{ label: focusDimmingSubtle, value: "subtle" }, { label: focusDimmingStrong, value: "strong" }]`, value = `focusDimming`, change → `setFocusDimming(value)`;
   - a `Button` `clearBranchFocus` that calls `selectBranch("*")` (which also clears the pause).
     The banner must not carry `data-focus-branch` or `data-focus-paused`: the UI tests count those attributes and expect only the badges rendered elsewhere.
2. **Filtered-history banner**, in history mode. A `<div>`: wrapping row, items centred, content pushed to both ends, 8 px gap, soft bottom border, 12 px horizontal and 8 px vertical padding, 12 px muted text. Two `<span>`s:
   - left: the filter's `path` if non-empty; else, if the filter's own `revision` is non-empty, `historyAt` with `{0}` = the first 12 characters of that revision; else `filteredHistory`;
   - right: `filteredHistoryHint`.
3. **Selection bar**, when more than one commit is selected (`selectedCommits.length > 1`), both modes. A `<div>`: wrapping row, items centred, 8 px gap, soft bottom border, background `--vscode-list-inactiveSelectionBackground`, 12 px horizontal and 8 px vertical padding, 13 px text. Children:
   - `<span>` `selectedCount` with `{0}` = the count;
   - only when exactly two are selected: `Button` `compareSelected` → `openCompare(first selected hash, second selected hash)`, in selection order;
   - `Button` `batchCherryPick` → `openBatch("cherry-pick")`, disabled when more than 100 are selected;
   - `Button` `batchRevert` → `openBatch("revert")`, disabled when more than 100 are selected;
   - `Button` `clearSelection` → empties `selectedCommits`.
4. **No-matches message**, in history mode with zero rows: `<p>` with 24 px padding, muted, text `noHistoryMatches`. The (empty) table still follows.
5. **Commit-menu hint**, in graph mode while `commitMenuHintDismissed` is false. A `<div role="note">`: wrapping row, items centred, ends apart, 8 px gap, soft bottom border, 12 px horizontal and 6 px vertical padding, 12 px muted text. Children: `<span>` `commitMenuHint`, and a plain `<button type="button">` (not the shared `Button`: no border, 4 px radius, 6 px × 2 px padding, pointer cursor, hover background `rgba(128,128,128,0.2)`, 1 px focus outline in `--vscode-focusBorder`) with text `dialogDismiss`, which calls `dismissCommitMenuHint()`. The hint also goes away by itself when a commit context menu opens (behaviour of `@/webview/lib/hints`).
6. **`CommitTable`** with:
   - `commits` = the rows;
   - `head` = `commitHead`; `headBranch` = `headBranch` (both modes);
   - `focus` = `null` when focus is paused, or the branch-focus query is loading or has an error; otherwise the query's data (or `null` when there is none). So the table falls back to normal colours during every reload of the focus data;
   - `keepMergedBright` = view mode is `ancestors`;
   - `dimming` = `focusDimming`.
7. **Page controls**, in history mode when the query has data: a `<div>` with 12 px horizontal padding holding `PageControls` with `offset` = `historyOffset`, `count` = number of rows, `more` = the page's `more`, and `change(offset)` that sets `historyOffset` and empties `selectedCommits`.
8. **Load more**, in graph mode when `moreCommitsAvailable` is true:
   - while the row count is below `maxCommits` (a larger page has been asked for and has not arrived): `<Loading />`;
   - otherwise a `<div>` (centred, 16 px vertical padding) holding a `Button` `loadMore` that calls `loadMoreCommits()` (which raises `maxCommits` by the `loadMoreCommits` setting and asks again).

#### A.3.4 Graph mode with zero rows but a HEAD

Graph mode, zero rows, `commitHead` not `null`: the graph view is shown with only the hint (if not dismissed) and an empty table. No message.

#### A.3.5 Interactions and what callers observe

- Retry (graph error view) → `refresh()`: a new `loadBranches` request, a repository state query, and a `loadCommits` request when a branch is chosen; the old error for each re-sent query is cleared at once, so the error view disappears (GraphErrors.test observes this).
- Pause/Resume → `toggleBranchFocus()` flips `focusPaused` and saves the view preferences; the banner's texts and the table's colours follow.
- Dimming change → `setFocusDimming("strong" | "subtle")`.
- Clear focus → `selectBranch("*")`: the banner disappears (no focus target).
- Compare Selected → a content dialog "Compare Revisions" comparing the two selected hashes.
- Load More → one `loadCommits` request with `maxCommits` raised by 100 by default.
- Next/Previous page → `historyOffset` ± 100, selection cleared, a new history query.

#### A.3.6 Selection of what to render never posts messages itself

Only the two queries of A.3.1 and the actions the user triggers post messages. Rendering the error, loading or "no commits" views posts nothing.

#### A.3.7 Scroll restoration

Whenever the rows are known (not `undefined`) and the navigation store `restoreScroll` holds a number, the view schedules one animation frame. In that frame it scrolls the window to (0, that number) and sets `restoreScroll` to `null`. The check runs when the component first shows rows and again whenever the selected repository or the rows (array identity) change. If they change again, or the component unmounts, before the frame runs, the pending frame is cancelled (a new one is scheduled if the value is still pending). While rows are `undefined` nothing is scheduled. Observed: `restoreScroll = 420`, no rows → no scroll after 50 ms; rows arrive → `scrollTo(0, 420)` once and `restoreScroll` becomes `null`.

#### A.3.8 Look

The table fills the width of the main column. Borders use the soft line colour `rgba(128,128,128,0.25)`; muted text uses `--vscode-descriptionForeground`; the focus outline colour is `--vscode-focusBorder`. The class names in the current file are not a contract: no test, stylesheet rule or other module selects on them.

#### A.3.9 DOM contract relied on by others

| Selector or fact                                                                                                                                         | Relied on by                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The root of every state is a `<main>` element (the only `<main>` in the page)                                                                            | UI tests read `document.querySelector("main").innerText` (to find "Filtered history", a file path after File History, and to check "No commits yet" is absent during an error); the benchmark finds `main button` "Load More Commits". |
| `[data-graph-error]` on the error view's `<main>`, with a `[role=alert]` inside                                                                          | UI test "shows a graph error and retries…"; GraphErrors.test (first `[role="alert"]` text equals the message).                                                                                                                         |
| The error view's text includes "Unable to load the graph"; its Retry button text is exactly `retry`                                                      | UI test (`button("Retry", "[data-graph-error]")`); GraphErrors.test.                                                                                                                                                                   |
| `select[aria-label="Dimming"]`, a keyboard tab stop with a visible focus outline                                                                         | UI tests (value `subtle`/`strong`, keyboard type-ahead, focus contrast ≥ 3:1).                                                                                                                                                         |
| Buttons with exact texts "Pause focus", "Resume focus", "Clear focus", "Cherry-pick Selected", "Revert Selected", "Clear Selection", "Load More Commits" | UI tests find buttons by trimmed text.                                                                                                                                                                                                 |
| No `data-focus-branch` attributes in the banner                                                                                                          | UI tests count `[data-focus-branch="main"]` and expect 2.                                                                                                                                                                              |

### A.4 Examples

(Vitest, key-name strings unless stated.)

1. `commitList = undefined`, no errors, graph mode → `<main>` (centred grid) containing one `[role=status]` spinner; text empty (the shell string is absent in jsdom).
2. `graphErrors = { loadCommits: "" }` → `<main data-graph-error="true"><h2>unableToLoad</h2><div><p role="alert">unableToLoad</p><button>copyError</button></div><button>retry</button></main>`.
3. `graphErrors = { loadCommits: "C", loadBranches: "B" }` → alert text `B`.
4. Rows `[a, b]`, head `a`, `moreCommitsAvailable = true`, `maxCommits = 2` → children of `<main>`: hint `[role=note]`, table, load-more `<div>` with button `loadMore`. Clicking it → `maxCommits` 102, one `loadCommits` posted with `maxCommits: 102`; the load-more area becomes a spinner until the answer.
5. Rows `[]`, head `null`, graph mode → `NoCommitsPage` (text contains `noCommits`).
6. Rows `[]`, head `"abc"`, graph mode → `<main class=relative>` with the hint and an empty table.
7. View mode `focus`, branch `remotes/origin/x`, rows `[a, b]`: banner `<div role="status"><span title="remotes/origin/x">branchFocus</span><span>loadingBranchFocus</span><button>pauseBranchFocus</button><label>focusDimming<select aria-label="focusDimming">…</select></label><button>clearBranchFocus</button></div>`; after the focus answer the second span reads `focusDirectHint`; with view mode `ancestors`, `focusAncestorsHint`; after Pause, `branchFocusPaused` / `focusPausedHint` / `resumeBranchFocus`; after a query error, `branchFocusUnavailable`.
8. With real English templates: branch `remotes/origin/main` → first span "Focus: origin/main", title "remotes/origin/main".
9. History filter `{ revision: "0123456789abcdef0123" }` → banner "History at 0123456789ab" / "Commits between matches may be hidden."; filter `{ path: "dir/f.txt", revision: "abc" }` → "dir/f.txt"; filter `{ since: "2020-01-01" }` → "Filtered history".
10. History query answered with `status: "bad revision"` → `<main class="p-3"><div><p role="alert">bad revision</p><button>copyError</button></div></main>`.
11. Three selected commits → span "3 commits selected" (English), no Compare Selected; 101 selected → both batch buttons disabled, Clear Selection enabled.

### A.5 Non-functional requirements

- A Preact function component with no props; all inputs come from stores and hooks. It must re-render when any store it reads changes.
- No work at import time other than defining the component.
- It must not use `ResizeObserver` or `scrollIntoView` itself (see 0.2).
- All visible text from `window.l10n` (lint rule, 0.2).
- The scroll frame must be cancelled on unmount (no scroll after the view is gone).
- Rendering must stay cheap: the only per-render work beyond the stores is mapping the rows to their hashes for the focus query. The table itself (thousands of rows) is `CommitTable`'s concern.

### A.6 Test coverage

Covered:

- `GraphErrors.test.ts`: the graph error view with a commit error (alert text, no "noCommits", Retry sends a fresh `loadCommits` and clears the error; after an empty answer the view shows `NoCommitsPage`); a branch error shown when no commit request was made, cleared by selecting another repository. (The other two tests there exercise stores and handlers, not the view.)
- `date.test.ts` "renders every row when one commit has an out-of-range date": the graph view renders rows and the date placeholder.
- UI workflow tests: the focus banner (Dimming select, Pause/Resume, Clear focus), the selection bar (Cherry-pick/Revert/Clear Selection), filtered history text in `<main>`, the graph error view with Retry, Load More (benchmark).

Not covered by Vitest (V8 reported the history query, the scroll frame, and everything after the load-more condition as unexecuted), with test cases:

- **graph G1 — history status view.** Setup: rows loaded in graph mode; set `historyFilter` to `{ …emptyFilter(), text: "x" }`; render. Expect a `<main>` holding a spinner, and one posted `repositoryQuery` whose `query.kind` is `history` and whose `filter.text` is `x`. Then answer it with `status: "boom", data: null`. Expect `main [role=alert]` text `boom` and no `[data-graph-error]`.
- **graph G2 — history revision fallback.** Setup: view mode `filter`, selected branch `remotes/origin/x`, filter text `t`. Expect the posted query's `filter.revision` = `refs/remotes/origin/x`. With view mode `focus`, expect `""`. With filter revision `v1`, expect `v1`.
- **graph G3 — filtered banner texts.** For filters `{path:"p"}`, `{revision:"0123456789abcdef"}`, `{author:"a"}` after an answer with one entry: expect left span `p`, `historyAt` (with English template: "History at 0123456789ab"), `filteredHistory`; right span `filteredHistoryHint`.
- **graph G4 — page controls.** Answer a history query with 2 entries and `more: true`; select one commit; click `nextPage`. Expect `historyOffset` 100, `selectedCommits` empty, a new query with `offset: 100`, and the spinner view.
- **graph G5 — no matches.** Answer with zero entries. Expect `<p>` `noHistoryMatches` before the table, and no `[role=note]` hint.
- **graph G6 — focus banner states.** View mode `focus`, branch `main`, rows `[a]`. Expect `loadingBranchFocus`; answer with data → `focusDirectHint` and the row's `data-branch-relation="direct"`; bump `repositoryRevision` → `loadingBranchFocus` and relation `normal`; answer with an error → `branchFocusUnavailable`; set view mode `ancestors` and answer → `focusAncestorsHint`; click Pause → `focusPaused` true, texts `branchFocusPaused`/`focusPausedHint`/`resumeBranchFocus`, relation `normal`.
- **graph G7 — dimming and clear.** Change the banner `<select>` to `strong` (dispatch `change`). Expect `focusDimming` `strong`. Click `clearBranchFocus`. Expect `selectedBranch` `*`, `focusPaused` false, no banner.
- **graph G8 — selection bar.** Two selected → buttons `compareSelected`, `batchCherryPick`, `batchRevert`, `clearSelection`; clicking Compare opens a content dialog whose content has `left`/`right` equal to the two hashes in selection order. 101 selected → batch buttons disabled. Clear → selection empty and no bar.
- **graph G9 — hint.** Graph mode, hint not dismissed: `[role=note]` with `commitMenuHint` and a `dialogDismiss` button; click it → no note, and `setState` called with `{ hints: { commitMenu: true } }` merged into the saved state.
- **graph G10 — load more.** `moreCommitsAvailable` true, rows = `maxCommits` → button `loadMore`; click → posted `loadCommits` with `maxCommits` + 100, and a spinner in place of the button until an answer with that many rows.
- **graph G11 — scroll restore.** Stub `window.scrollTo`; set `restoreScroll = 420` with rows `undefined`; render; wait a frame → not called. Load rows; wait a frame → called once with `(0, 420)` and `restoreScroll` is `null`. Unmount before the frame → not called.
- **graph G12 — branch error wins.** `graphErrors = { loadCommits: "C", loadBranches: "B" }` → alert text `B`; `{ loadCommits: "" }` → alert text `unableToLoad`.
- **graph G13 — errors win over rows.** Rows loaded, then `graphErrors.loadCommits = "x"` → `[data-graph-error]` and no table.

### A.7 Questions

- **graph Q1.** Placeholders are filled with a plain string replacement, so `$` sequences in the inserted value are interpreted. A branch named `x$&y` (Git allows `$`) shows as "Focus: origin/x{0}y", and `a$$b` shows "Focus: a$b". The same applies to `historyAt` with a revision containing `$`. Intended: insert the value literally (as the RPC client does for its timeout text).
- **graph Q2.** The focus colours and the banner text drop back to "Loading branch focus…" / normal colours on every refresh, because the focus data is withheld while its query reloads even though the previous answer is still valid. Intended may be to keep the previous focus until the new answer arrives.
- **graph Q3.** In graph mode, a failed branch or commit reload replaces rows that are already on screen with the error view. Intended may be to show the error above the kept rows.
- **graph Q4.** The history status view has no Retry button (only Copy Error Details). The user must press Refresh in the header or change the filter.
- **graph Q5.** A history answer that has neither data nor an error leaves the view on the loading spinner forever (observed). The backend should not send that, but nothing recovers from it.
- **graph Q6.** Graph mode with zero rows but a HEAD commit shows an empty table without any message.
- **graph Q7.** "Compare Selected" compares the two commits in the order they were clicked, while the batch dialogs order the selection by graph position. Intended order is unclear.
- **graph Q8.** The batch buttons are disabled above 100 selected commits with no visible reason or tooltip.
- **graph Q9.** "History at {0}" shows the first 12 characters of the revision, which suits a hash but truncates a ref name (`refs/heads/feature-x` → `refs/heads/f`).
- **graph Q10.** When the filter has both a path and a revision (File History opened at a revision), the banner shows only the path.
- **graph Q11.** The Load More spinner relies on the backend returning exactly `maxCommits` rows (plus the uncommitted row) when more exist. If a larger page is asked for and its answer is dropped as stale, the spinner stays until the next reload.

---

## B. `src/webview/layout/MainHeader.tsx`

### B.1 Interface

Module path `src/webview/layout/MainHeader.tsx`, imported as `@/webview/layout/MainHeader` or `./layout/MainHeader`. One named export, no default export.

| Export       | Signature                                                            | Meaning                                                                                                                                                                                    |
| ------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `MainHeader` | `function MainHeader(props: { repos: Array<GitRepo> }): JSX.Element` | The sticky toolbar at the top of the page. `repos` is the list of repositories offered in the Repo picker, in display order; `GitRepo` is `{ name: string; path: string }` from `@/types`. |

Users: `src/webview/App.tsx` (passes its own `repos`). No Vitest test imports it. The UI workflow tests, the UI benchmark and the webview's focus-restoring helper use it through the DOM (B.3.8).

### B.2 Dependencies the implementation must use

| Import path                                       | Names                                                                                                                   | What for                                                                                                                                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `preact/hooks`                                    | a layout-effect hook, a ref hook                                                                                        | Measuring the rendered header (B.3.2).                                                                                                                                            |
| `@/types`                                         | `GitRepo` (type)                                                                                                        | The prop type.                                                                                                                                                                    |
| `@/webview/components/history/ActivityView`       | `ActivityIndicator`, `openActivity`                                                                                     | The running/failed-operation indicator, and the "Git Activity" menu item.                                                                                                         |
| `@/webview/components/history/HistoryTools`       | `openCompare`, `openReflog`, `openFileHistory`                                                                          | Compare, reflog and File History.                                                                                                                                                 |
| `@/webview/components/history/WorkflowTools`      | `openWorkspaceSync`, `openCleanup`                                                                                      | Menu items.                                                                                                                                                                       |
| `@/webview/components/repository/BisectView`      | `openBisect`                                                                                                            | Menu item.                                                                                                                                                                        |
| `@/webview/components/repository/RemoteManager`   | `openRemotes`                                                                                                           | Menu item.                                                                                                                                                                        |
| `@/webview/components/repository/StashManager`    | `openStashes`                                                                                                           | Menu item.                                                                                                                                                                        |
| `@/webview/components/repository/WorktreeManager` | `openWorktrees`                                                                                                         | Menu item.                                                                                                                                                                        |
| `@/webview/components/ui/Button`                  | `Button`                                                                                                                | All header buttons (renders `<button type="button">`, accepts `class`, `disabled`, ARIA props).                                                                                   |
| `@/webview/components/ui/Dropdown`                | `Dropdown`                                                                                                              | The three pickers. Its trigger is a `<button aria-haspopup="listbox">` whose `title` is the chosen option's value and which is named by a label element whose text is `<label>:`. |
| `@/webview/components/ui/Icons`                   | `SearchIcon`, `RefreshIcon`, `GearIcon`                                                                                 | Button icons (decorative, `aria-hidden`).                                                                                                                                         |
| `@/webview/constants`                             | `SHOW_ALL_BRANCHES` (`"*"`)                                                                                             | Value of the "Show All" choice.                                                                                                                                                   |
| `@/webview/lib/actions`                           | `selectRepo`, `selectBranch`, `setBranchDisplay`, `refresh`, `setShowRemoteBranch`, `openContextMenu`, `openFormDialog` | Picker changes, Refresh, the menu, the File History form.                                                                                                                         |
| `@/webview/lib/focus`                             | `focusSearch`                                                                                                           | Opening the search row and putting the caret in it.                                                                                                                               |
| `@/webview/lib/navigation`                        | `refsVisible`, `workspaceVisible`, `searchVisible`, `toggleRefs`, `toggleWorkspace`, `toggleSearch`, `selectedCommits`  | Pane and search toggles; Compare's endpoints.                                                                                                                                     |
| `@/webview/lib/remote-actions`                    | `openRemoteAction`                                                                                                      | Fetch.                                                                                                                                                                            |
| `@/webview/lib/rpc/rpc-client`                    | `rpcClient`                                                                                                             | The three menu items handled by the extension.                                                                                                                                    |
| `@/webview/lib/stores`                            | `selectedRepo`, `branchList`, `selectedBranch`, `branchDisplay`, `showRemoteBranch`                                     | Picker values and enabled states.                                                                                                                                                 |
| `@/webview/types`                                 | `BranchDisplay` (type)                                                                                                  | View mode type.                                                                                                                                                                   |

### B.3 Behaviour

#### B.3.1 Structure (DOM order is part of the contract)

A single `<header>` element containing, in order:

1. `Button` "Branches" (`branchesPane`), `aria-expanded` = `refsVisible`; when expanded it also gets the selected background (`rgba(128,128,128,0.25)`). Click → `toggleRefs()` (flips the pane and saves it in the webview state under `navigation.refs`).
2. `Button` "Workspace" (`workspaceOverview`), `aria-expanded` = `workspaceVisible`, same selected background when expanded. Click → `toggleWorkspace()`.
3. `Dropdown` label `repo` ("Repo"): one option per repository `{ label: name, value: path }`, in the order of `repos`. If a repository is selected and no entry of `repos` has exactly that path, one more option is appended at the end for it, labelled with the text after its last `/` (or the whole path when it has no `/`). Value = `selectedRepo`. Change → `selectRepo(path)`. Never disabled.
4. `Dropdown` label `branch` ("Branch"): first `{ label: showAll, value: "*" }`, then one option per entry of `branchList` in its order, labelled with the entry minus a leading `remotes/` and valued with the entry itself (`remotes/origin/x` → label `origin/x`). Value = `selectedBranch`. Change → `selectBranch(value)`. Disabled while `branchList` is `undefined`.
5. `Dropdown` label `branchDisplay` ("View"): options `filterToBranch`/`filter`, `focusDirectHistory`/`focus`, `focusAllAncestors`/`ancestors`. Value = `branchDisplay`. Change → `setBranchDisplay(value)`. Disabled while `branchList` is `undefined`.
6. A trailing group (pushed to the right edge, wrapping, items centred, 8 px gap) containing, in order:
   1. `ActivityIndicator` (renders nothing when no operation is running and no failure is unseen);
   2. `Button`, icon only (16 px search icon), `aria-label` and `title` = `historySearch` ("Search history"), `aria-expanded` = `searchVisible`, selected background when `searchVisible`. Click: if `searchVisible` → `toggleSearch()` (hides the row); otherwise → `focusSearch()` (shows the row, then after a 0 ms timer focuses the `[data-history-search]` input and selects its text);
   3. `Button` with a 14 px refresh icon followed by the text `refresh` ("Refresh"). Click → `refresh()`. Always enabled;
   4. `Button` `fetch` ("Fetch"), disabled when no repository is selected. Click → `openRemoteAction("fetch")` (opens a running dialog "Loading remotes" and posts `{ command: "loadRemotes", repo, requestId: "remote-<n>", branchName: null }`);
   5. `Button` `compareSubmit` ("Compare"), disabled when no repository is selected. Click → `openCompare(<hash of 1st selected commit or "HEAD">, <hash of 2nd selected commit or "HEAD">)`;
   6. `Button`, icon only (16 px gear), `aria-label` and `title` = `settingsTools` ("Settings & Tools"), `aria-haspopup="menu"`, disabled when no repository is selected. Click → `openContextMenu(event, "repository-tools", entries)` with the entries of B.3.3.

Every `Dropdown` gets the extra class that limits its trigger to 14 rem (224 px) wide (the trigger truncates its text).

#### B.3.2 Header height variable

Before the first paint after mounting, the component sets the CSS custom property `--main-header-height` on `document.documentElement` to the header's rendered height in pixels (`<height>px`, fractional values allowed, e.g. `61.5px`; `0px` in jsdom). It keeps the value current with a `ResizeObserver` on the header (the header wraps onto more lines in narrow windows). On unmount it disconnects the observer and removes the property. Readers: the sticky sidebar in `App` (fallback `3rem`), the sticky table header in `CommitTable` (fallback `0px`), and the stylesheet's `.branch-focus-row` scroll margin (fallback `0px`).

#### B.3.3 The Settings & Tools menu

Entries in order (`null` is a divider), each `{ title, onClick }`:

| #   | Title                                                                                        | Action                                                                                                                                                                                |
| --- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `manageRemotes` (Remotes)                                                                    | `openRemotes()`                                                                                                                                                                       |
| 2   | `stashes` (Stashes)                                                                          | `openStashes()`                                                                                                                                                                       |
| 3   | `worktrees` (Worktrees)                                                                      | `openWorktrees()`                                                                                                                                                                     |
| 4   | `workspaceSync` (Workspace Fetch & Update)                                                   | `openWorkspaceSync()`                                                                                                                                                                 |
| 5   | `cleanupBranches` (Clean Up Merged Branches)                                                 | `openCleanup()`                                                                                                                                                                       |
| 6   | `bisectTitle` (Find a Regression (Bisect))                                                   | `openBisect()`                                                                                                                                                                        |
| –   | divider                                                                                      |                                                                                                                                                                                       |
| 7   | `reflog` (Recover lost commits (reflog))                                                     | `openReflog()`                                                                                                                                                                        |
| 8   | `fileHistory` (File History)                                                                 | `openFormDialog({ message: fileHistory, inputs: [{ kind: "text", label: historyPath, value: "" }], action: fileHistory, source: null, onSubmit: ([file]) => openFileHistory(file) })` |
| 9   | `operationActivity` (Git Activity)                                                           | `openActivity()`                                                                                                                                                                      |
| –   | divider                                                                                      |                                                                                                                                                                                       |
| 10  | `"✓ "` + `showRemoteBranches` when remote branches are shown, else just `showRemoteBranches` | `setShowRemoteBranch(!showRemoteBranch)`                                                                                                                                              |
| 11  | `gettingStarted` (Getting Started)                                                           | `rpcClient.request("walkthrough.open", null)`, result ignored                                                                                                                         |
| 12  | `learnMore` (Learn more)                                                                     | `rpcClient.request("docs.open", null)`, result ignored                                                                                                                                |
| 13  | `openSettings` (Open Extension Settings)                                                     | `rpcClient.request("settings.open", null)`, result ignored                                                                                                                            |

The entries are built when the button is clicked, so the check mark reflects the state at that moment. The menu's source key is exactly `repository-tools`. A click from the keyboard (detail 0) places the menu under the button; a pointer click places it at the pointer (behaviour of `openContextMenu`). Submitting the File History form with path `src/x.ts` sets `historyFilter` to `{ text: "", author: "", since: "", until: "", path: "src/x.ts", revision: "", follow: true }` and closes the dialog.

#### B.3.4 Re-rendering

The header re-renders when any store it reads changes: the selected repository, the branch list, the selected branch, the view mode, the pane and search toggles. The `repos` prop comes from the parent.

#### B.3.5 Look

Pinned to the top of the viewport while the page scrolls (sticky, top 0), stacked above the sticky table header and the scroll shade (z-index 20), with the editor background (`--vscode-editor-background`) so content scrolling under it is hidden, a soft bottom border, 12 px horizontal and 8 px vertical padding, 13 px text. Items sit in one row, centred vertically, 8 px apart, and wrap onto more lines when the window is narrow; the trailing group stays right-aligned. Buttons use the shared `Button` look.

#### B.3.6 Disabled states summary

| Control                          | Disabled when               |
| -------------------------------- | --------------------------- |
| Branches, Workspace              | never                       |
| Repo picker                      | never                       |
| Branch and View pickers          | `branchList` is `undefined` |
| Search, Refresh                  | never                       |
| Fetch, Compare, Settings & Tools | no repository selected      |

#### B.3.7 Errors

The component throws when `ResizeObserver` is missing (observed: `ReferenceError: ResizeObserver is not defined` on mount in jsdom). Every action it starts reports its own errors through dialogs.

#### B.3.8 DOM contract relied on by others

| Selector or fact                                                                                                                                      | Relied on by                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| A `<header>` element exists (together with `[data-branchwise]`) once the graph page is up                                                             | UI tests locate the graph's webview context with `document.querySelector("header")`.                                                |
| `header button[aria-haspopup="listbox"]`: exactly the three picker triggers, at least three                                                           | UI tests (narrow-window dropdown placement, repo selection).                                                                        |
| The Repo trigger's `title` is the selected repository path                                                                                            | UI tests wait for `title === <repo path>`.                                                                                          |
| The Branch trigger's `title` is the selected branch value (`*`, `main`, `remotes/mirror/main`, …); the View trigger's is `filter`/`focus`/`ancestors` | UI tests (`header button[title="*"]`, `[title="ancestors"]`, …) and the benchmark (clicks `header button[title=<focused branch>]`). |
| Picker labels read "Repo:", "Branch:", "View:" (the Dropdown adds the colon)                                                                          | UI helper `headerChoice(label, option)`.                                                                                            |
| Branch options: "Show All" and branch names without `remotes/`; an option's `title` starts with `remotes/…` for remote branches                       | UI tests.                                                                                                                           |
| Buttons found by text or `aria-label`: "Branches", "Workspace", "Search history", "Refresh", "Compare", "Settings & Tools"                            | UI tests; the benchmark.                                                                                                            |
| Header comes before every other button labelled "Refresh" in document order                                                                           | UI helper `button("Refresh")` picks the first enabled match.                                                                        |
| The first `header button` is a sensible focus fallback                                                                                                | `@/webview/lib/focus` falls back to `[data-history-search], header button` when the element that opened a dialog is gone.           |
| Menu items "Remotes", "Stashes", "Worktrees", "Recover lost commits (reflog)", "Git Activity", "Clean Up Merged Branches", "Workspace Fetch & Update" | UI tests click `[role=menuitem]` by text after "Settings & Tools".                                                                  |
| `--main-header-height` equals the header's height, also after it wraps                                                                                | UI tests: at 650 px and 880 px the table header's top and the sidebar's top equal the header's bottom/height within 1 px.           |

### B.4 Examples

(Vitest, key-name strings.)

1. `repos = [{a,/r/a},{b,/r/b}]`, selected `/r/a`, branch list `["main","remotes/origin/x"]`, branch `*`, view `filter`, panes: Branches open, Workspace closed, search closed. Buttons in order: `branchesPane` (`aria-expanded="true"`, selected background), `workspaceOverview` (`"false"`), Repo trigger (`title="/r/a"`, text `a`), Branch trigger (`title="*"`, text `showAll`), View trigger (`title="filter"`, text `filterToBranch`), search (`aria-label="historySearch"`, `aria-expanded="false"`), `refresh`, `fetch`, `compareSubmit`, gear (`aria-label="settingsTools"`, `aria-haspopup="menu"`). `--main-header-height` = `0px`.
2. Selected `/r/zzz/deep` not in `repos` → Repo trigger title `/r/zzz/deep`, text `deep`; options `a|/r/a`, `b|/r/b`, `deep|/r/zzz/deep`.
3. Nothing selected, empty `repos`, `branchList` undefined → Branch and View triggers disabled; `fetch`, `compareSubmit`, `settingsTools` disabled; the others enabled.
4. Branch `remotes/origin/x`, view `ancestors` → Branch trigger title `remotes/origin/x`, text `origin/x`; View trigger title `ancestors`. Branch options: `showAll` (title `*`), `main` (no title), `origin/x` (title `remotes/origin/x`).
5. Gear click with remote branches shown → menu source `repository-tools`, titles `manageRemotes, stashes, worktrees, workspaceSync, cleanupBranches, bisectTitle, —, reflog, fileHistory, operationActivity, —, ✓ showRemoteBranches, gettingStarted, learnMore, openSettings`. With them hidden, `showRemoteBranches` without the mark; choosing it turns them on and posts `loadBranches`, `loadCommits` and `saveRepoState`.
6. Getting Started, Learn more, Open Extension Settings → posted `{ kind: "rpc.request", method: "walkthrough.open" | "docs.open" | "settings.open", params: null, id }`.
7. Compare with no selection → dialog content props `{ left: "HEAD", right: "HEAD" }`; one selected `h1` → `{ left: "h1", right: "HEAD" }`; three selected → first two.
8. Search click while hidden → `searchVisible` true at once; the input `[data-history-search]` is focused with its whole text selected after the 0 ms timer. Second click → hidden.
9. Unmount → `--main-header-height` removed from `document.documentElement.style`.

### B.5 Non-functional requirements

- Requires `ResizeObserver` (VS Code's webview has it; tests must stub it).
- The custom property must be set before the first paint, so the sticky elements never start at the wrong offset.
- Exactly one observer per mounted header, disconnected on unmount.
- No work at import time other than defining the component.
- All visible text from `window.l10n` (0.2). Icon-only buttons need their `aria-label` and `title`.
- Keyboard: every control is a native button (or the Dropdown's), reachable with Tab and showing a 1 px focus outline in the focus colour (the UI tests measure focus visibility and contrast on header controls indirectly through focus return to "Compare").

### B.6 Test coverage

Covered only by the UI workflow tests (real VS Code): picker triggers and titles, choosing options, pickers inside narrow windows, Branches/Workspace/Search toggles, Refresh, Compare (dialog, focus return), Settings & Tools menu items, sticky table header and sidebar following the header's wrapped height. No Vitest test renders `MainHeader` (V8: 0 % of the file).

Gaps, as Vitest cases (stub `ResizeObserver` and `Element.prototype.scrollIntoView`):

- **header G1 — order and names.** Render with example 1's state. Expect the button sequence and attributes of B.4 example 1.
- **header G2 — height variable.** Stub `ResizeObserver` to capture its callback and `observe` target; stub the header's `getBoundingClientRect` to height 48. Render → property `48px`. Change the stub to 70 and call the callback → `70px`. Unmount → property removed and `disconnect` called.
- **header G3 — missing selected repository.** Example 2. Also selected `/r/trailing/` → appended option label `""` (see `header Q1`).
- **header G4 — disabled states.** Example 3 and the table of B.3.6.
- **header G5 — branch options.** Example 4. Choosing `origin/x` calls `selectBranch("remotes/origin/x")`; choosing the current value calls nothing.
- **header G6 — toggles.** Click Branches → `refsVisible` flipped, `aria-expanded` follows, `setState` receives `navigation.refs`. Same for Workspace.
- **header G7 — search button.** Example 8, with fake timers.
- **header G8 — menu.** Example 5 (titles, dividers, source), then each entry's action: e.g. File History → form dialog with one text input labelled `historyPath`, submit `src/x.ts` → `historyFilter.path` `src/x.ts`, `follow` true, dialog closed.
- **header G9 — RPC items.** Example 6.
- **header G10 — Compare and Fetch.** Example 7; Fetch posts `loadRemotes` with `branchName: null` and opens a running dialog.
- **header G11 — no ResizeObserver.** Without the stub, mounting throws (documents the requirement).

### B.7 Questions

- **header Q1.** The name of a selected repository missing from the list is the text after the last `/`. A path ending in `/` gives an empty label (observed), and a path with backslashes gives the whole path. Paths are normally forward-slash and without a trailing slash, so this may only matter for unexpected input.
- **header Q2.** Refresh stays enabled without a repository (it then does nothing), while Fetch, Compare and Settings & Tools are disabled.
- **header Q3.** "Show Remote Branches" shows its state with a `✓ ` text prefix. Assistive technology hears "check mark Show Remote Branches" and gets no checked state (`menuitemcheckbox`/`aria-checked`).
- **header Q4.** Header Compare uses the first two selected commits in click order and silently ignores further ones; with one selected it compares it with HEAD.
- **header Q5.** Submitting the File History form with an empty path clears the current history filter (the new filter has only `follow: true`), which ends an active search.
- **header Q6.** The search button's `aria-expanded` reflects only the saved "search row open" flag, but the row is also shown whenever a filter is active. Then the button reports "collapsed" while the row is visible, and a click focuses the row instead of hiding it.
- **header Q7.** The gear button declares `aria-haspopup="menu"` but has no `aria-expanded` while its menu is open.
- **header Q8.** The height variable is removed on unmount even if another header were mounted (only one exists today).
- **header Q9.** The View picker is enabled for a repository with an empty branch list; choosing a focus mode then keeps `*` and shows no focus.

---

## C. `src/webview/App.tsx`

### C.1 Interface

Module path `src/webview/App.tsx`, imported as `./App` by the webview entry. One named export, no default export.

| Export | Signature                                                     | Meaning                                                                                                                                                                                     |
| ------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `App`  | `function App(props: { repos: Array<GitRepo> }): JSX.Element` | The page when at least one repository is known: header, optional search row, repository status, sidebar and graph, plus the page-wide helpers. `repos` is passed to `MainHeader` unchanged. |

Users: `src/webview/main.tsx` only. No test imports it; the UI tests and harness see it through the DOM.

### C.2 Dependencies the implementation must use

| Import path                                | Names                                                               | What for                                                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `@/types`                                  | `GitRepo` (type)                                                    | Prop type.                                                                                                             |
| `./layout/MainHeader`                      | `MainHeader`                                                        | The header.                                                                                                            |
| `./layout/GraphView`                       | `GraphView`                                                         | The graph column.                                                                                                      |
| `./components/history/SearchBar`           | `SearchBar`                                                         | The search row (`<form role="search">` with the `[data-history-search]` input).                                        |
| `./components/repository/RepositoryStatus` | `RepositoryStatus`                                                  | The operation / tracking status strip (renders nothing until state is known).                                          |
| `./components/repository/RefsPane`         | `RefsPane`                                                          | The Branches pane (`<nav aria-label="Branches">`).                                                                     |
| `./components/history/WorkspacePane`       | `WorkspacePane`                                                     | The Workspace pane (`<aside aria-label="Workspace">`).                                                                 |
| `./components/history/NavigationEffects`   | `NavigationEffects`                                                 | Page-wide listeners (saves scroll/navigation, `/` and Ctrl/Cmd+F open search). Renders nothing.                        |
| `./components/ui/ScrollShadow`             | `ScrollShadow`                                                      | The shade along the top edge while scrolled.                                                                           |
| `./components/ui/ContextMenu`              | `ContextMenu`                                                       | The single context menu.                                                                                               |
| `./components/ui/Dialog`                   | `Dialog`                                                            | The single dialog.                                                                                                     |
| `./components/ui/ErrorBoundary`            | `ErrorBoundary`                                                     | Keeps a failure in the graph or the dialog from blanking the page ("This view could not be shown: {0}" + "Try Again"). |
| `./lib/navigation`                         | `refsVisible`, `workspaceVisible`, `searchVisible`, `historyActive` | Which optional parts to show.                                                                                          |

### C.3 Behaviour

A single root `<div data-branchwise>` (Preact writes `data-branchwise="true"`), a full-height column (at least the viewport's height). Its children, in DOM order:

1. `<MainHeader repos={repos} />`.
2. `<SearchBar />`, only when `searchVisible` or `historyActive` is true.
3. `<RepositoryStatus />`.
4. The **content row**: a flex container that grows to fill the remaining height, may shrink below its content's width, aligns its children to the top, stacks them vertically below 768 px (Tailwind `md`) and lays them side by side from 768 px up. It holds:
   1. The **sidebar**, only when `refsVisible` or `workspaceVisible` is true: a vertical stack holding `<RefsPane />` (when `refsVisible`) and then `<WorkspacePane />` (when `workspaceVisible`), each a direct child of the sidebar. It does not shrink, has a soft right border, and is full width below 768 px. From 768 px up it is sticky, with its top at `var(--main-header-height, 3rem)` and its height `100vh − var(--main-header-height, 3rem)`, 18 rem (288 px) wide but never more than 40 % of the viewport width.
   2. The **graph column**: grows to take the rest, full width when stacked, may shrink below its content's width; it holds `<ErrorBoundary><GraphView /></ErrorBoundary>`.
5. `<NavigationEffects />`.
6. `<ScrollShadow />`.
7. `<ContextMenu />`.
8. `<ErrorBoundary><Dialog /></ErrorBoundary>`.

It re-renders when the four navigation stores change. A failure while rendering the graph replaces only the graph column with the error boundary's message and "Try Again"; the header, sidebar and dialogs stay.

DOM contract relied on by others:

| Fact                                                                                                          | Relied on by                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| An element with the attribute `data-branchwise` exists while the page shows repositories                      | UI tests (finding the graph context), UI harness (`webview.html` must contain `data-branchwise`).                                                              |
| The Branches pane's `<nav>` is a direct child of the sticky sidebar                                           | UI test at 880 px reads `getComputedStyle(nav.parentElement)`: `position` `sticky`, `top` ≈ header height, `height` ≈ viewport height − header height (±1 px). |
| The page has one `<header>`, one `<main>` (from the graph view), and the only `<aside>` is the Workspace pane | UI tests use `document.querySelector("header" / "main" / "aside")`.                                                                                            |
| Header first, then search row, then status, then sidebar before the graph                                     | UI helpers pick the first matching button in document order (for example "Refresh", "Workspace").                                                              |

### C.4 Examples

1. Branches open, Workspace closed, search closed, no filter, no repository state yet → root children: `header`, content row, scroll shade (the status, effects, menu and dialog render nothing). The content row holds the sidebar (with the `<nav>`) and the graph column.
2. Both panes open and search open → root children: `header`, `form[role=search]`, content row, scroll shade; sidebar children: `nav[aria-label=branchesPane]`, `aside[aria-label=workspaceOverview]`; graph column child: the graph view's `<main>`.
3. Both panes closed, search flag off, filter `{ text: "x" }` → the search row is shown (filter active) and the content row holds only the graph column.

### C.5 Non-functional requirements

- No work at import time other than defining the component.
- It must not add another `<header>`, `<main>`, `<nav>` or `<aside>` (UI tests select the first of each).
- The sidebar's sticky offset must follow the header's measured height, not a fixed value (the UI test asserts the header is taller than 60 px at 880 px and the sidebar still starts right below it).
- No visible text of its own.

### C.6 Test coverage

Covered only by the UI workflow tests and harness (presence of `[data-branchwise]`, sidebar placement at 880 px, panes and search row appearing). No Vitest test renders `App` (V8: 0 %).

Gaps (stub `ResizeObserver`):

- **app G1 — skeleton.** Render `App` with one repo, Branches open, Workspace closed, search closed. Expect root `[data-branchwise]` with first child `header`, no `form[role=search]`, a content row whose first child contains `nav[aria-label=branchesPane]` as a direct child and no `aside`, and a graph column containing `main`.
- **app G2 — search row.** With `searchVisible` false and no filter → no search form; set `searchVisible` true → form present; set it false and set the filter text → form present.
- **app G3 — sidebar.** Both panes closed → no sidebar (the graph column is the row's only child). Workspace only → sidebar with only `aside`. Both → `nav` then `aside`.
- **app G4 — isolation.** Make the graph throw during render (for example by a mocked `GraphView` module). Expect `header` still present and the graph column showing `[role=alert]` with `viewFailed` and a `retryView` button.

### C.7 Questions

- **app Q1.** Before the header has been measured, the sidebar assumes a 3 rem header while the table header assumes 0 px. The two fallbacks differ.
- **app Q2.** The search row cannot be hidden while a filter is active; the header's search toggle then has no visible effect (see `header Q6`).
- **app Q3.** Below 768 px the sidebar stacks above the graph; its height is limited only by each pane's own maximum, so both panes open can push the graph far down.

---

## D. `src/webview/main.tsx`

### D.1 Interface

Module path `src/webview/main.tsx`. **No exports.** It is the entry point of the webview bundle: `esbuild.js` bundles it (IIFE, target ES2020, automatic JSX with `preact`) to `out/web.min.js`, and the CSS it imports to `out/web.min.css`. The HTML shell (`src/extension/html.ts`) loads both and provides `<div id="app"></div>` and the `<html>` attributes `data-loading`, `data-init-failed` and `data-rpc-timeout`. Nothing imports this module; `tests/webview/utils/fileTree.test.ts` only mentions its path as sample data.

### D.2 Dependencies the implementation must use

| Import path                    | Names                              | What for                                                                                                |
| ------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `./styles.css`                 | (side-effect import)               | Makes the bundler emit `out/web.min.css` (Tailwind + theme). The package smoke test requires that file. |
| `preact`                       | `render`                           | Rendering into `#app`.                                                                                  |
| `preact/hooks`                 | an effect hook                     | Selecting a repository after the list changes.                                                          |
| `./App`                        | `App`                              | The page with repositories.                                                                             |
| `./components/ui/Button`       | `Button`                           | The Retry button.                                                                                       |
| `./lib/actions`                | `selectRepo`                       | Selecting the first repository.                                                                         |
| `./lib/dispatcher`             | `initDispatcher`                   | Starts handling the extension's `{ command }` messages.                                                 |
| `./lib/load-repos`             | `loadRepoList`, `repoListError`    | Scanning for repositories (never rejects; failures land in `repoListError` as a message).               |
| `./lib/rpc/rpc-client`         | `rpcClient`                        | `init()` and the `webview.initialize` request.                                                          |
| `./lib/shell-text`             | `shellText`                        | The `initFailed` template.                                                                              |
| `./lib/stores`                 | `initializeStores`, `selectedRepo` | Setting the first page size; reading/clearing the selection.                                            |
| `./lib/stores/repo-list.store` | `repoListStore`                    | The current repository list (`undefined` until the first scan answers).                                 |
| `./lib/vscode`                 | `vscode`                           | Posting `viewReady`.                                                                                    |
| `./lib/webview-config`         | `initializeWebviewConfig`          | Storing the configuration (once).                                                                       |
| `./pages/LoadingPage`          | `LoadingPage`                      | The full-page spinner.                                                                                  |
| `./pages/NoRepoPage`           | `NoRepoPage`                       | The page offering `git init` when no repository is found.                                               |

### D.3 Behaviour

#### D.3.1 Start-up, synchronously when the script runs

1. Look up the element with id `app` (it is assumed to exist).
2. Start listening for RPC answers and notifications (`rpcClient.init()`).
3. Start listening for the extension's `{ command }` messages (`initDispatcher()`).
4. Render `<LoadingPage />` into `#app` (full-height centred spinner with the shell text "Loading…").
5. Start the asynchronous start-up (D.3.2) without waiting for it.

Both listeners are in place before any request is posted, so an early notification or legacy message is not lost.

#### D.3.2 Start-up, asynchronously

1. Request `webview.initialize` with params `null`. The answer is `{ l10n: LocalizedStrings, config: WebviewConfig }`.
2. Set `window.l10n` to the answer's `l10n`.
3. `initializeWebviewConfig(config)`.
4. `initializeStores(config.initialLoadCommits)` (the first page size, store `maxCommits`).
5. Render the page's top-level view (D.3.3) into `#app`, replacing the spinner.
6. Await `loadRepoList()` (one `repo.scan` request).
7. Post `{ command: "viewReady" }` with `vscode.postMessage`. The extension waits for this before sending a pending repository selection or pane request.

If any step fails (the RPC request rejects, including after its 30 s deadline, or anything else throws), `#app` is replaced by `<div role="alert">` whose text is the shell string `initFailed` with the first `{0}` replaced by the error's `message` (or `String(value)` for a non-`Error`). `viewReady` is then never posted. There is no retry.

Observed order of posted messages with a fake extension answering after 5 ms: `rpc:webview.initialize`, `rpc:repo.scan`, then (once the list has rendered) `selectRepo`, `loadBranches`, `repositoryQuery` for the first repository, and `viewReady`. The relative order of the first repository's selection and `viewReady` is not guaranteed and must not matter.

#### D.3.3 The top-level view

It reads `repoListStore.get()` and `repoListError` and re-renders when either changes.

Rendering, first match wins:

1. `repoListError` holds a message → `<div role="alert">` containing a `<p>` with `unableToLoadRepositories` where the first `{0}` is replaced by the message, and a `Button` with text `retry` that calls `loadRepoList()` again (not awaited). This replaces the whole page, even when a list from an earlier scan is still known.
2. The list is `undefined` → `<LoadingPage />`.
3. The list is empty → `<NoRepoPage />`.
4. Otherwise → `<App repos={list} />`.

When the view is first shown, and again after every change of the list (a new array from a scan, or an entry added by a `repo.select` notification), after rendering:

- list `undefined` → nothing;
- empty list → set `selectedRepo` to `undefined` (directly; nothing else is reset);
- non-empty list and the selected repository is not one of the listed paths → `selectRepo(<path of the first entry>)` (list order as given);
- otherwise nothing.

`loadRepoList()` clears `repoListError` when it starts, so a Retry shows the loading page (no list yet) or the previous list (a list was known) until the answer arrives.

#### D.3.4 Timing

Only the RPC client's 30 s deadline applies. With no answer to `webview.initialize`, after 30 s the page shows "Unable to open the graph: The extension did not answer in time: webview.initialize". With no answer to `repo.scan`, after 30 s it shows "Unable to load repositories: The extension did not answer in time: repo.scan" with Retry, and `viewReady` is posted then.

### D.4 Examples

(Fake extension; real English templates where shown.)

1. Initialize answers `{ l10n, config: { initialLoadCommits: 123, … } }`, scan answers `[{b,/r/b},{a,/r/a}]` → spinner, then the app; `window.l10n === l10n`; `maxCommits` 123; `selectedRepo` `/r/b`; `viewReady` posted.
2. After example 1, a `repo.select` notification for `{c,/r/c}` → list gains `/r/c`, selection `/r/c`. A later `repo.rescan` whose answer is `[b, a]` → selection falls back to `/r/b`.
3. Initialize rejects with `"boom $& {0} end"` → `<div role="alert">Unable to open the graph: boom {0} {0} end</div>` (see `webmain Q1`); no `viewReady`.
4. Scan rejects with "scan broke" → `<div role="alert"><p>Unable to load repositories: scan broke</p><button>Retry</button></div>`; `viewReady` still posted. Retry with a scan answering `[]` → loading page, then `NoRepoPage`; `selectedRepo` `undefined`.
5. List `[a]` shown, then a `repo.rescan` whose scan fails → during the scan the app stays; after the failure the whole page becomes the repository error with Retry.

### D.5 Non-functional requirements

- Side effects at import time are the purpose of this module; it must not be imported by other modules or unit tests without a DOM that has `#app` and the shell attributes.
- It must import the stylesheet so the bundle emits `web.min.css`.
- `initializeWebviewConfig` may be called only once per page (it throws on a second call).
- `window.l10n` must be set before anything renders that reads it (everything after the loading page).
- The error texts shown before `window.l10n` exists must come from `shellText`, not from `window.l10n`.
- The legacy dispatcher and RPC listeners must both be registered exactly once.

### D.6 Test coverage

No automated test loads this module except the real-VS Code UI tests and harness, which rely on it to bring the page up (V8: 0 % in Vitest).

Gaps, each in its own Vitest file (so the module's import-time effects start fresh), with `document.body.innerHTML = '<div id="app"></div>'`, the three `<html>` data attributes set, `ResizeObserver` stubbed, and `vscodeApi.postMessage` answering RPC requests by dispatching `{ kind: "rpc.response", id, success, result | error }` message events:

- **webmain G1 — happy path.** Answers as in example 1. Expect a `[role=status]` spinner right after import; then `window.l10n` set, `maxCommits` = `initialLoadCommits`, `[data-branchwise]` rendered, `selectedRepo` = the first listed path, and exactly one `{ command: "viewReady" }` posted after the `repo.scan` request.
- **webmain G2 — initialization failure.** Initialize fails with `"boom"`. Expect `#app` to contain only `[role=alert]` with text "Unable to open the graph: boom" and no `viewReady`.
- **webmain G3 — scan failure and Retry.** Scan fails once, then answers `[]`. Expect the alert with "Unable to load repositories: scan broke" and a Retry button, `viewReady` posted; click Retry → loading page, then `NoRepoPage`; `selectedRepo` `undefined`.
- **webmain G4 — keeping a valid selection.** Pre-set `selectedRepo` to the second listed path before the scan answers. Expect no `selectRepo` message.
- **webmain G5 — empty after non-empty.** After a list `[a]`, send `repo.rescan` answered with `[]`. Expect `NoRepoPage` and `selectedRepo` `undefined`.

### D.7 Questions

- **webmain Q1.** Both error templates are filled with a plain string replacement, so `$&`, `$$`, `` $` `` and `$'` in an error message are expanded (observed: `boom $& {0} end` → `boom {0} {0} end`). The RPC client fills its own template literally.
- **webmain Q2.** A failed rescan (a `repo.rescan` notification, or Retry) replaces the whole working page (header, graph, open dialog) with the repository error, although the previous repository list is still known and usable. Intended may be to keep the page and report the failure near the Repo picker.
- **webmain Q3.** After an initialization failure `viewReady` is never posted and there is no Retry: the extension keeps any pending selection, and only reopening the panel recovers.
- **webmain Q4.** When the list becomes empty, the selection is cleared without saving the previous repository's navigation state or clearing the loaded graph stores.
- **webmain Q5.** On start-up the first repository in scan order is selected, not the one viewed last; the extension no longer restores the last repository (its old `lastActiveRepo` state is ignored). Intended?
- **webmain Q6.** The initialization-failure alert has no styling or layout (plain text at the top-left).

---

## E. `src/main.ts`

### E.1 Interface

Module path `src/main.ts`, imported as `@/main` in tests. `package.json` has `"main": "./out/extension.js"`, built from this file by `esbuild.js` (CommonJS, platform node, target ES6, `vscode` external). Activation event: `onStartupFinished`.

| Export     | Signature                                               | Meaning                                                                                                                                                                                                            |
| ---------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `activate` | `function activate(ctx: vscode.ExtensionContext): void` | Called by VS Code once per activation. Sets up logging, settings migration, Git path discovery, localization of backend messages, the status bar item, and all five commands. Returns synchronously (`undefined`). |

There is no `deactivate` export; everything is released through `ctx.subscriptions`.

Users: VS Code; `tests/extension/activation.test.ts` (`const { activate } = await import("@/main"); activate(context)`); `tests-ext/extension.test.ts`, `tests-ext/ui/history.test.cjs` and `scripts/package-smoke.cjs` (through `extension.activate()`).

### E.2 Dependencies the implementation must use

| Import path                                              | Names                                                                                                                    | What for                                                                                                                                                                                                                                 |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vscode`                                                 | `commands.registerCommand`, `window.createStatusBarItem`, `StatusBarAlignment.Left`, `Uri.file`, `l10n.t`, `l10n.bundle` | The only VS Code members this module itself may touch (see E.5).                                                                                                                                                                         |
| `@vscode/l10n`                                           | `config`                                                                                                                 | Hands VS Code's loaded bundle to the standalone localization library that backend modules use.                                                                                                                                           |
| `@/extension/util/logger` (or `./extension/util/logger`) | `logger`                                                                                                                 | `logger.init(ctx)` creates the "Branchwise" log output channel; `logger.info` writes the activation line.                                                                                                                                |
| `@/extension/migrate-settings`                           | `migrateSettings`                                                                                                        | Copies settings saved under the old `neo-git-graph` section. Never rejects.                                                                                                                                                              |
| `@/extension/config`                                     | `resolveBuiltInGitPath`                                                                                                  | Asks the built-in Git extension for its executable. Never rejects.                                                                                                                                                                       |
| `@/extension/constants`                                  | `EXTENSION_NAME` (`"Branchwise"`)                                                                                        | Status bar name and text.                                                                                                                                                                                                                |
| `@/extension/view-command`                               | `createViewCommand`                                                                                                      | Returns the `branchwise.view` handler `(sourceControl?: { rootUri }, file?: string) => void` with a method `showPane(pane: "refs" \| "workspace")`. Creating it also sets up the diff-document provider and clears the old avatar cache. |
| `@/extension/handlers/onboarding`                        | `openDocumentation`, `openWalkthrough`                                                                                   | `(ctx) => Promise<void>`: open the shipped guide (`docs/git-actions.md`, Markdown preview or plain editor) and the "gettingStarted" walkthrough.                                                                                         |
| `@/old-extension/fileHistoryCommand`                     | `registerFileHistoryCommand`                                                                                             | `(ctx, open: (repo: string, file: string) => void)`: registers `branchwise.fileHistory` itself and pushes it to `ctx.subscriptions`.                                                                                                     |

`vi.mock` is keyed by resolved file, so relative or `@/` specifiers are equivalent for tests.

### E.3 Behaviour

`activate(ctx)` does the following, synchronously, in this order:

1. `logger.init(ctx)` — first, so every later step can log.
2. Start `migrateSettings(ctx)` and do not wait for it.
3. Start `resolveBuiltInGitPath()` and do not wait for it.
4. `config({ contents: vscode.l10n.bundle ?? {} })` from `@vscode/l10n` (the bundle VS Code loaded for the display language, or an empty object when there is none, as in English).
5. Create a status bar item with `vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left)` (no priority argument) and set: `name` = `"Branchwise"`, `command` = `"branchwise.view"`, `text` = `"$(type-hierarchy) Branchwise"`, `tooltip` = `vscode.l10n.t("View Graph")`. Show it and push it to `ctx.subscriptions`.
6. Create the view command once: `view = createViewCommand(ctx)`.
7. Register, pushing each returned disposable to `ctx.subscriptions`:
   - `branchwise.view` → `view` itself, so every argument VS Code passes reaches it (from Source Control's title bar the first argument is the `SourceControl`, whose `rootUri` selects the repository; from the palette there are none);
   - `branchwise.showBranches` → `view.showPane("refs")`, arguments ignored;
   - `branchwise.openDocumentation` → returns `openDocumentation(ctx)`;
   - `branchwise.openWalkthrough` → returns `openWalkthrough(ctx)`.
     The handlers of the last two must return the promise, so `executeCommand` settles only when the guide or walkthrough has opened (or rejects if it cannot); the VS Code suite and package smoke test rely on that.
8. `registerFileHistoryCommand(ctx, open)` with `open(repo, file)` calling `view({ rootUri: vscode.Uri.file(repo) }, file)`.
9. `logger.info("Extension activated")`.

Exactly five commands exist afterwards: `branchwise.view`, `branchwise.fileHistory`, `branchwise.showBranches`, `branchwise.openDocumentation`, `branchwise.openWalkthrough`. Activation registers them all whether or not a folder is open and whatever the saved state says. It runs no Git and reads no saved repository paths. It opens no panel.

Errors: nothing is caught. If a step throws, VS Code reports the activation failure and the later steps do not happen. The two unawaited promises never reject.

Disposal: VS Code disposes `ctx.subscriptions` on deactivation: the status bar item, the four command registrations, the file history registration, the log channel and whatever the view command registered.

### E.4 Examples

1. Window without a folder, the activation test's fake `vscode` → registered commands, sorted: `branchwise.fileHistory`, `branchwise.openDocumentation`, `branchwise.openWalkthrough`, `branchwise.showBranches`, `branchwise.view`; `simpleGit` never called.
2. With recording fakes: call order `logger.init`, `migrateSettings`, `resolveBuiltInGitPath`, `l10n.config {"contents":{}}`, `createViewCommand`, `registerFileHistoryCommand`, `logger.info "Extension activated"`. Status bar item: created with `[1]` (Left), `name` "Branchwise", `command` "branchwise.view", `text` "$(type-hierarchy) Branchwise", `tooltip` = the translation of "View Graph", shown. `ctx.subscriptions` = status item, then the four registrations in the order view, showBranches, openDocumentation, openWalkthrough (the file history registration and the log channel are pushed by their own modules).
3. `executeCommand("branchwise.view", { rootUri: { fsPath: "/x" } }, "f.txt")` → `view({ rootUri: { fsPath: "/x" } }, "f.txt")`.
4. `executeCommand("branchwise.showBranches", "ignored")` → `view.showPane("refs")`.
5. The file history callback with `("/repo", "dir/file.txt")` → `view({ rootUri: Uri.file("/repo") }, "dir/file.txt")`.
6. `vscode.l10n.bundle = { "View Graph": "查看分支图" }` → `config({ contents: { "View Graph": "查看分支图" } })`.
7. The saved `lastActiveRepo` points to a deleted folder → activation succeeds with the same five commands and no Git.

### E.5 Non-functional requirements

- **Import-time purity**: importing the module must do nothing but define `activate`; tests import it, then call `activate`.
- **VS Code surface**: the activation test's `vscode` fake provides only `commands.registerCommand`, `window.createOutputChannel`, `window.createStatusBarItem` (returning `{ show, dispose }`), `workspace.{workspaceFolders, getConfiguration, registerTextDocumentContentProvider, onDidCloseTextDocument}`, `extensions.getExtension`, `EventEmitter`, `StatusBarAlignment.Left`, `ConfigurationTarget`, `Uri.file` and `l10n.{t, bundle}`. Reading any other member of that fake throws, so activation (including the modules it calls) must stay within that set.
- **No Git, no blocking**: activation must not start Git processes or wait for any promise. It must finish in one synchronous call.
- **Localization**: `vscode.l10n.t` is called exactly once here, with "View Graph" (see 0.3).
- **Logging**: the line "Extension activated" at info level in the "Branchwise" log. The UI harness checks that the retained logs contain it.
- **Bundle**: a named export `activate` in the CommonJS bundle.

### E.6 Test coverage

Covered:

- `tests/extension/activation.test.ts`: all five commands registered with no folder and with a deleted saved repository, without Git; the old avatar cache removed (through the view command); the manifest declares virtual and untrusted workspaces unsupported.
- `tests-ext/extension.test.ts` (real VS Code): `branchwise.view` opens one "Branchwise" tab and reveals it on a second run; `showBranches` opens the panel; `openWalkthrough` and `openDocumentation` resolve; a setting under the old name is copied.
- `scripts/package-smoke.cjs`: the installed VSIX activates, opens its graph, and runs the documentation and walkthrough commands.
- `scripts/test-ui-harness.cjs`: logs contain "Extension activated".

Not covered in Vitest (V8: the four command callbacks and the file history callback never run), with test cases using `vi.mock` for `vscode` and for each dependency:

- **extmain G1 — status bar item.** Expect `createStatusBarItem` called once with `StatusBarAlignment.Left` only; `name`, `command`, `text`, `tooltip` as in E.3; `show` called; the item in `ctx.subscriptions`.
- **extmain G2 — command wiring.** Invoke the registered callbacks: `branchwise.view(sc, "f")` → `view(sc, "f")`; `branchwise.showBranches("x")` → `showPane("refs")`; `branchwise.openDocumentation()` returns the same promise `openDocumentation(ctx)` returned; likewise the walkthrough.
- **extmain G3 — file history callback.** Capture the `open` passed to `registerFileHistoryCommand`; call `open("/repo", "a/b.txt")`. Expect `view({ rootUri: Uri.file("/repo") }, "a/b.txt")`.
- **extmain G4 — localization bundle.** With `l10n.bundle` undefined → `config({ contents: {} })`; with a bundle object → that object.
- **extmain G5 — ordering and logging.** `logger.init` is the first call, `logger.info("Extension activated")` the last; `activate` returns `undefined` while `migrateSettings` and `resolveBuiltInGitPath` return promises that never settle.
- **extmain G6 — disposal.** After `activate`, disposing every entry of `ctx.subscriptions` disposes the status bar item and each command registration.

### E.7 Questions

- **extmain Q1.** If `logger.init` or `createViewCommand` throws, activation fails without registering any command, so the walkthrough links break too. Nothing guards the individual steps.
- **extmain Q2.** The status bar item is always visible, also without a folder or Git repository. The tooltip is localized but the text "Branchwise" is not (it is a product name).
- **extmain Q3.** `branchwise.showBranches` ignores its arguments, so it cannot open the pane for a specific repository from Source Control the way `branchwise.view` can.
- **extmain Q4.** The status bar item passes no priority, so its position among left-aligned items is up to VS Code.

---

## 8. Decisions

These decisions are the maintainer's answers to the questions above. Where they differ from "current behaviour" elsewhere in this specification, they win.

### GraphView

- **graph Q1.** Fill every `{0}` placeholder so the inserted value appears literally: `$&`, `$$`, `` $` `` and `$'` in a branch name or revision must not be expanded. A branch `remotes/origin/x$&y` shows "Focus: origin/x$&y".
- **graph Q2.** Keep the current behaviour (focus data withheld while its query reloads).
- **graph Q3.** Keep: the graph error view replaces the rows.
- **graph Q4.** The history status view shows, after the error box and only when there is an error (not while loading), a `Button` whose text is exactly `retry` and which calls `refresh()`. The graph error view is unchanged.
- **graph Q5, Q6, Q7, Q8, Q10, Q11.** Keep the current behaviour.
- **graph Q9.** "History at {0}" shows the first 12 characters only when the revision is a full object name (exactly 40 or 64 hexadecimal characters); any other revision (a ref name, a short hash, an expression) is shown in full, with the span's existing one-line ellipsis handling long values.

### MainHeader

- **header Q1.** The label of a selected repository missing from the list is its last non-empty path segment, splitting on both `/` and `\`; the whole path when there is no such segment.
- **header Q2, Q3, Q4, Q8.** Keep the current behaviour.
- **header Q5.** Submitting the File History form with a path that is empty after trimming changes nothing (the history filter stays as it was); a non-empty path is used as entered.
- **header Q6.** The search button's `aria-expanded` is `true` whenever the search row is shown (`searchVisible` or `historyActive`). A click hides the row (`toggleSearch()`) only when it is shown because of `searchVisible` alone (`searchVisible` true and `historyActive` false); otherwise it calls `focusSearch()`.
- **header Q7.** If `@/webview/lib/stores` (or the context-menu module) exposes which menu is open by its source key, give the Settings & Tools button `aria-expanded` = whether the open menu's source is `repository-tools`. If it does not, leave the attribute out and say so in the report; do not add new state for it.
- **header Q9.** The View picker is also disabled while `branchList` is an empty array (as well as while it is `undefined`). The Branch picker keeps its rule (disabled only while `undefined`).

### App

- **app Q1, Q2, Q3.** Keep the current behaviour.

### webview main

- **webmain Q1.** Fill both error templates so the inserted message appears literally (no `$` expansion).
- **webmain Q2, Q3, Q4, Q5.** Keep the current behaviour.
- **webmain Q6.** Lay out the initialization-failure `<div role="alert">` like the repository-error screen: padded and readable in the page's foreground colour, not bare text in the corner. Its text and role stay as specified.

### extension main

- **extmain Q1–Q4.** Keep the current behaviour and order. "View Graph" stays the only `vscode.l10n.t` string in `src/main.ts`.
