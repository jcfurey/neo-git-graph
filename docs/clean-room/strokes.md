# Clean-room specification: `src/webview/graph/strokes.ts`

This document states what the stroke module of the commit graph must do, as seen from outside it. It is written for an engineer who will build a replacement without seeing the current source. Everything here comes from the module's callers, the types and constants it depends on, the repository's tests, and results observed by running the current module.

The module takes one branch of a computed graph layout (a list of grid lines) and returns the SVG path data that draws it, split into as few pieces as the colouring allows.

---

## 0. Terms and environment

**Grid.** The layout (`computeGraphLayout` in `@/webview/graph/layout`) places every loaded commit on a grid.

- A **row** is the index of a commit in the loaded list; row 0 is the top. When the working tree has changes, row 0 is the synthetic "Uncommitted Changes" entry (hash `"*"`).
- A **lane** is a column; lane 0 is the leftmost.
- A **grid point** (`GraphPoint`) is `{ x: lane, y: row }`.
- A **line** (`GraphLine`) joins two grid points. A **branch** (`GraphBranch`) is an ordered list of lines sharing one colour index.

**Pixels.** CSS pixels in the graph's `<svg>`, measured from its top-left corner, y growing downwards.

- The **dot centre** of grid point `(x, y)` is `(laneX(x), rowY(y) + shift)`, where `shift` is the panel height for rows below the panel and 0 otherwise (§3.2). `CommitGraph` draws each commit's dot, radius 4, at exactly this position.
- A **vertical** piece has the same pixel x at both ends. A **lane change** has different pixel x at its ends.

**Panel.** When the user opens a commit's details, a panel of fixed height is inserted into the table directly beneath that commit's row. The graph receives this as a `GraphExpansion` `{ row, height }`: `row` is the row the panel sits under, `height` its height in pixels. `null` means no panel is open. In the product `height` is always `COMMIT_DETAILS_HEIGHT` (250). The panel's first table cell (the graph column) is empty, so lines drawn beside the panel are visible.

**Style.** The graph is drawn in one of two styles, chosen by the `branchwise.graphStyle` setting: `"rounded"` (default; lane changes are smooth curves) or `"angular"` (lane changes are straight segments with a corner). The module receives this as the boolean `angular`.

**Fixed numbers.** All are imported (see §2); the numbers are their current values.

| Name                    | Value | Where it lives                                    |
| ----------------------- | ----- | ------------------------------------------------- |
| `ROW_HEIGHT`            | 24    | `@/webview/constants`                             |
| `LANE_WIDTH`            | 16    | `@/webview/graph/constants` (reached via `laneX`) |
| `LANE_OFFSET`           | 8     | `@/webview/graph/constants` (reached via `laneX`) |
| `VERTEX_RADIUS`         | 4     | `@/webview/graph/constants` (caller only)         |
| `COMMIT_DETAILS_HEIGHT` | 250   | `@/webview/constants` (caller only)               |
| Rounded bend reach      | 19.2  | 0.8 × `ROW_HEIGHT` (§3.8)                         |
| Angular corner distance | 9.12  | 0.38 × `ROW_HEIGHT` (§3.8)                        |

So `laneX(x)` = 8 + 16x, and `rowY(y)` = 24y + 12.

**Environment of the observations.** Node v22.22.2, Vitest 4.1.11, repository at commit `459842e`, clean working tree. The whole Vitest `webview` project passes there (922 passed, 2 skipped). Outputs were observed by bundling the current module with esbuild into a scratch script and calling it directly.

---

## 1. Interface

### 1.1 Module and export

The module lives at `src/webview/graph/strokes.ts` and is imported as `@/webview/graph/strokes`. It has exactly one export, a named function, and no default export:

```ts
export function branchStrokes(
  branch: GraphBranch,
  angular: boolean,
  expansion: GraphExpansion | null,
  relationForLine?: (line: GraphLine) => BranchRelation
): Array<GraphStroke>;
```

- `relationForLine` may be omitted (the tests call the function with three arguments). Omitting it, or passing `undefined`, means every line has the relation `"normal"`.
- The types are declared in `@/webview/graph/types`. The module must not declare its own copies or re-export them.

### 1.2 Inputs

**`branch: GraphBranch`**

| Field    | Type               | Meaning                                                                                                                                   |
| -------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `colour` | `number`           | Colour index of the branch. It is not a CSS colour: the caller turns it into one (§3.12). The module copies it to every stroke unchanged. |
| `lines`  | `Array<GraphLine>` | The branch's lines, in the order the layout produced them. May be empty.                                                                  |

**`GraphLine`** (each element of `branch.lines`)

| Field         | Type             | Meaning                                                                                                                                                                                                                                                                                                                                                          | Read by this module?           |
| ------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `child`       | `number`         | Row of the commit the Git edge comes from. When an edge passes through several rows, each of its one-row lines carries the same `child`.                                                                                                                                                                                                                         | No (only the callback uses it) |
| `parent`      | `number \| null` | Row of the parent commit the edge leads to, or `null` when the edge has no loaded parent to end at (§3.11).                                                                                                                                                                                                                                                      | No (only the callback uses it) |
| `p1`          | `GraphPoint`     | Upper end of the line, as `{ x: lane, y: row }`.                                                                                                                                                                                                                                                                                                                 | Yes                            |
| `p2`          | `GraphPoint`     | Lower end of the line.                                                                                                                                                                                                                                                                                                                                           | Yes                            |
| `isCommitted` | `boolean`        | `false` for the lines that belong to the "Uncommitted Changes" row, `true` otherwise.                                                                                                                                                                                                                                                                            | Yes                            |
| `lockedFirst` | `boolean`        | For a lane change: `true` when the bend belongs next to the upper end (`p1`), `false` when it belongs next to the lower end (`p2`). It changes the drawing of angular lane changes (§3.8) and where the bend goes when a panel sits under the line's upper row (§3.3). It has no effect on vertical lines, or on rounded lane changes that do not cross a panel. | Yes                            |

**`angular: boolean`** — `true` for the angular style, `false` for the rounded style.

**`expansion: GraphExpansion | null`** — the open details panel, or `null`.

| Field    | Type     | Meaning                                                   |
| -------- | -------- | --------------------------------------------------------- |
| `row`    | `number` | The row the panel sits under. Rows after it move down.    |
| `height` | `number` | How far those rows move down, in pixels (250 in product). |

**`relationForLine(line)`** — gives the focus relation of one line: `"normal"`, `"direct"`, `"merged"` or `"unrelated"` (`BranchRelation`). The module passes each line of `branch.lines` to it (§3.4).

**What the layout guarantees about its lines.** Every layout produced by `computeGraphLayout` satisfies the following, and the required behaviour in §3 is defined for input of this shape:

1. Every line spans exactly one row: `p2.y = p1.y + 1`.
2. Lanes and rows are non-negative integers, and rows lie within the loaded list.
3. A line is vertical (`p1.x = p2.x`) or changes lane by any number of lanes.
4. A branch's lines mostly continue one another, each starting where the previous one ended. Lines the layout adds later for a merge into this branch can restart higher up and elsewhere (see the "criss-cross merges" fixture in Appendix A), so a branch can contain several disconnected runs.
5. Lines with `isCommitted: false` come first in a branch.

§3.13 records what the current module does outside this shape.

### 1.3 Result

An array of `GraphStroke` objects, in drawing order. Each object has exactly these four fields and no others:

| Field         | Type             | Meaning                                                                                                                 |
| ------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `path`        | `string`         | SVG path data (the `d` attribute) of this stroke, in pixels, in the grammar of §3.7.                                    |
| `colour`      | `number`         | Always `branch.colour`.                                                                                                 |
| `isCommitted` | `boolean`        | The `isCommitted` shared by every line drawn in this stroke.                                                            |
| `relation`    | `BranchRelation` | The relation shared by every line drawn in this stroke: the callback's result, or `"normal"` when there is no callback. |

The array is empty when the branch has no lines. No stroke has an empty `path`.

### 1.4 Who uses what

| User                                                  | What it uses                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/webview/components/commit/CommitGraph.tsx`       | `branchStrokes(branch, angular, expansion, relationForLine)` for every branch of the layout, in layout order, concatenating the results. It always passes all four arguments: `angular` is whether the `graphStyle` setting is `"angular"`, `expansion` comes from `CommitTable` (the open details row, height 250, or `null`), and `relationForLine` is `lineRelation(line, commits, relations)` from `@/webview/graph/focus`. It reads all four stroke fields. The result is memoised on `[layout, angular, expansion, relationForLine]`, but `CommitTable` passes a new callback function on every render, so in practice the strokes are rebuilt on every `CommitTable` render. |
| `tests/webview/graph/strokes.test.ts`                 | `branchStrokes(branch, angular, expansion)`, three arguments, both styles. Reads `path` only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `tests/webview/graph/focus.test.ts`                   | `branchStrokes(branch, false, { row: 2, height: 200 }, callback)` over a layout, and `branchStrokes(branch, true, null, callback)` over a hand-made branch. Reads `relation` only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `tests/webview/components/commit/GraphScroll.test.ts` | Indirectly, through the rendered `CommitTable`: the `stroke` attributes of all `<path>` elements must not change when the pointer moves over rows.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `tests-ext/ui/history.test.cjs` (UI harness)          | Indirectly, through the rendered webview: it reads `path[data-branch-relation]` elements (their relation and computed stroke colour) before focus, under focus, with strong dimming and with focus paused, and compares the lists element by element. It requires a `path[data-branch-relation="merged"]` whose `stroke` starts with `color-mix` when a branch is focused.                                                                                                                                                                                                                                                                                                          |
| `tests-ext/ui/benchmark.cjs`                          | Records the number of `svg path` elements (two per stroke) as a benchmark metric. No threshold.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

How `CommitGraph` draws a stroke (context only; not this module's job): each stroke becomes an SVG `<g>` holding two `<path>` elements with `d = stroke.path`. The first is a backing line (no fill, 4 px wide, the editor background at 75% opacity). The second is the visible line (no fill, 2 px wide), with `data-branch-relation = stroke.relation` and a `stroke` colour from §3.12. Groups are painted in array order, so a later stroke's backing line covers earlier strokes where they cross. The commit dots are painted after all strokes and cover the line ends.

---

## 2. Dependencies the implementation must use

| Import path                        | Names                                                                         | Purpose                                                                                                                                                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@/webview/graph/utils`            | `laneX`, `rowY`                                                               | Grid-to-pixel conversion. Lines must use the same functions as the dots so that they meet exactly. Do not recompute lane or row positions from `LANE_WIDTH`, `LANE_OFFSET` or `ROW_HEIGHT` yourself.     |
| `@/webview/constants`              | `ROW_HEIGHT`                                                                  | The row pitch. The bend sizes are fractions of it (§3.8), and a lane change next to a panel occupies exactly one row pitch of height (§3.3).                                                             |
| `@/webview/graph/types`            | `BranchRelation`, `GraphBranch`, `GraphExpansion`, `GraphLine`, `GraphStroke` | Signature and result types. They are types only, so they must be imported with `import type` (the project compiles with `verbatimModuleSyntax` and `isolatedModules`).                                   |
| `@/webview/graph/utils` (optional) | `expandOffset`                                                                | The rule for which rows the panel moves (rows strictly after `expansion.row`, by `expansion.height`). The line shift must follow exactly the same rule. Using this function is allowed but not required. |

The module must not import the colour modules (`@/webview/graph/palette`, `@/webview/graph/focus`), the webview configuration (`@/webview/lib/webview-config`), Preact, or anything that touches the DOM. It is a pure function of its arguments.

The project's TypeScript settings apply (`tsconfig.base.json` and `src/webview/tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`). `pnpm run typecheck`, `pnpm run lint` (oxlint) and `pnpm run format` (oxfmt) must pass.

---

## 3. Behaviour

### 3.1 Summary

The rules below are stated in terms of **pieces**, the drawn shapes of individual lines, only to make them precise. They constrain the output and say nothing about how it is computed.

- Each line is drawn as one or two pieces, straight or lane-changing, placed in pixels with the panel allowed for (§3.2, §3.3).
- Adjacent pieces on one straight vertical line are drawn as one segment (§3.5).
- A branch is divided into strokes only where the committed state or the relation changes (§3.6). Each stroke's path follows a fixed grammar and fixed shapes (§3.7, §3.8).

### 3.2 Pixel positions and the panel shift

A grid point `(x, y)` is at pixel `(laneX(x), rowY(y))` when no panel is open, which is (8 + 16x, 24y + 12).

With a panel `{ row: R, height: H }`, a point in row `y` moves down by `H` when `y > R` (strictly after the panel's row), and does not move when `y ≤ R`. This is the same rule `expandOffset` applies to the dots, so every line end that sits on a commit lands on that commit's dot centre. The rule holds for any `R`: with `R = -1` every row moves, and with `R` at or after the last row none does (§3.13).

### 3.3 Pieces

For a line from `p1` to `p2`, let `X1 = laneX(p1.x)`, `X2 = laneX(p2.x)`, `Y1 = rowY(p1.y)` and `Y2 = rowY(p2.y)`, before any panel shift.

**No panel, or the line lies wholly on one side of it.**

- No panel (`expansion` is `null`), or the line ends at or above the panel row (`p2.y ≤ R`): one piece from `(X1, Y1)` to `(X2, Y2)`.
- The line starts after the panel row (`p1.y > R`): one piece from `(X1, Y1 + H)` to `(X2, Y2 + H)`.

**The line crosses the panel** (`p1.y ≤ R < p2.y`; for one-row lines, `p1.y = R`). The upper end does not move and the lower end moves down by `H`. The extra `H` pixels must be covered by a straight vertical section. A lane change always occupies exactly one row pitch (24 px) of height, and it is never drawn taller to cover the panel.

| Line kind                         | Pieces, top first                                                                                                                                   |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vertical (`X1 = X2`)              | One vertical piece from `(X1, Y1)` to `(X1, Y2 + H)`.                                                                                               |
| Lane change, `lockedFirst: true`  | 1. A lane change from `(X1, Y1)` to `(X2, Y2)`, the same as with no panel. 2. A vertical piece in the lower lane from `(X2, Y2)` to `(X2, Y2 + H)`. |
| Lane change, `lockedFirst: false` | 1. A vertical piece in the upper lane from `(X1, Y1)` to `(X1, Y1 + H)`. 2. A lane change from `(X1, Y1 + H)` to `(X2, Y2 + H)`.                    |

Here is where that puts the bend. The panel's band of the table runs from pixel 24(R + 1) to 24(R + 1) + H. With `lockedFirst: true`, the bend runs from the expanded commit's dot to 12 px into that band. With `lockedFirst: false`, it runs from 12 px above the bottom of the band to the next commit's dot.

Every piece keeps the `isCommitted` and `lockedFirst` of its line and the relation of its line (§3.4). Pieces are ordered by line order, and the two pieces of one line are ordered top first, as in the table.

### 3.4 Relations

- With a callback, each line's relation is the callback's return value for that line. Both pieces of a split line share it.
- Without one, every line is `"normal"`.
- The value is copied to the stroke as returned. The module does not check it against the four allowed strings. A callback that returned `"whatever"` would produce a stroke with `relation: "whatever"`.
- The callback must receive the line objects of `branch.lines` themselves, not copies. The current module calls it exactly once per line, in list order, including for lines that are later joined. Nothing in the product depends on the count, but a replacement should not call it more than once per line.

### 3.5 Joining vertical runs

Two pieces that are next to each other in piece order are drawn as a single straight segment when all of these hold:

- both are vertical and in the same lane (same pixel x),
- the first ends at exactly the pixel where the second starts,
- they have the same `isCommitted` and the same relation.

`lockedFirst` does not matter. Joining is transitive, so a lane with ten consecutive one-row lines produces one `L` command. A joined segment passes straight through the commit dots along it without ending at them. The tests allow this.

No other joining takes place. A vertical piece followed by a lane change stays as two commands, even when they meet.

### 3.6 Grouping pieces into strokes

After joining, the pieces are cut into **maximal runs of consecutive pieces that share both `isCommitted` and relation**. Each run becomes one stroke, and the strokes appear in run order. Consequences:

- A branch whose pieces all share these two values gives exactly one stroke, even when the branch has several disconnected parts.
- A branch that alternates, for example relation A, B, A along its pieces, gives three strokes. Runs with the same values are not merged across a different run.
- When a run ends where the next one starts, as when a relation changes at a commit, the next stroke begins with a move to that shared point. Adjacent strokes therefore meet end to end.

### 3.7 Path grammar

Each stroke's `path` is a sequence of absolute SVG commands with no whitespace between commands:

- `M` _x_`,`_y_ — move to a point.
- `L` _x_`,`_y_ — straight segment to a point.
- `C` _x_`,`_y_` `_x_`,`_y_` `_x_`,`_y_ — cubic Bézier: two control points, then the end point, separated by single spaces.

Rules:

1. A path starts with `M` at the start of the run's first piece.
2. After that, each piece is written as the commands of §3.8. When a piece does not start at exactly the end of the previous piece in the same stroke, an `M` to its start comes first. When it does, no `M` is written.
3. **Number format.** Every x is written as a whole number, and every y with exactly one digit after the decimal point. Each must equal what JavaScript's `Number.prototype.toFixed(0)` (for x) and `toFixed(1)` (for y) gives for the exact value, so 12 becomes `12.0`, 26.88 becomes `26.9` and 21.12 becomes `21.1`. This includes the coordinates of `M` commands and of control points.
4. Only `M`, `L` and `C` are used, always upper case (absolute). No `H`, `V`, `Q`, `S`, `A` or `Z`, and no relative commands. The existing tests parse paths with a pattern that only recognises `M`, `L` and `C`, with numbers separated by commas or spaces.
5. There is no leading or trailing whitespace.

### 3.8 Drawing one piece

Let the piece run from `(x1, y1)` to `(x2, y2)` in pixels, after any panel shift.

**Vertical piece** (`x1 = x2`), in both styles: `L`x2`,`y2.

**Lane change, rounded style** (`angular` false): one cubic Bézier, whatever the value of `lockedFirst`.

- First control point directly below the start: `(x1, y1 + 19.2)`.
- Second control point directly above the end: `(x2, y2 − 19.2)`.
- End point `(x2, y2)`.

This is written `C`x1`,`(y1+19.2)` `x2`,`(y2−19.2)` `x2`,`y2. The curve leaves the start heading straight down and arrives at the end heading straight down, forming an S. For a one-row line the control points are 4.8 px from the opposite end's height, so they cross vertically. The curve's height is 24 px wherever it is drawn, including next to a panel. The reach of the control points is 0.8 × `ROW_HEIGHT`, so a one-row lane change starting at row y, with no panel, is `C`x1`,`(24y+31.2)` `x2`,`(24y+16.8)` `x2`,`(24y+36.0)`.

**Lane change, angular style** (`angular` true): two straight segments. The corner distance is c = 0.38 × `ROW_HEIGHT` = 9.12 px.

- `lockedFirst: true` — a diagonal from the start to the point in the end lane c pixels above the end, then straight down to the end: `L`x2`,`(y2 − 9.12)`L`x2`,`y2.
- `lockedFirst: false` — straight down c pixels in the start lane, then a diagonal to the end: `L`x1`,`(y1 + 9.12)`L`x2`,`y2.

For a one-row line, the diagonal covers 14.88 px of height and the straight stub 9.12 px, written as 14.9 and 9.1 after rounding.

In both styles the horizontal distance is the pixel distance between the lanes, whatever the number of lanes crossed.

### 3.9 Where strokes start and end relative to the dots

Where a commit sits at one of a line's two grid points, that end of the line, after the panel shift, is exactly the commit's dot centre. The joint between the two pieces of a line split by the panel (§3.3) is not at a dot. The dots (radius 4) are painted on top, so a line appears to leave the dot's rim.

- A line from a commit to its parent in the next row runs from dot centre to dot centre.
- A line that passes through a row where its lane holds no dot (a long edge) passes through the middle of that row, `rowY(y)` (plus the shift). Such lines are made of one-row lines, which are usually joined into one straight segment.
- A line to a parent that is not loaded ends at the middle of the last loaded row, in its lane, where no dot is drawn (§3.11).
- For layouts from `computeGraphLayout`, every `M` is at a dot centre or on a segment drawn for the same layout, possibly by another branch's strokes. The test "keeps %s connected with expanded details" checks this for every stroke of every fixture.

### 3.10 The uncommitted-changes row

The module has no special case for the uncommitted row. It relies on each line's `isCommitted` flag.

- The layout marks the lines from the uncommitted row's dot (row 0, lane 0) down to the dot of the commit HEAD points at as `isCommitted: false`. They may span several rows when other branch tips sit between them.
- Those lines always form their own stroke or strokes with `isCommitted: false`. The committed remainder of the same branch starts a new stroke at the HEAD commit's dot, as §3.6 requires.
- Their relation comes from the callback like any other line. In the product it is always `"normal"`, because `commitRelations` gives the `"*"` row `"normal"`.
- `CommitGraph` paints any stroke with `isCommitted: false` in `UNCOMMITTED_COLOUR` (`#808080`), whatever its relation or colour index.
- When the panel belongs to the uncommitted row (`R = 0`), the uncommitted stroke crosses the panel like any other line (see §4.5).

### 3.11 Lines to parents that are not loaded

The module draws these exactly like any other line: same style, same colour index, a solid line. It does not look at `parent`. What such lines look like is decided by the layout:

- A commit none of whose parents is loaded, and which is not on the last row, gets a line straight down its lane to the middle of the last loaded row (`parent: null` on each of those one-row lines). A root commit with no parents at all, when it is not on the last row, gets the same line (see "shallow roots" in Appendix A and Q7).
- A commit on the last row with an unloaded parent gets no line at all.
- A merge whose first parent is not loaded but whose second parent is gets only the line to the loaded parent, drawn as the main line (see "parents outside the page").

### 3.12 Colour, focus, selection and hover

The module does not choose colours. It returns the branch's colour index, `isCommitted` and `relation`, and `CommitGraph` turns them into a CSS colour. For context, with `base` = `branchColour(index)` from `@/webview/graph/palette` (the configured palette, wrapping; with an empty palette, `var(--vscode-focusBorder)`) and `gray` = `var(--vscode-descriptionForeground, #808080)`:

| Stroke                                      | Subtle dimming (default)             | Strong dimming                                                                                |
| ------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------- |
| `isCommitted: false`                        | `#808080`                            | `#808080`                                                                                     |
| `"normal"` or `"direct"`                    | `base`                               | `base`                                                                                        |
| `"merged"` (merged history not kept bright) | `color-mix(in srgb, base 40%, gray)` | `color-mix(in srgb, base 25%, color-mix(in srgb, gray 45%, var(--vscode-editor-background)))` |
| `"merged"` with "keep merged bright" on     | `base`                               | `base`                                                                                        |
| `"unrelated"`                               | `gray`                               | `color-mix(in srgb, gray 45%, var(--vscode-editor-background))`                               |

So a stroke is dimmed only through the relation the caller's callback gives. When no branch is focused, every commit is `"normal"` and nothing is dimmed. Under focus, `lineRelation` gives each line the relation of its child commit, except that an edge from a `"direct"` commit to a parent other than its first parent becomes `"merged"`. Selection, hover and "revealed" commits change only the dots, never the strokes. `GraphScroll.test.ts` checks that path colours do not change on hover. Nothing in this module depends on selection or hover.

### 3.13 Edge cases and inputs outside the layout's shape

"Required" rows must hold. "Current" rows record what the current module does for input the layout never produces. A replacement may match them, and §7 asks whether it should.

| Case                                                                                              | Behaviour                                                                                                                                                                                                                                                                                                                                     | Status                           |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Branch with no lines                                                                              | `[]`, with or without a panel, in either style.                                                                                                                                                                                                                                                                                               | Required                         |
| Panel row after the last row, e.g. `R = 99`                                                       | Nothing moves; same as no panel.                                                                                                                                                                                                                                                                                                              | Required                         |
| Panel on the last row                                                                             | Nothing moves (no line ends below it).                                                                                                                                                                                                                                                                                                        | Required                         |
| Panel row −1                                                                                      | Every line moves down by `H`, matching `expandOffset`, which moves every dot. `graphHeight` does not grow for such a row, so the bottom `H` px fall outside the `<svg>`. See Q3.                                                                                                                                                              | Required (consistency with dots) |
| Panel height 0                                                                                    | Same geometry as no panel. A crossing lane change still yields a zero-length vertical piece. When that piece meets a vertical piece in the same lane with the same committed state and relation, it joins it, and the output is byte-identical to the no-panel output. Otherwise a zero-length segment remains in the path (see §4.8 and Q5). | Current                          |
| Fractional panel height, e.g. 12.345                                                              | Shifted y values are rounded to one decimal on output (`…L24,48.3`).                                                                                                                                                                                                                                                                          | Required (format rule)           |
| Negative panel height                                                                             | Points below the panel move up by the amount. Nothing is clamped.                                                                                                                                                                                                                                                                             | Current                          |
| `expansion` is `undefined` (forbidden by the type)                                                | Throws `TypeError` ("Cannot read properties of undefined (reading 'row')"). See Q2.                                                                                                                                                                                                                                                           | Current                          |
| Zero-length line (`p1 = p2`)                                                                      | Drawn as a vertical piece: `M8,36.0L8,36.0`. After a vertical piece that ends at the same point, it is joined away.                                                                                                                                                                                                                           | Current                          |
| Vertical line spanning several rows                                                               | One piece; with a panel it follows §3.3 (`(0,0)→(0,3)`, no panel: `M8,12.0L8,84.0`).                                                                                                                                                                                                                                                          | Current                          |
| Lane change spanning several rows, no panel                                                       | Drawn with the same formulas: `(0,0)→(1,3)` rounded gives `M8,12.0C8,31.2 24,64.8 24,84.0`; angular with `lockedFirst: true` gives `M8,12.0L24,74.9L24,84.0`.                                                                                                                                                                                 | Current                          |
| Lane change spanning several rows, crossing a panel (`H` = 250, line `(0,0)→(1,3)`, `R` = 0 or 1) | `lockedFirst: true`: `M8,12.0C8,31.2 24,64.8 24,84.0M24,36.0L24,334.0`. `lockedFirst: false`: `M8,12.0L8,310.0M8,262.0C8,281.2 24,314.8 24,334.0`. The two pieces overlap and double back. See Q4.                                                                                                                                            | Current                          |
| Line going upwards (`p2.y < p1.y`)                                                                | Drawn between the two points with the same formulas (`(0,2)→(0,1)`: `M8,60.0L8,36.0`). With a panel, it is treated as lying above the panel whenever `p2.y ≤ R`.                                                                                                                                                                              | Current                          |
| Line within one row (`p1.y = p2.y`, lanes differ)                                                 | Drawn with the same formulas, giving a loop-like curve (`(0,1)→(2,1)` rounded: `M8,36.0C8,55.2 40,16.8 40,36.0`).                                                                                                                                                                                                                             | Current                          |
| Fractional lane, e.g. `x = 1/32` (pixel 8.5)                                                      | x is rounded on output (`M9,12.0…`). Whether the next piece needs an `M` is decided on the unrounded values.                                                                                                                                                                                                                                  | Current                          |
| Negative lane                                                                                     | Passed through (`M-8,12.0L-8,36.0`).                                                                                                                                                                                                                                                                                                          | Current                          |
| `NaN` coordinates                                                                                 | Written as `NaN` (`MNaN,12.0CNaN,31.2 NaN,16.8 NaN,36.0`). Not validated.                                                                                                                                                                                                                                                                     | Current                          |
| Any `colour` value, e.g. −3                                                                       | Copied unchanged.                                                                                                                                                                                                                                                                                                                             | Required                         |
| Very long lists (row 100000)                                                                      | Plain decimal output (`M8,2399988.0L8,2400012.0`), no exponent notation.                                                                                                                                                                                                                                                                      | Required                         |

---

## 4. Concrete examples

Notation: `(x1,y1)→(x2,y2)` is a line in grid units. `LF` marks `lockedFirst: true`; without it, `lockedFirst` is `false`. `U` marks `isCommitted: false`; without it, the line is committed. Unless a callback is given, relations are `"normal"`. In hand-made lines, `child` is `y1` and `parent` is `y2`. The colour index is 0 unless stated. All outputs below were observed on the current module, and every "Result" is the complete `path` string.

### 4.1 Single lines, no panel

| Line             | Rounded                              | Angular                      |
| ---------------- | ------------------------------------ | ---------------------------- |
| `(0,0)→(0,1)`    | `M8,12.0L8,36.0`                     | `M8,12.0L8,36.0`             |
| `(0,0)→(1,1) LF` | `M8,12.0C8,31.2 24,16.8 24,36.0`     | `M8,12.0L24,26.9L24,36.0`    |
| `(0,0)→(1,1)`    | `M8,12.0C8,31.2 24,16.8 24,36.0`     | `M8,12.0L8,21.1L24,36.0`     |
| `(1,0)→(0,1)`    | `M24,12.0C24,31.2 8,16.8 8,36.0`     | `M24,12.0L24,21.1L8,36.0`    |
| `(1,0)→(0,1) LF` | `M24,12.0C24,31.2 8,16.8 8,36.0`     | `M24,12.0L8,26.9L8,36.0`     |
| `(0,3)→(2,4) LF` | `M8,84.0C8,103.2 40,88.8 40,108.0`   | `M8,84.0L40,98.9L40,108.0`   |
| `(2,5)→(0,6)`    | `M40,132.0C40,151.2 8,136.8 8,156.0` | `M40,132.0L40,141.1L8,156.0` |

Each gives one stroke `{ path, colour: 0, isCommitted: true, relation: "normal" }`.

### 4.2 Joining and gaps (rounded unless stated)

| Branch lines                                                                 | Result (one stroke)                                  | Rule shown                                                     |
| ---------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------- |
| `(0,0)→(0,1)`, `(0,1)→(0,2)`, `(0,2)→(0,3)`                                  | `M8,12.0L8,84.0`                                     | Vertical run joined (§3.5)                                     |
| `(0,0)→(0,1)`, `(0,1)→(0,2) LF`, `(0,2)→(0,3)` (angular)                     | `M8,12.0L8,84.0`                                     | `lockedFirst` ignored for joining                              |
| `(0,0)→(0,1)`, `(0,1)→(0,2)`, `(0,2)→(1,3) LF`, `(1,3)→(1,4)`, `(1,4)→(1,5)` | `M8,12.0L8,60.0C8,79.2 24,64.8 24,84.0L24,132.0`     | Joins on both sides of a lane change; no `M` where pieces meet |
| `(0,0)→(0,1)`, `(0,2)→(0,3)`                                                 | `M8,12.0L8,36.0M8,60.0L8,84.0`                       | Gap in the same lane: `M` inside one stroke                    |
| `(0,0)→(0,1)`, `(1,1)→(1,2)`                                                 | `M8,12.0L8,36.0M24,36.0L24,60.0`                     | Jump to another lane: `M` inside one stroke                    |
| `(0,0)→(0,1)`, `(0,1)→(1,2) LF` with colour 7                                | `M8,12.0L8,36.0C8,55.2 24,40.8 24,60.0`, `colour: 7` | Colour copied; no `M` at the join                              |

### 4.3 Splitting into strokes

1. Colour 5, lines `(0,0)→(0,1)`, `(0,1)→(0,2)`, `(0,2)→(0,3)`, callback: `"direct"` for the line with `child` 1, `"unrelated"` otherwise. Result:
   `[{ path: "M8,12.0L8,36.0", colour: 5, isCommitted: true, relation: "unrelated" }, { path: "M8,36.0L8,60.0", colour: 5, isCommitted: true, relation: "direct" }, { path: "M8,60.0L8,84.0", colour: 5, isCommitted: true, relation: "unrelated" }]`
2. Colour 5, the same three lines with the middle one `U`, no callback: three strokes with paths `M8,12.0L8,36.0`, `M8,36.0L8,60.0`, `M8,60.0L8,84.0` and `isCommitted` `true`, `false`, `true`, all `"normal"`.
3. Lines `(0,0)→(0,1) U` and `(0,1)→(0,2)`, callback `"normal"` for `child` 0 and `"direct"` otherwise: `[{ "M8,12.0L8,36.0", isCommitted: false, "normal" }, { "M8,36.0L8,60.0", isCommitted: true, "direct" }]`.
4. Angular, lines `(0,0)→(1,1) LF` and `(1,1)→(1,2)`, callback `"merged"` for `child` 0 and `"direct"` otherwise: `M8,12.0L24,26.9L24,36.0` (`"merged"`), then `M24,36.0L24,60.0` (`"direct"`).
5. From `focus.test.ts` ("splits a reused lane…"): angular, no panel, lines `(0,0)→(0,1) LF` (`child` 0) and `(0,1)→(0,2) LF` (`child` 1), callback `"unrelated"` for `child` 0 and `"direct"` otherwise. Result: `M8,12.0L8,36.0` (`"unrelated"`), then `M8,36.0L8,60.0` (`"direct"`).

### 4.4 With a panel (height 250)

Single lines:

| Line and panel row                 | Rounded                                      | Angular                              |
| ---------------------------------- | -------------------------------------------- | ------------------------------------ |
| `(0,2)→(0,3)`, row 0 (below)       | `M8,310.0L8,334.0`                           | same                                 |
| `(0,4)→(1,5) LF`, row 2 (below)    | `M8,358.0C8,377.2 24,362.8 24,382.0`         | `M8,358.0L24,372.9L24,382.0`         |
| `(0,0)→(1,1) LF`, row 0 (crossing) | `M8,12.0C8,31.2 24,16.8 24,36.0L24,286.0`    | `M8,12.0L24,26.9L24,36.0L24,286.0`   |
| `(1,0)→(0,1)`, row 0 (crossing)    | `M24,12.0L24,262.0C24,281.2 8,266.8 8,286.0` | `M24,12.0L24,262.0L24,271.1L8,286.0` |

The last two rows are the inputs of `strokes.test.ts` "keeps lane-change corners outside details" (there with colour 2). The test requires the path to start at (8,12) or (24,12) and end at (24,286) or (8,286), with exactly one segment that changes x, spanning at most 24 px of height, and every `C` spanning at most 24 px of height.

Three-line branch `(0,0)→(0,1)`, `(0,1)→(0,2)`, `(0,2)→(0,3)` (all vertical):

| Panel row | Result             |
| --------- | ------------------ |
| none      | `M8,12.0L8,84.0`   |
| −1        | `M8,262.0L8,334.0` |
| 0, 1 or 2 | `M8,12.0L8,334.0`  |
| 3, or 5   | `M8,12.0L8,84.0`   |

Branch `(0,0)→(0,1)`, `(0,1)→(1,2)` [LF as stated], `(1,2)→(1,3)`:

| `lockedFirst` of the middle line | Panel row | Rounded                                              | Angular                                      |
| -------------------------------- | --------- | ---------------------------------------------------- | -------------------------------------------- |
| true                             | 0         | `M8,12.0L8,286.0C8,305.2 24,290.8 24,310.0L24,334.0` | `M8,12.0L8,286.0L24,300.9L24,310.0L24,334.0` |
| true                             | 1         | `M8,12.0L8,36.0C8,55.2 24,40.8 24,60.0L24,334.0`     | `M8,12.0L8,36.0L24,50.9L24,60.0L24,334.0`    |
| true                             | 2         | `M8,12.0L8,36.0C8,55.2 24,40.8 24,60.0L24,334.0`     | `M8,12.0L8,36.0L24,50.9L24,60.0L24,334.0`    |
| true                             | 3         | `M8,12.0L8,36.0C8,55.2 24,40.8 24,60.0L24,84.0`      | `M8,12.0L8,36.0L24,50.9L24,60.0L24,84.0`     |
| false                            | 0         | `M8,12.0L8,286.0C8,305.2 24,290.8 24,310.0L24,334.0` | `M8,12.0L8,286.0L8,295.1L24,310.0L24,334.0`  |
| false                            | 1         | `M8,12.0L8,286.0C8,305.2 24,290.8 24,310.0L24,334.0` | `M8,12.0L8,286.0L8,295.1L24,310.0L24,334.0`  |
| false                            | 2         | `M8,12.0L8,36.0C8,55.2 24,40.8 24,60.0L24,334.0`     | `M8,12.0L8,36.0L8,45.1L24,60.0L24,334.0`     |
| false                            | 3         | `M8,12.0L8,36.0C8,55.2 24,40.8 24,60.0L24,84.0`      | `M8,12.0L8,36.0L8,45.1L24,60.0L24,84.0`      |

Mirror image, branch `(1,0)→(1,1)`, `(1,1)→(0,2)`, `(0,2)→(0,3)`, panel row 1, rounded: with `LF` on the middle line `M24,12.0L24,36.0C24,55.2 8,40.8 8,60.0L8,334.0`; without it `M24,12.0L24,286.0C24,305.2 8,290.8 8,310.0L8,334.0`.

### 4.5 The uncommitted-changes row (layouts from `computeGraphLayout`)

Commit lists are written `hash → parents`.

1. `* → c1`, `c1 → c2`, `c2 → c3`, `c3` (HEAD is `c1`). One branch, lines `(0,0)→(0,1) U`, `(0,1)→(0,2)`, `(0,2)→(0,3)`.
   - No panel, either style: `[{ path: "M8,12.0L8,36.0", colour: 0, isCommitted: false, relation: "normal" }, { path: "M8,36.0L8,84.0", colour: 0, isCommitted: true, relation: "normal" }]`.
   - Panel row 0: `M8,12.0L8,286.0` (uncommitted), then `M8,286.0L8,334.0` (committed).
2. `* → c2`, `c1 → c2`, `c2 → c3`, `c3` (HEAD `c2`, another tip `c1` between). Branch 0 has lines `(0,0)→(0,1) U`, `(0,1)→(0,2) U`, `(0,2)→(0,3)`. Branch 1 (colour 1) has `(1,1)→(0,2)`.
   - No panel, rounded: branch 0 gives `M8,12.0L8,60.0` (uncommitted) and `M8,60.0L8,84.0`. Branch 1 gives `M24,36.0C24,55.2 8,40.8 8,60.0`.
   - Panel row 0, rounded: `M8,12.0L8,310.0` (uncommitted) and `M8,310.0L8,334.0`; branch 1 `M24,286.0C24,305.2 8,290.8 8,310.0`.
3. `* → c3`, `c1 → c2`, `c2 → c3`, `c3`: branch 0 is entirely uncommitted, `M8,12.0L8,84.0`. Branch 1 is `M24,36.0L24,60.0C24,79.2 8,64.8 8,84.0` (angular: `M24,36.0L24,60.0L24,69.1L8,84.0`).

### 4.6 Lines to parents that are not loaded

- "parents outside the page" (`merge → outside-main, topic`; `other → outside-other`; `topic → outside-topic`). Branch 1 is the single line `(1,1)→(1,2)` with `parent: null`, drawn `M24,36.0L24,60.0`: from `other`'s dot to the middle of the last row. With a panel under row 1 it is `M24,36.0L24,310.0`; under row 0 it is `M24,286.0L24,310.0`.
- "shallow roots" (`shallow` has no parents and is on row 2 of 4). Branch 1 ends with `(1,2)→(1,3)`, `parent: null`, and is drawn `M8,12.0C8,31.2 24,16.8 24,36.0L24,84.0`. The segment from 60 to 84 runs from `shallow`'s dot to the middle of row 3, where lane 1 has no dot.

### 4.7 The fixture from `focus.test.ts`

Commits `other → base`, `merge → main, topic`, `topic → base`, `main → base`, `base`, HEAD `merge`. Focus `{ direct: [merge, main, base], merged: [topic] }`, and the callback is `lineRelation(line, commits, commitRelations(commits, focus))`.

| Branch (colour) | Lines                                                      | Relation    | No panel, rounded                                                  | Panel row 2, height 200, rounded                                     |
| --------------- | ---------------------------------------------------------- | ----------- | ------------------------------------------------------------------ | -------------------------------------------------------------------- |
| 0 (0)           | `(0,0)→(0,1)`, `(0,1)→(0,2)`, `(0,2)→(0,3)`, `(0,3)→(0,4)` | `unrelated` | `M8,12.0L8,108.0`                                                  | `M8,12.0L8,308.0`                                                    |
| 1 (1)           | `(1,1)→(1,2)`, `(1,2)→(1,3)`, `(1,3)→(0,4)`                | `direct`    | `M24,36.0L24,84.0C24,103.2 8,88.8 8,108.0`                         | `M24,36.0L24,284.0C24,303.2 8,288.8 8,308.0`                         |
| 2 (2)           | `(1,1)→(2,2) LF`, `(2,2)→(2,3)`, `(2,3)→(0,4)`             | `merged`    | `M24,36.0C24,55.2 40,40.8 40,60.0L40,84.0C40,103.2 8,88.8 8,108.0` | `M24,36.0C24,55.2 40,40.8 40,60.0L40,284.0C40,303.2 8,288.8 8,308.0` |

Angular, panel row 2: `M8,12.0L8,308.0`; `M24,36.0L24,284.0L24,293.1L8,308.0`; `M24,36.0L40,50.9L40,60.0L40,284.0L40,293.1L8,308.0`. The test requires the set of stroke relations to be exactly {`direct`, `merged`, `unrelated`}.

A second focus example, with a merge line inside the parent's branch: history "merge into a parent another branch reached first", HEAD `tip`, focus `{ direct: [tip, merge, main, base], merged: [side] }`, callback `lineRelation`.

| Panel      | Style   | Branch 0 strokes (relation: path)                                                                               | Branch 1 strokes                                                             |
| ---------- | ------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| none       | rounded | `direct`: `M8,12.0L8,108.0`; `merged`: `M8,36.0C8,55.2 40,40.8 40,60.0L40,84.0C40,103.2 8,88.8 8,108.0`         | `merged`: `M8,12.0C8,31.2 24,16.8 24,36.0L24,84.0C24,103.2 8,88.8 8,108.0`   |
| none       | angular | `direct`: `M8,12.0L8,108.0`; `merged`: `M8,36.0L40,50.9L40,60.0L40,84.0L8,98.9L8,108.0`                         | `merged`: `M8,12.0L24,26.9L24,36.0L24,84.0L24,93.1L8,108.0`                  |
| row 3, 250 | rounded | `direct`: `M8,12.0L8,358.0`; `merged`: `M8,36.0C8,55.2 40,40.8 40,60.0L40,84.0C40,103.2 8,88.8 8,108.0L8,358.0` | `merged`: `M8,12.0C8,31.2 24,16.8 24,36.0L24,334.0C24,353.2 8,338.8 8,358.0` |
| row 3, 250 | angular | `direct`: `M8,12.0L8,358.0`; `merged`: `M8,36.0L40,50.9L40,60.0L40,84.0L8,98.9L8,108.0L8,358.0`                 | `merged`: `M8,12.0L24,26.9L24,36.0L24,334.0L24,343.1L8,358.0`                |

The branch 0 strokes split at the relation change even though the merge line was added to the branch after the main line. With the panel under row 3, the merged stroke overlaps the direct one (Q9).

### 4.8 Edge cases

- Empty branch, any style, any panel: `[]`.
- Lone crossing lane change `(0,0)→(1,1)`, panel row 0, height 0. With `LF`: rounded `M8,12.0C8,31.2 24,16.8 24,36.0L24,36.0`, angular `M8,12.0L24,26.9L24,36.0L24,36.0`. Without `LF`: rounded `M8,12.0L8,12.0C8,31.2 24,16.8 24,36.0`, angular `M8,12.0L8,12.0L8,21.1L24,36.0`.
- The same with height −10. With `LF`: `M8,12.0C8,31.2 24,16.8 24,36.0L24,26.0`. Without: `M8,12.0L8,2.0C8,21.2 24,6.8 24,26.0`.
- The same with height 12.345, `LF`, rounded: `M8,12.0C8,31.2 24,16.8 24,36.0L24,48.3`.
- The branch of §4.4 (middle line with or without `LF`), panel row 1, height 0: identical to the no-panel output, `M8,12.0L8,36.0C8,55.2 24,40.8 24,60.0L24,84.0` (angular: `…L24,50.9L24,60.0L24,84.0` with `LF`, `…L8,45.1L24,60.0L24,84.0` without).

### 4.9 All fixtures of `tests/webview/graph/fixtures.ts`

Appendix A gives, for each of the six histories, the layout's lines and the exact paths for no panel and for a 250 px panel under every row, in both styles. These are the exact conditions of the test "keeps %s connected with expanded details". In every one of those cases each branch produces exactly one stroke, committed and `"normal"`.

---

## 5. Non-functional requirements

1. **Pure and non-mutating.** The function must not modify `branch`, its `lines`, their points, or `expansion`. Both `strokes.test.ts` and `focus.test.ts` check that the layout deep-equals a `structuredClone` taken before drawing. The layout object is memoised and shared with the dot rendering, so any mutation would corrupt the dots.
2. **Deterministic.** The same inputs must always give the same strokes, in the same order and number. The UI harness compares path lists index by index across re-renders: before focus, under focus, with strong dimming and with focus paused. Nothing may depend on time, randomness, global state, configuration or the DOM.
3. **Fresh result.** Each call returns a new array of new objects. Callers may keep results from earlier calls, and nothing is cached between calls inside the module.
4. **Synchronous, no side effects** other than calling `relationForLine`. It must not log, and it must not throw for any input of the shape in §1.2 with `expansion` either `null` or `{ row, height }` (integer `row`, finite `height`).
5. **Performance.** Running time and memory must grow linearly with the number of lines.
   - The current module grows quadratically with the length of a branch's joined vertical runs. For all branches of a history, measured on the scratch bundle: a 5,000-commit linear history took about 37 ms, 10,000 about 150 ms, 20,000 about 560 ms, and 50,000 about 3.3–6.2 s. A branchy 50,000-commit history (a merge every three commits) took about 3.4 s. At the default page size (300 commits) it takes under 1 ms.
   - Because `CommitTable` rebuilds the strokes on every render (§1.4), this cost is paid on every selection change, panel toggle or focus change once many commits are loaded.
   - Target: all strokes for a 50,000-commit history in well under 100 ms on a developer machine. §6.2 G11 gives a test.
6. **Few strokes.** Each stroke costs two SVG `<path>` elements in the DOM. Splitting a branch more often than §3.6 requires is not allowed, and neither is extra `M`/`L` commands beyond §3.7 and §3.5, because they change the exact output.
7. **Output stability.** The path strings are compared byte for byte by the tests proposed in §6.2 and reproduced in Appendix A. The number format of §3.7 is part of the contract.
8. **Provenance.** The replacement must be written independently. `pnpm run check:provenance` currently attributes 82 lines of this file to the upstream project. It should attribute none after the rewrite.

---

## 6. Test coverage

### 6.1 What the existing tests check

| Test                                                                                                                                                        | What it pins                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/webview/graph/strokes.test.ts`, "keeps %s connected with expanded details" (both styles; six histories; no panel, and a 250 px panel under each row) | Paths contain only `M`/`L`/`C` with finite numbers. Every coordinate lies within `[0, graphWidth(layout)] × [0, graphHeight(layout, expansion)]`. Every `M` is at a dot centre (computed with `laneX`, `rowY`, `expandOffset`) or on a drawn segment: at a segment's end, or strictly inside a vertical `L`. Every commit that has a child has a drawn segment ending at its dot, or a vertical `L` passing through it. The layout is unchanged afterwards. It does not check exact coordinates, curve shapes, stroke count, `colour`, `isCommitted` or `relation`. |
| `tests/webview/graph/strokes.test.ts`, "keeps lane-change corners outside details (lockedFirst=%s)" (both styles)                                           | For one crossing lane change under a panel at row 0: start at (8,12) or (24,12), end at (24,286) or (8,286). Exactly one segment changes x, and it spans at most 24 px vertically. Every `C` (control and end points) spans at most 24 px vertically. Only `strokes[0]` is examined.                                                                                                                                                                                                                                                                                |
| `tests/webview/graph/focus.test.ts`, "keeps incoming unrelated edges gray…"                                                                                 | For the focus fixture, rounded style, panel `{ row: 2, height: 200 }`, with the `lineRelation` callback: the set of stroke relations is exactly {`direct`, `merged`, `unrelated`}, and the layout is unchanged.                                                                                                                                                                                                                                                                                                                                                     |
| `tests/webview/graph/focus.test.ts`, "splits a reused lane at emphasis changes…"                                                                            | Two vertical lines in one lane with different callback relations give strokes whose relations are `["unrelated", "direct"]`, in that order (angular, no panel).                                                                                                                                                                                                                                                                                                                                                                                                     |
| `tests/webview/components/commit/GraphScroll.test.ts`, "emphasizes only the hovered graph dot…"                                                             | Indirect: rendered path `stroke` attributes are unchanged by hover and by selection.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `tests-ext/ui/history.test.cjs`, branch focus scenario                                                                                                      | Indirect, end to end in VS Code: a merged stroke is drawn with a `color-mix` colour under focus, unrelated strokes change colour with strong dimming, and the paths are identical when focus is paused and when there is no focus.                                                                                                                                                                                                                                                                                                                                  |

### 6.2 Gaps, with ready-to-add cases

Every expected value below was checked against the current module, and all pass except G11 (performance). Use the notation of §4.

- **G1. Exact geometry of single lines, both styles.** Not tested today: any correct-looking curve passes. Add the fourteen cases of the §4.1 table and check that `branchStrokes({ colour: 0, lines: [line] }, angular, null).map(s => s.path)` equals the one-element list shown.
- **G2. Stroke fields and default relation.** Nothing checks `colour`, `isCommitted` or the default `"normal"`, or that the object has exactly four keys. Input: colour 7, lines `(0,0)→(0,1)`, `(0,1)→(1,2) LF`, rounded, no panel, no callback. Expected, with `toEqual`: `[{ path: "M8,12.0L8,36.0C8,55.2 24,40.8 24,60.0", colour: 7, isCommitted: true, relation: "normal" }]`, and `Object.keys(result[0]).sort()` equals `["colour", "isCommitted", "path", "relation"]`.
- **G3. Joining vertical runs.** The connectivity test tolerates both joined and unjoined output. (a) Angular, lines `(0,0)→(0,1)`, `(0,1)→(0,2) LF`, `(0,2)→(0,3)`: expect `["M8,12.0L8,84.0"]`. (b) Rounded, lines `(0,0)→(0,1)`, `(0,1)→(0,2)`, `(0,2)→(1,3) LF`, `(1,3)→(1,4)`, `(1,4)→(1,5)`: expect `["M8,12.0L8,60.0C8,79.2 24,64.8 24,84.0L24,132.0"]`.
- **G4. Gaps inside one stroke.** Rounded, no panel. Lines `(0,0)→(0,1)`, `(0,2)→(0,3)`: expect a single stroke `M8,12.0L8,36.0M8,60.0L8,84.0`. Lines `(0,0)→(0,1)`, `(1,1)→(1,2)`: expect `M8,12.0L8,36.0M24,36.0L24,60.0`.
- **G5. Splits by relation and by committed state.** Only one two-stroke relation split is tested today. (a) The three strokes of §4.3 case 1, compared with `toEqual`. (b) §4.3 case 2: paths and `isCommitted` equal `[["M8,12.0L8,36.0", true], ["M8,36.0L8,60.0", false], ["M8,60.0L8,84.0", true]]`. (c) §4.3 case 4: `[["M8,12.0L24,26.9L24,36.0", "merged"], ["M24,36.0L24,60.0", "direct"]]`.
- **G6. Uncommitted row, end to end.** No stroke test has a `"*"` row. (a) `computeGraphLayout([* → c1, c1 → c2, c2 → c3, c3], null)`: exactly one branch. Rounded, no panel: expect `toEqual` `[{ path: "M8,12.0L8,36.0", colour: 0, isCommitted: false, relation: "normal" }, { path: "M8,36.0L8,84.0", colour: 0, isCommitted: true, relation: "normal" }]`. Angular, panel `{ row: 0, height: 250 }`: `[["M8,12.0L8,286.0", false], ["M8,286.0L8,334.0", true]]`. (b) `[* → c2, c1 → c2, c2 → c3, c3]`, rounded, no panel: per branch `[[["M8,12.0L8,60.0", false], ["M8,60.0L8,84.0", true]], [["M24,36.0C24,55.2 8,40.8 8,60.0", true]]]`.
- **G7. Empty branch.** `branchStrokes({ colour: 3, lines: [] }, false, null)` and `branchStrokes({ colour: 3, lines: [] }, true, { row: 0, height: 250 })` both equal `[]`.
- **G8. Panel rules with exact output.** (a) Vertical branch `(0,0)→(0,1)`, `(0,1)→(0,2)`, `(0,2)→(0,3)`, rounded, height 250: rows −1, 0, 2, 3, 9 give `M8,262.0L8,334.0`, `M8,12.0L8,334.0`, `M8,12.0L8,334.0`, `M8,12.0L8,84.0`, `M8,12.0L8,84.0`. (b) The single-line and three-line tables of §4.4, both styles, `lockedFirst` both ways. (c) Height 0 gives output identical to no panel for the §4.4 three-line branch, both styles, both `lockedFirst` values. (d) Height 12.345 on `(0,0)→(1,1) LF`, row 0, rounded: `M8,12.0C8,31.2 24,16.8 24,36.0L24,48.3`.
- **G9. Callback contract.** Branch `(0,0)→(0,1)`, `(0,1)→(1,2) LF`, `(1,2)→(1,3)`, panel `{ row: 1, height: 250 }`, recording callback that returns `"normal"`. Expect every recorded argument to be one of `branch.lines` by identity, the set of recorded arguments to equal the set of lines, and the call count to be 3.
- **G10. No mutation of the panel, and repeatability.** Branch `(0,0)→(1,1) LF`, `(1,1)→(1,2)`, `(1,2)→(0,3)`, colour 1, panel `{ row: 0, height: 250 }`, angular, callback returning `"merged"`. After the call, the branch and the panel deep-equal clones taken before it, and a second call deep-equals the first result. The existing tests do not check the panel object or repeatability.
- **G11. Linear time.** One branch of 50,000 lines `(0,i)→(0,i+1)` for i = 0…49,999, rounded, no panel. Expect `["M8,12.0L8,1200012.0"]` within 500 ms. The current module takes about 3.3 s, so it fails this test. That is intended: the test exists to hold the replacement to §5.5.
- **G12. Uncommitted colour in the component** (caller-side gap, optional). Render `CommitTable` with a `"*"` row. The first stroke's visible `<path>` has `stroke="#808080"`, the committed one does not, and there are exactly two `<path>` elements per stroke.

---

## 7. Questions

Each question gives the current behaviour and what may have been intended. This document does not decide between them.

**Q1. Quadratic running time.** Building the strokes for a long straight run takes time proportional to the square of its length (§5.5): about 150 ms at 10,000 commits and 3–6 s at 50,000. The caller rebuilds them on every render.

- _May be intended:_ linear time, with the same output. G11 is written for that.

**Q2. `undefined` panel throws.** Passing `undefined` as `expansion` throws a `TypeError`. `graphHeight` and `expandOffset` in `@/webview/graph/utils` were decided to treat `undefined` like `null` (see `docs/clean-room/graph-utils.md`, decision on Q4 there). The type here forbids `undefined`, and no caller passes it.

- _May be intended:_ treat `undefined` as no panel, for consistency with the utils. The alternative is to leave it outside the contract.

**Q3. Panel under row −1.** Every line moves down by the height, as every dot does through `expandOffset`, but `graphHeight` adds no height for a row outside the layout, so the drawing's bottom is cut off. The module cannot tell a row beyond the end, which moves nothing anyway, from a valid one, but it can recognise a negative row. `CommitTable` never passes one.

- _May be intended:_ keep lines and dots consistent, which is today's behaviour. Whatever is chosen must stay identical to `expandOffset`'s rule, or lines and dots will separate.

**Q4. Lane changes spanning several rows under a panel.** The layout only produces one-row lines, but the function accepts any. For a lane change of several rows crossing a panel, the two output pieces overlap and double back (§3.13). Without a panel, multi-row lines are drawn sensibly.

- _May be intended:_ define input as one-row lines only, and leave this unspecified. Alternatively, keep the bend one row high next to the locked end, with the straight vertical covering all the remaining height.

**Q5. Zero-length segments.** A lone lane change crossing a panel of height 0 leaves a zero-length `L` in the output (`…L24,36.0L24,36.0` or `M8,12.0L8,12.0…`). This is harmless to draw and never happens in the product, where the height is 250.

- _May be intended:_ drop pieces of zero length. The alternative is to keep the output as it is.

**Q6. The rounded style ignores `lockedFirst` except next to a panel.** Without a panel, a rounded lane change is the same S-curve whichever way `lockedFirst` points, while the angular style puts the corner at the locked end. Next to a panel, `lockedFirst` decides which end the curve stays attached to in both styles.

- _May be intended:_ as is, since a symmetric curve has no corner to place. Alternatively, the rounded bend could lean towards the locked end, but that would change every rounded graph.

**Q7. A line leads down from a commit with no loaded parent, even a true root commit.** A parentless commit ("shallow roots": `shallow`) or one whose parents are all unloaded ("parents outside the page": `other`) gets a solid line down its lane to the middle of the last loaded row. There it ends with no dot, and it looks the same as a real edge. A commit on the last row with an unloaded parent gets no line, and a merge with an unloaded first parent shows no sign of the missing parent. The layout creates these lines. This module draws them like any other and cannot tell them apart, except that `parent` is `null`.

- _May be intended:_ a line only for commits whose parents exist but are not loaded, meaning "history continues below", and none for true root commits. The drawing might also mark such lines, for example with a fade or a dash, which would need a new stroke field or a split on `parent === null`.

**Q8. x rounded to whole pixels, y to tenths.** Line x coordinates are written as whole numbers, while dots use the unrounded `laneX`. Today every lane position is a whole number, so nothing is lost. If `LANE_OFFSET` or `LANE_WIDTH` ever became fractional, for example 7.5, lines would miss dot centres by up to half a pixel. The rounding of y to 0.1 px moves angular corners by up to 0.05 px (26.88 is written 26.9), which is invisible.

- _May be intended:_ the same precision for both axes, for example one decimal for x as well. That would change every path string (`M8.0,12.0…`), so it should be decided together with the golden outputs here.

**Q9. A merge line can cover its parent's own line beside the panel.** A lane change with `lockedFirst: true` that crosses the panel ends in a straight vertical in the lower lane (§3.3). The layout sets `lockedFirst: true` on the last line of every merge edge that joins its parent's lane at the parent's row. So when the panel sits under the row just above that parent, the merge edge runs down the parent's lane for the full panel height, on top of the line that already reaches the parent from above in that lane.

- Example: history "merge into a parent another branch reached first", HEAD `tip`, focus `{ direct: [tip, merge, main, base], merged: [side] }`, callback `lineRelation`, panel `{ row: 3, height: 250 }`, rounded. Branch 0 gives `"direct"` `M8,12.0L8,358.0`, then `"merged"` `M8,36.0C8,55.2 40,40.8 40,60.0L40,84.0C40,103.2 8,88.8 8,108.0L8,358.0`. The second stroke's final `L8,358.0` from y = 108 lies exactly on the first stroke and is painted after it. The direct `main → base` line beside the panel is therefore shown in the dimmed merged colour, with the merged stroke's backing line under it. Without a panel, or with the panel elsewhere, the two strokes only touch at the `base` dot. "criss-cross merges" with the panel under row 2 shows the same overlap (`…C24,79.2 8,64.8 8,84.0L8,334.0` over branch 0's `M8,12.0L8,382.0`).
- _May be intended:_ that a merge edge never runs along another line's lane beside the panel, for example by putting its bend next to the parent when it ends on a dot another line reaches from above. This would conflict with the current meaning of `lockedFirst` and with the corner test's expectations, so it needs a decision on which rule wins. The alternative is to accept the overlap as it is.

---

## Appendix A. Golden output for every fixture history

Layouts come from `computeGraphLayout(commits, null)` for the histories in `tests/webview/graph/fixtures.ts`. Panel rows use height 250. "Rounded" is `angular: false`. Each cell lists the path of branch 0, branch 1 and so on, one per line. Every branch in these cases produces exactly one stroke with its own `colour`, `isCommitted: true` and `relation: "normal"`.

#### "reused lanes"

Branch lines (child→parent, grid start→end, `LF` = `lockedFirst`, all committed):

- branch 0, colour 0: 0→1 (0,0)→(0,1); 1→3 (0,1)→(0,2); 1→3 (0,2)→(0,3); 3→4 (0,3)→(0,4); 4→5 (0,4)→(0,5); 5→7 (0,5)→(0,6); 5→7 (0,6)→(0,7)
- branch 1, colour 1: 0→2 (0,0)→(1,1) LF; 0→2 (1,1)→(1,2); 2→3 (1,2)→(0,3)
- branch 2, colour 1: 4→6 (0,4)→(1,5) LF; 4→6 (1,5)→(1,6); 6→7 (1,6)→(0,7)

| Expansion | Style   | Paths, one list per branch (each branch here gives exactly one stroke)                                                                                            |
| --------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| none      | rounded | `M8,12.0L8,180.0`<br>`M8,12.0C8,31.2 24,16.8 24,36.0L24,60.0C24,79.2 8,64.8 8,84.0`<br>`M8,108.0C8,127.2 24,112.8 24,132.0L24,156.0C24,175.2 8,160.8 8,180.0`     |
| none      | angular | `M8,12.0L8,180.0`<br>`M8,12.0L24,26.9L24,36.0L24,60.0L24,69.1L8,84.0`<br>`M8,108.0L24,122.9L24,132.0L24,156.0L24,165.1L8,180.0`                                   |
| row 0     | rounded | `M8,12.0L8,430.0`<br>`M8,12.0C8,31.2 24,16.8 24,36.0L24,310.0C24,329.2 8,314.8 8,334.0`<br>`M8,358.0C8,377.2 24,362.8 24,382.0L24,406.0C24,425.2 8,410.8 8,430.0` |
| row 0     | angular | `M8,12.0L8,430.0`<br>`M8,12.0L24,26.9L24,36.0L24,310.0L24,319.1L8,334.0`<br>`M8,358.0L24,372.9L24,382.0L24,406.0L24,415.1L8,430.0`                                |
| row 1     | rounded | `M8,12.0L8,430.0`<br>`M8,12.0C8,31.2 24,16.8 24,36.0L24,310.0C24,329.2 8,314.8 8,334.0`<br>`M8,358.0C8,377.2 24,362.8 24,382.0L24,406.0C24,425.2 8,410.8 8,430.0` |
| row 1     | angular | `M8,12.0L8,430.0`<br>`M8,12.0L24,26.9L24,36.0L24,310.0L24,319.1L8,334.0`<br>`M8,358.0L24,372.9L24,382.0L24,406.0L24,415.1L8,430.0`                                |
| row 2     | rounded | `M8,12.0L8,430.0`<br>`M8,12.0C8,31.2 24,16.8 24,36.0L24,310.0C24,329.2 8,314.8 8,334.0`<br>`M8,358.0C8,377.2 24,362.8 24,382.0L24,406.0C24,425.2 8,410.8 8,430.0` |
| row 2     | angular | `M8,12.0L8,430.0`<br>`M8,12.0L24,26.9L24,36.0L24,310.0L24,319.1L8,334.0`<br>`M8,358.0L24,372.9L24,382.0L24,406.0L24,415.1L8,430.0`                                |
| row 3     | rounded | `M8,12.0L8,430.0`<br>`M8,12.0C8,31.2 24,16.8 24,36.0L24,60.0C24,79.2 8,64.8 8,84.0`<br>`M8,358.0C8,377.2 24,362.8 24,382.0L24,406.0C24,425.2 8,410.8 8,430.0`     |
| row 3     | angular | `M8,12.0L8,430.0`<br>`M8,12.0L24,26.9L24,36.0L24,60.0L24,69.1L8,84.0`<br>`M8,358.0L24,372.9L24,382.0L24,406.0L24,415.1L8,430.0`                                   |
| row 4     | rounded | `M8,12.0L8,430.0`<br>`M8,12.0C8,31.2 24,16.8 24,36.0L24,60.0C24,79.2 8,64.8 8,84.0`<br>`M8,108.0C8,127.2 24,112.8 24,132.0L24,406.0C24,425.2 8,410.8 8,430.0`     |
| row 4     | angular | `M8,12.0L8,430.0`<br>`M8,12.0L24,26.9L24,36.0L24,60.0L24,69.1L8,84.0`<br>`M8,108.0L24,122.9L24,132.0L24,406.0L24,415.1L8,430.0`                                   |
| row 5     | rounded | `M8,12.0L8,430.0`<br>`M8,12.0C8,31.2 24,16.8 24,36.0L24,60.0C24,79.2 8,64.8 8,84.0`<br>`M8,108.0C8,127.2 24,112.8 24,132.0L24,406.0C24,425.2 8,410.8 8,430.0`     |
| row 5     | angular | `M8,12.0L8,430.0`<br>`M8,12.0L24,26.9L24,36.0L24,60.0L24,69.1L8,84.0`<br>`M8,108.0L24,122.9L24,132.0L24,406.0L24,415.1L8,430.0`                                   |
| row 6     | rounded | `M8,12.0L8,430.0`<br>`M8,12.0C8,31.2 24,16.8 24,36.0L24,60.0C24,79.2 8,64.8 8,84.0`<br>`M8,108.0C8,127.2 24,112.8 24,132.0L24,406.0C24,425.2 8,410.8 8,430.0`     |
| row 6     | angular | `M8,12.0L8,430.0`<br>`M8,12.0L24,26.9L24,36.0L24,60.0L24,69.1L8,84.0`<br>`M8,108.0L24,122.9L24,132.0L24,406.0L24,415.1L8,430.0`                                   |
| row 7     | rounded | `M8,12.0L8,180.0`<br>`M8,12.0C8,31.2 24,16.8 24,36.0L24,60.0C24,79.2 8,64.8 8,84.0`<br>`M8,108.0C8,127.2 24,112.8 24,132.0L24,156.0C24,175.2 8,160.8 8,180.0`     |
| row 7     | angular | `M8,12.0L8,180.0`<br>`M8,12.0L24,26.9L24,36.0L24,60.0L24,69.1L8,84.0`<br>`M8,108.0L24,122.9L24,132.0L24,156.0L24,165.1L8,180.0`                                   |

#### "octopus merge"

Branch lines (child→parent, grid start→end, `LF` = `lockedFirst`, all committed):

- branch 0, colour 0: 0→1 (0,0)→(0,1); 1→5 (0,1)→(0,2); 1→5 (0,2)→(0,3); 1→5 (0,3)→(0,4); 1→5 (0,4)→(0,5)
- branch 1, colour 1: 0→2 (0,0)→(1,1) LF; 0→2 (1,1)→(1,2); 2→5 (1,2)→(1,3); 2→5 (1,3)→(1,4); 2→5 (1,4)→(0,5)
- branch 2, colour 2: 0→3 (0,0)→(2,1) LF; 0→3 (2,1)→(2,2); 0→3 (2,2)→(2,3); 3→5 (2,3)→(2,4); 3→5 (2,4)→(0,5)
- branch 3, colour 3: 0→4 (0,0)→(3,1) LF; 0→4 (3,1)→(3,2); 0→4 (3,2)→(3,3); 0→4 (3,3)→(3,4); 4→5 (3,4)→(0,5)

| Expansion | Style   | Paths, one list per branch (each branch here gives exactly one stroke)                                                                                                                                                              |
| --------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| none      | rounded | `M8,12.0L8,132.0`<br>`M8,12.0C8,31.2 24,16.8 24,36.0L24,108.0C24,127.2 8,112.8 8,132.0`<br>`M8,12.0C8,31.2 40,16.8 40,36.0L40,108.0C40,127.2 8,112.8 8,132.0`<br>`M8,12.0C8,31.2 56,16.8 56,36.0L56,108.0C56,127.2 8,112.8 8,132.0` |
| none      | angular | `M8,12.0L8,132.0`<br>`M8,12.0L24,26.9L24,36.0L24,108.0L24,117.1L8,132.0`<br>`M8,12.0L40,26.9L40,36.0L40,108.0L40,117.1L8,132.0`<br>`M8,12.0L56,26.9L56,36.0L56,108.0L56,117.1L8,132.0`                                              |
| row 0     | rounded | `M8,12.0L8,382.0`<br>`M8,12.0C8,31.2 24,16.8 24,36.0L24,358.0C24,377.2 8,362.8 8,382.0`<br>`M8,12.0C8,31.2 40,16.8 40,36.0L40,358.0C40,377.2 8,362.8 8,382.0`<br>`M8,12.0C8,31.2 56,16.8 56,36.0L56,358.0C56,377.2 8,362.8 8,382.0` |
| row 0     | angular | `M8,12.0L8,382.0`<br>`M8,12.0L24,26.9L24,36.0L24,358.0L24,367.1L8,382.0`<br>`M8,12.0L40,26.9L40,36.0L40,358.0L40,367.1L8,382.0`<br>`M8,12.0L56,26.9L56,36.0L56,358.0L56,367.1L8,382.0`                                              |
| row 1     | rounded | `M8,12.0L8,382.0`<br>`M8,12.0C8,31.2 24,16.8 24,36.0L24,358.0C24,377.2 8,362.8 8,382.0`<br>`M8,12.0C8,31.2 40,16.8 40,36.0L40,358.0C40,377.2 8,362.8 8,382.0`<br>`M8,12.0C8,31.2 56,16.8 56,36.0L56,358.0C56,377.2 8,362.8 8,382.0` |
| row 1     | angular | `M8,12.0L8,382.0`<br>`M8,12.0L24,26.9L24,36.0L24,358.0L24,367.1L8,382.0`<br>`M8,12.0L40,26.9L40,36.0L40,358.0L40,367.1L8,382.0`<br>`M8,12.0L56,26.9L56,36.0L56,358.0L56,367.1L8,382.0`                                              |
| row 2     | rounded | `M8,12.0L8,382.0`<br>`M8,12.0C8,31.2 24,16.8 24,36.0L24,358.0C24,377.2 8,362.8 8,382.0`<br>`M8,12.0C8,31.2 40,16.8 40,36.0L40,358.0C40,377.2 8,362.8 8,382.0`<br>`M8,12.0C8,31.2 56,16.8 56,36.0L56,358.0C56,377.2 8,362.8 8,382.0` |
| row 2     | angular | `M8,12.0L8,382.0`<br>`M8,12.0L24,26.9L24,36.0L24,358.0L24,367.1L8,382.0`<br>`M8,12.0L40,26.9L40,36.0L40,358.0L40,367.1L8,382.0`<br>`M8,12.0L56,26.9L56,36.0L56,358.0L56,367.1L8,382.0`                                              |
| row 3     | rounded | `M8,12.0L8,382.0`<br>`M8,12.0C8,31.2 24,16.8 24,36.0L24,358.0C24,377.2 8,362.8 8,382.0`<br>`M8,12.0C8,31.2 40,16.8 40,36.0L40,358.0C40,377.2 8,362.8 8,382.0`<br>`M8,12.0C8,31.2 56,16.8 56,36.0L56,358.0C56,377.2 8,362.8 8,382.0` |
| row 3     | angular | `M8,12.0L8,382.0`<br>`M8,12.0L24,26.9L24,36.0L24,358.0L24,367.1L8,382.0`<br>`M8,12.0L40,26.9L40,36.0L40,358.0L40,367.1L8,382.0`<br>`M8,12.0L56,26.9L56,36.0L56,358.0L56,367.1L8,382.0`                                              |
| row 4     | rounded | `M8,12.0L8,382.0`<br>`M8,12.0C8,31.2 24,16.8 24,36.0L24,358.0C24,377.2 8,362.8 8,382.0`<br>`M8,12.0C8,31.2 40,16.8 40,36.0L40,358.0C40,377.2 8,362.8 8,382.0`<br>`M8,12.0C8,31.2 56,16.8 56,36.0L56,358.0C56,377.2 8,362.8 8,382.0` |
| row 4     | angular | `M8,12.0L8,382.0`<br>`M8,12.0L24,26.9L24,36.0L24,358.0L24,367.1L8,382.0`<br>`M8,12.0L40,26.9L40,36.0L40,358.0L40,367.1L8,382.0`<br>`M8,12.0L56,26.9L56,36.0L56,358.0L56,367.1L8,382.0`                                              |
| row 5     | rounded | `M8,12.0L8,132.0`<br>`M8,12.0C8,31.2 24,16.8 24,36.0L24,108.0C24,127.2 8,112.8 8,132.0`<br>`M8,12.0C8,31.2 40,16.8 40,36.0L40,108.0C40,127.2 8,112.8 8,132.0`<br>`M8,12.0C8,31.2 56,16.8 56,36.0L56,108.0C56,127.2 8,112.8 8,132.0` |
| row 5     | angular | `M8,12.0L8,132.0`<br>`M8,12.0L24,26.9L24,36.0L24,108.0L24,117.1L8,132.0`<br>`M8,12.0L40,26.9L40,36.0L40,108.0L40,117.1L8,132.0`<br>`M8,12.0L56,26.9L56,36.0L56,108.0L56,117.1L8,132.0`                                              |

#### "criss-cross merges"

Branch lines (child→parent, grid start→end, `LF` = `lockedFirst`, all committed):

- branch 0, colour 0: 0→1 (0,0)→(0,1); 1→3 (0,1)→(0,2); 1→3 (0,2)→(0,3); 3→5 (0,3)→(0,4); 3→5 (0,4)→(0,5); 2→3 (1,2)→(0,3) LF
- branch 1, colour 1: 0→2 (0,0)→(1,1) LF; 0→2 (1,1)→(1,2); 2→4 (1,2)→(1,3); 2→4 (1,3)→(1,4); 4→5 (1,4)→(0,5); 1→4 (0,1)→(2,2) LF; 1→4 (2,2)→(1,3) LF

| Expansion | Style   | Paths, one list per branch (each branch here gives exactly one stroke)                                                                                                                       |
| --------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| none      | rounded | `M8,12.0L8,132.0M24,60.0C24,79.2 8,64.8 8,84.0`<br>`M8,12.0C8,31.2 24,16.8 24,36.0L24,108.0C24,127.2 8,112.8 8,132.0M8,36.0C8,55.2 40,40.8 40,60.0C40,79.2 24,64.8 24,84.0`                  |
| none      | angular | `M8,12.0L8,132.0M24,60.0L8,74.9L8,84.0`<br>`M8,12.0L24,26.9L24,36.0L24,108.0L24,117.1L8,132.0M8,36.0L40,50.9L40,60.0L24,74.9L24,84.0`                                                        |
| row 0     | rounded | `M8,12.0L8,382.0M24,310.0C24,329.2 8,314.8 8,334.0`<br>`M8,12.0C8,31.2 24,16.8 24,36.0L24,358.0C24,377.2 8,362.8 8,382.0M8,286.0C8,305.2 40,290.8 40,310.0C40,329.2 24,314.8 24,334.0`       |
| row 0     | angular | `M8,12.0L8,382.0M24,310.0L8,324.9L8,334.0`<br>`M8,12.0L24,26.9L24,36.0L24,358.0L24,367.1L8,382.0M8,286.0L40,300.9L40,310.0L24,324.9L24,334.0`                                                |
| row 1     | rounded | `M8,12.0L8,382.0M24,310.0C24,329.2 8,314.8 8,334.0`<br>`M8,12.0C8,31.2 24,16.8 24,36.0L24,358.0C24,377.2 8,362.8 8,382.0M8,36.0C8,55.2 40,40.8 40,60.0L40,310.0C40,329.2 24,314.8 24,334.0`  |
| row 1     | angular | `M8,12.0L8,382.0M24,310.0L8,324.9L8,334.0`<br>`M8,12.0L24,26.9L24,36.0L24,358.0L24,367.1L8,382.0M8,36.0L40,50.9L40,60.0L40,310.0L24,324.9L24,334.0`                                          |
| row 2     | rounded | `M8,12.0L8,382.0M24,60.0C24,79.2 8,64.8 8,84.0L8,334.0`<br>`M8,12.0C8,31.2 24,16.8 24,36.0L24,358.0C24,377.2 8,362.8 8,382.0M8,36.0C8,55.2 40,40.8 40,60.0C40,79.2 24,64.8 24,84.0L24,334.0` |
| row 2     | angular | `M8,12.0L8,382.0M24,60.0L8,74.9L8,84.0L8,334.0`<br>`M8,12.0L24,26.9L24,36.0L24,358.0L24,367.1L8,382.0M8,36.0L40,50.9L40,60.0L24,74.9L24,84.0L24,334.0`                                       |
| row 3     | rounded | `M8,12.0L8,382.0M24,60.0C24,79.2 8,64.8 8,84.0`<br>`M8,12.0C8,31.2 24,16.8 24,36.0L24,358.0C24,377.2 8,362.8 8,382.0M8,36.0C8,55.2 40,40.8 40,60.0C40,79.2 24,64.8 24,84.0`                  |
| row 3     | angular | `M8,12.0L8,382.0M24,60.0L8,74.9L8,84.0`<br>`M8,12.0L24,26.9L24,36.0L24,358.0L24,367.1L8,382.0M8,36.0L40,50.9L40,60.0L24,74.9L24,84.0`                                                        |
| row 4     | rounded | `M8,12.0L8,382.0M24,60.0C24,79.2 8,64.8 8,84.0`<br>`M8,12.0C8,31.2 24,16.8 24,36.0L24,358.0C24,377.2 8,362.8 8,382.0M8,36.0C8,55.2 40,40.8 40,60.0C40,79.2 24,64.8 24,84.0`                  |
| row 4     | angular | `M8,12.0L8,382.0M24,60.0L8,74.9L8,84.0`<br>`M8,12.0L24,26.9L24,36.0L24,358.0L24,367.1L8,382.0M8,36.0L40,50.9L40,60.0L24,74.9L24,84.0`                                                        |
| row 5     | rounded | `M8,12.0L8,132.0M24,60.0C24,79.2 8,64.8 8,84.0`<br>`M8,12.0C8,31.2 24,16.8 24,36.0L24,108.0C24,127.2 8,112.8 8,132.0M8,36.0C8,55.2 40,40.8 40,60.0C40,79.2 24,64.8 24,84.0`                  |
| row 5     | angular | `M8,12.0L8,132.0M24,60.0L8,74.9L8,84.0`<br>`M8,12.0L24,26.9L24,36.0L24,108.0L24,117.1L8,132.0M8,36.0L40,50.9L40,60.0L24,74.9L24,84.0`                                                        |

#### "parents outside the page"

Branch lines (child→parent, grid start→end, `LF` = `lockedFirst`, all committed):

- branch 0, colour 0: 0→2 (0,0)→(0,1); 0→2 (0,1)→(0,2)
- branch 1, colour 1: 1→null (1,1)→(1,2)

| Expansion | Style   | Paths, one list per branch (each branch here gives exactly one stroke) |
| --------- | ------- | ---------------------------------------------------------------------- |
| none      | rounded | `M8,12.0L8,60.0`<br>`M24,36.0L24,60.0`                                 |
| none      | angular | `M8,12.0L8,60.0`<br>`M24,36.0L24,60.0`                                 |
| row 0     | rounded | `M8,12.0L8,310.0`<br>`M24,286.0L24,310.0`                              |
| row 0     | angular | `M8,12.0L8,310.0`<br>`M24,286.0L24,310.0`                              |
| row 1     | rounded | `M8,12.0L8,310.0`<br>`M24,36.0L24,310.0`                               |
| row 1     | angular | `M8,12.0L8,310.0`<br>`M24,36.0L24,310.0`                               |
| row 2     | rounded | `M8,12.0L8,60.0`<br>`M24,36.0L24,60.0`                                 |
| row 2     | angular | `M8,12.0L8,60.0`<br>`M24,36.0L24,60.0`                                 |

#### "shallow roots"

Branch lines (child→parent, grid start→end, `LF` = `lockedFirst`, all committed):

- branch 0, colour 0: 0→1 (0,0)→(0,1); 1→3 (0,1)→(0,2); 1→3 (0,2)→(0,3)
- branch 1, colour 1: 0→2 (0,0)→(1,1) LF; 0→2 (1,1)→(1,2); 2→null (1,2)→(1,3)

| Expansion | Style   | Paths, one list per branch (each branch here gives exactly one stroke) |
| --------- | ------- | ---------------------------------------------------------------------- |
| none      | rounded | `M8,12.0L8,84.0`<br>`M8,12.0C8,31.2 24,16.8 24,36.0L24,84.0`           |
| none      | angular | `M8,12.0L8,84.0`<br>`M8,12.0L24,26.9L24,36.0L24,84.0`                  |
| row 0     | rounded | `M8,12.0L8,334.0`<br>`M8,12.0C8,31.2 24,16.8 24,36.0L24,334.0`         |
| row 0     | angular | `M8,12.0L8,334.0`<br>`M8,12.0L24,26.9L24,36.0L24,334.0`                |
| row 1     | rounded | `M8,12.0L8,334.0`<br>`M8,12.0C8,31.2 24,16.8 24,36.0L24,334.0`         |
| row 1     | angular | `M8,12.0L8,334.0`<br>`M8,12.0L24,26.9L24,36.0L24,334.0`                |
| row 2     | rounded | `M8,12.0L8,334.0`<br>`M8,12.0C8,31.2 24,16.8 24,36.0L24,334.0`         |
| row 2     | angular | `M8,12.0L8,334.0`<br>`M8,12.0L24,26.9L24,36.0L24,334.0`                |
| row 3     | rounded | `M8,12.0L8,84.0`<br>`M8,12.0C8,31.2 24,16.8 24,36.0L24,84.0`           |
| row 3     | angular | `M8,12.0L8,84.0`<br>`M8,12.0L24,26.9L24,36.0L24,84.0`                  |

#### "merge into a parent another branch reached first"

Branch lines (child→parent, grid start→end, `LF` = `lockedFirst`, all committed):

- branch 0, colour 0: 0→1 (0,0)→(0,1); 1→3 (0,1)→(0,2); 1→3 (0,2)→(0,3); 3→4 (0,3)→(0,4); 1→4 (0,1)→(2,2) LF; 1→4 (2,2)→(2,3); 1→4 (2,3)→(0,4) LF
- branch 1, colour 1: 0→2 (0,0)→(1,1) LF; 0→2 (1,1)→(1,2); 2→4 (1,2)→(1,3); 2→4 (1,3)→(0,4)

| Expansion | Style   | Paths, one list per branch (each branch here gives exactly one stroke)                                                                                        |
| --------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| none      | rounded | `M8,12.0L8,108.0M8,36.0C8,55.2 40,40.8 40,60.0L40,84.0C40,103.2 8,88.8 8,108.0`<br>`M8,12.0C8,31.2 24,16.8 24,36.0L24,84.0C24,103.2 8,88.8 8,108.0`           |
| none      | angular | `M8,12.0L8,108.0M8,36.0L40,50.9L40,60.0L40,84.0L8,98.9L8,108.0`<br>`M8,12.0L24,26.9L24,36.0L24,84.0L24,93.1L8,108.0`                                          |
| row 0     | rounded | `M8,12.0L8,358.0M8,286.0C8,305.2 40,290.8 40,310.0L40,334.0C40,353.2 8,338.8 8,358.0`<br>`M8,12.0C8,31.2 24,16.8 24,36.0L24,334.0C24,353.2 8,338.8 8,358.0`   |
| row 0     | angular | `M8,12.0L8,358.0M8,286.0L40,300.9L40,310.0L40,334.0L8,348.9L8,358.0`<br>`M8,12.0L24,26.9L24,36.0L24,334.0L24,343.1L8,358.0`                                   |
| row 1     | rounded | `M8,12.0L8,358.0M8,36.0C8,55.2 40,40.8 40,60.0L40,334.0C40,353.2 8,338.8 8,358.0`<br>`M8,12.0C8,31.2 24,16.8 24,36.0L24,334.0C24,353.2 8,338.8 8,358.0`       |
| row 1     | angular | `M8,12.0L8,358.0M8,36.0L40,50.9L40,60.0L40,334.0L8,348.9L8,358.0`<br>`M8,12.0L24,26.9L24,36.0L24,334.0L24,343.1L8,358.0`                                      |
| row 2     | rounded | `M8,12.0L8,358.0M8,36.0C8,55.2 40,40.8 40,60.0L40,334.0C40,353.2 8,338.8 8,358.0`<br>`M8,12.0C8,31.2 24,16.8 24,36.0L24,334.0C24,353.2 8,338.8 8,358.0`       |
| row 2     | angular | `M8,12.0L8,358.0M8,36.0L40,50.9L40,60.0L40,334.0L8,348.9L8,358.0`<br>`M8,12.0L24,26.9L24,36.0L24,334.0L24,343.1L8,358.0`                                      |
| row 3     | rounded | `M8,12.0L8,358.0M8,36.0C8,55.2 40,40.8 40,60.0L40,84.0C40,103.2 8,88.8 8,108.0L8,358.0`<br>`M8,12.0C8,31.2 24,16.8 24,36.0L24,334.0C24,353.2 8,338.8 8,358.0` |
| row 3     | angular | `M8,12.0L8,358.0M8,36.0L40,50.9L40,60.0L40,84.0L8,98.9L8,108.0L8,358.0`<br>`M8,12.0L24,26.9L24,36.0L24,334.0L24,343.1L8,358.0`                                |
| row 4     | rounded | `M8,12.0L8,108.0M8,36.0C8,55.2 40,40.8 40,60.0L40,84.0C40,103.2 8,88.8 8,108.0`<br>`M8,12.0C8,31.2 24,16.8 24,36.0L24,84.0C24,103.2 8,88.8 8,108.0`           |
| row 4     | angular | `M8,12.0L8,108.0M8,36.0L40,50.9L40,60.0L40,84.0L8,98.9L8,108.0`<br>`M8,12.0L24,26.9L24,36.0L24,84.0L24,93.1L8,108.0`                                          |

---

## 8. Decisions on §7 (from the project maintainer's side)

These decisions replace the "current behaviour" wherever they differ. Build to these, and test the decided behaviour.

- **Q1: linear time, same output.** Running time grows linearly with the number of lines. G11's test uses a bound of 1,000 ms for 50,000 lines, so that it holds on a slow CI machine; the target on a developer machine stays well under 100 ms.
- **Q2: `undefined` means no panel.** An `expansion` of `undefined` is treated exactly like `null`. The signature's type may stay as it is.
- **Q3: keep.** The panel shift follows `expandOffset`'s rule for every row value, so lines and dots never separate.
- **Q4: outside the contract.** Lines spanning more than one row that cross a panel need no particular drawing, but must not throw and must keep the path grammar of §3.7.
- **Q5: no zero-length pieces.** A piece whose start and end are the same pixel point is not drawn. With a panel of height 0 the output is therefore identical to the no-panel output in every case, and a zero-length line (`p1 = p2`) draws nothing. A branch whose pieces are all zero-length gives no stroke, so no stroke ever has an empty path.
- **Q6: keep.**
- **Q7: out of scope.** Which lines exist is the layout's decision.
- **Q8: keep.** x as a whole number, y to one decimal.
- **Q9: keep.** The overlap beside the panel stays as it is for now.

Appendix A's golden output was produced with the current layout. Build the fixture layouts with `computeGraphLayout` as the existing tests do, and use Appendix A's strings as the expected output, adjusted only where §8 changes this module's behaviour.
