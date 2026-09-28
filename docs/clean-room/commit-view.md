# Clean-room specification: the commit view components

Modules covered, one top-level section each, in this order:

1. `src/webview/components/commit/CommitDetails.tsx` (§1)
2. `src/webview/components/commit/CommitTable.tsx` (§2)
3. `src/webview/components/commit/CommitRow.tsx` (§3)
4. `src/webview/components/commit/CommitGraph.tsx` (§4)
5. `src/webview/components/commit/RefLabel.tsx` (§5)

This document says what these five webview components do, as seen from outside. It is written for an engineer who will build replacements without seeing the current source. It was put together from the modules' importers, the modules they depend on, the stylesheet, the repository's unit tests, the VS Code UI workflow tests, and from rendering the current components in the repository's jsdom test environment.

Together the five modules draw the main history view: `CommitTable` is the whole table; it draws one `CommitRow` per commit, overlays a `CommitGraph` (the lanes and dots) on the table's first column, shows `CommitDetails` (or the working-tree panel, which reuses `CommitDetails`' row frame) under the expanded row, and each row shows its branches and tags with `RefLabel`.

None of these modules runs Git. Their effects on Git happen only through messages that their dependencies post to the extension; those messages are named where they matter.

---

## 0. Conventions shared by all five modules

### 0.1 Environment used for the observations

- Linux, Node v22.22.2, Vitest 4.1.11 with jsdom 30.0.1, Preact 10.29.8, Tailwind CSS 4.3.3, time zone UTC.
- Components were rendered with `preact`'s `render` inside `act` from `preact/test-utils`, after `setupWebviewTest()` from `tests/webview/test-utils.ts`. That helper installs a webview configuration (`locale: "en"`, `dateFormat: "Date & Time"`, `graphColours: []`, `graphStyle: "rounded"`, `autoCenterCommitDetailsView: true`) and a `window.l10n` proxy that answers every key with the key's own name (so a label reads `commitActions`). Where an example shows English text, `window.l10n` held the English strings of §0.2.
- `ResizeObserver` and `window.scrollBy` do not exist or do nothing in jsdom; tests that render the table stub them.

### 0.2 Localized strings

All text a person reads or hears must come from `window.l10n` (the repository's lint rule `webview/no-hard-coded-text` rejects literal words in JSX text and in `title`, `aria-label` and similar attributes; strings without letters, such as `↑`, `↓`, `↗`, `<`, `>`, `, `, are allowed). Keys used by these modules, with their English text:

| Key                       | English text                                                                     | Used by       | Placeholder filling                                |
| ------------------------- | -------------------------------------------------------------------------------- | ------------- | -------------------------------------------------- |
| `detailCommit`            | `Commit: {0}`                                                                    | CommitDetails | see §1.3.4                                         |
| `detailParents`           | `Parents: {0}`                                                                   | CommitDetails | see §1.3.4                                         |
| `detailAuthor`            | `Author: {0}`                                                                    | CommitDetails | see §1.3.4                                         |
| `detailDate`              | `Date: {0}`                                                                      | CommitDetails | see §1.3.4                                         |
| `detailCommitter`         | `Committer: {0}`                                                                 | CommitDetails | see §1.3.4                                         |
| `close`                   | `Close`                                                                          | CommitDetails | none                                               |
| `graph`                   | `Graph`                                                                          | CommitTable   | none                                               |
| `description`             | `Description`                                                                    | CommitTable   | none                                               |
| `date`                    | `Date`                                                                           | CommitTable   | none                                               |
| `author`                  | `Author`                                                                         | CommitTable   | none                                               |
| `commit`                  | `Commit`                                                                         | CommitTable   | none                                               |
| `resizeColumn`            | `Resize {0} column`                                                              | CommitTable   | first `{0}` replaced by a column title             |
| `revealSelectedLane`      | `Reveal selected lane`                                                           | CommitTable   | none                                               |
| `scrollGraphHorizontally` | `Scroll graph horizontally`                                                      | CommitTable   | none                                               |
| `graphKeyboardHint`       | `Arrow keys move between commits. Enter opens details. Shift+F10 opens actions.` | CommitTable   | none                                               |
| `uncommittedChanges`      | `Uncommitted Changes ({0})`                                                      | CommitRow     | every `{0}` replaced by the changed-file count     |
| `viewWorkingTreeChanges`  | `Click or press Enter to view uncommitted changes.`                              | CommitRow     | none                                               |
| `selectCommitsHint`       | `Ctrl/Cmd-click to select commits; Shift-click to select a range.`               | CommitRow     | none                                               |
| `commitActions`           | `Actions for commit {0}`                                                         | CommitRow     | first `{0}` replaced by the 8-character short hash |
| `labelCurrentBranch`      | `the current branch`                                                             | RefLabel      | none                                               |
| `upstreamGone`            | `Upstream no longer exists`                                                      | RefLabel      | none                                               |
| `worktreeAt`              | `Checked out at {0}`                                                             | RefLabel      | first `{0}` replaced by the worktree path          |

`unknownDate` (`Unknown date`) also reaches the view, through the date helpers. The strings are defined on the extension side (`src/old-extension/l10n/*.ts`) and translated in `l10n/bundle.l10n.*.json`; these modules only read them.

Every read of `window.l10n` must happen while rendering or handling an event, never when the module is imported: several tests import the modules before `window.l10n` exists.

### 0.3 Styling vocabulary

The webview uses Tailwind CSS 4, compiled from class names found in `src/webview` (see `src/webview/styles.css`). One spacing unit is 4 px. The theme tokens below come from that stylesheet; the look is described in terms of them. Implementers may use any classes (or inline styles) that produce the described look, except for the class names listed in §0.4, which other code selects on.

| Token                         | Value                                                             |
| ----------------------------- | ----------------------------------------------------------------- |
| `--color-graph`               | `var(--vscode-focusBorder)`; overridden per row (see §3.3.7)      |
| `--color-line`                | `rgba(128,128,128,0.5)`                                           |
| `--color-line-soft`           | `rgba(128,128,128,0.25)`                                          |
| `--color-btn`                 | `rgba(128,128,128,0.1)`                                           |
| `--color-btn-hover`           | `rgba(128,128,128,0.2)`                                           |
| `--color-editor`              | `var(--vscode-editor-background)`                                 |
| `--color-focus`               | `var(--vscode-focusBorder)`                                       |
| `--color-fg`, `--color-muted` | `var(--vscode-foreground)`, `var(--vscode-descriptionForeground)` |
| `--color-row-head`            | `var(--vscode-list-inactiveSelectionBackground)`                  |
| `--color-row-hover`           | `var(--vscode-list-hoverBackground)`                              |
| `--color-row-selected`        | `rgba(128,128,128,0.25)`                                          |
| `--color-row-selected-hover`  | `rgba(128,128,128,0.35)`                                          |
| `--text-ui`                   | 13 px                                                             |
| `--radius-md`                 | 5 px (Tailwind's `--radius-sm` is 4 px)                           |
| monospace font                | `var(--vscode-editor-font-family)`                                |

### 0.4 Class names and attributes that other code selects on

These are part of the interface and must appear exactly as stated:

| Name                                                                                                                                               | Where it must be                                                                       | Who relies on it                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| class `branch-focus-row`                                                                                                                           | every commit row `<tr>` (§3)                                                           | `styles.css` (row colour and focus rules, scroll margin)             |
| class `graph-scrollbar`                                                                                                                            | the graph scroll region in the Graph header cell (§2)                                  | `styles.css` (thin themed scrollbar)                                 |
| class `table-fixed`                                                                                                                                | the `<table>`, exactly when column widths are stored (§2)                              | `tests/webview/components/commit/ColumnResize.test.ts`               |
| class `cursor-col-resize`                                                                                                                          | the header `<tr>`'s whole `className` while a drag is in progress; `""` otherwise (§2) | `ColumnResize.test.ts` (asserts `className` equality)                |
| class `max-w-1/2`                                                                                                                                  | the refs container of a row's description cell (§3)                                    | `tests/webview/components/commit/CommitRow.test.ts`                  |
| class `flex-1`                                                                                                                                     | the message `<span>` of a row's description cell (§3)                                  | `CommitRow.test.ts`                                                  |
| class `font-bold`                                                                                                                                  | the name `<span>` of a ref label, only when `active` (§5)                              | `tests/webview/components/commit/RefLabel.test.ts`                   |
| `data-commit-hash`                                                                                                                                 | every commit row `<tr>`, value = full hash or `*`                                      | tests, UI tests, `src/webview/lib/focus.ts`, the table's hover logic |
| `data-branch-relation`                                                                                                                             | commit rows, graph vertex circles, coloured graph paths                                | `styles.css`, UI tests, benchmark                                    |
| `data-emphasized`                                                                                                                                  | commit rows, value `"true"`/`"false"`                                                  | `styles.css`                                                         |
| `data-details-row`                                                                                                                                 | the details `<tr>` (§1)                                                                | UI tests                                                             |
| `data-graph-viewport`, `data-graph-scroll`                                                                                                         | the graph clip box and the graph scroll region (§2)                                    | GraphScroll test, UI tests, benchmark                                |
| `colspan="4"`                                                                                                                                      | the details content cell (§1)                                                          | UI tests (`td[colspan="4"]`)                                         |
| CSS custom properties `--branch-colour`, `--branch-display-colour`                                                                                 | inline style of every commit row (§3)                                                  | `styles.css`                                                         |
| CSS custom properties `--col-graph`, `--col-date`, `--col-author`, `--col-commit`, `--graph-viewport-width`, `--graph-top`, `--main-header-height` | read by the table's inline styles (§2)                                                 | written by `useColumnResize`, `useGraphScroll`, `MainHeader`         |

---

## 1. `src/webview/components/commit/CommitDetails.tsx`

### 1.1 Interface

Imported as `@/webview/components/commit/CommitDetails`. It has exactly two exports, both Preact function components. Names and prop shapes must stay as given.

```ts
export function CommitDetails(props: { details: GitCommitDetails | null }): JSX.Element;
export function DetailsRow(props: { children: ComponentChildren }): JSX.Element;
```

**`CommitDetails`**: shows one commit's facts (hash, parents, author, date, committer, message) and its changed files, inside a `DetailsRow`.

- `details`: the loaded details of the expanded commit, or `null` while they are being fetched. `GitCommitDetails` (from `@/backend/types`) has:
  - `hash: string`: the commit's full ID.
  - `parents: string[]`: full IDs of its parents, first parent first; empty for a root commit.
  - `author: string`, `email: string`: author name and e-mail address.
  - `date: number`: a Git timestamp in Unix seconds (may arrive as `null` or be out of range when Git gave no usable date).
  - `committer: string`: the committer's name alone.
  - `body: string`: the whole commit message, lines separated by `\n`, no trailing newline.
  - `fileChanges: GitFileChange[]`: changed paths, each `{ oldFilePath, newFilePath, type: "A" | "M" | "D" | "R", additions: number | null, deletions: number | null }`.

**`DetailsRow`**: the fixed-height table-row frame, with a close button and Escape handling, that both commit details and the working-tree panel sit in.

- `children`: the content to show inside the frame.

**Who uses what**

- `src/webview/components/commit/CommitTable.tsx` renders `<CommitDetails details={commitDetails.value} />` immediately after the expanded commit's row, when that row is not the uncommitted-changes row.
- `src/webview/components/commit/WorkingTreeDetails.tsx` imports `DetailsRow` and wraps its whole panel in it (the uncommitted-changes row's details).
- `tests/webview/components/commit/FileTree.test.ts` imports `CommitDetails` and renders it alone inside a `<tbody>` of a `<table>`.
- `tests/webview/components/commit/FileTreeView.test.ts`, `WorkingTreeDetails.test.ts` and `WorkingTreeTiming.test.ts` reach both exports through `CommitTable`. `tests-ext/ui/history.test.cjs` reaches them through the real view.

### 1.2 Dependencies the implementation must use

| Import path                            | Name                                          | Used for                                                                                                                                                                                |
| -------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@/backend/types`                      | type `GitCommitDetails`                       | the prop type                                                                                                                                                                           |
| `@/webview/components/commit/FileTree` | `FileTree`                                    | the changed-file tree; props `nodes: FileTreeNode[]` and `commitHash: string`. It keeps its own open/closed folder state per `commitHash`, so it must receive the details' `hash`.      |
| `@/webview/utils/fileTree`             | `buildFileTree(fileChanges)`                  | turns `details.fileChanges` into the `nodes` for `FileTree`                                                                                                                             |
| `@/webview/components/ui/Loading`      | `Loading`                                     | the loading indicator (props `class?: string`, `variant?: "inline" \| "page"`; it renders `role="status"`, `aria-live="polite"`)                                                        |
| `@/webview/components/ui/Icons`        | `Icon`                                        | the close glyph (an `<svg>` wrapper that defaults to 16×16, `fill="currentColor"`, `aria-hidden="true"`, `focusable="false"`, and accepts SVG attributes such as `viewBox` and `class`) |
| `@/webview/constants`                  | `COMMIT_DETAILS_HEIGHT`, `ROW_HEIGHT`         | 250 and 24 (pixels): the frame's height and one commit row's height                                                                                                                     |
| `@/webview/lib/actions`                | `closeCommitDetails()`                        | closes the details: sets `expandedCommit` and `commitDetails` to `null` and makes any pending details reply stale                                                                       |
| `@/webview/lib/webview-config`         | `getWebviewConfig()`                          | reads `autoCenterCommitDetailsView` (setting `branchwise.autoCenterCommitDetailsView`, default `true`)                                                                                  |
| `@/webview/utils/date`                 | `getFullDate(seconds)`                        | the long date and time shown on the Date line; returns `window.l10n.unknownDate` when the timestamp is unusable                                                                         |
| `preact`, `preact/hooks`               | types `ComponentChildren`, `RefObject`; hooks | rendering, a ref to the row element, a memo for the file tree nodes, and an effect for scrolling                                                                                        |

Platform: `window.scrollBy`, `window.innerHeight`, `Element.getBoundingClientRect`, `HTMLElement.focus({ preventScroll: true })`.

### 1.3 Behaviour

#### 1.3.1 `DetailsRow`: rendered contract

`DetailsRow` renders exactly one `<tr>`:

- `<tr data-details-row>` (the attribute renders as `data-details-row="true"`), with an inline height of exactly **250 px** (`COMMIT_DETAILS_HEIGHT`). No `data-commit-hash`, no class needed.
  - First child: an empty `<td>` with no content and no background. It lies under the graph column, and the graph lines drawn behind the table show through it.
  - Second child: `<td colspan="4">` (the attribute must read `colspan="4"`) containing, in order:
    1. A block element of height exactly **248 px** (250 minus a 2 px bottom line) with overflow hidden. It holds `children`.
    2. The close button: `<button type="button">` whose `title` and `aria-label` are both `window.l10n.close` (English `Close`). Its only content is an X-shaped close glyph drawn with `Icon` at 24×24 px (the current glyph uses a 12×16 view box); the glyph is `aria-hidden`.

Look of the content cell: positioned relatively (the close button and the bottom line are placed against it); background `--color-btn`; no padding; content aligned to the top; 13 px text (`--text-ui`) with an 18 px line height; normal white-space wrapping (the table otherwise keeps text on one line); a 2 px horizontal line in `--color-line` runs along its bottom edge across its full width, drawn so that it does not take space from the 248 px block (for example as an absolutely placed pseudo-element). The close button sits 4 px from the cell's top and right edges, shows a pointer cursor, and is drawn at 60 % opacity, fully opaque on hover.

The height must be exact in pixels: `CommitTable` stretches the graph by exactly 250 px below the expanded row (§2), and any other height misaligns every dot below it.

#### 1.3.2 `DetailsRow`: closing

Both of the following close the details:

- a click on the close button;
- a `keydown` whose `key` is `"Escape"` that reaches the `<tr>` from anything inside it (the close button, a file-tree entry, a working-tree file button, and so on). For this key the handler calls `preventDefault()` and `stopPropagation()` on the event, so listeners further up (for example a dialog's document-level Escape listener) never see it. Other keys are left alone and keep propagating.

Closing does, in this order: note the element immediately before the details `<tr>` (its previous element sibling; inside `CommitTable` that is the row of the expanded commit), call `closeCommitDetails()`, then, if such an element exists, focus it with `{ preventScroll: true }`. When there is no previous sibling, the details still close and focus is not moved.

After closing, `expandedCommit` and `commitDetails` are `null`; `CommitTable` then stops rendering the details row. For the working-tree panel, unmounting cancels its running query (that is `WorkingTreeDetails`' doing).

#### 1.3.3 `DetailsRow`: bringing itself into view

Once, right after the row is first put on screen (an effect after mount, not repeated when its content re-renders, for example when details arrive after the loading indicator), it scrolls the window. It measures the details `<tr>`'s bounding box and reads `autoCenterCommitDetailsView` at that moment. Below, `T`, `B` and `H` are the box's top, bottom and height in viewport pixels, and `W` is `window.innerHeight`.

- **Setting on:** a single call `window.scrollBy({ top: T + H / 2 − W / 2 })`, made even when the amount is 0. The vertical centre of the details row ends up at the vertical centre of the window.
- **Setting off:** the smallest scroll that leaves 32 px of window above the details row (room for the 24 px commit row plus 8 px) and 8 px below it, preferring the top:
  - when `T − 32` is negative, one call `window.scrollBy({ top: T − 32 })`;
  - else, when `B + 8` exceeds `W`, one call `window.scrollBy({ top: B + 8 − W })`;
  - else no call.

The argument is always an object with a `top` member only (an instant scroll). Each newly mounted details row (a different commit opened, or the working-tree panel opened) scrolls again; re-renders of the same mounted row do not.

#### 1.3.4 `CommitDetails`: content

`CommitDetails` always renders a `DetailsRow`. Its content:

- **While `details` is `null`:** `Loading` in its default inline variant, stretched to the full 248 px height, so the indicator is centred.
- **When `details` is set:** a two-area horizontal layout filling the full height:
  1. **Commit facts** (left area): 45 % of the width, does not shrink, scrolls when its content overflows, 1 px `--color-line` borders on its left and right, 10 px padding on all sides, and text in it can be selected (the table disables selection elsewhere). It contains, in this order:
     - five one-line entries, each a block element whose text is kept on one line and cut off with an ellipsis:
       1. template `detailCommit`, value: `details.hash`;
       2. template `detailParents`, value: `details.parents` joined with `", "` (nothing for a root commit);
       3. template `detailAuthor`, value: the author name, a space, `<`, then a link `<a href="mailto:<encodeURIComponent(email)>">` whose text is the e-mail address exactly as given, then `>`. The link inherits the text colour and is underlined;
       4. template `detailDate`, value: `getFullDate(details.date)` (for `locale: "en"` in UTC, `1700000000` reads `Tuesday, November 14, 2023 at 10:13:20 PM UTC`; an unusable date reads `Unknown date`);
       5. template `detailCommitter`, value: `details.committer`.

       Each entry is built from its template like this: the text before the first `{0}` is shown in a `<b>` element; then comes the value; then the text between the first `{0}` and the next `{0}` (or the end of the template). Text after a second `{0}` is not shown. A template without `{0}` is shown whole in `<b>`, followed by the value.

     - a paragraph `<p>` with 16 px top margin whose text is `details.body`, with spaces and line breaks preserved and long lines wrapped.

     Every value is inserted as text; nothing is parsed as markup.

  2. **File list** (right area): takes the remaining width, keeps a 32 px right margin (the close button sits there), hides horizontal overflow, always shows a vertical scrollbar, has a 1 px `--color-line` right border and 4 px padding above and below. It contains `<FileTree nodes={…} commitHash={details.hash} />`, where the nodes are `buildFileTree(details.fileChanges)`.

The nodes are rebuilt only when a different `details` object arrives (memoised on object identity); while `details` is `null` no tree is built.

#### 1.3.5 Events, timing, disposal

- No timers, no debouncing, no animation frames.
- No listeners on `window` or `document`; only the element handlers above.
- Nothing to clean up on unmount.
- No messages are posted directly. `closeCommitDetails()` posts nothing; it only drops the pending `commitDetails` request, so a late reply is ignored.

### 1.4 Examples

English strings; the element before the details row is a focusable `<tr id="owner">`.

1. `details = { hash: "c"×40, parents: ["p"×40, "q"×40], author: "Ann <x>", email: "ann+tag@ex ample.com", date: 1700000000, committer: "Bob", body: "Subject\n\n  indented body <b>", fileChanges: [] }` shows, in the left area, the lines
   - `<b>Commit: </b>cccc…c` (40 characters)
   - `<b>Parents: </b>pppp…p, qqqq…q`
   - `<b>Author: </b>Ann <x> <ann+tag@ex ample.com>` where the address is a link to `mailto:ann%2Btag%40ex%20ample.com`
   - `<b>Date: </b>Tuesday, November 14, 2023 at 10:13:20 PM UTC`
   - `<b>Committer: </b>Bob`
   - then a paragraph whose text is exactly `Subject\n\n  indented body <b>` (the `<b>` is literal text).
     The file list contains an empty tree (`<ul>` with no entries).
2. `details = null`: the 248 px block holds the loading indicator (`[role="status"]`); the close button is present.
3. Scrolling with `innerHeight = 1000` and a 250 px tall details row:

   | setting | `T` | call made                 |
   | ------- | --- | ------------------------- |
   | on      | 100 | `scrollBy({ top: -275 })` |
   | on      | 900 | `scrollBy({ top: 525 })`  |
   | off     | 10  | `scrollBy({ top: -22 })`  |
   | off     | 40  | none                      |
   | off     | 500 | none                      |
   | off     | 742 | none (bottom + 8 = 1000)  |
   | off     | 743 | `scrollBy({ top: 1 })`    |
   | off     | 800 | `scrollBy({ top: 58 })`   |

   In each case, re-rendering the same row with loaded details makes no further call.

4. Escape dispatched (bubbling, cancelable) on the close button: `defaultPrevented` is `true`, a `keydown` listener on `document` is not called, `expandedCommit` becomes `null`, and `document.activeElement` is `#owner`. An Enter keydown on the same button is not prevented and reaches `document`.
5. With `detailCommit = "{0} is the commit"` the entry reads `<b></b>cccc…c is the commit`; with `detailParents = "No placeholder"` it reads `<b>No placeholder</b>` followed by the parents; with `detailAuthor = "A {0} B {0} C"` it reads `<b>A </b>` + the author value + `B` (the trailing ` C` is lost).
6. `DetailsRow` alone with child `<p>child</p>` renders `tr[data-details-row]` (height 250 px) → empty `td`, `td[colspan="4"]` → 248 px block containing `<p>child</p>`, then the Close button.

### 1.5 Non-functional requirements

- **Pure rendering, no import-time work.** Importing the module must not read `window.l10n`, the configuration, or any store. `FileTree.test.ts` imports it statically and installs `window.l10n` afterwards.
- **Fixed geometry.** The row is 250 px tall and its inner block 248 px, in pixels (not rem), whatever the content; long content scrolls inside its area.
- **Cheap re-renders.** The file tree nodes are built once per details object. A second object for the same commit is rebuilt, but `FileTree` keeps its folder state because `commitHash` is unchanged (tested).
- **Scrolling uses `window.scrollBy`.** Tests stub or spy on exactly that method (jsdom does not implement it).
- **Focus return without jumping.** The focus moved back to the owner row uses `preventScroll: true`.
- **Circular-import safety.** `WorkingTreeDetails.tsx` imports this module, and `CommitTable.tsx` imports both; this module must not import `WorkingTreeDetails`.

### 1.6 Test coverage

Already checked:

- `tests/webview/components/commit/FileTree.test.ts`: `CommitDetails` shows the file tree for `details.fileChanges` (folders first, entry labels in order), and a new details object for the same hash keeps a closed folder closed (so `commitHash` must be `details.hash` and the tree must not be remounted). It stubs `window.scrollBy`.
- `tests/webview/components/commit/FileTreeView.test.ts` ("inside the commit table"): Escape pressed on a file entry closes the details (`expandedCommit` is `null`) and focus returns to the commit's row.
- `tests/webview/components/commit/WorkingTreeDetails.test.ts`: through `DetailsRow`, the close button is found by `[aria-label="close"]` (test proxy); Escape on it closes and focuses the `*` row; a click on it closes, cancels the working-tree query and focuses the `*` row.
- `tests-ext/ui/history.test.cjs`: the `Close` button inside `[data-details-row]` returns focus to the `*` row; `td[colspan="4"]` contains the selected commit's full hash; the graph dots stay aligned with their rows with details open (which depends on the 250 px height).

Not checked; proposed cases:

- **CD-G1 Commit facts.** Setup: English strings, the details of example 1. Call: render `CommitDetails`. Expect: five one-line entries with the exact texts of example 1, `<b>` holding `Commit: `, `Parents: `, `Author: `, `Date: `, `Committer: `; the link's `href` is `mailto:ann%2Btag%40ex%20ample.com` and its text `ann+tag@ex ample.com`; the paragraph's `textContent` equals `body`.
- **CD-G2 Loading.** Setup: render with `details: null`. Expect: `[data-details-row] [role="status"]` exists; no `<b>` elements; the close button exists.
- **CD-G3 Frame.** Setup: render `DetailsRow` with a child. Expect: `tr[data-details-row]` with `style.height === "250px"`; exactly two cells; the first has no child nodes; the second has `colSpan === 4`; its first child's `style.height === "248px"` and contains the child; the button has `type="button"` and `title` = `aria-label` = the `close` string.
- **CD-G4 Centred scroll.** Setup: `autoCenterCommitDetailsView: true`, `innerHeight` 1000, row box `{ top: 100, height: 250 }`, spy on `window.scrollBy`. Call: mount, then re-render with loaded details. Expect: exactly one call, `{ top: -275 }`.
- **CD-G5 Minimal scroll.** Setup: setting off, the boxes of example 3. Expect: the calls in that table.
- **CD-G6 Escape containment.** Setup: a `keydown` listener on `document`. Call: dispatch a bubbling Escape on a descendant. Expect: the listener is not called and the event's `defaultPrevented` is `true`; dispatching Enter instead reaches the listener and is not prevented.
- **CD-G7 No owner row.** Setup: render the details row as the first row of its `<tbody>`, `expandedCommit` set. Call: click Close. Expect: `expandedCommit` is `null`, no exception.
- **CD-G8 Unknown date.** Setup: English strings, `details.date = NaN` (and, separately, `99_999_999_999_999`). Expect: the Date entry reads `<b>Date: </b>Unknown date`.

### 1.7 Questions

- **CommitDetails Q1: the minimal scroll ignores the sticky headings.** With the setting off, the view only keeps 32 px free above the details row. The table's heading row (32 px) and the page's main header (`--main-header-height`) are sticky, so the commit row just above the details can end up underneath them. The intent may be to keep that row below the sticky headings.
- **CommitDetails Q2: Escape only works from inside the details.** After a click on a commit row, focus is on the row, not in the details, and Escape does nothing there. Closing from the owning row may be intended.
- **CommitDetails Q3: the whole address is percent-encoded in the `mailto:` link.** `@` becomes `%40`, and `+` becomes `%2B`. RFC 6068 allows percent-encoding, but some mail clients may not decode the `@`. It is unclear whether only the characters that need encoding were meant to be encoded.
- **CommitDetails Q4: an empty e-mail address** still renders `Name <>` with an empty link to `mailto:`.
- **CommitDetails Q5: template handling.** Text after a second `{0}` in a detail template is dropped, and the bold label is always the text before `{0}`, even in a translation that puts the value first (then the bold part is empty). Neither happens with today's translations.
- **CommitDetails Q6: accessibility of the panel.** The details row has no name or role, is not linked to its commit row (for example with `aria-controls` on the row), and the close button is labelled only "Close". This may be acceptable, or a name such as the commit's short hash may be wanted.
- **CommitDetails Q7: parents are plain text.** Parent hashes are shown in full and cannot be followed to the parent's row. This may be intended (the left area is selectable text).

---

## 2. `src/webview/components/commit/CommitTable.tsx`

### 2.1 Interface

Imported as `@/webview/components/commit/CommitTable`. One export, a Preact function component. Its props type is not exported but its shape is part of the interface:

```ts
export function CommitTable(props: {
  commits: Array<HistoryEntry>;
  head: string | null;
  headBranch: string | null;
  focus?: { direct: string[]; merged: string[] } | null; // default null
  keepMergedBright?: boolean; // default false
  dimming?: FocusDimming; // default "subtle"
}): JSX.Element;
```

- `commits`: the rows to show, in display (graph) order. `HistoryEntry` (from `@/backend/types`) is a `GitCommitNode` — `{ hash, parentHashes: string[] (first parent first), author, email, date (Unix seconds), message (subject line), refs: GitRef[] }` — plus the optional file-history fields `filePath?`, `previousPath?`, `change?` (a status letter such as `"M"` or `"D"`). A row whose `hash` is `"*"` (`UNCOMMITTED_CHANGES`) stands for the uncommitted changes; the backend puts it first.
- `head`: the full hash HEAD points to, or `null` (no commits, or unknown).
- `headBranch`: the name of the checked-out local branch, or `null` when HEAD is detached or unknown.
- `focus`: the branch-focus result: `direct` holds the hashes on the focused branch's first-parent history, `merged` the other hashes it contains. `null` (or omitted) means no focus is shown and every row is `"normal"`. The object `GraphView` passes also has a `tip` field; it is ignored.
- `keepMergedBright`: `true` in the "Focus all ancestors" view: merged history is drawn as brightly as direct history.
- `dimming`: `"subtle"` or `"strong"` (`FocusDimming` from `@/webview/types`): how far unrelated and merged history is dimmed in the graph.

**Who uses what**

- `src/webview/layout/GraphView.tsx` (the only importer) renders `<CommitTable commits={…} head={commitHead.value} headBranch={headBranch.value} focus={focusPaused.value || focus.loading || focus.error ? null : focus.data} keepMergedBright={branchDisplay.value === "ancestors"} dimming={focusDimming.value} />`, where `commits` is either the loaded graph (`commitList`) or a page of filtered history. It renders the table even when a filtered history has no rows.
- Tests that render it directly: `tests/webview/components/commit/ColumnResize.test.ts`, `GraphScroll.test.ts`, `FileTreeView.test.ts`, `WorkingTreeDetails.test.ts`, `WorkingTreeTiming.test.ts` (runs only with `NGG_BENCH_WORKING_TREE=1`). Through `GraphView`: `tests/webview/utils/date.test.ts` ("graph rendering"). `tests/webview/components/commit/GraphErrors.test.ts` renders `GraphView` but never reaches a table with rows. The UI workflow tests (`tests-ext/ui/history.test.cjs`) and benchmark (`tests-ext/ui/benchmark.cjs`) drive it in VS Code.

### 2.2 Dependencies the implementation must use

| Import path                                      | Name                                                                                     | Used for                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@/webview/components/commit/CommitRow`          | `CommitRow`                                                                              | one row per commit (§3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `@/webview/components/commit/CommitGraph`        | `CommitGraph`                                                                            | the lanes and dots (§4)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `@/webview/components/commit/CommitDetails`      | `CommitDetails`                                                                          | details under an expanded commit (§1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `@/webview/components/commit/WorkingTreeDetails` | `WorkingTreeDetails`                                                                     | details under the expanded uncommitted-changes row (no props; it loads its own data)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `@/webview/components/commit/useColumnResize`    | `useColumnResize(graphColumn)`, type `ColumnResize`                                      | column resizing. Returns `{ containerRef, headRef, resizing, startResize(boundary, event), nudge(boundary, event) }`. `containerRef` goes on the outermost element (the hook writes `--col-graph`, `--col-date`, `--col-author`, `--col-commit` into its inline style: the stored widths, or only `--col-graph: <graphColumn>px` while none are stored); `headRef` goes on the header `<tr>` (the hook measures its five cells). `resizing` is `true` during a pointer drag. `startResize` belongs in a handle's `mousedown` handler and `nudge` in its `keydown` handler, each with the boundary number. Its own specification is `docs/clean-room/column-resize.md`.                                                                                                                                                                                                                    |
| `@/webview/components/commit/useGraphScroll`     | `useGraphScroll(containerRef, headRef, contentWidth)`                                    | horizontal scrolling of the graph. Returns `{ viewportRef, scrollRef, overflow, syncScroll, onWheel, revealLane }`. It measures header cell 0 and writes `--graph-viewport-width` (that cell's laid-out width) and `--graph-top` (the header row's height) into the container's inline style, re-measuring through a `ResizeObserver` on that cell. `overflow` is `true` when `contentWidth` exceeds the cell's width by more than 1 px. `syncScroll` copies the scroll region's `scrollLeft` to the viewport. `onWheel(event)` scrolls horizontally for a horizontal wheel (or Shift + vertical wheel) whose target lies in a column-0 cell, calling `preventDefault` only when it actually scrolled. `revealLane(x)` scrolls by the smallest amount that shows pixel `x` with a small margin. It resets the scroll position to 0 whenever the selected repository changes and on mount. |
| `@/webview/components/ui/Icons`                  | `RevealIcon`                                                                             | the crosshair glyph of the "Reveal selected lane" button                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `@/webview/constants`                            | `COMMIT_DETAILS_HEIGHT` (250), `TABLE_HEADER_HEIGHT` (32), `UNCOMMITTED_CHANGES` (`"*"`) | the graph stretch for open details, the fallback graph top, the uncommitted row's hash                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `@/webview/graph/constants`                      | `GRAPH_PADDING` (16)                                                                     | extra space right of the last lane                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `@/webview/graph/layout`                         | `computeGraphLayout(commits, head)`                                                      | the graph layout: `{ branches, vertices, lanes }`; `vertices[i]` belongs to row `i` and has `x` (lane), `y` (row), `colour` (palette index), `isCommitted`, `isCurrent`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `@/webview/graph/focus`                          | `commitRelations(commits, focus)`, `lineRelation(line, commits, relations)`              | per-row relation (`"normal"` for every row when `focus` is `null`; otherwise `"*"` is `"normal"`, and a hash is `"direct"`, `"merged"` or `"unrelated"`), and per-line relation for the graph                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `@/webview/graph/palette`                        | `branchColour(index)`                                                                    | the configured palette colour for a palette index (wraps around), or `undefined` when the palette (`graphColours`) is empty                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `@/webview/graph/utils`                          | `graphWidth(layout)`, `laneX(x)`                                                         | the drawing's width (`8 + (lanes − 1) × 16 + 8`, 0 for no lanes) and a lane's centre in pixels (`8 + x × 16`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `@/webview/graph/types`                          | type `GraphExpansion`                                                                    | `{ row: number; height: number }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `@/webview/lib/actions`                          | `toggleCommitDetails(hash)`                                                              | a row's `onSelect`: opens that row's details, or closes them if that row is the open one. For a commit it posts `{ command: "commitDetails", requestId, repo, commitHash }`; for `"*"` it posts nothing (the working-tree panel loads its own data). Does nothing without a selected repository.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `@/webview/lib/navigation`                       | `focusedCommit`, `selectedCommits`                                                       | signals: the hash of the row that last had keyboard focus or a click (or `null`), and the selected rows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `@/webview/lib/stores`                           | `columnWidths`, `commitDetails`, `expandedCommit`                                        | signals: stored column widths or `null`; the loaded details of the expanded commit or `null`; the expanded row's hash or `null`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `@/webview/types`                                | type `FocusDimming`                                                                      | the `dimming` prop                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `@/backend/types`                                | type `HistoryEntry`                                                                      | the `commits` prop                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `@preact/signals`                                | `useSignal`                                                                              | the hovered-row state, which only the graph reads (§2.3.4)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `preact`, `preact/hooks`                         | `Fragment`, `useMemo`                                                                    | keyed row groups and memoised derived data                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

### 2.3 Behaviour

#### 2.3.1 Derived values

Computed on each render from the props and signals:

- **Layout**: `computeGraphLayout(commits, head)`, recomputed only when `commits` or `head` changes (by identity).
- **Relations**: `commitRelations(commits, focus)`, recomputed only when `commits` or `focus` changes.
- **Graph content width**: `graphWidth(layout) + 16`.
- **Suggested graph column width** (`graphColumn`, passed to `useColumnResize`): the content width clamped to at least **64** and at most **240** pixels.
- **Expanded row**: the index in `commits` of `expandedCommit.value`, or −1 when it is `null` or not among the loaded rows. The graph expansion is `{ row: <index>, height: 250 }`, or `null` for −1.
- **Keyboard tab stop**: the hash of `focusedCommit.value` when that hash is among `commits`; otherwise the first row's hash; none when there are no rows. Exactly this one row gets `tabStop: true`. It is decided once per render, not by each row scanning the list.
- **Revealed rows** (row indices whose graph dot is drawn in full colour regardless of focus): rows whose hash is `head`, `focusedCommit.value` or `expandedCommit.value`, or is in `selectedCommits.value`.
- **Messages map**: hash → `message` for every row (rebuilt when `commits` changes); passed to each row for the commit menu.
- **Row index map**: hash → index (rebuilt when `commits` changes); passed to the graph.
- **Row colour**: for row `i`, `branchColour(layout.vertices[i]?.colour ?? 0)`.

Signals read while rendering, so that a change re-renders the table: `selectedCommits`, `focusedCommit`, `expandedCommit`, `columnWidths`, `commitDetails` (plus what the two hooks read, such as `selectedRepo`).

#### 2.3.2 Rendered structure

```
div                                   ← containerRef; position: relative
├─ div[data-graph-viewport]           ← viewportRef; the graph's clip box
│  └─ div (width = graph content width, px)
│     └─ CommitGraph
└─ table[aria-label=graphKeyboardHint]
   ├─ colgroup: 5 × col
   ├─ thead
   │  └─ tr                           ← headRef
   │     └─ th × 5 (Graph, Description, Date, Author, Commit)
   └─ tbody
      └─ for each commit, keyed by hash: CommitRow, then its details row if expanded
```

The graph clip box must come **before** the `<table>` in document order: tests collect `container.querySelectorAll("circle")` and expect the first circles to be the graph's dots in row order (each row's menu button also contains circles).

**Outer container**: a plain `<div>` with `position: relative`. `useColumnResize` and `useGraphScroll` write their custom properties into its inline style; rows inside it inherit `--graph-top` (the stylesheet uses it for rows' scroll margin).

**Graph clip box**: `<div data-graph-viewport>` (renders `data-graph-viewport="true"`), `position: absolute`, `left: 0`, `overflow: hidden` (the UI test asserts computed `overflow-x` is `hidden`), ignores the pointer (`pointer-events: none`, so hover, clicks and wheel go to the table cells beneath), with inline style `width: var(--graph-viewport-width, 0px); top: var(--graph-top, 32px);`. Its only child is a `<div>` whose inline width is the graph content width in pixels, holding the `CommitGraph`. The clip box is painted above the table's first column (an absolutely placed element paints over the in-flow table), and its horizontal `scrollLeft` is driven by `useGraphScroll`.

**`<table>`**: `aria-label` = `window.l10n.graphKeyboardHint`. Full width, default arrow cursor, collapsed borders, 13 px text, text selection disabled, plus the class `table-fixed` (fixed table layout) exactly when `columnWidths.value` is not `null`. It handles:

- `mouseover`: sets the hovered row to the `data-commit-hash` of the closest `tr[data-commit-hash]` around the event target, or to `null` when there is none (header, details row);
- `mouseleave`: sets the hovered row to `null`;
- `wheel`: passes the event to `useGraphScroll`'s `onWheel`.

**`<colgroup>`**: five `<col>` elements; their inline widths are, in order, `width: var(--col-graph)`, none (the Description column takes the rest), `width: var(--col-date)`, `width: var(--col-author)`, `width: var(--col-commit)`.

**`<thead>`**: sticky, with inline style `top: var(--main-header-height, 0px)`, stacked above the rows and the graph (z-index 10), background `--color-editor`.

**Header `<tr>`** (`headRef`): its `className` is exactly `cursor-col-resize` while `resizing` is `true` (the column-resize cursor shows anywhere over the header during a drag) and exactly the empty string otherwise.

**Header cells**: five `<th>`, in the order Graph, Description, Date, Author, Commit, with texts `window.l10n.graph`, `.description`, `.date`, `.author`, `.commit`. Each cell is positioned relatively, 32 px tall, clips its overflow, has a 1 px `--color-line` bottom border, 12 px horizontal padding, left-aligned semibold text on one line with an ellipsis. When `overflow` is `true`, the Graph cell gets 8 px of bottom padding (room for its scrollbar).

Children of each header cell, in DOM order:

| Cell          | Children in order                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 Graph       | title text; the graph scroll region; right resize handle for boundary 0                                                                     |
| 1 Description | left resize handle for boundary 0; title text; the "Reveal selected lane" button (only when `overflow`); right resize handle for boundary 1 |
| 2 Date        | left handle for boundary 1; title text; right handle for boundary 2                                                                         |
| 3 Author      | left handle for boundary 2; title text; right handle for boundary 3                                                                         |
| 4 Commit      | left handle for boundary 3; title text (no right handle)                                                                                    |

Boundary `n` is the edge between column `n` and column `n + 1`. The left handle must come before the right handle in each cell: `thead th:nth-child(2) [role="separator"]` must find the focusable left handle.

**Resize handles**: `<span role="separator" aria-orientation="vertical">` with `aria-label` = `window.l10n.resizeColumn` with its first `{0}` replaced by the title of the column **left of the boundary** (so both handles of boundary 0 read "Resize Graph column", both of boundary 1 "Resize Description column", and so on). Left handles have `tabindex="0"` (keyboard-focusable); right handles have no `tabindex`. Both handles of a boundary call `startResize(boundary, event)` on `mousedown` and `nudge(boundary, event)` on `keydown`. Look: absolutely placed at the top of the cell, full cell height, 6 px wide, column-resize cursor, a 1 px `--color-focus` outline drawn 1 px inside the edge when focused; a left handle sits at the cell's left edge and draws a 1 px `--color-line-soft` left border, which is the visible divider between two header cells; a right handle sits at the cell's right edge and has no border. Each boundary thus has a 6 px pointer target on both of its sides.

**Graph scroll region** (inside the Graph cell): a `<div data-graph-scroll role="region">` (`data-graph-scroll="true"`) with `aria-label` = `window.l10n.scrollGraphHorizontally`, the class `graph-scrollbar`, `ref` = `scrollRef`, and a `scroll` handler calling `syncScroll`. `tabindex="0"` when `overflow` is `true`; no `tabindex` otherwise. Look: absolutely placed along the bottom-left of the Graph cell, full cell width, 10 px tall, scrolls horizontally (`overflow-x: auto`), never vertically, 1 px `--color-focus` outline drawn inside when focused, and `visibility: hidden` when `overflow` is `false` (it is always in the DOM). Its only child is an empty `<div>` whose inline style is the graph content width and a 1 px height, so the region's scroll width equals the graph's.

**"Reveal selected lane" button** (only while `overflow` is `true`): `<button type="button">` with `aria-label` and `title` both `window.l10n.revealSelectedLane`, `disabled` when `focusedCommit.value` is not the hash of a loaded row. Its content is `RevealIcon` at 14 px. A click reveals the focused commit's lane (§2.3.5); it changes neither focus, selection, nor details. Look: 8 px left margin, inline flex, pointer cursor, 4 px corner radius, 4 px padding, vertically centred with the heading text, `--color-btn-hover` background on hover, a 1 px `--color-focus` outline when focused; when disabled, default cursor and 50 % opacity.

**`<tbody>`**: for each commit, in order, a group keyed by the commit's hash containing:

1. `<CommitRow>` with:
   - `commit`: the entry; `rows`: the whole `commits` array; `tabStop`: whether this is the tab-stop row;
   - `isHead`: `commit.hash === head`; `headBranch`: the prop;
   - `messages`: the messages map; `colour`: the row colour (§2.3.1);
   - `relation`: the row's relation (`"normal"` when missing); `keepMergedBright`: the prop;
   - `expanded`: whether this is the expanded row;
   - `onSelect`: a function calling `toggleCommitDetails(commit.hash)`;
   - `onRevealLane`: the reveal function of §2.3.5.
     The `dimming` prop is not passed to rows (see CommitTable Q1).
2. Only for the expanded row: `<WorkingTreeDetails />` when its hash is `"*"`, otherwise `<CommitDetails details={commitDetails.value} />`.

Rows are keyed by hash: a re-render with a new array holding the same hashes (a refresh) keeps the same `<tr>` elements (measured: the seventh row is the same DOM node after re-rendering with a deep copy of the rows), so DOM focus and an open details row survive it. A details row is mounted each time details open (on another row, or on the same row after closing), and is not remounted by a refresh; this matters because it scrolls itself into view on mount (§1.3.3).

#### 2.3.3 Graph

`<CommitGraph>` receives: `layout`; `expansion`; `relations`; `relationForLine` (a function mapping a graph line to `lineRelation(line, commits, relations)`); `keepMergedBright`; `dimming`; `revealed` (the revealed row indices); `hovered` (the hovered-row state as a read-only signal); `commitRows` (the hash → index map).

#### 2.3.4 Hover

Requirement: moving the pointer from row to row must re-render `CommitGraph` and nothing else (measured today: 0 row renders and 1 graph render per hover). To meet it, the hovered hash lives in a signal owned by the table instance (for example from `useSignal`); the table only writes it from its event handlers, and `CommitGraph` is the only reader. Row hover highlighting itself needs no state: it is a CSS `:hover` style.

#### 2.3.5 Revealing a lane

The reveal function takes a hash, finds that commit's row index in `commits`, and, if the layout has a vertex for it, calls `revealLane(laneX(vertex.x))`. Unknown hashes do nothing. It is called by rows on click, focus and arrow-key navigation (§3), and by the "Reveal selected lane" button for `focusedCommit.value`. It is never called by a re-render or a refresh, so a manual pan survives refreshes and resizes.

#### 2.3.6 Details row

At most one details row, directly after the expanded commit's row. When `expandedCommit` names a hash that is not loaded, no details row is shown and the graph is not stretched (see CommitTable Q3).

#### 2.3.7 Events, timing, disposal

The table adds no listeners of its own outside its elements, and no timers. The hooks it uses own their listeners (`useColumnResize`: `window` `mousemove`/`mouseup`/`blur` during a drag; `useGraphScroll`: a `ResizeObserver` on header cell 0) and clean them up on unmount.

### 2.4 Examples

1. Rows `[*, a, b]` (`*` with parent `a`, `a` with parent `b`, `b` a root), `head = a`, `headBranch = "main"`, `a` labelled with local branch `main`, empty palette, no focus. Rendered:
   - Container style begins with `--col-graph: 64px` (one lane: content width 16 + 16 = 32, raised to 64).
   - Graph: `<svg width="16" height="72">`; the inner div's width is `32px`.
   - Header texts: `Graph | Description | Date | Author | Commit`. Separators (cell index : label : tabindex): `0:Resize Graph column:none`, `1:Resize Graph column:0`, `1:Resize Description column:none`, `2:Resize Description column:0`, `2:Resize Date column:none`, `3:Resize Date column:0`, `3:Resize Author column:none`, `4:Resize Author column:0`.
   - Rows: `*` (tabindex 0, text `Uncommitted Changes (<count>)`), `a` (tabindex −1, bold message, head marker, `main` label), `b` (tabindex −1).
2. Graph column suggestions: 1 lane → 64 px; 13 lanes (14 commits that all branch from one base, as in the tests) → `8 + 12 × 16 + 8 + 16 = 224` px; 20 lanes → 336 clamped to 240 px; no commits → 64 px.
3. `expandedCommit` set to the fourth of six rows: the SVG height grows from 144 to 394, a `tr[data-details-row]` follows that row, and dots of rows 5 and 6 move down by 250 px.
4. `expandedCommit` set to an unknown hash: no `[data-details-row]`, SVG height unchanged.
   No commits: `<svg width="0" height="0">` with no children, `--col-graph: 64px`, an empty `<tbody>`, and the header still drawn.
5. With `focus = { direct: [a], merged: [] }` over rows `[*, a, b]`: the rows' `data-branch-relation` are `normal`, `direct`, `unrelated`.
6. Hover: with focus making row 8 unrelated, a `mouseover` on row 8 changes that dot's `fill` to the full colour while row 7's stays dimmed and no path's `stroke` changes; a `mouseover` on row 7 swaps them; ctrl-clicking row 8 selects it, and after `mouseleave` on the table row 8's dot stays in full colour (it is now revealed) while row 7's is dimmed again (from `GraphScroll.test.ts`).
7. Tab stop: rows `[*, c0 … c13]`, `focusedCommit` `null` → only `*` has `tabindex="0"`; `focusedCommit = c8` → only `c8`; rows `[*, c0 … c4]` with `focusedCommit = c8` → only `*`.
8. Drag: with no stored widths and header cells measuring 120, 600, 110, 100, 90 px, a `mousedown` at x = 120 on the Graph cell's separator makes the header row's `className` `cursor-col-resize`; a window `mousemove` to x = 60 adds `table-fixed` to the table; the `mouseup` clears the header row's class and saves `[60, 110, 100, 90]` (from `ColumnResize.test.ts`).

### 2.5 Non-functional requirements

- **Hover isolation**: hovering must not re-render `CommitRow`s, and must not rebuild the graph's line paths (§4.5).
- **Keyed rows**: rows and their details are keyed by hash so a refresh reuses DOM elements.
- **One pass per render** for the tab stop, the revealed set and the maps; no per-row scans of the whole list.
- **Pixel geometry**: header cells 32 px tall (the graph's fallback top is `TABLE_HEADER_HEIGHT` = 32 px), rows 24 px (§3), details 250 px (§1). The graph is drawn on this grid.
- **No import-time work**; `window.l10n` is read during render.
- **Accessibility**: the resize handles, the scroll region and the reveal button show a visible 1 px outline in `--color-focus` when focused by keyboard (the UI tests measure a width of at least 1 px and a contrast of at least 3:1 against the background in four built-in themes).

### 2.6 Test coverage

Already checked:

- `ColumnResize.test.ts` ("in the commit table"): the container's `--col-graph` is `224px` for a 13-lane fan; `table-fixed` appears only once widths are stored; the header row's `className` is `cursor-col-resize` during a drag and `""` after; `th:first-child [role=separator]` starts a drag on boundary 0; `th:nth-child(2) [role=separator][tabindex="0"]` and `th:nth-child(4) [role=separator][tabindex="0"]` move boundaries 0 and 2 with the arrow keys.
- `GraphScroll.test.ts`: clicking and keyboard-focusing rows reveals their lanes with the smallest movement; manual panning survives a refresh with cloned rows and a resize until the reveal button (`[aria-label="revealSelectedLane"]`) is clicked; switching repositories and remounting reset panning; a vertical wheel on a row is not prevented; the single tab stop (example 7); hover changes only the hovered dot and not the paths, and selection keeps a dot revealed after `mouseleave`.
- `WorkingTreeDetails.test.ts`: clicking the `*` row expands it, shows the working-tree panel and sends no `commitDetails` request; the `*` row's last three cells are empty; clicking it again removes `[data-working-tree-details]`.
- `FileTreeView.test.ts`: clicking a commit row sends a `commitDetails` request and, once answered, shows the file tree under it.
- `tests/webview/utils/date.test.ts` ("graph rendering"): every row renders when a commit's date is out of range (`unknownDate` shown).
- `tests-ext/ui/history.test.cjs`: the graph never paints over the Description column (clip box right edge ≤ description left edge) at wide, narrow and zoomed sizes; the clip box has `overflow-x: hidden`; scrolling the scroll region moves the clip box by the same amount and leaves text in place; Shift + wheel and horizontal wheel over the graph column pan it; keyboard focus on the scroll region pans with arrow keys; dots stay vertically aligned with rows with details open; rounded vs angular paths; `[data-focus-branch]` badges; focus relations on rows; sticky header and scrollbar positions deep in history; "Reveal selected lane" after panning and after a refresh; separators have accessible names containing "Graph" and visible focus.
- `tests-ext/ui/benchmark.cjs`: selects `tbody tr[data-commit-hash]`, `[data-graph-scroll]`, `[data-graph-viewport]`, and dispatches `mouseover` on rows.

Not checked; proposed cases:

- **CT-G1 Clamp bounds.** Setup: render rows forming 1 lane, and rows forming 20 lanes, with no stored widths. Expect: the container's `--col-graph` is `64px` and `240px`.
- **CT-G2 Structure.** Setup: example 1. Expect: the first child of the container is `[data-graph-viewport]` with inline `width: var(--graph-viewport-width, 0px)` and `top: var(--graph-top, 32px)`; the `<table>`'s `aria-label` is `graphKeyboardHint`; five `<col>`s with the widths of §2.3.2; `<thead>` inline `top: var(--main-header-height, 0px)`; header texts in order; separator labels and `tabindex`es as in example 1.
- **CT-G3 Reveal button state.** Setup: make `overflow` `true` (in jsdom header cells measure 0 px wide, so any graph is already wider; to get `false`, stub `getBoundingClientRect` with a width above the content width); `focusedCommit` `null`. Expect: `button[aria-label="revealSelectedLane"]` is disabled. Set `focusedCommit` to a loaded hash: enabled; to an unloaded hash: disabled. With `overflow` `false`: no such button and the scroll region has no `tabindex`.
- **CT-G4 Details placement.** Setup: rows `[*, a, b]`, `expandedCommit = b`. Expect: the `<tr>` after `b`'s row is `[data-details-row]` holding the loading indicator; with `expandedCommit = "*"` the row after `*` contains `[data-working-tree-details]`.
- **CT-G5 Relations and brightness.** Setup: `focus = { direct: [a], merged: [b] }`. Expect: `b`'s row has `data-branch-relation="merged"`; with `keepMergedBright` it has `"direct"`. With `dimming: "strong"`, an unrelated row's graph dot `fill` is `color-mix(in srgb, var(--vscode-descriptionForeground, #808080) 45%, var(--vscode-editor-background))`.
- **CT-G6 Header hover clears.** Setup: hover a row with focus making it unrelated. Call: `mouseover` on a `<th>`. Expect: that row's dot returns to the dimmed fill.
- **CT-G7 Revealed rows.** Setup: focus making rows `s` and `t` unrelated; `head` = `s`. Expect: `s`'s dot uses the full palette colour; set `expandedCommit = t`: `t`'s dot uses the full colour.

### 2.7 Questions

- **CommitTable Q1: rows ignore the dimming level.** The graph uses `dimming`, but rows are not given it, so each row's `--branch-display-colour` (used by its ref-label icons and head marker) is always the "subtle" colour. With strong dimming, a row's labels and its dot use different greys. The UI test only requires that row text colour does not change with dimming.
- **CommitTable Q2: relation attributes disagree in the ancestors view.** With `keepMergedBright`, a merged row reports `data-branch-relation="direct"`, while its graph dot and lines still report `"merged"` (their colours are bright in both). The UI tests rely on both current behaviours (rows `"direct"` in the ancestors view; dots and paths by raw relation).
- **CommitTable Q3: an expanded commit that is no longer loaded.** After a refresh or a filter change removes the expanded commit, `expandedCommit` stays set (and its details request may still be answered), but nothing is shown and the graph is not stretched. Closing the details in that case may be intended.
- **CommitTable Q4: "selected" lane means the focused commit.** The reveal button reveals `focusedCommit`, the last row clicked or keyboard-focused, not a member of `selectedCommits`. After ctrl-clicking several rows it reveals the last one clicked, and after a right-click it reveals the previously focused row.
- **CommitTable Q5: a row whose menu is open is not revealed.** A right-clicked row gets full-colour text (`data-emphasized`), but its graph dot stays dimmed because the revealed set only covers head, focused, expanded and selected rows.
- **CommitTable Q6: an empty table.** With a filtered history that matches nothing, `GraphView` shows its "no matches" message and this component still renders a header and an empty body.
- **CommitTable Q7: the line paths are rebuilt on every table render.** The function passed as `relationForLine` is new on each render, so the graph rebuilds all line paths whenever the table renders (selection, focus or details changes), though not on hover. Keeping it stable while `commits` and `relations` are unchanged may be intended.
- **CommitTable Q8: the table's name is an instruction.** Its `aria-label` is the keyboard hint, which screen readers announce as the table's name. A short name plus a description may be intended.

---

## 3. `src/webview/components/commit/CommitRow.tsx`

### 3.1 Interface

Imported as `@/webview/components/commit/CommitRow`. One export, a Preact function component rendering one `<tr>`. Its props type is not exported but its shape is part of the interface:

```ts
export function CommitRow(props: {
  commit: HistoryEntry;
  rows?: HistoryEntry[]; // default [commit]
  tabStop?: boolean; // default true
  isHead: boolean;
  headBranch: string | null;
  messages: CommitMessages; // ReadonlyMap<string, string>
  colour: string | undefined;
  relation?: BranchRelation; // default "normal"
  keepMergedBright?: boolean; // default false
  expanded: boolean;
  onSelect: (() => void) | undefined;
  onRevealLane?: (hash: string) => void;
}): JSX.Element;
```

- `commit`: the row's entry (see §2.1). `hash === "*"` makes it the uncommitted-changes row.
- `rows`: all rows of the table in display order; used for arrow-key targets and range selection.
- `tabStop`: whether the row is the table's single keyboard entry point (`tabindex="0"`); otherwise `tabindex="-1"`.
- `isHead`: the commit is the one HEAD points to.
- `headBranch`: the checked-out branch's name, or `null`; the local-branch label with this name is the active one.
- `messages`: a map from full hash to subject line, covering the loaded rows. It is handed to `commitMenu`, which shows the subjects when asking which parent of a merge to use.
- `colour`: the row's graph colour, or `undefined` when the palette is empty.
- `relation`: `"normal" | "direct" | "merged" | "unrelated"` (`BranchRelation` from `@/webview/graph/types`), the row's relation to the focused branch.
- `keepMergedBright`: whether merged history is shown as bright as direct history.
- `expanded`: `true` while this row's details row is shown below it.
- `onSelect`: the activation callback (the table passes a function that toggles this row's details); `undefined` makes the row non-activatable (no pointer cursor, activation keys do nothing).
- `onRevealLane`: called with a hash when the user reaches a row by click, focus or arrow keys; the table then scrolls the graph horizontally so that commit's dot is visible.

**Who uses what**

- `CommitTable` renders one per commit (§2.3.2).
- `tests/webview/components/commit/CommitRow.test.ts`, `tests/webview/lib/config-changed.test.ts` and `tests/webview/lib/history-tools.test.ts` import it directly. `CommitRow.test.ts` and `config-changed.test.ts` render it straight into a `<tbody>` without a table and without `rows`, `tabStop`, `relation`, `keepMergedBright` or `onRevealLane`; `history-tools.test.ts` renders three inside `<table><tbody>`.

### 3.2 Dependencies the implementation must use

| Import path                              | Name                                                                                                 | Used for                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@/webview/components/commit/RefLabel`   | `RefLabel`                                                                                           | one label per ref (§5)                                                                                                                                                                                                                                                                                                                                                  |
| `@/webview/components/history/file-menu` | `fileContextMenu(hash, file, before, deleted, destination)`                                          | the file entries appended to the menu of a file-history row: File History, Open File at This Revision, Restore                                                                                                                                                                                                                                                          |
| `@/webview/components/ui/Icons`          | `KebabIcon`                                                                                          | the three-dot glyph of the row's menu button                                                                                                                                                                                                                                                                                                                            |
| `@/webview/constants`                    | `UNCOMMITTED_CHANGES` (`"*"`)                                                                        | recognising the uncommitted row                                                                                                                                                                                                                                                                                                                                         |
| `@/webview/graph/focus`                  | `focusColour(colour, relation, keepMergedBright?, dimming?)`                                         | the row's two colour custom properties. It returns `colour` (or `var(--vscode-focusBorder)` when `undefined`) for `"normal"`, `"direct"`, and `"merged"` with `keepMergedBright`; a grey (`var(--vscode-descriptionForeground, #808080)` for subtle dimming) for `"unrelated"`; a `color-mix(in srgb, <colour> 40%, <grey>)` for `"merged"` without it (subtle dimming) |
| `@/webview/graph/types`                  | type `BranchRelation`                                                                                | the `relation` prop                                                                                                                                                                                                                                                                                                                                                     |
| `@/webview/lib/actions`                  | `openContextMenu(event, source, entries)`                                                            | opens the commit menu. It calls `preventDefault()` and `stopPropagation()` on the event, remembers the element to give focus back to, and places the menu at the event's pointer position, or below the event's `currentTarget` when the event came from the keyboard (a `click` with `detail === 0`, or pointer coordinates of exactly 0, 0)                           |
| `@/webview/lib/menus`                    | `commitMenu(commit, messages)`, `commitMenuSource(hash)`, type `CommitMessages`                      | the commit menu entries, and the menu's source key `"commit:" + hash` (other code matches this prefix, for example `src/webview/lib/hints.ts`)                                                                                                                                                                                                                          |
| `@/webview/lib/navigation`               | `focusedCommit`, `selectedCommits`, `selectCommitRows(commit, rows, toggle, range)`, `historyFilter` | the focused hash; the selection; the shared selection logic (keeps the range anchor: a plain call selects only `commit`, `toggle` adds or removes it, `range` selects from the anchor to `commit` within `rows`, never including `"*"`); the file-history destination path (`historyFilter.value.path`), read only when a menu is built                                 |
| `@/webview/lib/stores`                   | `activeSource`, `uncommittedChanges`                                                                 | the source key of the open menu or form dialog (to show "menu open"); the changed-file count for the uncommitted row                                                                                                                                                                                                                                                    |
| `@/webview/utils/date`                   | `getCommitDate(seconds)`                                                                             | `{ title, value }` for the date cell (value per the `dateFormat` setting; title always the day and a 24-hour time; both `Unknown date` when unusable). It reads the configuration, so a settings change re-renders the row                                                                                                                                              |
| `@/webview/utils/format`                 | `format(template, ...parts)`                                                                         | fills every `{n}` of a template with nodes (returns an array of children)                                                                                                                                                                                                                                                                                               |
| `@/backend/utils/string`                 | `abbrevCommit(hash)`                                                                                 | the first 8 characters of a hash                                                                                                                                                                                                                                                                                                                                        |
| `@/backend/types`                        | types `HistoryEntry`, `GitRef`                                                                       | props and refs                                                                                                                                                                                                                                                                                                                                                          |

### 3.3 Behaviour

Throughout this section, "the uncommitted row" is a row whose `commit.hash` is `"*"`, a "commit row" is any other row, and a row "is selected" when its `commit.hash` is among `selectedCommits.value`.

#### 3.3.1 The `<tr>` element

| Attribute / property             | Value                                                                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `class`                          | must include `branch-focus-row`; the rest is look (§3.3.7)                                                                    |
| `data-commit-hash`               | `commit.hash`                                                                                                                 |
| `data-branch-relation`           | `relation`, except `"direct"` when `relation` is `"merged"` and `keepMergedBright` is `true`                                  |
| `data-emphasized`                | `"true"` when the row is the head, is the uncommitted row, is expanded, is selected, or its menu is open; otherwise `"false"` |
| `tabindex`                       | `0` when `tabStop`, else `-1`                                                                                                 |
| `aria-selected`                  | the uncommitted row: `expanded`; other rows: whether the row is selected (`"true"`/`"false"`)                                 |
| `aria-expanded`                  | `expanded` (`"true"`/`"false"`), always present                                                                               |
| `title`                          | the uncommitted row: `window.l10n.viewWorkingTreeChanges`; commit rows: `window.l10n.selectCommitsHint`                       |
| inline `--branch-colour`         | `focusColour(colour, "normal")`: `colour`, or `var(--vscode-focusBorder)` when `undefined`                                    |
| inline `--branch-display-colour` | `focusColour(colour, relation, keepMergedBright)` (subtle dimming; see CommitTable Q1)                                        |

"Its menu is open" means `activeSource.value === "commit:" + commit.hash` (a context menu, or a form dialog opened from that menu, belongs to this row).

#### 3.3.2 Cells

Exactly five `<td>` cells, in this order. None of the first two cells carries a `title` attribute: `config-changed.test.ts` takes the first `td[title]` to be the date cell.

1. **Graph cell**: empty. The graph is drawn over it.
2. **Description cell**: takes all remaining width (it must be able to shrink below its content so that the text truncates), 10 px left padding; for the head row, an inset 2 px bar on its left edge in `--color-graph`. It contains one horizontal flex line (items vertically centred, allowed to shrink) holding, in order:
   1. **Head marker**, only when `isHead`: an empty `<span>`, a 6 px circle with a 2 px `--color-graph` ring (10 px overall), 5 px right margin, not shrinking.
   2. **Refs container**, only when `commit.refs` is not empty: a `<span>` with class `max-w-1/2` (at most half the cell's width), a flex line that does not shrink and clips overflow. It holds one `RefLabel` per ref, with `gitRef` = the ref and `active` = (`type === "head"` and `name === headBranch`). Labels follow the order of `commit.refs`, except that the active label, if there is one, is moved to the front.
   3. **Message**: a `<span>` with class `flex-1`, allowed to shrink to nothing, one line, cut off with an ellipsis. Its `title` is the message's plain text. Its content is the message as text, wrapped in `<b>` when the row is the head or the uncommitted row. For the uncommitted row the message is `format(window.l10n.uncommittedChanges, uncommittedChanges.value)` (English `Uncommitted Changes (3)`), and its title is the same text joined into one string; otherwise it is `commit.message`.
   4. **Menu button**, only on commit rows: `<button type="button" tabindex="-1" aria-haspopup="menu">` with `aria-label` = `window.l10n.commitActions` with its first `{0}` replaced by `abbrevCommit(commit.hash)`. Content: `KebabIcon` at 14 px. Look: 4 px left margin, 20 px tall, 4 px horizontal padding, 4 px corner radius, pointer cursor, `--color-btn-hover` background on hover, not shrinking; it is hidden unless the pointer is over the row, and always shown while the row's menu is open.
3. **Date cell**: text `getCommitDate(commit.date).value`, `title` = `.title`. Uncommitted row: empty, no `title`.
4. **Author cell**: at most 124 px wide; text `commit.author`; `title` = `"<author> <<email>>"` (for example `Ann <ann@example.com>`). Uncommitted row: empty, no `title`.
5. **Commit cell**: monospace; text `abbrevCommit(commit.hash)`; `title` = the full hash. Uncommitted row: empty, no `title`.

Every cell is exactly 24 px tall with a 24 px line height, 4 px horizontal padding, one line of text, overflow clipped with an ellipsis. The row's contents must never make it taller than 24 px (the graph is drawn on a 24 px grid).

#### 3.3.3 Pointer

- **Focus** (whenever the `<tr>` itself receives focus, by click, keyboard, script or focus restoration after a menu; focus landing on a child does not count): sets `focusedCommit` to the hash and calls `onRevealLane?.(hash)`.
- **Click** (anywhere in the row except where a child stops it, such as a ref label or the menu button):
  1. sets `focusedCommit` to the hash, calls `onRevealLane?.(hash)`, and focuses the row with `{ preventScroll: true }` (which fires the focus behaviour again);
  2. the uncommitted row: clears the selection (`selectedCommits.value = []`) and calls `onSelect?.()`, whatever modifier keys were held;
  3. commit rows: calls `selectCommitRows(commit, rows, ctrlKey || metaKey, shiftKey)`, then, only when none of Ctrl, Meta or Shift was held, calls `onSelect?.()`.

  So a plain click selects only this row and toggles its details; Ctrl/Cmd-click toggles it in the selection; Shift-click selects a range; neither of the last two opens or closes details.

- **Right-click** (`contextmenu`) on a commit row: `openContextMenu(event, "commit:" + hash, entries)` with the entries of §3.3.5, placed at the pointer. On the uncommitted row there is no handler: the event is not prevented.
- **Menu button click**: stops the click from reaching the row (no selection, no details change) and calls `openContextMenu(event, "commit:" + hash, entries)`.

#### 3.3.4 Keyboard

The row handles `keydown` only when the event's target is the row itself; key presses bubbling up from a child are ignored (not prevented).

- **ArrowUp, ArrowDown, Home, End**: `preventDefault()`. The target is, within `rows`: the first row (Home), the last row (End), or the neighbour above/below, clamped to the first and last rows (so ArrowUp on the first row and ArrowDown on the last row target the row itself). If this row's hash is not in `rows`, the neighbour counts from position −1 (both arrows then target the first row). Then:
  1. `focusedCommit` = the target's hash; `onRevealLane?.(target hash)`;
  2. selection: a commit-row target is passed to `selectCommitRows(target, rows, false, shiftKey)` (plain arrows select only the target; Shift extends a range from the anchor); the uncommitted row as target clears the selection without Shift and leaves it unchanged with Shift;
  3. the `<tr data-commit-hash="<target hash>">` inside the closest `<table>` gets `focus()` **without** `preventScroll`, so the browser scrolls it into view (honouring the stylesheet's scroll margin below the sticky headings). Outside a table, focus does not move.
- **Enter** (any modifiers), and **Space** on the uncommitted row: `preventDefault()`; on the uncommitted row, clears the selection; then `onSelect?.()`.
- **Space** on commit rows: `preventDefault()`; `selectCommitRows(commit, rows, true, shiftKey)` (toggle; with Shift, a range from the anchor). Details are not changed.
- **ContextMenu**, or **F10 with Shift**, on commit rows: `preventDefault()`; opens the commit menu at `x = row's left + 80`, `y = row's bottom` (viewport pixels from the row's bounding box), by passing a synthetic `contextmenu` `MouseEvent` with those `clientX`/`clientY` to `openContextMenu`. F10 without Shift does nothing.
- Any other key, and the menu keys on the uncommitted row: nothing, not prevented.

#### 3.3.5 Menu entries

The entries are built when the menu opens: `commitMenu(commit, messages)`; and, when `commit.filePath` is set (a file-history row), a divider (`null`) followed by `fileContextMenu(commit.hash, commit.filePath, commit.previousPath ?? commit.filePath, <deleted>, historyFilter.value.path)`, where `<deleted>` is `true` exactly when `commit.change` starts with `"D"`.

With the test proxy the entry titles are `addTag… | createBranch… | — | checkout… | cherryPick… | revert… | — | merge… | reset… | — | interactiveRebase… | createFixupMenu… | compareWith | bisectChooseGood | bisectChooseBad | copyCommitHash` (— is a divider), and for a file-history row `| — | fileHistory | openHistoricalFile | restoreHistoricalFile` follows.

#### 3.3.6 Re-render triggers

Signals read while rendering: `uncommittedChanges` (the uncommitted row), `activeSource`, `selectedCommits`, and the configuration (through `getCommitDate`), so a date-format or locale change redraws the date cells. `historyFilter` is read only when a menu is built.

#### 3.3.7 Look

- Row background, one state at a time, in this priority: expanded or selected → `--color-row-selected`, `--color-row-selected-hover` on hover; otherwise menu open → `--color-row-hover` (constant); otherwise head → `--color-row-head`, `--color-row-hover` on hover; otherwise transparent, `--color-row-hover` on hover.
- Pointer cursor when `onSelect` is set.
- When the row itself has focus: a 1 px `--color-focus` outline drawn 1 px inside its edge.
- Text colour and the row's `--color-graph` come from `styles.css`: `.branch-focus-row` sets `--color-graph` to `--branch-display-colour`; `merged` rows get 80 % foreground, `unrelated` rows the muted colour; on hover, while anything in the row has focus, or when `data-emphasized="true"`, the row returns to `--color-fg` and `--color-graph` becomes `--branch-colour`. The component must not set its own text colour on the row or its cells.

### 3.4 Examples

Test proxy strings, palette colour `#123456`, date `1700000000` (UTC, en, "Date & Time"), hash `abcdef0123456789abcdef0123456789abcdef01`, refs `[tag v1, remote origin/main, head main]`, message `Fix <b>it</b>`, author `Ann`, e-mail `ann@x`.

1. Plain (`isHead: false`, `headBranch: null`): `data-branch-relation="normal"`, `data-emphasized="false"`, `tabindex="0"`, `aria-selected="false"`, `aria-expanded="false"`, `title="selectCommitsHint"`, style `--branch-colour: #123456; --branch-display-colour: #123456;`. Labels in order `v1`, `origin/main`, `main` (none active). Message span text `Fix <b>it</b>` (literal), title the same. Cells 3 to 5: `Nov 14, 2023 22:13` (title the same), `Ann` (title `Ann <ann@x>`), `abcdef01` (title the full hash). Menu button `aria-label="commitActions"`, hidden until hover.
2. Head (`isHead: true`, `headBranch: "main"`): `data-emphasized="true"`, head background; the description cell has the left bar; head marker first; labels `main` (active, bold, title `main\nlabelCurrentBranch`), `v1`, `origin/main`; message in `<b>`.
3. `expanded: true`, `relation: "merged"`, `keepMergedBright: true`: `data-branch-relation="direct"`, `data-emphasized="true"`, `aria-selected="false"` (not selected), `aria-expanded="true"`, selected background.
4. `relation: "unrelated"`, `colour: undefined`: `--branch-colour: var(--vscode-focusBorder); --branch-display-colour: var(--vscode-descriptionForeground, #808080);`.
5. Uncommitted, `uncommittedChanges = 3`, English strings: text `Uncommitted Changes (3)` in `<b>`, message title the same, row title `Click or press Enter to view uncommitted changes.`, `data-emphasized="true"`, no labels, no menu button, cells 3 to 5 empty without titles. `aria-selected` equals `expanded`.
6. Selected, `tabStop: false`: `tabindex="-1"`, `aria-selected="true"`, `data-emphasized="true"`, selected background.
7. Menu open (`contextMenu.source = "commit:<hash>"`), `onSelect: undefined`: `data-emphasized="true"`, constant hover background, no pointer cursor, menu button always visible.

Interaction sequence over rows `[*, a (head), b, c]` in a table, each row's `onSelect` recording its hash (selection shown as first letters):

| Action                                    | Selection after | `onSelect` calls | Focus after                                         |
| ----------------------------------------- | --------------- | ---------------- | --------------------------------------------------- |
| click `b`                                 | `b`             | `b`              | `b`                                                 |
| Ctrl-click `c`                            | `bc`            | none             | `c`                                                 |
| Shift-click `a`                           | `abc`           | none             | `a`                                                 |
| click `*`                                 | empty           | `*`              | `*`                                                 |
| Ctrl-click `*`                            | empty           | `*`              | `*`                                                 |
| ArrowDown on `a`                          | `b`             | none             | `b`                                                 |
| Shift+ArrowDown on `b`                    | `bc`            | none             | `c`                                                 |
| ArrowDown on `c` (last)                   | `c`             | none             | `c`                                                 |
| Home on `c`                               | empty           | none             | `*`                                                 |
| End on `*`                                | `c`             | none             | `c`                                                 |
| Shift+ArrowUp on `a` with selection `b`   | `b`             | none             | `*`                                                 |
| Enter on `a`                              | unchanged       | `a`              | —                                                   |
| Enter or Space on `*` with selection `b`  | empty           | `*`              | —                                                   |
| Space on `a`, then Space on `a` again     | `a`, then empty | none             | —                                                   |
| ContextMenu on `b`                        | —               | —                | menu `commit:b…` at (left + 80, bottom), 16 entries |
| F10 on `b` without Shift                  | —               | —                | no menu, not prevented                              |
| ContextMenu, or right-click, on `*`       | —               | —                | no menu, not prevented                              |
| ArrowDown dispatched on `b`'s menu button | —               | —                | ignored, not prevented                              |
| click `b`'s menu button                   | unchanged       | none             | menu opens                                          |

A plain click also calls `onRevealLane` twice with the same hash (directly, then through the focus event).

### 3.5 Non-functional requirements

- **Exact row height** of 24 px for every state (head marker, labels, menu button included).
- **No import-time work**: `window.l10n`, signals and configuration are read during render or in handlers. `CommitRow.test.ts` and `config-changed.test.ts` import the module after installing `window.l10n`, but other tests import it statically.
- **Standalone rendering**: works when rendered straight into a `<tbody>` with only the required props (the defaults of §3.1 apply), and when not inside a `<table>` (arrow keys then change state but move no focus).
- **Focus and scrolling**: a click focuses the row without scrolling; arrow keys focus the target with the browser's normal scrolling.
- **Menu identity**: menus are opened through `openContextMenu` with the source `commitMenuSource(hash)`, so focus is given back to the row when the menu closes and hints can match `"commit:"`.
- **Performance**: the row re-renders when `activeSource` changes (every row reads it; see CommitRow Q6). Hover must not re-render rows.
- **Timing and disposal**: no timers, no listeners outside the row's own elements, nothing to clean up.

### 3.6 Test coverage

Already checked:

- `CommitRow.test.ts`: the refs container (`td:nth-child(2) > div > span:first-child`) has class `max-w-1/2` and its first `[title]` element's title is the branch name; the message span (`> div > span:last-of-type`) has class `flex-1`, `title` and text equal to the message; the menu button (`button[aria-haspopup]`) has `aria-label` `commitActions`, and clicking it opens a menu whose `source` is `commit:abc123456789`.
- `config-changed.test.ts`: the first `td[title]` shows a `HH:MM` date; after a `config.changed` notification with `dateFormat: "Date Only"` it shows the date without time, equal to its title minus the time.
- `history-tools.test.ts`: in a table of three rows, ArrowDown moves DOM focus and `focusedCommit` to the next row; Enter calls `onSelect` once; Shift+F10 opens a menu containing `compareWith`.
- `WorkingTreeDetails.test.ts` (through the table): the `*` row has `tabIndex` 0; ArrowUp from the commit reaches `*`; Enter on `*` expands it without selecting; Space on `*` toggles it closed and open; `aria-expanded` is `"true"` when open; Shift+ArrowDown from `*` selects the commit; Shift+Home never selects `*`; the `*` row's last three cells are empty.
- `GraphScroll.test.ts` (through the table): Ctrl-click and focus reveal the lane; ArrowDown sets `focusedCommit`, moves focus and reveals.
- `tests-ext/ui/history.test.cjs`: right-click on rows opens the commit menu; Ctrl-click builds a selection; clicking the description cell selects the row (`aria-selected="true"`) and shows its details; Space selects a focused row; the `*` row's text includes `Uncommitted Changes (3)`; focused and emphasised rows regain full text colour; ArrowUp never leaves the focused row under the sticky headings; text contrast per relation.

Not checked; proposed cases:

- **CR-G1 Plain versus modified clicks.** Setup: rows `[a, b, c]` in a table, `onSelect` spy. Call: click `b`; Ctrl-click `c`; Shift-click `a`. Expect: the selection sequence and `onSelect` calls of the example table.
- **CR-G2 Uncommitted click.** Setup: selection `[b]`. Call: Ctrl-click `*`. Expect: selection empty, `onSelect` called once.
- **CR-G3 Home/End and edges.** Expect the Home, End, ArrowDown-on-last and ArrowUp-on-first rows of the example table, with `defaultPrevented` `true`.
- **CR-G4 Space toggles.** Call: Space twice on `a`. Expect: `[a]`, then `[]`; `onSelect` not called.
- **CR-G5 Menu keys.** Call: ContextMenu on `b`. Expect: `contextMenu.value.source === "commit:" + b`, `x` = row left + 80, `y` = row bottom, event prevented. F10 without Shift: no menu, not prevented.
- **CR-G6 Uncommitted has no menu.** Call: ContextMenu key and a `contextmenu` mouse event on `*`. Expect: `contextMenu.value` stays `null` and neither event is prevented.
- **CR-G7 Child keydown ignored.** Call: dispatch a bubbling ArrowDown on the menu button. Expect: not prevented; focus and selection unchanged.
- **CR-G8 Menu button isolation.** Call: click the menu button. Expect: menu open, selection unchanged, `onSelect` not called.
- **CR-G9 File-history entries.** Setup: `commit.filePath = "new.txt"`, `previousPath = "old.txt"`, `change = "D"`. Call: right-click. Expect: the commit entries, a `null`, then `fileHistory`, `openHistoricalFile`, `restoreHistoricalFile`.
- **CR-G10 Attributes.** Expect the attribute values of examples 1 to 7 (`data-emphasized`, `aria-selected`, `aria-expanded`, `title`, `tabindex`, both custom properties).
- **CR-G11 Ref order.** Setup: refs `[tag v1, remote origin/main, head main]`, `headBranch: "main"`. Expect: label titles' first lines `main`, `v1`, `origin/main`.
- **CR-G12 Cells.** Expect example 1's date, author and hash cells and their titles, and example 5's empty cells for `*`.

### 3.7 Questions

- **CommitRow Q1: arrow keys change the selection.** Plain arrows select the target row alone, which the README's "Space selects" does not suggest. Selection following focus may be intended (a list-box convention) or not.
- **CommitRow Q2: a plain click on the open row** closes its details but leaves it selected (selected background).
- **CommitRow Q3: `aria-selected` means different things.** On the uncommitted row it reflects `expanded`; on other rows it reflects the selection. The table is not a `grid`, so assistive technology may ignore `aria-selected` on its rows entirely.
- **CommitRow Q4: right-click on the uncommitted row** falls through to the webview's default context menu.
- **CommitRow Q5: the keyboard menu's position** is 80 px right of the row's left edge, while `openContextMenu` places other keyboard-opened menus at their owner's left edge.
- **CommitRow Q6: every row re-renders when any menu or form dialog opens or closes**, because each row compares the shared `activeSource` itself (20 of 20 rows re-render in a 20-row table). The Branches pane fixed the same cost by subscribing each row to a computed "my menu is open" value.
- **CommitRow Q7: the uncommitted row ignores modifier keys.** Ctrl- or Shift-clicking it still toggles its details and clears the selection.
- **CommitRow Q8: the menu button is not keyboard-reachable** (`tabindex="-1"`); keyboard users rely on the ContextMenu key or Shift+F10, which the table's label announces.

---

## 4. `src/webview/components/commit/CommitGraph.tsx`

### 4.1 Interface

Imported as `@/webview/components/commit/CommitGraph`. One export, a Preact function component. All props are required:

```ts
export function CommitGraph(props: {
  layout: GraphLayout;
  expansion: GraphExpansion | null;
  relations: BranchRelation[];
  relationForLine: (line: GraphLine) => BranchRelation;
  keepMergedBright: boolean;
  dimming: FocusDimming;
  revealed: ReadonlySet<number>;
  hovered: ReadonlySignal<string | null>;
  commitRows: ReadonlyMap<string, number>;
}): JSX.Element;
```

- `layout`: `{ branches: GraphBranch[]; vertices: GraphVertex[]; lanes: number }` from `computeGraphLayout`. A vertex is `{ x: lane, y: row, colour: palette index, isCommitted, isCurrent }`; `vertices` are in row order.
- `expansion`: `{ row, height }` of open details (rows after `row` move down by `height`), or `null`.
- `relations`: the relation of each row, by row index (missing entries count as `"normal"`).
- `relationForLine`: the relation of each drawn line.
- `keepMergedBright`, `dimming`: as in §2.1.
- `revealed`: row indices whose dot must use the full colour whatever their relation.
- `hovered`: a read-only signal holding the hovered row's hash, or `null`.
- `commitRows`: hash → row index, to find the hovered row.

**Who uses what**: only `CommitTable` renders it (§2.3.3). No test imports it; `GraphScroll.test.ts` and the UI tests inspect its output through the table.

### 4.2 Dependencies the implementation must use

| Import path                    | Name                                                                 | Used for                                                                                                                                                                                                                              |
| ------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@/webview/graph/strokes`      | `branchStrokes(branch, angular, expansion, relationForLine)`         | the SVG paths of one layout branch: `GraphStroke[]`, each `{ relation, path, colour (palette index), isCommitted }`                                                                                                                   |
| `@/webview/graph/utils`        | `laneX`, `rowY`, `expandOffset`, `graphWidth`, `graphHeight`         | pixel geometry: lane centre `8 + x × 16`; row middle `(y + 0.5) × 24`; the downward shift of rows after an open expansion; the drawing's width; its height (`rows × 24`, plus the expansion height when its row is within the layout) |
| `@/webview/graph/constants`    | `VERTEX_RADIUS` (4)                                                  | dot radius                                                                                                                                                                                                                            |
| `@/webview/graph/focus`        | `focusColour(colour, relation, keepMergedBright, dimming)`           | the colour of a line or dot for its relation                                                                                                                                                                                          |
| `@/webview/graph/palette`      | `branchColour(index)`, `UNCOMMITTED_COLOUR` (`"#808080"`)            | palette colours (or `undefined` for an empty palette) and the grey of uncommitted lines and dots                                                                                                                                      |
| `@/webview/lib/webview-config` | `getWebviewConfig()`                                                 | `graphStyle` (`"rounded"` or `"angular"`); read during render so a settings change redraws                                                                                                                                            |
| `@/webview/graph/types`        | types `BranchRelation`, `GraphExpansion`, `GraphLayout`, `GraphLine` | props                                                                                                                                                                                                                                 |
| `@/webview/types`              | type `FocusDimming`                                                  | props                                                                                                                                                                                                                                 |
| `@preact/signals`              | type `ReadonlySignal`                                                | the `hovered` prop                                                                                                                                                                                                                    |
| `preact/hooks`                 | `useMemo`                                                            | keeping the strokes across hover re-renders                                                                                                                                                                                           |

`focusColour` results, for reference: `base` = the palette colour or `var(--vscode-focusBorder)`; grey = `var(--vscode-descriptionForeground, #808080)`; for `"unrelated"`: the grey (subtle) or `color-mix(in srgb, <grey> 45%, var(--vscode-editor-background))` (strong); for `"merged"` without `keepMergedBright`: `color-mix(in srgb, <base> 40%, <grey>)` (subtle) or `color-mix(in srgb, <base> 25%, <strong grey>)` (strong); otherwise `base`.

### 4.3 Behaviour

#### 4.3.1 The `<svg>`

One `<svg>` element, displayed as a block, with attributes `width` = `graphWidth(layout)`, `height` = `graphHeight(layout, expansion)`, and `aria-hidden="true"` (the UI tests select `svg[aria-hidden] circle[data-branch-relation]`). No title or description.

#### 4.3.2 Lines

`angular` is `getWebviewConfig().graphStyle === "angular"`. The strokes are, in order, the results of `branchStrokes(branch, angular, expansion, relationForLine)` for each entry of `layout.branches` in order, concatenated.

For each stroke, one `<g>` containing two `<path>` elements with the same `d` = `stroke.path`:

1. an underlay: no fill; stroke `--color-editor` at 75 % opacity (for example `color-mix(in oklab, var(--color-editor) 75%, transparent)`), stroke width 4. No `data-branch-relation`. It separates crossing lines and dots visually.
2. the visible line: no fill; stroke width 2; `data-branch-relation` = `stroke.relation`; a `stroke` **attribute** = `focusColour(branchColour(stroke.colour), stroke.relation, keepMergedBright, dimming)` for a committed stroke, or `#808080` (`UNCOMMITTED_COLOUR`) otherwise.

Colours must be set as `stroke`/`fill` attributes: tests read `getAttribute("stroke")`/`getAttribute("fill")` and select `path[data-branch-relation="merged"][stroke^="color-mix"]`.

#### 4.3.3 Dots

After all lines (so dots paint above them), one `<circle>` per entry of `layout.vertices`, in array order (row order), keyed by row:

- `data-branch-relation` = `relations[vertex.y]` (or `"normal"`); this is the row's own relation even when the dot is drawn in full colour;
- `cx` = `laneX(vertex.x)`, `cy` = `rowY(vertex.y) + expandOffset(vertex.y, expansion)`, `r` = 4;
- colour: `#808080` when `!vertex.isCommitted`; otherwise `focusColour(branchColour(vertex.colour), shown, keepMergedBright, dimming)`, where `shown` is `"normal"` when the row is in `revealed`, is the hovered row (`commitRows.get(hovered.value)`), or `vertex.isCurrent`; otherwise it is the row's relation;
- when `vertex.isCurrent` (the open HEAD dot): a `stroke` attribute with the colour, no `fill` attribute, filled with `--color-editor`, stroke width 2;
- otherwise: a `fill` attribute with the colour, no `stroke` attribute, outlined in `--color-editor` at 75 % opacity with stroke width 1.

No other `<circle>` may be drawn inside the graph: the UI tests pair `[data-graph-viewport] circle` elements with rows by index.

#### 4.3.4 Re-render behaviour

- The strokes are recomputed only when `layout`, `angular`, `expansion` or `relationForLine` changes (by identity). A re-render caused only by `hovered`, `revealed` or colour props reuses them.
- `hovered.value` is read during render, so this component (and nothing above it) re-renders on hover.
- The configuration is read during render, so changing `graphStyle` or `graphColours` redraws.

#### 4.3.5 Events, timing, disposal

No event handlers (the clip box around it ignores the pointer), no timers, nothing to dispose.

### 4.4 Examples

Palette `["#ff0000", "#00ff00", "#0000ff"]`, rows `[*, m, s, t, a, b]`: `*` has parent `m`; `m` is a merge of `a` (first parent) and `t`; `s`, `t` and `a` have parent `b`; `head = m`; `focus = { direct: [m, a, b], merged: [t] }`; subtle dimming. The layout has 3 lanes, so `<svg width="48" height="144">`.

| Row | `cx,cy` | `data-branch-relation` | Attribute                                                                              | Drawn as   |
| --- | ------- | ---------------------- | -------------------------------------------------------------------------------------- | ---------- |
| `*` | 8,12    | normal                 | `stroke="#808080"` (current and uncommitted)                                           | open dot   |
| `m` | 8,36    | direct                 | `fill="#ff0000"`                                                                       | filled dot |
| `s` | 40,60   | unrelated              | `fill="var(--vscode-descriptionForeground, #808080)"`                                  | filled dot |
| `t` | 24,84   | merged                 | `fill="color-mix(in srgb, #00ff00 40%, var(--vscode-descriptionForeground, #808080))"` | filled dot |
| `a` | 8,108   | direct                 | `fill="#ff0000"`                                                                       | filled dot |
| `b` | 8,132   | direct                 | `fill="#ff0000"`                                                                       | filled dot |

Visible paths (`d`, relation, stroke), rounded style: `M8,12.0L8,36.0` normal `#808080`; `M8,36.0L8,132.0` direct `#ff0000`; `M8,36.0C8,55.2 24,40.8 24,60.0L24,108.0C24,127.2 8,112.8 8,132.0` merged `color-mix(in srgb, #00ff00 40%, …)`; `M40,60.0L40,108.0C40,127.2 8,112.8 8,132.0` unrelated grey. After switching `graphStyle` to angular: the third path becomes `M8,36.0L24,50.9L24,60.0L24,108.0L24,117.1L8,132.0`.

The same with strong dimming and `keepMergedBright`: `s`'s dot and the unrelated path become `color-mix(in srgb, var(--vscode-descriptionForeground, #808080) 45%, var(--vscode-editor-background))`; `t`'s dot becomes `#00ff00` and the merged path `#00ff00`, while their `data-branch-relation` stay `unrelated` and `merged`.

With `s` in `revealed` and `t` hovered: `s`'s dot fill is `#0000ff`, `t`'s `#00ff00`; paths unchanged. When the hover clears, `t`'s dot returns to its dimmed colour.

With `expansion = { row: 3, height: 250 }`: height 394; `cy` values `12, 36, 60, 84, 358, 382`.

An empty layout (no rows) gives `<svg width="0" height="0">` with no children.

### 4.5 Non-functional requirements

- **Hover cost**: a hover re-renders only this component and does not call `branchStrokes`.
- **Stable DOM order**: lines before dots; dots in row order.
- **Pure**: no side effects; nothing at import time.
- **Hidden from assistive technology**: the drawing is decorative (`aria-hidden`); the rows carry the information.

### 4.6 Test coverage

Already checked (through the table):

- `GraphScroll.test.ts`: the `cx` of dot _i_ is the lane of row _i_ (used to compute reveal positions); hovering changes only the hovered dot's `fill`; paths' `stroke`s do not change on hover; a selected row's dot stays in full colour after the hover ends.
- `tests-ext/ui/history.test.cjs`: `circle[data-branch-relation]` positions do not change when focus, pause, the ancestors view or the focused branch change; subtle and strong dimming differ for unrelated lines and for every non-direct dot and are equal for direct dots; pausing focus restores exactly the unfocused colours; `path[data-branch-relation="merged"]` has a `stroke` starting with `color-mix`; rounded paths contain `C` and angular paths do not; dots stay vertically aligned with rows with details open and after zoom.

Not checked; proposed cases:

- **CG-G1 Size.** Setup: the example layout. Expect: `width="48"`, `height="144"`, `aria-hidden="true"`; with `expansion = { row: 3, height: 250 }`, `height="394"`; an empty layout gives `0`, `0`.
- **CG-G2 Stroke pairs.** Expect: one `<g>` per stroke with two paths of equal `d`; only the second has `data-branch-relation` and a `stroke` attribute.
- **CG-G3 Uncommitted colour.** Expect: the uncommitted line has `stroke="#808080"` and the uncommitted dot `stroke="#808080"` whatever the relation or dimming.
- **CG-G4 HEAD dot.** Setup: a layout whose current vertex is committed. Expect: that circle has a `stroke` attribute with its colour, no `fill` attribute, and uses the full colour even when its relation is `unrelated`.
- **CG-G5 Revealed.** Setup: `revealed = {2}` with row 2 unrelated. Expect: circle 2's `fill` is the palette colour and its `data-branch-relation` is still `unrelated`.
- **CG-G6 Expansion offsets.** Expect the `cy` values of the example with `expansion` row 3.
- **CG-G7 Strokes reused on hover.** Setup: spy on `branchStrokes` (or count path elements' identity). Call: change `hovered`. Expect: no new calls; the `<path>` elements are the same nodes.

### 4.7 Questions

- **CommitGraph Q1: a dot's relation attribute does not describe its colour.** Revealed, hovered and current dots are drawn in full colour but keep their row's relation in `data-branch-relation`. The UI tests compare dots by that attribute, so it may be intended as "the row's relation".
- **CommitGraph Q2: the uncommitted grey is fixed.** `#808080` is used for the uncommitted line and dot in every theme, unlike the other colours, which follow theme variables; its contrast in high-contrast themes is untested.
- **CommitGraph Q3: the HEAD commit is drawn as a filled dot when there are uncommitted changes**, because the layout then makes the uncommitted row current. This follows the layout module and may be intended.

---

## 5. `src/webview/components/commit/RefLabel.tsx`

### 5.1 Interface

Imported as `@/webview/components/commit/RefLabel`. One export, a Preact function component:

```ts
export function RefLabel(props: { gitRef: GitRef; active: boolean }): JSX.Element;
```

- `gitRef`: `{ hash: string; name: string; type: "head" | "tag" | "remote" }` (`GitRef` from `@/backend/types`). `"head"` means a local branch (not HEAD). `name` has no namespace: `main`, `v1.0`, `origin/main`.
- `active`: the label is the checked-out branch (`CommitRow` passes `true` exactly for a `"head"` ref whose name equals `headBranch`).

**Who uses what**: `CommitRow` renders one per ref of a commit (§3.3.2). `tests/webview/components/commit/RefLabel.test.ts` imports it and renders it into a `<div>`. `CommitRow.test.ts` and the UI tests reach it through rows.

### 5.2 Dependencies the implementation must use

| Import path                                    | Name                                                                                     | Used for                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@/webview/components/commit/BranchFocusBadge` | `BranchFocusBadge`                                                                       | the "Focus"/"Paused" badge. Prop `branch: string`; it renders nothing unless `branch` equals the current focus target (`branchFocusTarget`), which names remote branches with a `remotes/` prefix. The badge carries `data-focus-branch` and `data-focus-paused`, which the UI tests count.                                              |
| `@/webview/components/ui/Icons`                | `BranchIcon`, `TagIcon`                                                                  | the label's icon: `TagIcon` for tags, `BranchIcon` for local and remote branches                                                                                                                                                                                                                                                         |
| `@/webview/lib/actions`                        | `openContextMenu(event, source, entries)`                                                | opens the ref's menu at the pointer (and prevents the event and stops it, so the row's own menu does not open)                                                                                                                                                                                                                           |
| `@/webview/lib/menus`                          | `refMenu(gitRef, isHeadBranch)`, `refMenuSource(gitRef)`, `checkoutBranchAction(gitRef)` | the menu entries (pass `active` as `isHeadBranch`); the source key `ref:<type>:<name>`; the double-click checkout (a local branch posts `{ command: "checkoutBranch", branchName, remoteBranch: null, requestId: "action-<n>", repo }`; a remote branch other than `<remote>/HEAD` opens the remote checkout dialog; a tag does nothing) |
| `@/webview/lib/repository-actions`             | `repositoryState`                                                                        | signal holding the repository state or `null`: `branches: { name, hash, upstream, ahead, behind, gone }[]` (`upstream` like `origin/main`, empty when none) and `worktrees: { path, head, branch, … }[]` (`branch` without `refs/heads/`; the main worktree is included)                                                                 |
| `@/webview/lib/stores`                         | `activeSource`                                                                           | whether this ref's menu or form dialog is open                                                                                                                                                                                                                                                                                           |
| `@/backend/types`                              | type `GitRef`                                                                            | the prop                                                                                                                                                                                                                                                                                                                                 |

### 5.3 Behaviour

#### 5.3.1 Data

- **Branch entry**: for a `"head"` ref only, the entry of `repositoryState.value.branches` whose `name` equals `gitRef.name` (none when the state is `null` or has no such branch).
- **Worktree entry**: for a `"head"` ref only, the first entry of `repositoryState.value.worktrees` whose `branch` equals `gitRef.name`.
- **Menu open**: `activeSource.value === refMenuSource(gitRef)`, that is `ref:<type>:<name>`. Every label of the same ref shares this key.

#### 5.3.2 Rendered contract

One outer `<span>`, whose `title` is the following lines, in order, joined with `\n`, leaving out lines that do not apply:

1. `gitRef.name` (always first: the UI tests find a label by the first line of its title);
2. `window.l10n.labelCurrentBranch`, when `active`;
3. the branch entry's `upstream`, when non-empty;
4. `window.l10n.upstreamGone`, when the branch entry has `gone: true`;
5. `window.l10n.worktreeAt` with its first `{0}` replaced by the worktree entry's `path`, when there is a worktree entry.

So a tag's or remote branch's title is just its name.

Children of the outer span, in order:

1. The icon (an `<svg>`): `TagIcon` for `"tag"`, `BranchIcon` otherwise. It must be a descendant of the titled span (the UI tests look for a `span[title]` that contains an `svg`). Look: 18×18 px including 2 px padding, not shrinking, rounded 4 px on its left corners only, background `--color-graph`, glyph filled with `--color-editor`, 5 px right margin.
2. The name: a `<span>` with the text `gitRef.name`, one line with an ellipsis; class `font-bold` (bold) exactly when `active`. It must be the first `<span>` inside the outer span (`RefLabel.test.ts` selects `span > span`).
3. For refs that are not tags: `<BranchFocusBadge branch={…} />` with `branch` = `"remotes/" + name` for a remote ref, else `name`.
4. When the branch entry has a non-empty `upstream`, is not `gone`, and `ahead > 0` or `behind > 0`: a `<span>` with the text `↑<ahead> ↓<behind>` (for example `↑2 ↓0`), 4 px left margin, no wrapping.
5. When there is a worktree entry and the label is not `active`: a `<span>` with the text `↗`, 4 px left margin.

Look of the outer span: an inline flex box, 18 px tall content with a 1 px border all round (content-box sizing, so 20 px overall), 2 px top margin, 5 px right margin, 5 px right padding (the icon sits flush left), at most the full width of its container, clipping overflow, 5 px corner radius (`--radius-md`), 12 px text, aligned to the top of the line, items vertically centred. Border colour `--color-graph` when `active`, otherwise `--color-line`. Background `--color-btn`, or `--color-btn-hover` while its menu is open.

#### 5.3.3 Pointer

- **`contextmenu`**: `openContextMenu(event, refMenuSource(gitRef), refMenu(gitRef, active))`.
- **`click`**: `stopPropagation()` only (the row does not select or toggle details); the default is not prevented.
- **`dblclick`**: `stopPropagation()`, then `checkoutBranchAction(gitRef)`.

There is no keyboard interaction and the label is not focusable (see RefLabel Q1).

#### 5.3.4 Re-render triggers

Signals read while rendering: `activeSource`, `repositoryState` (and, through the badge, the focus target and paused state).

### 5.4 Examples

Test proxy strings; repository state with branches `main` (upstream `origin/main`, ahead 2, behind 0), `feat` (upstream `origin/feat`, 0/0), `gone` (upstream `origin/gone`, 1/3, gone), `wt` (no upstream), and worktrees `/repo` on `main` and `/repo-wt` on `wt`.

| Ref, `active`               | `title` (lines separated by `/`)                       | Extra children after the name | Border |
| --------------------------- | ------------------------------------------------------ | ----------------------------- | ------ |
| head `main`, true           | `main / labelCurrentBranch / origin/main / worktreeAt` | `↑2 ↓0`                       | graph  |
| head `main`, false          | `main / origin/main / worktreeAt`                      | `↑2 ↓0`, `↗`                  | line   |
| head `feat`, false          | `feat / origin/feat`                                   | none                          | line   |
| head `gone`, false          | `gone / origin/gone / upstreamGone`                    | none                          | line   |
| head `wt`, false            | `wt / worktreeAt`                                      | `↗`                           | line   |
| remote `origin/main`, false | `origin/main`                                          | none                          | line   |
| tag `main`, false           | `main` (tag icon)                                      | none                          | line   |
| head `main`, true, no state | `main / labelCurrentBranch`                            | none                          | graph  |

With English strings the first title reads `main`, `the current branch`, `origin/main`, `Checked out at /repo`.

With the view in focus mode on `main` (`branchDisplay = "focus"`, `selectedBranch = "main"`), the active `main` label shows, between the name and `↑2 ↓0`, the badge `<span data-focus-branch="main" data-focus-paused="false" title="branchFocus">focusBadge</span>`; paused, `data-focus-paused="true"`. With `selectedBranch = "remotes/origin/main"`, the remote label `origin/main` shows the badge with `data-focus-branch="remotes/origin/main"`. A tag never shows a badge.

With `contextMenu.source = "ref:head:feat"`, the `feat` label has the hover background.

Events on the `feat` label (selected repository `/repo`): a click does not reach a listener on its parent; a double-click does not reach the parent and posts `{"command":"checkoutBranch","branchName":"feat","remoteBranch":null,"requestId":"action-1","repo":"/repo"}`; a right-click at (5, 6) opens a menu with source `ref:head:feat` at (5, 6), prevents the event, and lists `focusThisBranch | compareWith | — | configureUpstream… | addWorktree… | rebaseOnto… | checkoutBranch | pushBranch… | renameBranch… | deleteBranch… | merge… | — | copyBranchName`.

### 5.5 Non-functional requirements

- **No import-time work**; `window.l10n` and signals are read during render.
- **Fits a 24 px row**: 2 px margin + 20 px box.
- **Truncation**: a long name is cut off with an ellipsis inside the label; the row's refs container limits all labels together to half of the description cell.
- **Timing and disposal**: no timers, no listeners outside the label's own element, nothing to clean up.

### 5.6 Test coverage

Already checked:

- `RefLabel.test.ts`: `span > span` has `font-bold` for an active branch and not for an inactive one.
- `CommitRow.test.ts`: an inactive branch label's title is exactly its name (no repository state).
- `tests-ext/ui/history.test.cjs`: right-clicking the `span[title]` whose first title line is a ref's name and which contains an `svg` opens that ref's menu (Focus this branch, Push Tag…, Delete Remote Tag…); `tbody [title="refresh-marker"]` finds a new tag's label; `tbody span[title^="origin/"]` disappears when the remote is hidden; `[data-focus-branch="main"][data-focus-paused="false"]` counts include the label's badge (two in total with the other badge), and switch to `true` when paused.

Not checked; proposed cases:

- **RL-G1 Title lines.** Setup: the repository state of §5.4. Expect: each row of the example table's title.
- **RL-G2 Ahead/behind.** Expect: `↑2 ↓0` for `main`; nothing for `feat` (0/0), for `gone` (gone), and for a branch without upstream.
- **RL-G3 Worktree arrow.** Expect: `↗` for `wt` and for inactive `main`; none for active `main`.
- **RL-G4 Icons.** Expect: a tag uses the tag glyph (`viewBox="0 0 15 16"` with the current icon set) and branches the branch glyph.
- **RL-G5 Badge naming.** Setup: `branchDisplay = "focus"`, `selectedBranch = "remotes/origin/main"`. Expect: the `origin/main` remote label's badge has `data-focus-branch="remotes/origin/main"`. Setup: `selectedBranch = "v1"`. Expect: the tag label `v1` has no `[data-focus-branch]`.
- **RL-G6 Click containment.** Setup: a click listener on the parent. Call: click the label. Expect: the listener is not called.
- **RL-G7 Double-click.** Setup: selected repository `/repo`, spy on `postMessage`. Call: double-click a local branch label. Expect: one `checkoutBranch` message with `branchName` = the name and `remoteBranch: null`; for a tag, no message.
- **RL-G8 Menu.** Call: `contextmenu` at (5, 6). Expect: `contextMenu.value` has `source` `ref:head:feat`, `x` 5, `y` 6, the entries of `refMenu(gitRef, active)`; the event is prevented; a `contextmenu` listener on the row is not called.
- **RL-G9 Menu-open look.** Setup: `contextMenu.source = "ref:head:feat"`. Expect: the label's background is the hover background (and another label is not).

### 5.7 Questions

- **RefLabel Q1: labels are pointer-only.** A label cannot be focused, so its menu (focus, checkout, push, delete, …) and double-click checkout are unavailable from the keyboard in the graph; the Branches pane offers the same actions by keyboard.
- **RefLabel Q2: double-clicking the checked-out branch** runs a checkout of that same branch (a Git action and an activity entry).
- **RefLabel Q3: the current branch's title names its own worktree.** The main worktree is part of the worktree list, so the checked-out branch's tooltip says "Checked out at <this repository>", and a branch checked out in the main worktree shows `↗` when the view is opened from a linked worktree. Whether the line and the arrow should only mark other worktrees is unclear.
- **RefLabel Q4: `$` in a worktree path.** The path is put into the `worktreeAt` template with a string replacement that interprets `$&`, `` $` ``, `$'` and `$$` in the replacement, so a path such as `/home/u/wt$&x` reads `Checked out at /home/u/wt{0}x`. A literal substitution is probably intended. (`resizeColumn` and `commitActions` use the same kind of replacement, but their values cannot contain `$`.)
- **RefLabel Q5: ahead/behind counts have no text alternative.** `↑2 ↓0` is announced as arrow symbols and is not repeated in the title.
- **RefLabel Q6: the upstream is listed even when gone**, followed by "Upstream no longer exists". This may be intended as the name of the missing upstream.

---

## 6. Decisions

These decisions are the maintainer's answers to the questions above. Where they differ from "current behaviour" elsewhere in this specification, they win.

### CommitDetails

- **Q1.** With auto-centring off, the minimal scroll keeps the commit row above the details below both sticky headings: the free space kept above it is the main header's height (`--main-header-height` on the document element, 0 when unset) plus the table's heading row height, not a fixed 32 px.
- **Q2.** Escape pressed on the commit row whose details are open (the event's target is that row) closes the details, exactly as Escape inside the details does, and is prevented. Escape on any other row does nothing.
- **Q3.** The `mailto:` link keeps the `@` literal: percent-encode the part before the last `@` and the part after it separately (each with `encodeURIComponent`) and join them with `@`. An address without `@` is encoded whole.
- **Q4.** An empty e-mail address shows only the name, with no angle brackets and no link.
- **Q5.** Fill placeholders literally (no `$` expansion). Otherwise keep the current template handling.
- **Q6, Q7.** Keep the current behaviour.

### CommitTable

- **Q1.** Rows use the same `dimming` as the graph for their `--branch-display-colour`, so a row's labels and its dot agree. Row text colour must still not change with dimming (it comes from the stylesheet's relation rules).
- **Q2, Q3, Q4, Q6, Q8.** Keep the current behaviour.
- **Q5.** The row whose context menu is open (`activeSource` is `commit:<hash>`) is revealed like the head, focused, expanded and selected rows, so its dot is drawn in full colour too.
- **Q7.** Keep the line-relation input to the graph stable while `commits` and the relations are unchanged, so the graph rebuilds its line paths only when they can differ.

### CommitRow

- **Q1, Q2, Q3, Q4, Q5, Q7, Q8.** Keep the current behaviour.
- **Q6.** A row re-renders for a menu or dialog change only when its own "menu is open" state changes (for example by subscribing each row to a computed value for its own source), not whenever any menu opens or closes. The rendered result is unchanged.

### CommitGraph

- **Q1–Q3.** Keep the current behaviour.

### RefLabel

- **Q1, Q3, Q5, Q6.** Keep the current behaviour.
- **Q2.** Double-clicking the label of the branch that is already checked out (`active`) does nothing (no message is posted); the click is still kept from reaching the row.
- **Q4.** Fill `worktreeAt` so the path appears literally (no `$` expansion).

### Tests

- The icons are being redrawn in a common 16 × 16 view box in the same batch, so tests must not assert any icon's `viewBox` or path data. Tell the tag and branch glyphs apart some other way (for example by rendering `TagIcon` and `BranchIcon` and comparing their markup with the label's `svg`).
