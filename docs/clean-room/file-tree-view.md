# Clean-room specification: `src/webview/components/commit/FileTree.tsx`

This document describes, from the outside, the part of the commit details panel that shows a commit's changed paths grouped by directory, with the actions available on each path. It is written for an engineer who will build a replacement without seeing the current source. It is based on the module's only importer (`CommitDetails.tsx`), the modules it relies on, the repository's tests, the stylesheet and built CSS, and on running the current module in the repository's jsdom test environment.

The tree-building helper `src/webview/utils/fileTree.ts` is a separate module with its own specification (`docs/clean-room/file-tree.md`). This document covers only the view that renders the helper's output.

---

## 0. Environment used for observations

- Node v22.22.2, Vitest 4.1.11 with the jsdom environment, Preact as installed in the repository, Linux, 4 vCPU.
- The module was rendered directly with nodes produced by the tree-building helper, and also through `CommitDetails` as the existing test does.
- Unless an example says otherwise, `window.l10n` is the test proxy from `tests/webview/test-utils.ts`, which returns each key's own name (so a tooltip reads `tooltipBinaryFile`). Where an example shows English text, `window.l10n` held the English strings listed in §2.4.
- Unless an example says otherwise, the selected repository (`selectedRepo`) is `"/repo"`.

Notation in examples:

- `▾ name` is an expanded folder entry, `▸ name` a collapsed folder entry, `· name` a file entry.
- Two spaces of indent mean one level of nesting.
- `{…}` after a file shows its visible trailing text, such as the rename marker or line counts.

---

## 1. Interface

**Module path:** `src/webview/components/commit/FileTree.tsx`, imported as `@/webview/components/commit/FileTree`. The path, the export name and the prop names must stay the same.

### 1.1 The single export

`FileTree` is a named export (there is no default export). It is a Preact function component whose props are:

| Prop         | Type                  | Meaning                                                                                                                                                                                                                    |
| ------------ | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nodes`      | `Array<FileTreeNode>` | The top level of the tree to show, exactly as the tree-building helper returns it. Folders carry their children; files carry the underlying change. The view renders the nodes in the order given and never re-sorts them. |
| `commitHash` | `string`              | The full hash of the commit the changes belong to. It is only passed on to the diff request and to the file menu; it plays no part in what is displayed or in which folders are collapsed.                                 |

It renders one list element (the tree) and returns nothing else. It takes no children, no callbacks, and exposes no ref or imperative handle.

### 1.2 Node shapes it consumes (defined elsewhere)

From `@/webview/utils/fileTree`:

- A **folder node** has `type: "folder"`, a display `name` (one path segment), a `path` (its segments joined with `/`, the same string every time the same folder is built) and `children` (an array of nodes).
- A **file node** has `type: "file"`, a display `name` (the last segment of the new path; may be the empty string for a degenerate path) and `file`, a `GitFileChange`.

From `@/backend/types`, a `GitFileChange` has:

- `oldFilePath` and `newFilePath` (strings, repository-relative, `/`-separated; equal unless the change is a rename),
- `type`, one of `"A"` (added), `"M"` (modified; the backend also maps type changes to this), `"D"` (deleted), `"R"` (renamed),
- `additions` and `deletions`, each a non-negative integer or `null`. The backend sets both to `null` when `git diff-tree --numstat` prints `-` for the entry, which happens for binary content and for paths the working tree's attributes mark `-diff`.

### 1.3 Who uses it

| Caller or test                                     | What it uses                                                                                                                                                                                                                                          |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/webview/components/commit/CommitDetails.tsx`  | Renders `FileTree` with `nodes` (built from `details.fileChanges`, rebuilt only when a new details object arrives) and `commitHash` = `details.hash`, inside a vertically scrolling area to the right of the commit summary. It is the only importer. |
| `tests/webview/components/commit/FileTree.test.ts` | Does not import `FileTree`; it renders `CommitDetails` and queries the tree's DOM (see §3.8).                                                                                                                                                         |
| `tests/webview/utils/fileTree.test.ts`             | Tests the tree-building helper only; it does not render this view.                                                                                                                                                                                    |
| `tests-ext/ui/history.test.cjs`                    | Expands commit details and checks that the details cell contains the commit hash (which comes from the summary, not the tree). It never clicks or reads the file tree.                                                                                |

No other module imports it. In the app, `CommitDetails` shows a loading indicator (and no tree) until the details arrive, and the details row is rendered under the expanded commit's own row, so opening a different commit, or closing and reopening one, always creates a fresh tree.

---

## 2. Dependencies the implementation must use

### 2.1 Repository imports

| Import path                              | Name                   | Purpose                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@/webview/utils/fileTree`               | `FileTreeNode` (type)  | The prop type. `FileTreeFile` and `FileTreeFolder` are also exported there if narrower types help.                                                                                                                                                                                                                                                                                             |
| `@/backend/types`                        | `GitFileChange` (type) | The change carried by a file node; its `type` union keys the colour choice.                                                                                                                                                                                                                                                                                                                    |
| `@/webview/lib/actions`                  | `viewDiff`             | `viewDiff(commitHash, change)` asks the extension to open the diff of one file of one commit. It posts `{ command: "viewDiff", repo, commitHash, oldFilePath, newFilePath, type }` taken from the selected repository and the change, and sends nothing when no repository is selected.                                                                                                        |
| `@/webview/lib/actions`                  | `openContextMenu`      | `openContextMenu(event, source, entries)` opens the app's context menu. It prevents the event's default action and stops its propagation, remembers the element to refocus when the menu closes, and places the menu at the event's `clientX`/`clientY` (or below the event's current target when the event carries no position). `source` is a string naming the element the menu belongs to. |
| `@/webview/components/history/file-menu` | `fileContextMenu`      | `fileContextMenu(hash, path, previousPath, deleted)` returns the three menu entries for a file of a commit (§3.4). The fifth parameter (destination) is not passed by this view.                                                                                                                                                                                                               |
| `@/webview/components/ui/Icons`          | `Icon`                 | The shared SVG wrapper: it marks the graphic `aria-hidden="true"` and `focusable="false"`, fills with `currentColor` and defaults to 16×16 unless sized by CSS. Use it for the three glyphs in §3.7. No folder or file glyph exists in `Icons.tsx` yet; the replacement must draw its own.                                                                                                     |
| `preact/hooks`                           | a state hook           | To hold which folders are collapsed for the lifetime of the mounted tree.                                                                                                                                                                                                                                                                                                                      |

Optional: `@/webview/utils/format` exports `format(template, ...parts)`, which splits a template on `{0}`, `{1}` … and returns the parts as an array of children without interpreting any text in the parts. Joining its result gives a safe string for a `title` attribute (see Q1).

### 2.2 Globals read

- `window.l10n` for every piece of text a person reads (§2.4). The repository's lint rule (`oxlint/webview-text.cjs`) rejects JSX text, string children and `title`/`aria-label` values that contain letters and do not come from `window.l10n`. Punctuation and digits such as `(`, `|`, `)`, `+`, `-` are allowed as literals. The rename marker must therefore come from the change's `type` value, not be written as a literal letter.

### 2.3 Styling environment

- Tailwind v4 with the repository's theme in `src/webview/styles.css`. Tailwind only generates utilities it finds written out in full in files under `src/webview`, so class names must not be assembled from fragments at run time.
- Spacing unit: 4 px (`--spacing: 0.25rem` on a 16 px root).
- Theme colours used by this view: `fg` (VS Code `--vscode-foreground`), `git-added` (`--vscode-gitDecoration-addedResourceForeground`), `git-modified` (`--vscode-gitDecoration-modifiedResourceForeground`), `git-deleted` (`--vscode-gitDecoration-deletedResourceForeground`).
- The stylesheet contains no rule aimed at the file tree; all its styling comes from utilities on its own elements plus what it inherits from the details cell (13 px interface font, 18 px line height, a faint grey panel background).

### 2.4 Localized strings

| Key                 | English text                                  | Placeholders                                    |
| ------------------- | --------------------------------------------- | ----------------------------------------------- |
| `tooltipAddition`   | `{0} addition`                                | `{0}` = the count (used when the count is 1)    |
| `tooltipAdditions`  | `{0} additions`                               | `{0}` = the count (used for every other count)  |
| `tooltipDeletion`   | `{0} deletion`                                | as above                                        |
| `tooltipDeletions`  | `{0} deletions`                               | as above                                        |
| `tooltipBinaryFile` | `This is a binary file, unable to view diff.` | none                                            |
| `tooltipRenamedTo`  | `{0} was renamed to {1}`                      | `{0}` = old path, `{1}` = new path (full paths) |

The file menu's own titles (`fileHistory`, `openHistoricalFile`, `restoreHistoricalFile`) are supplied by `fileContextMenu`, not by this view.

---

## 3. Behaviour

### 3.1 What is rendered

The view renders the given nodes as a bulleted-list structure with the bullets hidden: one list for the top level, and for every expanded folder a nested list of that folder's children placed directly beneath the folder's entry. Entries appear in depth-first document order: a folder entry, then (if expanded) all of its descendants, then its next sibling. Within one level the order is exactly the order of the `nodes`/`children` arrays.

Every entry, folder or file, is a native `<button type="button">` that fills the width of its list item and shows its content on a single line.

**A folder entry** shows a folder glyph (open or closed shape, §3.7) followed by the folder's `name`. Nothing else: no count, no chevron character, no tooltip. Its text colour is inherited (the panel's foreground colour).

**A file entry** shows, in order:

1. a document glyph;
2. the file's `name`;
3. only for a rename (`type` `"R"`): the change type letter `R`, with a tooltip built from `tooltipRenamedTo` with `{0}` replaced by `oldFilePath` and `{1}` by `newFilePath`;
4. only when the type is `"M"` or `"R"` **and** both counts are numbers: the line counts, shown as an opening parenthesis, `+` and the number of added lines, a vertical bar, `-` and the number of removed lines, and a closing parenthesis, with no spaces in the text (for example `(+3|-1)`). The added count has a tooltip from `tooltipAddition` when the count is exactly 1 and `tooltipAdditions` otherwise (including 0), with `{0}` replaced by the plain decimal number; the removed count likewise uses `tooltipDeletion`/`tooltipDeletions`.

Added (`"A"`) and deleted (`"D"`) files never show counts, even when Git supplied them.

**Binary files.** A file counts as binary when either count is `null` (in practice Git nulls both together). A binary file entry:

- shows no counts (a binary rename still shows its `R` marker and its tooltip);
- carries the tooltip `tooltipBinaryFile` on the whole entry;
- shows the default arrow cursor instead of the pointer;
- does nothing when activated (no message is sent), but stays a focusable, enabled button and still offers its context menu.

**Colour by change type.** The whole file entry's text is coloured by its type: added → `git-added`; modified and renamed → `git-modified`; deleted → `git-deleted`. The `R` marker and the parentheses and bar around the counts are drawn in the foreground colour; the added count in `git-added` and the removed count in `git-deleted`. Glyphs are not tinted by type (§3.7).

**Names and paths are plain text.** They are displayed and placed in tooltips as literal text and never interpreted as markup. As a consequence of single-line layout, runs of whitespace in a name (including tabs or newlines, which Git permits) are displayed collapsed to one space (see Q14).

**An empty `nodes` array** renders an empty top-level list: no entries and no placeholder message.

### 3.2 Expanded and collapsed folders

- **Initial state:** every folder at every depth starts expanded when the tree is mounted.
- **Toggling:** activating a folder entry (click anywhere on its row, or Enter/Space while it is focused) flips that folder between expanded and collapsed. Nothing is sent to the extension.
- **Collapsed means absent:** a collapsed folder's descendants are removed from the document, not merely hidden, so they are neither visible, nor focusable, nor found by DOM queries.
- **State is per folder path.** The collapsed state is remembered by the folder's `path` string, not by node identity. Consequences, all observed:
  - A new `nodes` array for the same commit (for example, the same details delivered again) keeps every folder in the state the user left it.
  - Collapsing a parent and expanding it again restores each descendant folder's own state (a subfolder that was collapsed before is still collapsed).
  - The remembered state lasts as long as the tree stays mounted. If the same mounted tree is given a different tree (even with a different `commitHash`), any folder whose `path` was collapsed earlier appears collapsed; paths that are absent simply have no effect until they appear again (see Q6).
- **Nothing is persisted** beyond the mounted tree: no webview state, no local storage, no message to the extension. Closing the details, opening another commit, switching repository or reloading the view all start again with every folder expanded (see Q7).
- **Focus** stays on the folder entry that was toggled.

### 3.3 Pointer actions

| Target                             | Action                      | Effect                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Folder entry (anywhere on the row) | Primary click               | Toggle the folder (§3.2).                                                                                                                                                                                                                                                                                                                                                         |
| Folder entry                       | Double-click                | Each of the two clicks toggles, so the folder ends where it started. The double-click event itself has no effect.                                                                                                                                                                                                                                                                 |
| Folder entry                       | Right-click                 | Not handled. The event is neither prevented nor stopped, so whatever the host does by default happens. No app menu opens.                                                                                                                                                                                                                                                         |
| File entry, not binary             | Primary click               | Call `viewDiff(commitHash, change)`: posts `{ command: "viewDiff", repo: <selected repo>, commitHash, oldFilePath, newFilePath, type }`. Nothing is posted if no repository is selected. The view does not change.                                                                                                                                                                |
| File entry, binary                 | Primary click               | Nothing.                                                                                                                                                                                                                                                                                                                                                                          |
| File entry, not binary             | Double-click                | Each click posts its own `viewDiff`, so two identical messages are sent (see Q2).                                                                                                                                                                                                                                                                                                 |
| File entry (binary or not)         | Right-click                 | Open the app context menu at the pointer through `openContextMenu`, handing it the pointer event itself, the source key described in §3.4, and the entries `fileContextMenu` returns when given, in order, the commit hash, the new path, the old path and whether the change is a deletion. The event's default is prevented and its propagation stopped (by `openContextMenu`). |
| Rename marker, each count          | Hover                       | Show that element's tooltip (native `title`), with the help cursor. Clicking them is a click on the file entry.                                                                                                                                                                                                                                                                   |
| Any entry                          | Hover                       | No highlight, no extra buttons. Folders and non-binary files show the pointer cursor; binary files the default cursor.                                                                                                                                                                                                                                                            |
| Any entry                          | Middle click, other buttons | Nothing.                                                                                                                                                                                                                                                                                                                                                                          |

There are no hover buttons, inline actions or drag behaviour.

### 3.4 The file menu (supplied by `fileContextMenu`)

The menu has three entries, in this order; their behaviour belongs to the file-menu module but is listed here so the effect of using the tree is clear. Let H be `commitHash`. For a deleted file, the revision used is `H^` and the path is `oldFilePath`; otherwise the revision is H and the path is `newFilePath`.

1. **File History** (`fileHistory`): closes any dialog and filters the history to that path at that revision, following renames. Observed filter: `{ text: "", author: "", since: "", until: "", path, revision, follow: true }`.
2. **Open File at This Revision** (`openHistoricalFile`): sends a repository action `{ command: "repositoryAction", requestId: "repository-action-<n>", action: { kind: "viewHistoricalFile", hash: <revision>, path }, repo }`.
3. **Restore File Contents** (`restoreHistoricalFile`): opens a form dialog titled with that string whose single text field (`restoreDestination`, "Restore to path") is prefilled with `newFilePath`.

The `source` key passed with the menu is the literal prefix `file:` followed by `newFilePath`. No other module reads keys with that prefix today, and the view does not highlight the entry whose menu is open (see Q10).

### 3.5 Keyboard behaviour

There is no roving focus, no arrow-key navigation, no Home/End, no typeahead and no expand-all/collapse-all key. Keyboard support is what native buttons give, plus a menu shortcut on files.

| Key (focus on…)                           | Effect                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tab / Shift+Tab (any)                     | Moves to the next/previous entry in document order. Every rendered folder and file entry is a tab stop; entries inside collapsed folders are not in the document and are skipped.                                                                                                                            |
| Enter or Space (folder)                   | Toggles the folder (native button activation; Space acts on release).                                                                                                                                                                                                                                        |
| Enter or Space (file)                     | Same as a primary click: opens the diff, or does nothing for a binary file.                                                                                                                                                                                                                                  |
| Context Menu key, or Shift+F10 (file)     | Prevents the key's default action and opens the same file menu as a right-click, placed with its top-left corner at the entry button's bottom-left corner (left edge, bottom edge of the button's box in viewport coordinates). Propagation is not stopped. Focus returns to the entry when the menu closes. |
| F10 without Shift (file)                  | Nothing (default not prevented).                                                                                                                                                                                                                                                                             |
| Context Menu key, or Shift+F10 (folder)   | Not handled by the view; default not prevented.                                                                                                                                                                                                                                                              |
| Escape (any)                              | Not handled and not stopped by the view. It must bubble: the enclosing details row closes the details and returns focus to the commit's row.                                                                                                                                                                 |
| `/`, Ctrl+F / Cmd+F (any)                 | Not handled by the view; they must reach the window-level handler that focuses history search.                                                                                                                                                                                                               |
| Arrow keys, Page Up/Down, Home, End (any) | Not handled; the browser's default (scrolling the nearest scrollable area) applies.                                                                                                                                                                                                                          |

The view never moves focus by itself: not on mount, not when new nodes arrive, not after a toggle, not after a diff request.

### 3.6 Accessibility

- **Roles:** the structure is nested lists and list items; each entry is a native button. There is no `tree`, `treeitem` or `group` role, and no `aria-level`, `aria-setsize`, `aria-posinset`, `aria-controls`, `aria-selected` or `aria-label` (see Q8).
- **Folders:** `aria-expanded="true"` when expanded, `"false"` when collapsed. The accessible name is the folder name.
- **Files:** no `aria-expanded`. The accessible name comes from the visible text, so it is the name followed by the `R` marker and the counts when present (for example `a.ts(+3|-1)`). For a binary file, the tooltip becomes the accessible description. The change type of added, modified and deleted files is conveyed by colour only (see Q4).
- **Glyphs:** hidden from assistive technology and not focusable.
- **Ids:** none. Nothing in the view has an `id`.
- **Disabled state:** never set, not even on binary files (see Q3).

### 3.7 Appearance requirements

All sizes are CSS pixels at the default 16 px root size.

| Aspect                | Requirement                                                                                                                                                                                                                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Font                  | Inherited from the details cell: the VS Code interface font at 13 px with an 18 px line height. The view sets no font of its own.                                                                                                                                                                                     |
| Lists                 | No bullets or numbering. The top-level list has 10 px of left padding; every nested list has 30 px of left padding. An entry at depth d (0 for top level) therefore begins 10 + 30 × d px from the tree's left edge.                                                                                                  |
| Vertical rhythm       | Each list item has 4 px of space above it. An entry's row is one line (18 px), so entries repeat every 22 px. The caller adds 4 px of padding above and below the whole tree.                                                                                                                                         |
| Entry row             | Full width of its list; content laid out in a row, vertically centred, left-aligned; never wraps; anything that does not fit is clipped (the list item also clips). No background, border or radius beyond the browser/Tailwind button reset (transparent background, inherited font and colour).                     |
| Glyph                 | 13 × 13 px, 8 px of space between it and the name, never shrinks. Filled with the foreground colour (`fg`) at 60 % opacity, whatever the entry's text colour.                                                                                                                                                         |
| Glyph shapes          | Folder, collapsed: a closed folder (back panel with a tab at the top left, closed front). Folder, expanded: an opened folder (front panel tilted forward, revealing the back). File: a page with its top-right corner folded. Each is drawn in a square viewBox and scales to 13 px. The shapes must be drawn afresh. |
| Name                  | Takes the remaining width; when the row is too narrow, the name is shortened with an ellipsis first, while the `R` marker and the counts stay whole for as long as they fit.                                                                                                                                          |
| Rename marker         | 8 px of space before it; foreground colour; help cursor.                                                                                                                                                                                                                                                              |
| Counts                | 8 px of space before the opening parenthesis; parentheses and bar in the foreground colour; each number has 3 px of horizontal padding on both sides and a help cursor; added number in `git-added`, removed number in `git-deleted`.                                                                                 |
| Text colour of a file | `git-added` for A, `git-modified` for M and R, `git-deleted` for D. Folders: inherited.                                                                                                                                                                                                                               |
| Cursor                | Pointer on folders and non-binary files; default arrow on binary files; help on the marker and on each count.                                                                                                                                                                                                         |
| Hover                 | No visual change.                                                                                                                                                                                                                                                                                                     |
| Focus                 | No focus style of its own; the browser/host default focus outline applies (see Q13).                                                                                                                                                                                                                                  |
| Width                 | The tree never widens its container: long names are truncated, deep indentation is clipped at the right edge. The caller's area scrolls vertically only.                                                                                                                                                              |

### 3.8 DOM contract relied on by tests

The existing test (`tests/webview/components/commit/FileTree.test.ts`) and any replacement must agree on these points:

1. Every entry, folder or file, is a `button` element whose parent is an `li` element (`li > button` finds exactly the rendered entries).
2. Inside each entry button, the first `span` element in document order contains exactly the entry's name and nothing else. Glyphs must therefore not be wrapped in, or preceded by, a `span`.
3. Folder entry buttons, and only folder entry buttons, carry `aria-expanded`, with the string values `"true"`/`"false"`.
4. A folder entry button's `textContent` is exactly the folder name (no extra text, and no text inside the glyph such as an SVG `<title>`).
5. `li > button` elements appear in depth-first order matching the given nodes, and a collapsed folder's descendants are not in the document.
6. Calling `click()` on a folder entry button toggles that folder.
7. Collapsed state survives a re-render with a newly built `nodes` array for the same commit.

Nothing else (element types of the lists, ids, data attributes) is relied on by the tests, the UI harness or the stylesheet. The context-menu key (`file:` + new path) is part of the contract with the menu module (§3.4).

---

## 4. Concrete examples

### 4.1 The existing test's commit

Changes: `src/a.ts` and `src/b/c.ts`, both `M`, additions 1, deletions 0. `commitHash` = forty `c` characters.

Rendered (English strings):

```
▾ src                  (depth 0, starts 10 px in)
  ▾ b                  (depth 1, 40 px)
    · c.ts {(+1|-0)}   (depth 2, 70 px; modified colour; "+1" tooltip "1 addition", "-0" tooltip "0 deletions")
  · a.ts {(+1|-0)}     (depth 1, 40 px)
```

Labels as the test reads them (`li > button`, first `span`): `src`, `b`, `c.ts`, `a.ts`.

| Interaction                                        | Result                                                                                                                             |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Click `b`                                          | `b` shows `aria-expanded="false"` and the closed glyph; `c.ts` leaves the document. Labels: `src`, `b`, `a.ts`.                    |
| Same commit's details delivered again (new object) | Unchanged: `b` still collapsed, `src` still expanded. Labels: `src`, `b`, `a.ts`.                                                  |
| Then click `src`                                   | Only `src` remains (`aria-expanded="false"`).                                                                                      |
| Then click `src` again                             | Labels: `src` (expanded), `b` (still collapsed), `a.ts`.                                                                           |
| Click `a.ts`                                       | Posts `{ command: "viewDiff", repo: "/repo", commitHash: "cccc…c", oldFilePath: "src/a.ts", newFilePath: "src/a.ts", type: "M" }`. |
| Close the details and open them again              | A fresh tree: every folder expanded.                                                                                               |

### 4.2 Every change kind in one commit

`commitHash` = `"abc"`. Changes:

| newFilePath  | oldFilePath | type | additions | deletions |
| ------------ | ----------- | ---- | --------- | --------- |
| `src/a.ts`   | same        | M    | 3         | 1         |
| `src/b/c.ts` | same        | M    | 1         | 1         |
| `README.md`  | same        | A    | 10        | 0         |
| `gone.txt`   | same        | D    | 0         | 5         |
| `lib/new.ts` | `old.ts`    | R    | 0         | 0         |
| `img.png`    | same        | M    | null      | null      |
| `bin.dat`    | same        | A    | null      | null      |

Rendered (the helper puts folders before files, each group in name order):

```
▾ lib
  · new.ts {R (+0|-0)}   modified colour; R tooltip "old.ts was renamed to lib/new.ts"; counts "0 additions", "0 deletions"
▾ src
  ▾ b
    · c.ts {(+1|-1)}     modified; "1 addition", "1 deletion"
  · a.ts {(+3|-1)}       modified; "3 additions", "1 deletion"
· bin.dat                added colour; binary tooltip on the entry; default cursor
· gone.txt               deleted colour; no counts
· img.png                modified colour; binary tooltip on the entry; default cursor
· README.md              added colour; no counts
```

Entry `textContent` values, in order: `lib`, `new.tsR(+0|-0)`, `src`, `b`, `c.ts(+1|-1)`, `a.ts(+3|-1)`, `bin.dat`, `gone.txt`, `img.png`, `README.md`.

Primary click on each file (repo `/repo`):

| Entry       | Message posted                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| `new.ts`    | `{ command: "viewDiff", repo: "/repo", commitHash: "abc", oldFilePath: "old.ts", newFilePath: "lib/new.ts", type: "R" }` |
| `c.ts`      | `{ …, oldFilePath: "src/b/c.ts", newFilePath: "src/b/c.ts", type: "M" }`                                                 |
| `a.ts`      | `{ …, oldFilePath: "src/a.ts", newFilePath: "src/a.ts", type: "M" }`                                                     |
| `bin.dat`   | nothing                                                                                                                  |
| `gone.txt`  | `{ …, oldFilePath: "gone.txt", newFilePath: "gone.txt", type: "D" }`                                                     |
| `img.png`   | nothing                                                                                                                  |
| `README.md` | `{ …, oldFilePath: "README.md", newFilePath: "README.md", type: "A" }`                                                   |

Right-click at (50, 60) on any file entry opens the menu at x = 50, y = 60 with source `file:<newFilePath>` (for example `file:lib/new.ts`, `file:bin.dat`) and the three entries of §3.4; the event's default is prevented and it does not reach the tree's container. Right-click on `lib` or `src` does nothing and is not prevented.

With focus on a file entry, the Context Menu key and Shift+F10 each prevent the key's default and open the same menu with the same source, anchored at the entry's bottom-left corner (in jsdom, where every box is empty, that is x = 0, y = 0). Plain F10 does nothing. On a folder entry, none of Enter, Space, ArrowRight, ArrowLeft or the Context Menu key has any effect when sent as a bare `keydown` event (Enter and Space act through the browser's native button activation, which a synthetic `keydown` does not trigger).

### 4.3 Counts, plurals and binary edge cases (English strings)

| Change                                     | Visible text | Tooltips                                                                  |
| ------------------------------------------ | ------------ | ------------------------------------------------------------------------- |
| `one`, M, 1 / 1                            | `one(+1      | -1)`                                                                      | `1 addition`, `1 deletion`                                                |
| `zero`, M, 0 / 0                           | `zero(+0     | -0)`                                                                      | `0 additions`, `0 deletions`                                              |
| `many`, M, 1234 / 2                        | `many(+1234  | -2)`                                                                      | `1234 additions`, `2 deletions` (no digit grouping)                       |
| `half`, M, 5 / null                        | `half`       | entry: `This is a binary file, unable to view diff.`; click sends nothing |
| `new/path.ts` from `old/path.ts`, R, 2 / 3 | `path.tsR(+2 | -3)`                                                                      | R: `old/path.ts was renamed to new/path.ts`; `2 additions`, `3 deletions` |
| `rb.png` from `ra.png`, R, null / null     | `rb.pngR`    | entry: binary tooltip; R: `ra.png was renamed to rb.png`                  |

### 4.4 The file menu's effects

`commitHash` = `"H"`, repo `/repo`.

| File                               | Entry                      | Effect                                                                                                                                                           |
| ---------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/new.ts` renamed from `old.ts` | File History               | History filter becomes `{ text: "", author: "", since: "", until: "", path: "lib/new.ts", revision: "H", follow: true }`.                                        |
| same                               | Open File at This Revision | Posts `{ command: "repositoryAction", requestId: "repository-action-1", action: { kind: "viewHistoricalFile", hash: "H", path: "lib/new.ts" }, repo: "/repo" }`. |
| same                               | Restore File Contents      | Form dialog; the destination field holds `lib/new.ts`.                                                                                                           |
| `gone.txt`, deleted                | File History               | Filter with `path: "gone.txt"`, `revision: "H^"`, `follow: true`.                                                                                                |
| same                               | Open File at This Revision | Posts the same shape with `hash: "H^"`, `path: "gone.txt"`.                                                                                                      |
| same                               | Restore File Contents      | Form dialog; the destination field holds `gone.txt`.                                                                                                             |

### 4.5 A file replaced by a folder of the same name

Changes: `a` (D) and `a/b` (A).

```
▾ a
  · b      added colour
· a        deleted colour
```

Clicking the folder `a` leaves `▸ a` and `· a`; clicking it again restores all three entries. The file entry `a` is never affected by the folder's state.

### 4.6 Two changes with the same new path

Changes: `d/x` renamed from `p` (R, 1/0), `d/x` (A, 1/0), `d/y` (M, 1/0). Rendered: `▾ d`, `· x {R (+1|-0)}`, `· x` (added colour, no counts), `· y {(+1|-0)}`. Toggling `d` twice returns to exactly this. Both `x` entries use the menu source `file:d/x`.

### 4.7 Degenerate names and an empty list

- Changes with new paths `""` and `"/a//b/"`: rendered `▾ a`, `· b {(+1|-0)}`, then a file entry whose name is empty, so its visible text is only `(+1|-0)` and its first `span` is empty.
- `nodes` = `[]`: an empty top-level list; no entries, no message.

### 4.8 The same mounted tree given another commit's nodes

Mount with `src/a` and `lib/b`, collapse `src`: `▾ lib`, `· b`, `▸ src`. Re-render the same mounted tree with nodes for `src/z` and `other/q` and `commitHash` `h2`: `▾ other`, `· q`, `▸ src`. Re-render with `x/q`, then again with `src/a`: `▸ src`. Unmount and mount with `src/a`: `▾ src`, `· a`. (The app never re-renders a mounted tree with another commit; see §1.3 and Q6.)

---

## 5. Non-functional requirements

### 5.1 Size of commits

Every entry of every expanded folder is rendered; there is no virtualisation or paging. The details panel is 250 px tall, so about ten entries are visible at once and the rest are reached by scrolling the caller's area.

Measured in jsdom (much slower than a real browser; use the numbers as a baseline, not a target), with files spread over 50 top-level folders and 400 second-level folders, one level of files beneath:

| Files  | Entries rendered | First render                | Toggle a folder holding n / 400 files (collapse, expand) | Same details delivered again |
| ------ | ---------------- | --------------------------- | -------------------------------------------------------- | ---------------------------- |
| 200    | 450              | ≈ 180 ms (includes warm-up) | ≈ 20 ms, ≈ 17 ms                                         | ≈ 17 ms                      |
| 1,000  | 1,450            | ≈ 365 ms                    | ≈ 45 ms, ≈ 38 ms                                         | ≈ 45 ms                      |
| 5,000  | 5,450            | ≈ 1.2 s                     | ≈ 175 ms, ≈ 180 ms                                       | ≈ 160 ms                     |
| 10,000 | 10,450           | ≈ 2.7 s                     | ≈ 780 ms, ≈ 790 ms                                       | ≈ 765 ms                     |

Requirements:

- Rendering time must grow no worse than linearly with the number of rendered entries, and must not be slower than the baseline above in the same environment.
- Toggling a folder currently costs about as much as re-rendering the whole tree, however few entries the folder holds. A replacement must be no slower; being proportional to the toggled folder's size is welcome but not required.
- Delivering the same commit's details again (a new `nodes` array with equal content) must not be slower than a toggle, must keep the collapsed state, and must not rebuild the DOM of unchanged entries in a way that loses focus from a focused entry.

### 5.2 Depth

A deep enough path makes the current view overflow the JavaScript stack while rendering. In jsdom, 350 nested folders rendered and 400 overflowed on a cold run; after warm-up, 500 rendered and 700 overflowed. The tree-building helper itself handles thousands of levels, and a path of 400 one-letter folders is only about 800 characters. A replacement must handle at least 350 levels; whether it must handle Git's full path depth is Q11.

### 5.3 Resources and side effects

- No global or document listeners, timers, animation frames, observers, subscriptions or storage. All handlers live on the view's own elements and disappear with them. Unmounting leaves nothing behind.
- It reads no store during rendering; the selected repository is read only by `viewDiff` when a file is activated. It must not make the details panel re-render when unrelated stores change.
- It never moves focus or scrolls on its own.
- Apart from the file menu shortcut (whose default it prevents), it neither prevents nor stops keyboard events, so Escape, `/` and Ctrl/Cmd+F keep working from inside the tree. Its right-click handling on files stops propagation (through `openContextMenu`); folder right-clicks propagate untouched.
- Entry identity across re-renders must be stable for each change and each folder, including when a file and a folder share a path (§4.5) or two changes share a new path (§4.6), so a re-render never shows one change's data on another's entry.

---

## 6. Test coverage

### 6.1 Already covered

`tests/webview/components/commit/FileTree.test.ts` (renders `CommitDetails` in a table body):

- Folders start expanded (`aria-expanded="true"`); clicking a folder collapses it (`"false"`) and removes its files from the DOM; entry order and names (`src`, `b`, `c.ts`, `a.ts`), which also depend on the helper's ordering.
- A collapsed folder stays collapsed, and its parent stays expanded, when the same commit's details are delivered again as a new object.

`tests/webview/utils/fileTree.test.ts` covers the helper's output (order, paths, names), not this view. No other webview test, and neither the UI harness nor the benchmark harness, interacts with the tree.

### 6.2 Gaps

Unless noted, set up with `setupWebviewTest()` (key-name strings), `selectedRepo.value = "/repo"`, `vscodeApi.postMessage` cleared, and render either `CommitDetails` as the existing test does or `FileTree` directly with nodes from the tree-building helper. "Labels" means the first `span` text of each `li > button`, in order.

1. **Re-expanding.** Setup: `src/a.ts`, `src/b/c.ts`. Interaction: click `b`, then click `b` again. Expected: `aria-expanded="true"`; labels `src`, `b`, `c.ts`, `a.ts`.
2. **Descendant state survives a parent's collapse.** Same setup. Click `b`, click `src`, click `src`. Expected: labels `src`, `b`, `a.ts`; `b` has `aria-expanded="false"`.
3. **Fresh mount is fully expanded.** Collapse `src`, unmount, mount again with the same nodes. Expected: every folder button has `aria-expanded="true"`.
4. **Diff request.** Change `lib/new.ts` renamed from `old.ts` (R, 2/3), `commitHash` `"H"`. Click its entry. Expected: exactly one posted message, `{ command: "viewDiff", repo: "/repo", commitHash: "H", oldFilePath: "old.ts", newFilePath: "lib/new.ts", type: "R" }`.
5. **No repository.** `selectedRepo.value = undefined`; click a non-binary file. Expected: nothing posted.
6. **Binary file.** Change `img.png`, M, null/null. Expected: entry has `title` `tooltipBinaryFile`; no counts in its text; clicking posts nothing; the entry is still a focusable button without `disabled`.
7. **One null count is binary.** Change M with additions 5, deletions null. Expected: as gap 6.
8. **Counts only for M and R.** Changes A 10/0, D 0/5, M 3/1. Expected: the A and D entries' text is just the name; the M entry's text is `name(+3|-1)`; the `+3` element's `title` is `tooltipAdditions`, the `-1` element's `title` is `tooltipDeletion`.
9. **Plural choice with real templates.** Install English templates on `window.l10n` for the six keys in §2.4. Change M 1/0. Expected: titles `1 addition` and `0 deletions`. Change M 1234/2: `1234 additions`, `2 deletions`.
10. **Rename marker.** With English templates, change `new/path.ts` from `old/path.ts`, R. Expected: an element with text `R` and `title` `old/path.ts was renamed to new/path.ts`; no such element for M, A or D entries.
11. **Right-click on a file.** Dispatch a cancelable, bubbling `contextmenu` at (50, 60) on a file entry for `src/a.ts` with `commitHash` `"H"`. Expected: `contextMenu.value` has x 50, y 60, source `file:src/a.ts`, entry titles `fileHistory`, `openHistoricalFile`, `restoreHistoricalFile`; the event's `defaultPrevented` is true; a `contextmenu` listener on the tree's container is not called.
12. **Deleted file's menu targets the parent revision.** Change `gone.txt`, D, `commitHash` `"H"`. Open the menu and run its first entry. Expected: the history filter has `path: "gone.txt"`, `revision: "H^"`, `follow: true`. Running the second entry posts a `repositoryAction` whose `action` is `{ kind: "viewHistoricalFile", hash: "H^", path: "gone.txt" }`.
13. **Keyboard menu.** Stub the file entry's `getBoundingClientRect` to `{ left: 40, bottom: 120, … }`. Dispatch cancelable `keydown` events: `ContextMenu`; then (after clearing `contextMenu.value`) `F10` with `shiftKey`; then `F10` alone. Expected: the first two are `defaultPrevented` and each opens the menu with x 40, y 120 and source `file:<path>`; plain F10 is not prevented and opens nothing.
14. **Folders have no menu.** Right-click a folder entry, and send `ContextMenu` `keydown` to it. Expected: `contextMenu.value` stays `null`; neither event is `defaultPrevented`.
15. **Escape bubbles to the details row.** Render `CommitTable` with one commit (as `WorkingTreeDetails.test.ts` does), open the commit, deliver its details through `handleCommitDetails` with the request id from `latestGraphRequest("commitDetails")`, focus a file entry and dispatch a bubbling `Escape` `keydown` on it. Expected: `expandedCommit.value` is `null` and the commit's row has focus.
16. **DOM contract.** For a tree with folders and files: every button is `type="button"`; only folder buttons carry `aria-expanded`; each folder button's `textContent` equals its name; every `svg` has `aria-hidden="true"` and `focusable="false"`; no element in the tree has an `id`.
17. **Empty commit.** `nodes` = `[]`. Expected: no `li > button` in the tree and no text.
18. **File replaced by a folder.** Changes `a` (D) and `a/b` (A). Expected labels `a`, `b`, `a` (the first with `aria-expanded`); after clicking the folder: `a`, `a`; after clicking again: `a`, `b`, `a`. Clicking the last entry posts a `viewDiff` with `type: "D"`.
19. **Duplicate new paths.** Changes `d/x` from `p` (R), `d/x` (A), `d/y` (M). Toggle `d` twice. Expected: labels `d`, `x`, `x`, `y`; clicking the first `x` posts `type: "R"` with `oldFilePath: "p"`, the second posts `type: "A"`.
20. **Focus is left alone.** Focus a file entry, then deliver the same commit's details again. Expected: `document.activeElement` is still that entry (same name). Toggle a folder with focus on it: focus stays on that folder's button.
21. **Moderate depth.** One change whose path has 300 nested folders. Expected: renders without throwing; 301 `li > button` elements. (A deeper target depends on Q11.)
22. **Large commit smoke test (optional, generous bound).** 5,000 changes over 400 folders. Expected: first render and a folder toggle each complete, and the entry count is 5,450; if a time bound is added, use one well above §5.1's baseline to avoid flaky CI.
23. **Double-click on a file (records current behaviour; depends on Q2).** Two `click()` calls then a `dblclick` on a non-binary file. Expected today: exactly two `viewDiff` messages.
24. **Same mounted tree, different commit (records current behaviour; depends on Q6).** As §4.8.

Not testable in jsdom and to be checked by eye in the running extension: colours by change type, 13 px glyphs at 60 % opacity, 10 px/30 px indentation, 22 px entry pitch, ellipsis on long names with the marker and counts still visible, cursors, and the default focus outline.

---

## 7. Questions

**Q1. Placeholder substitution corrupts some paths in tooltips.** The rename tooltip fills `{0}` and then `{1}` by plain search-and-replace with special replacement patterns active. Observed: an old path `a$$b.txt` renamed to `c.txt` shows `a$b.txt was renamed to c.txt`; an old path `p$&q` shows `p{0}q was renamed to r`; a new path `n$'ew.ts` shows as `new.ts`; and an old path `x{1}.txt` renamed to `y.txt` shows `xy.txt.txt was renamed to {1}`. The count tooltips are safe because the values are digits. Intended is presumably literal substitution of both paths.

**Q2. Double-clicking a file requests the diff twice.** Each click of a double-click posts `viewDiff`, so two identical requests reach the extension. Folders toggle twice and end unchanged. Should the second click of a double-click be ignored for files?

**Q3. Binary entries are live buttons that do nothing.** They stay focusable and enabled, sit in the tab order and respond to Enter/Space with nothing; the reason is only in a tooltip (and the accessible description). Should they be marked unavailable (for example `aria-disabled`), or should activation give feedback?

**Q4. Added, modified and deleted are shown only by colour.** Renames show an `R`, but A/M/D have no letter, no text for assistive technology and no non-colour cue. Is colour alone intended?

**Q5. Counts are hidden for added and deleted files.** Git supplies them (for example 10/0 for a new file), but they are only shown for modified and renamed files. Intended, or should every non-binary file show its counts?

**Q6. Collapsed state is keyed by folder path only and outlives a change of commit on the same mounted tree.** Not visible in the app today, because the tree is always remounted for a new commit, but a caller that re-rendered with another commit would see folders collapsed that the user never touched in that commit. Should the state reset when `commitHash` changes?

**Q7. Collapsed state is forgotten when the details close.** Closing and reopening the same commit, or visiting another commit and coming back, expands everything again. Should it persist (per commit, per repository, or across sessions)?

**Q8. No tree semantics or tree keyboard model.** There are no `tree`/`treeitem`/`group` roles, no roving tab stop, no arrow keys (Right/Left to expand/collapse or move to parent), no Home/End, no typeahead and no expand-all. Every entry is a tab stop, which makes a commit with thousands of files slow to traverse by keyboard. Should the replacement adopt the ARIA tree pattern? Note that the tests constrain the DOM (§3.8): buttons directly inside list items, `aria-expanded` on folder buttons.

**Q9. Folders have no context menu.** A right-click on a folder leaves the host's default menu and there is no keyboard shortcut. Is a folder menu (for example collapse all, or history for the folder) wanted, or should the default at least be suppressed as it is elsewhere?

**Q10. The entry whose menu is open is not highlighted, and its menu key lacks the commit.** Commit rows and ref labels highlight themselves while their menu or form is open; file entries do not. The key `file:<new path>` is also the same for two changes with one new path (§4.6) and for the same path in different commits. Should the entry highlight itself, and should the key include the commit hash or be unique per entry?

**Q11. Deep folder nesting crashes rendering.** Somewhere between about 350 and 700 nested folders (depending on JIT state in jsdom) rendering throws a stack overflow, which would likely break the whole webview; the tree helper deliberately supports thousands of levels. Must the view handle any depth Git allows?

**Q12. Truncated names have no tooltip.** Long names end in an ellipsis, but no tooltip gives the full name or path (the only entry tooltip is the binary notice). Should entries expose the full path on hover?

**Q13. No hover highlight and no focus style of its own.** The working-tree file list in the same panel shows a hover background and a 1 px focus outline in the focus colour; this tree shows neither and relies on the host's default focus ring. Should it match the working-tree list?

**Q14. Whitespace in names is collapsed.** Because entries are single-line, a name containing two consecutive spaces, a tab or a newline is displayed with a single space. Should such characters be preserved or made visible?

**Q15. Keyboard menu and the native context-menu event.** On a file, the view prevents the default of the Context Menu key and of Shift+F10 and opens its own menu at the entry's bottom-left. On platforms where the browser still dispatches a native `contextmenu` event after the key (for example on key release), the right-click handling would run as well and reposition the menu to the browser's coordinates. This has not been observed in a real browser. The intended result is presumably exactly one menu, anchored at the entry.

**Q16. Counts are not formatted for the display locale.** `1234` shows as `+1234` and `1234 additions`, although the webview has a configurable locale. Is locale digit grouping wanted?

**Q17. No empty-state message.** A commit with no file changes (for example an empty merge) shows an empty area next to the summary. Should it say that no files changed?

---

## 8. Decisions on §7 (from the project maintainer's side)

These decisions replace the "current behaviour" wherever they differ. Build to these, and test the decided behaviour.

- **Q1: literal substitution.** The rename tooltip shows both paths exactly as they are: no `$` pattern is interpreted, and a `{1}` inside the old path is not replaced. The count tooltips likewise.
- **Q2: one diff per double-click.** A click on a file whose click count (`detail`) is 2 or more does nothing, so a double-click requests the diff once. A keyboard activation (count 0) and a single click (count 1) request it as before. Folders are unchanged.
- **Q3: binary entries are marked unavailable.** A binary file entry carries `aria-disabled="true"`. It stays an enabled, focusable button with its tooltip and its context menu, and activating it still does nothing.
- **Q4: keep.**
- **Q5: keep.** Counts only for modified and renamed files.
- **Q6: reset on a new commit.** When `commitHash` changes, every folder starts expanded again. New nodes for the same `commitHash` keep the collapsed state as before.
- **Q7: keep.** Nothing is persisted.
- **Q8: keep.** No tree pattern; the DOM contract of §3.8 stands.
- **Q9: keep.** Folders have no menu.
- **Q10: keep.** No highlight, and the source key stays `file:` plus the new path.
- **Q11: any practical depth.** The view must render a path of at least 2,000 nested folders without error. The nesting of list elements is not part of the contract (§3.8 names only `li > button`, their order, and the absence of collapsed descendants), so entries may be laid out in a single flat list with each entry's indentation applied to it, as long as the visible result matches §3.7.
- **Q12 – Q17: keep.**
