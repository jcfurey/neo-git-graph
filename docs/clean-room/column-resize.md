# Clean-room specification: `src/webview/components/commit/useColumnResize.ts`

This document says what the commit table's column-resizing hook must do, as seen from outside it. It is written for an engineer who will build a replacement without seeing the current source. It is based on the hook's only caller (`CommitTable.tsx`), the modules the hook depends on, the Vitest and VS Code UI tests that drive it, the project documentation, and the results of running the current code in jsdom.

---

## 0. Background: the table and its columns

The commit table in the webview has five columns, in this order (cell index in a row):

| Index | Column      | Resizable by the user?                  | Stored width slot |
| ----- | ----------- | --------------------------------------- | ----------------- |
| 0     | Graph       | yes                                     | 0                 |
| 1     | Description | no, it takes the space the others leave | none              |
| 2     | Date        | yes                                     | 1                 |
| 3     | Author      | yes                                     | 2                 |
| 4     | Commit      | yes                                     | 3                 |

A saved set of **column widths** is therefore always an array of exactly four pixel numbers, in the order **[graph, date, author, commit]**. The Description column has no stored width.

A **boundary** is the vertical edge between two adjacent columns. Boundaries are numbered by the column to their left:

| Boundary | Lies between          | Moving it right by _d_ pixels means                             |
| -------- | --------------------- | --------------------------------------------------------------- |
| 0        | Graph and Description | Graph grows by _d_; Description (not stored) gives up the space |
| 1        | Description and Date  | Date shrinks by _d_; Description takes the space                |
| 2        | Date and Author       | Date grows by _d_, Author shrinks by _d_                        |
| 3        | Author and Commit     | Author grows by _d_, Commit shrinks by _d_                      |

Moving a boundary left is the same with _d_ negative. Any other boundary number is accepted but nothing moves (see §3.4).

Widths are chosen per repository and saved in VS Code's workspace state, so they survive switching repositories, closing the panel and restarting VS Code (`docs/preferences.md`, "Column widths: Restored for each repository").

While no widths are saved for the selected repository, the browser lays out the table itself (automatic table layout), and only the Graph column is given a preferred width by the caller. Once widths exist, `CommitTable` switches the table to fixed layout (`table-fixed` class) and the four `<col>` elements take their widths from CSS custom properties that this hook writes.

---

## 1. Interface

**Module path:** `src/webview/components/commit/useColumnResize.ts`, imported as `@/webview/components/commit/useColumnResize`.

The module has exactly two exports. Their names and signatures must stay as shown. There is no default export.

### `export function useColumnResize(graphColumn: number): ColumnResize`

A Preact hook. It must be called during a component's render, following the rules of hooks, once per render.

- `graphColumn`: the preferred width, in CSS pixels, of the Graph column while the selected repository has no saved widths. `CommitTable` computes it from the graph's drawn width and keeps it between 64 and 240; the hook must accept any number.
- Returns a `ColumnResize` object (below).

### `export type ColumnResize`

An object type with these five fields (names and types must stay exactly as listed):

| Field          | Type                                                    | Meaning                                                                                                                                                                                                                                                                      |
| -------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `containerRef` | `RefObject<HTMLDivElement>` (`RefObject` from `preact`) | The caller attaches it (`ref=`) to the element whose inline style receives the four width custom properties. `CommitTable` attaches it to its outermost `<div>`, which contains both the graph overlay and the `<table>`, so the properties cascade to the `<col>` elements. |
| `headRef`      | `RefObject<HTMLTableRowElement>`                        | The caller attaches it to the table's header row (`<thead><tr>`). Its `cells` must be the five header cells in the order of §0. The hook measures these cells.                                                                                                               |
| `resizing`     | `boolean`                                               | `true` while a pointer drag of a boundary is in progress, otherwise `false`.                                                                                                                                                                                                 |
| `startResize`  | `(boundary: number, event: MouseEvent) => void`         | Begins a pointer drag of the given boundary. The caller calls it from a `mousedown` handler.                                                                                                                                                                                 |
| `nudge`        | `(boundary: number, event: KeyboardEvent) => void`      | Moves the given boundary one keyboard step if the key is Left or Right Arrow. The caller calls it from a `keydown` handler.                                                                                                                                                  |

### Who uses what

- **`src/webview/components/commit/CommitTable.tsx`** (the only importer):
  - imports the type `ColumnResize` and uses it as the type of the `resize` prop of its internal resize-handle component;
  - imports `useColumnResize` and calls it once per render as `useColumnResize(graphColumn)`;
  - uses `containerRef` as the `ref` of the outer `<div>` and passes it to `useGraphScroll`;
  - uses `headRef` as the `ref` of the header `<tr>` and passes it to `useGraphScroll`;
  - uses `resizing` to add the `cursor-col-resize` class to the header row while a drag is in progress;
  - binds each resize handle's `onMouseDown` to `startResize(boundary, event)` and `onKeyDown` to `nudge(boundary, event)`. Every header cell except the Graph cell has a keyboard-focusable handle at its left edge for the boundary before it (`tabIndex` 0), and every cell except the Commit cell has a pointer-only handle at its right edge for the boundary after it. So boundaries 0 to 3 each have two handles, and only 0 to 3 are ever passed. The event passed is Preact's targeted event, a subtype of the DOM `MouseEvent` / `KeyboardEvent`.
- **`src/webview/components/commit/useGraphScroll.ts`** does not import this module, but receives `containerRef` and `headRef` from `CommitTable`, lists them as layout-effect dependencies, writes its own custom properties (`--graph-viewport-width`, `--graph-top`) to the same container element, and measures header cell 0.
- **Tests:** no test imports the module directly. `tests/webview/components/commit/GraphScroll.test.ts` renders `CommitTable`, so it runs the hook. `tests-ext/ui/history.test.cjs` drives the handles in a real VS Code window (see §6).

---

## 2. Dependencies the implementation must use

### 2.1 Repository modules

| Import path               | Name                                                 | Contract the hook relies on                                                                                                                                                                                                                                      |
| ------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@/webview/constants`     | `RESIZABLE_COLUMNS`                                  | `[0, 2, 3, 4]`: the header-cell index of each stored width slot, in slot order. Use it rather than hard-coding the mapping.                                                                                                                                      |
| `@/webview/constants`     | `DESCRIPTION_COLUMN`                                 | `1`: the header-cell index of the Description column.                                                                                                                                                                                                            |
| `@/webview/utils/columns` | `MIN_COLUMN`                                         | `40`: the smallest width in pixels of any resizable column.                                                                                                                                                                                                      |
| `@/webview/utils/columns` | `moveBoundary(widths, boundary, delta, description)` | Returns `{ widths, moved }`. See §2.2. The hook must delegate all boundary arithmetic and clamping to it so that pointer and keyboard moves share one set of rules.                                                                                              |
| `@/webview/lib/stores`    | `columnWidths`                                       | A read-only computed Preact signal: the selected repository's saved widths, or `null` when no repository is selected, none are saved, or the saved value is not four finite positive numbers. Reading `.value` during render subscribes the rendering component. |
| `@/webview/lib/actions`   | `setColumnWidths(widths: Array<number>)`             | Puts `widths` into the in-memory state of the **currently selected** repository (`repoStates`), which updates `columnWidths`. It does **not** persist anything. Does nothing when no repository is selected.                                                     |
| `@/webview/lib/actions`   | `saveColumnWidths(widths: Array<number>)`            | Does what `setColumnWidths` does and then posts one message to the extension: `{ command: "saveRepoState", repo: <selected repo path>, state: { columnWidths: <widths> } }`. Does nothing, and posts nothing, when no repository is selected.                    |

Related types: `GitRepoState.columnWidths: number[] | null` and the `saveRepoState` request type are in `src/types/legacy.ts`. On the extension side, `src/old-extension/messageHandler.ts` merges the message's `state` into the repository's stored state, and `repoManager` writes it to workspace storage. `receiveRepoState` in `@/webview/lib/actions` merges state arriving from the extension so that fields already in memory win over the arriving ones; that is why widths placed in memory at the start of a drag are not replaced by a `repoState` message that arrives during the drag.

### 2.2 Contract of `moveBoundary` (dependency, not part of this module)

`moveBoundary(widths, boundary, delta, description)` takes the four stored widths, a boundary number, a requested movement `delta` in pixels (positive = rightwards), and the current rendered width of the Description column. It returns a new four-width array and `moved`, the part of `delta` that was applied. It never changes the array it is given. `MIN_DESCRIPTION` in that module is 64.

The two columns on either side of the boundary must both end at or above their minimum: 40 px for a stored column, 64 px for the Description (whose resulting width is taken to be its measured width minus the movement for boundary 0, or plus the movement for boundary 1). `moved` is the value nearest to `delta` that satisfies both minimums. Boundaries 2 and 3 move width from one stored column to its neighbour, and boundaries 0 and 1 change only the one stored column next to the Description. If no value satisfies both minimums (both columns are already too narrow), nothing moves and `moved` is 0. For a boundary number other than 0 to 3, nothing moves and `moved` is 0.

"Nearest to `delta`" has a consequence that is observable through this hook: when one of the two columns is already below its minimum, any movement, including one in the opposite direction, pushes the boundary far enough to restore that minimum (examples in §4.4 and §4.2, question Q5).

`tests/webview/utils/columns.test.ts` covers this function.

### 2.3 Platform APIs and shared state

- **Preact hooks** from `preact/hooks` for refs, component state and effects, and the `RefObject` type from `preact`.
- **DOM writes:** four CSS custom properties in the inline style of the `containerRef` element (§3.1). No other element and no other property is written. Other inline properties on that element (for example `useGraphScroll`'s) must be left alone.
- **DOM reads:** the header row's `cells` collection and each cell's `clientWidth` (the laid-out width including padding, excluding border, an integer in browsers). Nothing else is measured.
- **Events:** the `MouseEvent` passed to `startResize` (`clientX`, `preventDefault()`), and the `KeyboardEvent` passed to `nudge` (`key`, `preventDefault()`). While a drag is in progress the hook listens on **`window`** for `mousemove`, `mouseup` and `blur`. The listeners must be on `window` itself: the UI tests dispatch the move and release with `window.dispatchEvent(...)`, which does not reach listeners on `document` or on elements.
- **Persisted state and messages:** only through `saveColumnWidths` (one `saveRepoState` message per call). The hook never calls `postMessage` or `vscode.setState` itself and receives no messages.
- **No** timers, animation frames, `ResizeObserver`, pointer capture, `localStorage`, or globals.

---

## 3. Behaviour

### 3.1 Writing widths to the container

The four custom properties are `--col-graph`, `--col-date`, `--col-author` and `--col-commit`, in stored-slot order. `CommitTable` reads them as `width: var(--col-…)` on the Graph, Date, Author and Commit `<col>` elements. Each value is the number followed by `px`, written as JavaScript would print the number, with no rounding (for example `120px`, `42.75px`, `5.5px`).

What the container shows depends on the selected repository's saved widths (the `columnWidths` signal):

- **Saved widths exist:** all four properties are set from them. `graphColumn` is ignored.
- **No saved widths (`null`):** `--col-graph` is set to `graphColumn` px, and `--col-date`, `--col-author` and `--col-commit` are removed from the inline style, so those columns fall back to automatic sizing.

When this is applied:

- On first mount, and again whenever the saved widths value (by identity) or `graphColumn` changes. Nothing is re-applied on renders where neither changed.
- In the **layout phase**: after Preact has attached the refs and updated the DOM, before the browser paints, and before any layout effect that the calling component declares after calling this hook. `CommitTable` calls `useGraphScroll` after this hook, and its layout effect measures the Graph header cell; it must see the widths already applied.
- If `containerRef` is not attached, nothing is written and nothing fails.

Saved widths are written as they are, without clamping to the 40 px minimum (a saved `5.5` is written as `5.5px`).

The signal only yields widths that are four finite positive numbers. A malformed saved value (three numbers, a zero, `NaN`) behaves exactly like no saved widths.

Switching the selected repository changes the signal, so the container changes to the new repository's widths, or to the "no saved widths" form.

### 3.2 Pointer drag

**Starting a drag (`startResize(boundary, event)`).** If `headRef` is not attached, the call has no effect at all: the default is not prevented, nothing listens, nothing is stored, and `resizing` stays `false`. Otherwise, by the time the call returns:

- the event's default action has been prevented (so no text selection starts and focus stays where it was);
- the drag's **starting widths** are fixed. They are the selected repository's saved widths when it has any, and the header is not measured in that case. Otherwise they are the `clientWidth` of header cells 0, 2, 3 and 4, each raised to at least 40;
- the starting widths are in memory for the selected repository through `setColumnWidths`, without being persisted. This makes `CommitTable` switch the table to fixed layout on its next render, and makes §3.1 give the container the starting widths, so the columns keep their on-screen sizes rather than jumping when the layout mode changes;
- `window` is listening for `mousemove`, `mouseup` and `blur`. This must already be true when `startResize` returns. The UI tests dispatch `mousedown`, `mousemove` and `mouseup` one after another in one synchronous script, with no render in between, and expect the move to take effect;
- `resizing` will read `true` from the next render on.

The pressed button is not examined: any button starts a drag (Q2).

**Following the pointer.** The boundary tracks the pointer's horizontal position (`clientX`). At the press, the boundary counts as being at the press position. Each `window` `mousemove` asks `moveBoundary` to move the boundary from where it currently counts as being to the event's `clientX`, starting from the drag's current widths. The Description is measured again for every move (`clientWidth` of header cell 1), so the limit follows the live layout. Only the amount actually applied changes where the boundary counts as being. So after a column hits a limit, moving the pointer further has no effect, and the boundary starts moving back only when the pointer comes back past the point where the boundary stopped (example §4.2 steps 3 to 5).

After every move, all four custom properties on the container show the drag's current widths. They are written synchronously, inside the event handler. A move never writes a signal or component state, never causes a render, and never posts a message.

**Ending a drag.** The first `mouseup` or `blur` event on `window` ends the drag. The `mouseup` position is not used. When the drag ends:

- the drag's current widths are saved with `saveColumnWidths`: exactly one `saveRepoState` message, and the in-memory widths become the final widths, which §3.1 applies again on the next render;
- none of the three window listeners remain, so later `mousemove`, `mouseup` or `blur` events have no effect and post nothing;
- `resizing` reads `false` from the next render on.

The widths are saved even when the pointer did not move: a plain click on a handle persists the starting widths (for a repository without saved widths, that means the measured widths) and leaves the table in fixed layout from then on (Q1).

`clientX` of a real mouse event is normally an integer, but fractional positions are used as they are, and fractional widths are stored and persisted without rounding (Q13).

### 3.3 Keyboard nudge

`nudge(boundary, event)` reacts only to `event.key` values `"ArrowLeft"` and `"ArrowRight"`, and only when `headRef` is attached. In every other case it has no effect and does not prevent the default. Legacy key names such as `"Left"` are not accepted. Modifier keys make no difference: Shift+ArrowLeft behaves exactly like ArrowLeft.

For an accepted key:

- the default is prevented, so the page does not scroll;
- the boundary moves by a fixed **8 px**: left (−8) for ArrowLeft, right (+8) for ArrowRight. The move goes through `moveBoundary` and is subject to the same limits as a drag;
- the widths it moves from are chosen as at the start of a drag (the saved widths, or else the measured header cells raised to at least 40), and the Description is measured at the time of the key press;
- the result is saved with `saveColumnWidths`: one `saveRepoState` message per key press, **even if nothing moved** (for example at a minimum, or for a boundary number outside 0 to 3).

Further points:

- `nudge` does not touch the container directly. The new widths reach the DOM through the signal and §3.1 on the next render (asynchronously, not inside the key handler).
- `nudge` never changes `resizing`.
- Key repeat simply calls `nudge` again for each `keydown`.

### 3.4 Boundary numbers

The hook passes the boundary number through to `moveBoundary` without checking it. For a number other than 0 to 3, nothing moves, but a drag still starts, sets `resizing`, writes the starting widths to memory and saves them on release, and a nudge still saves (unchanged) widths.

### 3.5 The `resizing` flag

It is component state of the calling component: `true` from the render after a drag starts until the render after it ends. It is `false` initially, after a nudge, and when `startResize` returns early.

### 3.6 Selected repository

Everything the hook stores goes to whichever repository is selected **at the moment** of the store call (`setColumnWidths` at drag start, `saveColumnWidths` at drag end or nudge).

- **No repository selected:** a drag still follows the pointer on screen and `resizing` still toggles, but nothing is stored or posted. Because the signal stays `null`, the dragged widths stay on the container after release until `graphColumn` or the signal changes, which re-applies the "no saved widths" form. A nudge prevents the default but has no visible effect and posts nothing.
- **Repository changes during a drag:** the container switches to the new repository's widths on the next render. The next pointer move writes the drag widths back, and the release saves the drag widths into the **new** repository (Q9).

### 3.7 Errors

If a header cell that has to be measured does not exist, the hook throws `Error` with the message `"Invalid commit table column"`:

- `startResize` and `nudge` throw it when there are no saved widths and the header row has fewer than five cells (the default has already been prevented at that point when called from `startResize`);
- with saved widths and no Description cell, `startResize` succeeds, but every `mousemove` handler throws, which the browser reports as an uncaught error. Nothing moves, and the release still saves the starting widths.

`CommitTable` always renders five header cells, so this cannot happen in the product. Whether the exact message matters is Q12. No other errors are thrown or caught.

### 3.8 Unmounting

When the calling component unmounts while a drag is in progress, the three window listeners are removed. Nothing is saved or posted, and `resizing` is not updated (the component is gone). The starting widths written to memory at drag start stay in memory for that repository, unsaved (Q11). Unmounting when no drag is in progress does nothing observable.

### 3.9 Re-entrancy and overlapping actions

- **`startResize` during an active drag** (for example after a release that was never delivered): the new drag replaces the old one. Its starting widths are the in-memory widths (the previous drag's starting widths, not its current widths), and only the new boundary moves. The first drag's three window listeners are **not** removed. They stay attached for the life of the page. They do not cause double movement, and a later `mouseup` still produces one save, but they leak (Q3).
- **`nudge` during a drag:** the nudge works from the in-memory widths (the drag's starting widths), saves its result, and the next render shows it. The next pointer move shows the drag widths again, and the release saves the drag widths, so the nudge is lost (Q8).
- **A re-render that changes `graphColumn` or the saved widths during a drag** re-applies §3.1. The container shows the in-memory widths (normally the drag's starting widths) until the next pointer move writes the drag widths again (Q7). A `repoState` message for the same repository during a drag does not change the in-memory widths (see §2.1), so it causes no such reset.
- **Events dispatched synchronously before the start-of-drag render:** if a `mousemove` is handled before the render that follows `startResize`, that render shows the starting widths again, until the next move. In a browser, the render runs in a microtask before the next input event, so this only happens with synthetic, synchronously dispatched events.
- The functions returned by one render keep working if called after later renders.

---

## 4. Concrete examples

All examples were observed by running the current code in the repository's Vitest `webview` configuration (jsdom, `tests/webview/setup.ts` for the VS Code API mock). Header cells had mocked `clientWidth`s, listed as **cells [c0, c1, c2, c3, c4]**, where c1 is Description. Unless stated otherwise: the selected repository is `"/repo"`, nothing is saved, `graphColumn` is 77, and **cells [150, 500, 100, 90, 80]**. "Props" lists the container's `--col-graph`, `--col-date`, `--col-author`, `--col-commit` values, with `""` for an absent property. "Message" is the argument of `vscode.postMessage`. Every drag and key event was dispatched inside `act()`.

### 4.1 Applying widths

| #   | Situation                                                         | Result                                                                                                               |
| --- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1   | Mount, nothing saved                                              | Props `["77px","","",""]`. The container's `style` attribute is exactly `--col-graph: 77px;`. `resizing` is `false`. |
| 2   | Mount with `/repo` saved `[120, 90, 100, 70]`                     | Props `["120px","90px","100px","70px"]`                                                                              |
| 3   | Same, then re-render with `graphColumn` 99                        | Unchanged: `["120px","90px","100px","70px"]`                                                                         |
| 4   | Same, then select `/other` (nothing saved)                        | Props `["99px","","",""]`. The container's `style` attribute is exactly `--col-graph: 99px;`.                        |
| 5   | Then re-render with `graphColumn` 64                              | `["64px","","",""]`                                                                                                  |
| 6   | Then `/other` saved as `[120, 90, 100]` (three numbers)           | Treated as nothing saved: `["64px","","",""]`                                                                        |
| 7   | Then `/other` saved as `[120, 90, 100, 5.5]`                      | `["120px","90px","100px","5.5px"]` (no clamping)                                                                     |
| 8   | `CommitTable` with the 14-commit fixture of `GraphScroll.test.ts` | `["224px","","",""]` (the caller passed 224). The table has no `table-fixed` class.                                  |
| 9   | `CommitTable` with a three-commit linear history                  | `["64px","","",""]` (the caller's minimum Graph column)                                                              |

### 4.2 A full drag (boundary 0)

| Step | Action                                                | Result                                                                                                                                                                                                                                                                                                                       |
| ---- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `startResize(0, mousedown{clientX: 200, cancelable})` | `defaultPrevented` is `true`. Immediately, `repoStates["/repo"].columnWidths` is `[150, 100, 90, 80]` (the measured cells 0, 2, 3, 4) and no message has been posted. `mousemove`, `mouseup`, `blur` listeners were added to `window`. After the next render: `resizing` is `true`, props `["150px","100px","90px","80px"]`. |
| 2    | `window` mousemove `clientX` 230                      | Props `["180px","100px","90px","80px"]`, written synchronously. In-memory widths still `[150, 100, 90, 80]`. No render and no message.                                                                                                                                                                                       |
| 3    | mousemove `clientX` −500                              | `["40px",…]`: stops at the minimum. The boundary is now considered to be at x = 90.                                                                                                                                                                                                                                          |
| 4    | mousemove `clientX` 50                                | Still `["40px",…]`: the pointer is left of 90.                                                                                                                                                                                                                                                                               |
| 5    | mousemove `clientX` 100                               | `["50px","100px","90px","80px"]`                                                                                                                                                                                                                                                                                             |
| 6    | `window` mouseup                                      | `resizing` `false`. Exactly one message: `{"command":"saveRepoState","repo":"/repo","state":{"columnWidths":[50,100,90,80]}}` (with the step-5 widths). Listeners removed. In-memory widths are the saved ones.                                                                                                              |
| 7    | More mousemove / mouseup                              | No effect, no message.                                                                                                                                                                                                                                                                                                       |

The Description limit uses the measurement taken at each move. With **cells [150, 500, …]** and the Description measured as **100** during the move, `startResize(0, clientX 0)` then mousemove to 100 gives `--col-graph` **186px** (only 100 − 64 = 36 of the 100 requested). If the Description then measures **50** and the pointer moves further right to 200, `--col-graph` becomes **172px**: the Graph column **shrinks** by 14 to give the Description its 64 px back. Release saves `[172, 100, 90, 80]`.

### 4.3 Other drag cases

| #   | Situation                                                                                                                                                                                                    | Result                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **cells [10, 500, 30, 90, 0]**, `startResize(2, clientX 10.5)`                                                                                                                                               | Starting widths `[40, 40, 90, 40]` (measured values raised to 40). Move to 13.25: props `["40px","42.75px","87.25px","40px"]`. Release saves `[40, 42.75, 87.25, 40]`.                                                                   |
| 2   | `startResize(1, clientX 10)` then mouseup, no move                                                                                                                                                           | One message with `columnWidths: [150, 100, 90, 80]`.                                                                                                                                                                                     |
| 3   | `startResize(1, clientX 10)`, move to 30, then `window` `blur`                                                                                                                                               | `resizing` `false`. Message `columnWidths: [150, 80, 90, 80]`. Props `["150px","80px","90px","80px"]`.                                                                                                                                   |
| 4   | `startResize(0, clientX 10)`, move to 30, unmount                                                                                                                                                            | The three listeners are removed. No message. In memory `[150, 100, 90, 80]` (starting widths). A later mouseup posts nothing.                                                                                                            |
| 5   | Saved `[111, 122, 133, 144]` (cells still [150, 500, 100, 90, 80], which differ from the saved widths), `startResize(3, mousedown{clientX 10, button 2})`, move to 20                                        | The right button starts a drag (`resizing` `true`, default prevented). Props `["111px","122px","143px","134px"]`: the saved widths were used, not the measured ones. Release saves `[111, 122, 143, 134]`.                               |
| 6   | `startResize(7, clientX 10)`, move to 60, release                                                                                                                                                            | Props `["150px","100px","90px","80px"]` (nothing moved). Release still saves `[150, 100, 90, 80]`.                                                                                                                                       |
| 7   | No repository selected: `startResize(0, clientX 10)`, move to 30, release                                                                                                                                    | `resizing` `true` then `false`. Props `["170px","100px","90px","80px"]` during and after the drag. `repoStates` stays `{}`. No message. Re-render with `graphColumn` 90: props `["90px","","",""]`.                                      |
| 8   | `/repo` saved `[111, 122, 133, 144]`, `/b` saved `[50, 50, 50, 50]`. Drag boundary 0 from 10 to 20, select `/b`, release                                                                                     | After the switch, props `["50px","50px","50px","50px"]`. Release posts `{"repo":"/b","state":{"columnWidths":[121,122,133,144]}}`. `/repo` keeps `[111, 122, 133, 144]`.                                                                 |
| 9   | Drag boundary 0 from 10 to 40 (`180px`), re-render with a new `graphColumn` 120                                                                                                                              | Props `["150px","100px","90px","80px"]` (starting widths shown again). A `repoState` message for `/repo` with `[60, 60, 60, 60]` changes nothing. Next move to 41: `["181px",…]`. Release saves `[181, 100, 90, 80]`.                    |
| 10  | `startResize(0, clientX 10)` then `startResize(2, clientX 10)`, move to 30, release                                                                                                                          | Props `["150px","120px","70px","80px"]`. One message `[150, 120, 70, 80]`. `addEventListener` was called 6 times and `removeEventListener` 3 times, and no more removals happen on unmount. A later stray mouseup or blur posts nothing. |
| 11  | **cells [120, 600, 110, 100, 90]**. `startResize(0, clientX 10)` and a `mousemove` to 40, both dispatched synchronously **outside** `act()`, then the pending render is allowed to run (a `setTimeout` wait) | Before the render: `["150px","110px","100px","90px"]` (moved). After it: `["120px","110px","100px","90px"]`, the starting widths. The next move (to 50) gives `["160px",…]`.                                                             |
| 12  | `containerRef` not attached, drag boundary 0 from 0 to 20 with all cells 100                                                                                                                                 | No error, no DOM change. Release saves `[120, 100, 100, 100]`.                                                                                                                                                                           |

### 4.4 Keyboard

Saved `[100, 120, 120, 90]`, Description measured 400, applied one after another:

| Key press                                                  | Saved result          | Notes                                                                                                                             |
| ---------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `nudge(0, ArrowRight)`                                     | `[108, 120, 120, 90]` | `defaultPrevented` `true`. One message. Props become `["108px","120px","120px","90px"]` after the next render, not synchronously. |
| `nudge(3, ArrowLeft + Shift)`                              | `[108, 120, 112, 98]` | Shift changes nothing.                                                                                                            |
| `nudge(1, ArrowRight)`                                     | `[108, 112, 112, 98]` | The Date column gives 8 px to the Description.                                                                                    |
| `nudge(2, ArrowRight)`                                     | `[108, 120, 104, 98]` |                                                                                                                                   |
| `nudge(0, "a")`, `nudge(0, "ArrowUp")`, `nudge(0, "Left")` | unchanged             | Not prevented, no message.                                                                                                        |

More cases:

| Situation                                                               | Result                                                                                                                                                             |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Saved `[40, 120, 120, 90]`, `nudge(0, ArrowLeft)`                       | Saved `[40, 120, 120, 90]`, and **a message is still posted**.                                                                                                     |
| Saved `[10, 120, 120, 90]`, `nudge(0, ArrowLeft)`                       | `[40, 120, 120, 90]`: an ArrowLeft **widened** the column to the minimum.                                                                                          |
| Saved `[300, 120, 120, 90]`, Description 200, `nudge(0, ArrowRight)`    | `[308, 120, 120, 90]`                                                                                                                                              |
| Saved `[308, …]`, Description 70, `nudge(0, ArrowRight)`                | `[314, 120, 120, 90]` (only 70 − 64 = 6 px)                                                                                                                        |
| Saved `[100, 120, 120, 90]`, Description 50, `nudge(0, ArrowRight)`     | `[86, 120, 120, 90]`: ArrowRight **narrowed** the Graph column by 14.                                                                                              |
| Saved `[100, 120, 120, 90]`, Description 50, `nudge(1, ArrowRight)`     | `[100, 106, 120, 90]`                                                                                                                                              |
| Saved `[100, 120, 120, 90]`, Description 50, `nudge(1, ArrowLeft)`      | `[100, 106, 120, 90]`: ArrowLeft moved the boundary **right** by 14.                                                                                               |
| Nothing saved, **cells [150, 500, 100, 90, 80]**, `nudge(2, ArrowLeft)` | `[150, 92, 98, 80]`                                                                                                                                                |
| `nudge(-1, ArrowLeft)`, nothing saved                                   | Saves `[150, 100, 90, 80]` unchanged, with a message.                                                                                                              |
| During a drag of boundary 0 (props `170px…`), `nudge(2, ArrowRight)`    | Message with `[150, 108, 82, 80]`. Props `["150px","108px","82px","80px"]`. Next move shows `["171px","100px","90px","80px"]`. Release saves `[171, 100, 90, 80]`. |

### 4.5 Through `CommitTable`

The 14-commit fixture from `GraphScroll.test.ts`, with header **cells [120, 600, 110, 100, 90]**:

1. Mount: props `["224px","","",""]`. The table has no `table-fixed`, and the header row class is `""`.
2. Bubbling `mousedown` (`clientX` 120) on the right-edge handle of the Graph header cell: default prevented. After render, the table has `table-fixed`, the header row class is `"cursor-col-resize"`, and props are `["120px","110px","100px","90px"]`. No message.
3. `window` mousemove to 60: `["60px","110px","100px","90px"]`.
4. `window` mouseup: the header row class is `""`. Message `columnWidths: [60, 110, 100, 90]`.
5. ArrowLeft `keydown` on the focusable handle in the Description header (boundary 0): default prevented, `["52px","110px","100px","90px"]`, message `[52, 110, 100, 90]`.
6. ArrowRight on the focusable handle in the Author header (boundary 2): `["52px","118px","92px","90px"]`.

### 4.6 Errors

| Situation                                                                                                    | Result                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Header row with 3 cells, nothing saved, `startResize(0, …)`                                                  | Throws `Error("Invalid commit table column")`                                                                                                                                                          |
| Same, `nudge(0, ArrowLeft)`                                                                                  | Throws the same error                                                                                                                                                                                  |
| Header row with 1 cell, saved `[100, 120, 120, 90]`: `startResize(0, clientX 10)`, then a `window` mousemove | `startResize` returns normally (default prevented). The move handler throws, and `window` receives an `error` event with message `"Invalid commit table column"`. Release saves `[100, 120, 120, 90]`. |

---

## 5. Non-functional requirements

1. **No re-rendering while dragging.** A pointer move must only write the four inline custom properties. It must not write any signal or component state and must not post messages. The table can hold hundreds of rows (300 by default on first load, 113 in the deep-history UI test), and re-rendering it on every move would make dragging stutter. During a drag the store is written exactly twice: once at the start (in memory only) and once at the end (saved).
2. **Message volume.** One `saveRepoState` message per finished drag (mouseup or blur), and one per arrow-key press. None during moves.
3. **Listener lifetime.** The three `window` listeners exist only between the start and end of a drag (or unmount). A drag that ends normally leaves no listener behind. Unmounting during a drag removes them. The hook creates no timers, observers or animation-frame callbacks.
4. **Synchronous listening.** The listeners must be added inside `startResize`, not in an effect after the next render, so that events dispatched immediately after `mousedown` are handled (§3.2).
5. **Layout-phase application.** Widths from the store reach the container before paint, and before the caller's later layout effects (§3.1).
6. **Stable refs.** `containerRef` and `headRef` must be the same objects for the whole life of the component. `useGraphScroll` uses them as effect dependencies, and new objects on each render would make it re-measure and recreate its `ResizeObserver` on every render. `startResize` and `nudge` do not need stable identities; `CommitTable` creates new handlers each render.
7. **No mutation of shared arrays.** The array read from the `columnWidths` signal belongs to the store, and the store's consumers detect changes by identity. The hook must never change that array in place. Any changed widths must be a new array, handed to `setColumnWidths` or `saveColumnWidths` (`moveBoundary` already returns a new array).
8. **Only its own properties.** The hook writes and removes only `--col-graph`, `--col-date`, `--col-author` and `--col-commit` on the container. It must not clear or replace the element's whole `style`, because `useGraphScroll` keeps `--graph-viewport-width` and `--graph-top` there.
9. **Reactivity.** The hook must read the saved widths during render in a way that re-applies them whenever the selected repository or its saved widths change. The caller also reads the same signal, but the hook must not depend on that.
10. **One layout read per move.** Each move reads the Description cell's width once. Starting a drag or a nudge without saved widths reads the four resizable header cells once each.

---

## 6. Test coverage

### 6.1 What existing tests already check

- **`tests/webview/components/commit/GraphScroll.test.ts`** renders the real `CommitTable`, so the hook runs in every test. The tests do not look at any `--col-*` property, drag or key press. They depend on the hook only indirectly: `containerRef` and `headRef` must attach to the outer `<div>` and the header row and stay stable, or `useGraphScroll` finds no elements and the clipping and scrolling assertions fail. The file mocks `HTMLElement.prototype.clientWidth` and `getBoundingClientRect` for every element, and stubs `ResizeObserver`.
- **`tests-ext/ui/history.test.cjs`** (VS Code UI tests, real Chromium layout):
  - _"clips wide graphs after scrolling, resizing, zoom and details (rounded|angular)"_: in one synchronous script, dispatches a bubbling `mousedown` at the Graph header cell's right edge on that cell's `[role=separator]` handle, then `window` `mousemove` to the cell's left + 40, then `window` `mouseup`. It waits until the graph viewport is narrower than before, then checks that the graph is still clipped to the column. This checks that a drag started from the handle and driven by `window` events narrows the Graph column, and that listening starts synchronously.
  - _"reveals selected lanes and keeps graph scrolling accessible deep in history"_: the same drag to left + 80 before testing lane reveal. It only needs the drag to work.
  - _"keeps focus and remote controls readable and keyboard accessible (<theme>)"_: focuses the first `[role="separator"]` in the Description header (boundary 0), presses ArrowLeft, and checks for a visible focus outline and an accessible name containing "Graph". **It does not check that any width changed.** The name comes from `CommitTable`, not from this hook.
- **Dependencies only** (not this hook): `tests/webview/utils/columns.test.ts` covers `moveBoundary` and `isColumnWidths`. `tests/webview/lib/preference-lifetime.test.ts` and `tests/webview/lib/remote-visibility.test.ts` cover `saveColumnWidths` persistence and restoring widths through `receiveRepoState`.

No unit test drives `startResize` or `nudge` or inspects the container's custom properties.

### 6.2 Gaps: tests to add

Suggested setup: a jsdom test (`// @vitest-environment jsdom`) using `setupWebviewTest()` from `@tests/webview/test-utils` and `vscodeApi` from `@tests/webview/setup`. Either render `CommitTable`, or render a small component that calls the hook and renders a `<div ref={containerRef}>` holding a table whose header `<tr ref={headRef}>` has five `<th>`. Mock `clientWidth` per header cell (for example by `cellIndex`). Set `selectedRepo.value = "/repo"` and `repoStates.value = {}` before each test. Dispatch events and call the hook's functions **inside `act()`**. Renders scheduled outside `act()` are not flushed by a later empty `act()`. Unless noted, header cells are [150, 500, 100, 90, 80] and `graphColumn` is 77.

| #   | Input                                                                                                                                                                                                                                                  | Expected                                                                                                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| G1  | Mount with nothing saved                                                                                                                                                                                                                               | Container `style` has `--col-graph: 77px` and no `--col-date`, `--col-author` or `--col-commit`. `resizing` is `false`.                                                                                                                                |
| G2  | Mount with saved `[120, 90, 100, 70]`, then re-render with `graphColumn` 99                                                                                                                                                                            | Props `120px, 90px, 100px, 70px` both times.                                                                                                                                                                                                           |
| G3  | From G2, select a repository with nothing saved                                                                                                                                                                                                        | `--col-graph: 99px`, and the other three are removed.                                                                                                                                                                                                  |
| G4  | Saved `[120, 90, 100]`                                                                                                                                                                                                                                 | Same as nothing saved.                                                                                                                                                                                                                                 |
| G5  | `startResize(0, cancelable mousedown clientX 200)`                                                                                                                                                                                                     | `defaultPrevented` `true`. In-memory widths `[150, 100, 90, 80]`. **No** message. After render: `resizing` `true`, props `150px,100px,90px,80px`. With `CommitTable`: the table has `table-fixed` and the header row has `cursor-col-resize`.          |
| G6  | From G5, `window` mousemove clientX 230                                                                                                                                                                                                                | `--col-graph: 180px` immediately. In-memory widths unchanged. No message. The component did not re-render (count renders).                                                                                                                             |
| G7  | From G6, moves to −500, then 50, then 100                                                                                                                                                                                                              | `40px`, `40px`, `50px`.                                                                                                                                                                                                                                |
| G8  | From G7, `window` mouseup                                                                                                                                                                                                                              | `resizing` `false`. Exactly one message `{command:"saveRepoState", repo:"/repo", state:{columnWidths:[50,100,90,80]}}`. Later moves and releases change nothing and post nothing. `removeEventListener` was called for `mousemove`, `mouseup`, `blur`. |
| G9  | `startResize(1, clientX 10)`, move to 30, `window` `blur`                                                                                                                                                                                              | Drag ends. Message with `[150, 80, 90, 80]`.                                                                                                                                                                                                           |
| G10 | `startResize(1, clientX 10)`, mouseup                                                                                                                                                                                                                  | Message with `[150, 100, 90, 80]` (a click saves).                                                                                                                                                                                                     |
| G11 | Cells [10, 500, 30, 90, 0], `startResize(2, …)`, mouseup                                                                                                                                                                                               | Message with `[40, 40, 90, 40]`.                                                                                                                                                                                                                       |
| G12 | Saved `[111, 122, 133, 144]`, cells all 999 except Description, drag boundary 3 by +10                                                                                                                                                                 | Props `111px,122px,143px,134px` (saved widths used, not measured).                                                                                                                                                                                     |
| G13 | Drag boundary 0 with Description measured 100: +100                                                                                                                                                                                                    | `--col-graph: 186px`.                                                                                                                                                                                                                                  |
| G14 | `startResize(0, …)`, move, unmount                                                                                                                                                                                                                     | Listeners removed. No message.                                                                                                                                                                                                                         |
| G15 | Saved `[100, 120, 120, 90]`, Description 400: `nudge` ArrowRight on 0, ArrowLeft on 3, ArrowRight on 1, ArrowRight on 2                                                                                                                                | Saved widths after each: `[108,120,120,90]`, `[108,120,112,98]`, `[108,112,112,98]`, `[108,120,104,98]`. Each prevented, one message each. Container updated after render.                                                                             |
| G16 | `nudge` with keys `"a"`, `"ArrowUp"`, `"Left"`                                                                                                                                                                                                         | Not prevented, no message, nothing changes.                                                                                                                                                                                                            |
| G17 | Saved `[40, 120, 120, 90]`, `nudge(0, ArrowLeft)`                                                                                                                                                                                                      | Widths unchanged, one message still posted (current behaviour, see Q6).                                                                                                                                                                                |
| G18 | Nothing saved, `nudge(2, ArrowLeft)`                                                                                                                                                                                                                   | Saved `[150, 92, 98, 80]`.                                                                                                                                                                                                                             |
| G19 | Component that never attaches `headRef`: `startResize` and `nudge(ArrowLeft)`                                                                                                                                                                          | Neither event prevented, no listeners added, no message, `resizing` `false`.                                                                                                                                                                           |
| G20 | `selectedRepo` `undefined`: drag boundary 0 from 10 to 30, release                                                                                                                                                                                     | Props `170px,…` during and after. `repoStates` unchanged. No message.                                                                                                                                                                                  |
| G21 | Re-render several times                                                                                                                                                                                                                                | `containerRef` and `headRef` are the same objects each time.                                                                                                                                                                                           |
| G22 | Header row with 3 cells, nothing saved, `startResize(0, …)`                                                                                                                                                                                            | Throws `Error("Invalid commit table column")` (only if Q12 keeps the message).                                                                                                                                                                         |
| G23 | With `CommitTable`, nothing saved, header cells [120, 600, 110, 100, 90], the unit version of the UI drag: bubbling `mousedown` on `thead th:first-child [role=separator]` at clientX 120, `window` mousemove 60, `window` mouseup, all in one `act()` | One message with `[60, 110, 100, 90]`. After the act, props `60px,110px,100px,90px` and the table has `table-fixed` (observed).                                                                                                                        |

---

## 7. Questions

Each item states the current behaviour. None is decided here.

- **Q1. A click saves.** Pressing and releasing a handle without moving persists the widths on screen. For a repository with no saved widths, this permanently switches its table from automatic to fixed layout, and nothing in the UI returns it to automatic sizing. Intended, or should a drag with no movement save nothing?
- **Q2. Any mouse button starts a drag.** Right-click or middle-click on a handle starts a drag, prevents the default, and saves on release. Should only the primary button start one?
- **Q3. Leaked listeners.** If `startResize` is called while a drag is active (possible when a release happens outside the webview and neither `mouseup` nor `blur` arrives), the first drag's `window` listeners are never removed. It is functionally harmless today, but it is a leak. Should a new drag end the old one first?
- **Q4. Lost release.** No check is made that a button is still pressed during `mousemove`. If the release is never delivered, the column keeps following the pointer until the next click anywhere or a window blur. Should a move with no button pressed end the drag?
- **Q5. Moves opposite to the input.** When the Description column is already under 64 px (for example after the window was narrowed with widths saved), ArrowRight on boundary 0 narrows the Graph column, and ArrowLeft on boundary 1 moves the boundary right. Dragging does the same. A saved column under 40 px jumps to 40 on the first move in either direction. This comes from `moveBoundary`. Is it intended that one step can move against the key or pointer?
- **Q6. Saves without change.** A nudge that moves nothing (a column at its limit, or a boundary outside 0 to 3) still posts a `saveRepoState` message, and so does a drag that moves nothing. Should unchanged widths skip the save?
- **Q7. Brief reset during a drag.** If `graphColumn` or the saved widths change during a drag (for example a background refresh changes the graph's width), or a move is handled before the start-of-drag render, the container shows the starting widths again until the next pointer move. Should an in-progress drag always keep its own widths on screen?
- **Q8. Nudge during a drag** is saved and then overwritten by the drag's final save. Should keyboard input be ignored during a drag, or be folded into it?
- **Q9. Repository switch during a drag** saves the old repository's dragged widths into the newly selected repository. Should the drag save to the repository it started in, or be cancelled?
- **Q10. No selected repository.** Dragging still changes the widths on screen but stores nothing, and the dragged widths stay on screen after release. A nudge prevents the default but does nothing. Should the hook do nothing at all without a repository?
- **Q11. Unmount during a drag** leaves the starting widths in memory for that repository without saving them. If the table remounts in the same session, it uses fixed layout with those widths, but they are gone after a reload. Should an unmount save, or roll the in-memory widths back?
- **Q12. Error message.** A header row with missing cells throws `Error("Invalid commit table column")`, and from a `mousemove` listener that becomes an uncaught error on every move. Must a replacement throw the same message, or is any failure (or silently ignoring the move) acceptable, given that `CommitTable` always renders five cells?
- **Q13. Fractional widths.** Fractional pointer positions give fractional widths, which are persisted as they are (for example `42.75`). Should stored widths be rounded?
- **Q14. Keyboard.** The step is fixed at 8 px. Modifiers are ignored. `Home`/`End`, `PageUp`/`PageDown` and the legacy `"Left"`/`"Right"` key names are not handled. Right-to-left layouts are not considered (ArrowRight always moves the boundary towards larger x). Is any of this wanted?
- **Q15. Saved widths below the minimum** (for example `5.5`) are applied as they are, and only corrected (to 40) on the next move of an adjacent boundary. Measured widths, in contrast, are raised to 40 when a drag or nudge starts. Should saved widths be clamped when applied?

---

## 8. Decisions on §7 (from the project maintainer's side)

These decisions replace the "current behaviour" wherever they differ. Build to these, and replace the gap cases they contradict (for example G10 and G17) with tests of the decided behaviour.

- **Q1: a click changes nothing.** Pressing and releasing a handle without moving the pointer leaves the table as it was: no widths stored, no switch to fixed layout, no save. Widths are stored, and the table switches to fixed layout, from the first move that changes a width.
- **Q2: primary button only.** Only the primary mouse button (button 0) starts a drag. Other buttons are ignored and their default is not prevented.
- **Q3: one drag at a time.** A press while a drag is already active is ignored. No listener may outlive the drag it belongs to.
- **Q4: end a stranded drag.** A move that reports the primary button is no longer held ends the drag as though it had been released at that point.
- **Q5: never move against the input.** A drag or nudge never moves a boundary in the direction opposite to the one requested. Where the limits allow no movement in the requested direction, nothing changes.
- **Q6: save only real changes.** A drag or nudge that changes no width saves nothing and posts no message. A nudge that changes nothing is still prevented from scrolling when a repository is selected.
- **Q7: no flashes.** While a drag is active, the widths it has set stay on screen even if the component renders again.
- **Q8: nudges wait for drags.** Keyboard nudges are ignored while a drag is active.
- **Q9: a repository change ends the drag.** If the selected repository changes during a drag, the drag ends without saving anything to either repository.
- **Q10: no repository, no resizing.** With no repository selected, drags and nudges do nothing: no width change, no default prevented, nothing stored or saved.
- **Q11: unmounting discards.** Unmounting during a drag removes its listeners and leaves stored widths as they were before the drag began.
- **Q12: error text is not a contract.** A header row without the expected cells still throws an `Error`, but its exact text is up to you.
- **Q13: whole pixels.** Widths are rounded to whole pixels before they are stored or saved.
- **Q14: keep.** Nudges stay at 8 px, for ArrowLeft and ArrowRight only.
- **Q15: clamp saved widths.** Saved widths below their minimum are raised to it when applied, just as measured widths are.
