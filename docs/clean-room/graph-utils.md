# Clean-room specification: `src/webview/graph/utils.ts`

This document says what the commit graph's geometry and lane-bookkeeping module must do, as seen from outside it. It is written for an engineer who will build a replacement without seeing the current source. Everything here comes from the module's callers, the types and constants it depends on, the repository's tests, and results observed by running the current code.

---

## 0. Terms and environment

**Grid and pixels.** The graph is laid out on a grid before it is drawn.

- A **row** is the index of a commit in the loaded commit list. Row 0 is the top row. When the working tree has changes, row 0 is the synthetic "Uncommitted Changes" entry.
- A **lane** is a column of the graph. Lane 0 is the leftmost.
- A **grid point** (`GraphPoint`) is a pair `{ x: lane, y: row }`. It is not a pixel position.
- **Pixels** are CSS pixels inside the graph's `<svg>`, measured from its top-left corner.

**Fixed numbers used in this document.** All of these are imported constants (see §2); the numbers are their current values.

| Constant                | Value | Where it lives                             |
| ----------------------- | ----- | ------------------------------------------ |
| `ROW_HEIGHT`            | 24    | `@/webview/constants`                      |
| `LANE_WIDTH`            | 16    | `@/webview/graph/constants`                |
| `LANE_OFFSET`           | 8     | `@/webview/graph/constants`                |
| `COMMIT_DETAILS_HEIGHT` | 250   | `@/webview/constants` (callers only)       |
| `GRAPH_PADDING`         | 16    | `@/webview/graph/constants` (callers only) |
| `VERTEX_RADIUS`         | 4     | `@/webview/graph/constants` (callers only) |

**Environment of the observations.** Node v22.22.2, Vitest 4.1.11, repository at commit `420bcb3`. Values were observed by bundling a scratch script against the current module and by running the Vitest `webview` project on a scratch copy of the repository. (At the time, the working tree also held uncommitted edits to `src/webview/lib/webview-config.ts`, which make two tests in `tests/webview/lib/webview-config.test.ts` fail. They are unrelated to this module.)

---

## 1. Interface

**Module path:** `src/webview/graph/utils.ts`, imported everywhere as `@/webview/graph/utils`.

The module has ten named exports, all functions. It exports no types and has no default export. Callers use named imports, so the names and signatures below must stay exactly as shown. (Because the signatures must match, a few declaration lines of the new module will unavoidably read the same as the old ones.)

### 1.1 Pixel geometry

| Export                                                                                        | Returns                                                                                                    |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `export function laneX(x: number): number`                                                    | x pixel coordinate of the vertical line along which lane `x`'s dots and straight segments are drawn.       |
| `export function rowY(y: number): number`                                                     | y pixel coordinate of the middle of row `y`, before any shift caused by an open details panel.             |
| `export function graphWidth(layout: GraphLayout): number`                                     | Pixel width of the graph drawing.                                                                          |
| `export function graphHeight(layout: GraphLayout, expansion: GraphExpansion \| null): number` | Pixel height of the graph drawing, including the open details panel if there is one.                       |
| `export function expandOffset(row: number, expansion: GraphExpansion \| null): number`        | Vertical displacement, in pixels, that the open details panel applies to row `row`: 0 or the panel height. |

### 1.2 Lane bookkeeping during layout

| Export                                                                                                           | Returns / effect                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `export function pointOf(vertex: Vertex): GraphPoint`                                                            | The grid point of the vertex's own dot.                                                                                  |
| `export function nextPointOf(vertex: Vertex): GraphPoint`                                                        | The grid point in the vertex's row at lane `vertex.nextX`, the leftmost lane still free.                                 |
| `export function connectionTo(vertex: Vertex, connectsTo: Vertex \| null, onBranch: Branch): GraphPoint \| null` | The grid point of the lowest lane of the vertex's row already occupied on behalf of `(connectsTo, onBranch)`, or `null`. |
| `export function takePoint(vertex: Vertex, x: number, connectsTo: Vertex \| null, onBranch: Branch): void`       | Occupies lane `x` of the vertex's row on behalf of `(connectsTo, onBranch)`, if `x` is the lowest free lane.             |
| `export function joinBranch(vertex: Vertex, branch: Branch, x: number): void`                                    | Places a vertex that has no branch yet on `branch` at lane `x`; does nothing otherwise.                                  |

### 1.3 Types the signatures use

All come from `@/webview/graph/types` (`src/webview/graph/types.ts`). This module does not define or re-export any of them.

- **`GraphPoint`** `{ x: number; y: number }`: `x` is a lane, `y` a row.
- **`GraphLayout`** `{ branches: GraphBranch[]; vertices: GraphVertex[]; lanes: number }`: the finished layout produced by `computeGraphLayout`. `vertices` has one entry per loaded row, in row order. `lanes` is the number of lanes the layout uses (0 for an empty history). `branches` holds the lines to draw. This module reads only `lanes` and the length of `vertices`.
- **`GraphExpansion`** `{ row: number; height: number }`: the commit-details panel that is open in the table. `row` is the row of the commit whose details are shown; the panel sits directly beneath that row. `height` is the panel's height in pixels (`COMMIT_DETAILS_HEIGHT`, 250, in production). `null` means no panel is open.
- **`Vertex`**: mutable per-commit state used only while a layout is computed. Relevant fields:
  - `y` (read-only): the vertex's row.
  - `branch: Branch | null`: the branch the vertex has been placed on; `null` until it is placed.
  - `x: number`: the vertex's lane. Meaningful only once `branch` is not `null`.
  - `nextX: number`: the lowest lane of this row that is still free (see §3.7).
  - `connections: Connection[]`: storage available for the record of occupied lanes (see §3.7).
  - Other fields (`parents`, `nextParent`, `isCommitted`, `isCurrent`) are not used by this module.
  - `createVertex(y)` in `@/webview/graph/vertex` creates a vertex with `branch: null`, `x: 0`, `nextX: 0`, `connections: []`.
- **`Branch`** `{ colour: number; lines: GraphLine[]; uncommitted: number }`: a branch being built during layout. This module never reads or changes its fields; it only compares branch objects by identity.
- **`Connection`** `{ connectsTo: Vertex | null; onBranch: Branch }`: the shape of one occupied-lane record.

### 1.4 Who uses what

| File                                            | Exports used                                                        | Purpose                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/webview/components/commit/CommitGraph.tsx` | `laneX`, `rowY`, `expandOffset`, `graphWidth`, `graphHeight`        | Sets the `<svg>` `width` to `graphWidth(layout)` and `height` to `graphHeight(layout, expansion)`. Places each commit dot (`<circle>`, radius `VERTEX_RADIUS`) at `cx = laneX(vertex.x)` and `cy = rowY(vertex.y) + expandOffset(vertex.y, expansion)`.                                                                                |
| `src/webview/components/commit/CommitTable.tsx` | `graphWidth`, `laneX`                                               | The graph column's content width is `graphWidth(layout) + GRAPH_PADDING`, then clamped to between 64 and 240 px. When the user navigates to a commit, `laneX(vertex.x)` is passed to the horizontal scroller as the pixel position of that commit's dot, so the scroller can bring it into view.                                       |
| `src/webview/graph/strokes.ts`                  | `laneX`, `rowY`                                                     | Converts the endpoints of each layout line to pixels before building SVG paths. It applies the details-panel shift itself, using the same rule as `expandOffset` (a point below the expanded row moves down by the panel height). The lines and the dots must meet, so the two rules must agree.                                       |
| `src/webview/graph/layout.ts`                   | `pointOf`, `nextPointOf`, `connectionTo`, `takePoint`, `joinBranch` | Tracks which lanes of each row are occupied while it walks commits to their parents, and where each commit's dot goes. It also reads `vertex.nextX`, `vertex.x` and `vertex.branch` directly: the layout's `lanes` is the largest `nextX` over all vertices, and each output dot takes its lane from `x` and its colour from `branch`. |
| `tests/webview/graph/strokes.test.ts`           | `laneX`, `rowY`, `expandOffset`, `graphWidth`, `graphHeight`        | See §6.1.                                                                                                                                                                                                                                                                                                                              |

No test file imports `pointOf`, `nextPointOf`, `connectionTo`, `takePoint` or `joinBranch`; they are exercised only through `computeGraphLayout`.

---

## 2. Dependencies the implementation must use

| What                               | Import                                                                                         | Notes                                                                                                             |
| ---------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Row height                         | `ROW_HEIGHT` from `@/webview/constants`                                                        | 24. The commit table's rows are exactly this tall; the graph must use the same value, not a copy of it.           |
| Lane spacing and first-lane offset | `LANE_WIDTH`, `LANE_OFFSET` from `@/webview/graph/constants`                                   | 16 and 8.                                                                                                         |
| Types                              | `Branch`, `GraphExpansion`, `GraphLayout`, `GraphPoint`, `Vertex` from `@/webview/graph/types` | Type-only imports. The project compiles with `verbatimModuleSyntax`, so they must be imported with `import type`. |

The results must follow the constants: if a constant changes, results change with it. Do not hard-code 24, 16 or 8.

**Nothing else.** The module uses no DOM, no `window` or other globals, no VS Code API, no messages, no signals, no timers and no third-party packages. It performs arithmetic on its arguments and reads or writes fields of the `Vertex` objects it is given. Importing it has no side effects.

**Build rules.** The file is part of the webview TypeScript project (`src/webview/tsconfig.json`), which enables `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals` and `noUnusedParameters`. It must pass `pnpm run typecheck`, `pnpm run lint` (oxlint) and `pnpm run format` (oxfmt).

---

## 3. Behaviour

### 3.1 From grid to pixels

Lane `n` is drawn `LANE_WIDTH` pixels to the right of lane `n − 1`, and lane 0 is drawn `LANE_OFFSET` pixels from the left edge. Row `n` spans the pixel band from `n × ROW_HEIGHT` to `(n + 1) × ROW_HEIGHT`, and points in it are drawn at the band's middle. An open details panel inserts extra vertical space directly beneath the expanded row, so every row after it, but not the row itself, is drawn lower by the panel height.

With the current constants, the leftmost and rightmost lanes are drawn 8 px inside the left and right edges of the drawing. The first row's middle is 12 px below the top edge, and the last row's middle is at least 12 px above the bottom edge (exactly 12 when no panel is open, or when the panel sits under an earlier row). Every dot and line endpoint therefore falls inside the `<svg>` box, which `strokes.test.ts` checks.

### 3.2 `laneX(x)`

Returns `LANE_OFFSET + x × LANE_WIDTH`, which is 8 + 16x with the current constants. The result is not rounded or clamped, and the argument is not validated (see §3.13).

### 3.3 `rowY(y)`

Returns `y × ROW_HEIGHT + ROW_HEIGHT ÷ 2`, which is 24y + 12 with the current constants. It takes no account of the details panel: callers add `expandOffset` for dots, and `strokes.ts` adds its own equivalent shift for lines. The result is not rounded, clamped or validated.

### 3.4 `graphWidth(layout)`

Returns `layout.lanes × LANE_WIDTH` (16 × lanes). It depends only on `layout.lanes`: the number of rows does not matter, and `LANE_OFFSET` is not involved. An empty layout (`lanes` 0) has width 0. It does not change the layout.

### 3.5 `graphHeight(layout, expansion)`

Returns `layout.vertices.length × ROW_HEIGHT`, plus `expansion.height` when `expansion` is not `null`. The number of lanes does not matter.

- The panel height is added whenever an expansion is given, whatever its `row` is, including a row that lies outside the layout (see Q3).
- An empty layout with no expansion has height 0. An empty layout with an expansion has the panel's height.
- It does not change its arguments.

### 3.6 `expandOffset(row, expansion)`

Returns `expansion.height` when `expansion` is not `null` and `row` is strictly greater than `expansion.row`. Otherwise it returns 0.

- The expanded row itself is not moved, because the panel opens beneath it.
- Rows above the expanded row are not moved.
- With `expansion` `null`, every row gets 0.
- The comparison is purely numeric. A negative `expansion.row` moves every row from 0 onwards. A `NaN` row gets 0.
- It does not change its arguments.

### 3.7 The lane-occupancy model shared by the bookkeeping exports

While a layout is computed, each row has lanes 0, 1, 2, … . A lane of a row is **occupied** when some line passes through that row in that lane, or when the row's own dot is placed in it. Each occupied lane carries a record of **on whose behalf** it was occupied: a pair made of a **target** (a `Vertex`, or `null`) and a **branch** (a `Branch`).

The layout uses the target for the vertex that the line in that lane is heading towards. When a vertex's own dot takes a lane, the layout records the vertex itself as the target, and uses `null` for a line whose destination is not among the loaded rows. This module does not interpret targets; it only stores them and compares them.

The rules the module must maintain for every vertex, whatever sequence of calls is made:

1. The occupied lanes of a row are always exactly lanes `0 … nextX − 1`. Lanes are occupied strictly from left to right, one at a time, and never released.
2. `vertex.nextX` is always the lowest free lane. It starts at 0 (from `createVertex`), and the only thing that changes it is a successful `takePoint`. `layout.ts` reads it directly to compute the graph's lane count, so it must be the vertex's own `nextX` field that holds this value.
3. Once a lane is occupied, its record never changes.
4. Records are compared by **object identity** of both the target and the branch. Two distinct `Branch` objects with equal fields are different branches. `null` is a valid target and matches only `null`.
5. The records must be stored on the vertex object itself. The `connections` field exists for this, and nothing outside this module reads or writes it. The module keeps no state of its own between calls, so separate vertices and separate layouts never influence each other.
6. `vertex.x` and `vertex.branch` are written only by `joinBranch`.

### 3.8 `pointOf(vertex)`

Returns a new object `{ x: vertex.x, y: vertex.y }`: the vertex's dot position on the grid.

- Callers ask for it only after the vertex has been placed with `joinBranch`. For a vertex that has not been placed, it still returns whatever `x` holds, which is 0 for a fresh vertex (see Q6).
- The result is a snapshot: a plain object with exactly the two own properties `x` and `y`. It is a different object on every call. Later changes to the vertex do not change an earlier result, and changing the result does not change the vertex. The layout stores these points directly as line endpoints in its output, and tests compare them with `toEqual`.
- It does not change the vertex.

### 3.9 `nextPointOf(vertex)`

Returns a new object `{ x: vertex.nextX, y: vertex.y }`: the leftmost free lane of the vertex's row, as a grid point.

- The same snapshot requirements as `pointOf` apply. They matter especially here, because the layout typically asks for the next free point and then immediately occupies it, which raises `nextX`. The point returned before that must still hold the old lane.
- It does not occupy the lane and does not change the vertex.

### 3.10 `connectionTo(vertex, connectsTo, onBranch)`

Looks for an occupied lane of the vertex's row whose record has exactly this target (`connectsTo`, compared by identity, `null` allowed) and exactly this branch (`onBranch`, compared by identity).

- If there is one, it returns a new point `{ x: lane, y: vertex.y }` for the **lowest** such lane.
- If there is none, including when the row has no occupied lanes, it returns `null`.
- A record matches only if both parts match. The same target on another branch does not match, and neither does the same branch with another target.
- The result is a fresh plain object with exactly `x` and `y`, as for `pointOf`.
- It does not change the vertex.

In the layout, this is how a line being drawn to a parent discovers that an existing line (or the parent's own dot) for that parent, on that branch, already occupies a lane in the current row, so it can join it instead of occupying a new lane.

### 3.11 `takePoint(vertex, x, connectsTo, onBranch)`

Tries to occupy lane `x` of the vertex's row on behalf of `(connectsTo, onBranch)`. Returns nothing.

- **`x` equals `vertex.nextX` (the lowest free lane):** the lane becomes occupied with this record, and `vertex.nextX` becomes `x + 1`. The target may be `null`, and the pair need not be new: the same pair may occupy several lanes of one row, and `connectionTo` then reports the lowest of them.
- **`x` is less than `nextX` (already occupied):** nothing changes. In particular, the lane keeps the record it already had, even if the new target or branch differ. The layout relies on this. For example, when a second branch reaches a vertex whose dot is already placed, it occupies that lane again on its own behalf, and the dot's original record must survive so that later merge lines into that vertex still find it.
- **Any other value of `x`** (greater than `nextX`, negative, fractional or `NaN`): nothing changes (see Q1).
- It never changes `vertex.x` or `vertex.branch`, and never throws for any number.

### 3.12 `joinBranch(vertex, branch, x)`

Places a vertex on a branch.

- **`vertex.branch` is `null`:** sets `vertex.branch` to `branch` (the same object, not a copy) and `vertex.x` to `x`.
- **The vertex already has a branch:** nothing changes, even if `branch` or `x` differ. The first placement is permanent: a commit's dot stays in the lane where it was first placed, and in the colour of that placement (see Q7).
- It does not occupy any lane and does not change `nextX` or the lane records. Callers that want the dot's lane marked as occupied call `takePoint` separately.

### 3.13 Inputs outside the contract

Callers only pass non-negative integers as lanes and rows, a `GraphExpansion` or `null`, vertices made by `createVertex`, and lane records made through `takePoint`. For other inputs, the current behaviour is as follows. A replacement need not copy it, except where §3 already requires something.

- The pixel functions apply their arithmetic unchanged: `laneX(-1)` → −8, `laneX(0.5)` → 16, `rowY(-1)` → −12, `rowY(0.5)` → 24, and `NaN` or `Infinity` in gives `NaN` or `Infinity` out (Q5).
- `graphHeight(layout, undefined)` treats `undefined` like `null`, but `expandOffset(row, undefined)` throws a `TypeError` (Q4).
- A negative or zero panel height is added as given: `graphHeight` of 3 rows with `{ row: 0, height: -30 }` is 42.
- If a vertex's `connections` array contains holes, which only code outside this module could cause, `connectionTo` throws a `TypeError` when it reaches a hole before finding a match. It returns normally if a match comes before the first hole (Q2).

---

## 4. Concrete examples

All values were observed with the current code.

### 4.1 Pixel functions

| Call        | Result |
| ----------- | ------ |
| `laneX(0)`  | 8      |
| `laneX(1)`  | 24     |
| `laneX(2)`  | 40     |
| `laneX(3)`  | 56     |
| `laneX(10)` | 168    |
| `rowY(0)`   | 12     |
| `rowY(1)`   | 36     |
| `rowY(2)`   | 60     |
| `rowY(5)`   | 132    |
| `rowY(100)` | 2412   |

For `graphWidth` and `graphHeight`, "L lanes, N rows" means a `GraphLayout` with `lanes: L`, `N` entries in `vertices` and no branches.

| Call                                               | Result |
| -------------------------------------------------- | ------ |
| `graphWidth` (0 lanes, 5 rows)                     | 0      |
| `graphWidth` (1 lane, 5 rows)                      | 16     |
| `graphWidth` (3 lanes, 5 rows)                     | 48     |
| `graphWidth` (3 lanes, 0 rows)                     | 48     |
| `graphWidth` (10 lanes, 5 rows)                    | 160    |
| `graphHeight` (0 rows), `null`                     | 0      |
| `graphHeight` (3 rows), `null`                     | 72     |
| `graphHeight` (3 rows, 7 lanes), `null`            | 72     |
| `graphHeight` (3 rows), `{ row: 1, height: 250 }`  | 322    |
| `graphHeight` (3 rows), `{ row: 2, height: 250 }`  | 322    |
| `graphHeight` (3 rows), `{ row: 99, height: 250 }` | 322    |
| `graphHeight` (3 rows), `{ row: -1, height: 250 }` | 322    |
| `graphHeight` (0 rows), `{ row: 0, height: 250 }`  | 250    |
| `graphHeight` (3 rows), `{ row: 0, height: 0 }`    | 72     |

| Call                                         | Result |
| -------------------------------------------- | ------ |
| `expandOffset(5, null)`                      | 0      |
| `expandOffset(0, { row: 2, height: 250 })`   | 0      |
| `expandOffset(1, { row: 2, height: 250 })`   | 0      |
| `expandOffset(2, { row: 2, height: 250 })`   | 0      |
| `expandOffset(3, { row: 2, height: 250 })`   | 250    |
| `expandOffset(10, { row: 2, height: 250 })`  | 250    |
| `expandOffset(2.5, { row: 2, height: 250 })` | 250    |
| `expandOffset(-1, { row: 2, height: 250 })`  | 0      |
| `expandOffset(0, { row: -1, height: 250 })`  | 250    |
| `expandOffset(3, { row: 2, height: 0 })`     | 0      |
| `expandOffset(NaN, { row: 2, height: 250 })` | 0      |

### 4.2 A drawn graph

History (each commit lists its parents): `m → a, b`; `a → base`; `b → base`; `base`. `computeGraphLayout(rows, "m")` gives 2 lanes, with the dots in lanes `[0, 0, 1, 0]` for rows 0–3.

| Quantity                                                                 | No panel                       | Panel under row 1, height 250    |
| ------------------------------------------------------------------------ | ------------------------------ | -------------------------------- |
| `graphWidth`                                                             | 32                             | 32                               |
| `graphHeight`                                                            | 96                             | 346                              |
| Dot centres `[laneX(x), rowY(y) + expandOffset(y, expansion)]`, rows 0–3 | `[8,12] [8,36] [24,60] [8,84]` | `[8,12] [8,36] [24,310] [8,334]` |

### 4.3 Lane bookkeeping, step by step

Start with `V = createVertex(4)`, two distinct vertices `T = createVertex(9)` and `T2 = createVertex(9)`, and two distinct branches `B1` and `B2`, each `{ colour: 0, lines: [], uncommitted: 0 }`. Each step continues from the previous one.

| #   | Call                                                                            | Result / effect                                                                        | `V.nextX` after |
| --- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------- |
| 1   | `pointOf(V)`, `nextPointOf(V)`                                                  | `{ x: 0, y: 4 }` each (`V` has not been placed, so `pointOf` shows the default lane 0) | 0               |
| 2   | `connectionTo(V, T, B1)`                                                        | `null`                                                                                 | 0               |
| 3   | `connectionTo(V, null, B1)`                                                     | `null`                                                                                 | 0               |
| 4   | `P = nextPointOf(V)`                                                            | `{ x: 0, y: 4 }`                                                                       | 0               |
| 5   | `takePoint(V, 1, T, B1)`                                                        | no effect: lane 1 is not the lowest free lane                                          | 0               |
| 6   | `takePoint(V, 0, T, B1)`                                                        | lane 0 occupied for (T, B1)                                                            | 1               |
| 7   | `P`                                                                             | still `{ x: 0, y: 4 }`                                                                 | 1               |
| 8   | `nextPointOf(V)`                                                                | `{ x: 1, y: 4 }`                                                                       | 1               |
| 9   | `connectionTo(V, T, B1)`                                                        | `{ x: 0, y: 4 }`                                                                       | 1               |
| 10  | `connectionTo(V, T, B2)`                                                        | `null`: different branch                                                               | 1               |
| 11  | `connectionTo(V, T2, B1)`                                                       | `null`: different target, even though it is equal in value                             | 1               |
| 12  | `connectionTo(V, T, { ...B1 })`                                                 | `null`: a copy of the branch is a different branch                                     | 1               |
| 13  | `connectionTo(V, null, B1)`                                                     | `null`                                                                                 | 1               |
| 14  | `takePoint(V, 0, null, B2)`                                                     | no effect: lane 0 keeps its (T, B1) record                                             | 1               |
| 15  | `connectionTo(V, T, B1)`                                                        | `{ x: 0, y: 4 }`                                                                       | 1               |
| 16  | `connectionTo(V, null, B2)`                                                     | `null`                                                                                 | 1               |
| 17  | `takePoint(V, 1, null, B2)`                                                     | lane 1 occupied for (null, B2)                                                         | 2               |
| 18  | `connectionTo(V, null, B2)`                                                     | `{ x: 1, y: 4 }`                                                                       | 2               |
| 19  | `takePoint(V, 2, T, B1)`                                                        | lane 2 occupied for (T, B1) as well                                                    | 3               |
| 20  | `connectionTo(V, T, B1)`                                                        | `{ x: 0, y: 4 }`: the lowest matching lane                                             | 3               |
| 21  | `takePoint(V, -1, T, B1)`, `takePoint(V, NaN, T, B2)`, `takePoint(V, 7, T, B2)` | no effect                                                                              | 3               |
| 22  | `takePoint(V, 3, T, B2)`                                                        | lane 3 occupied                                                                        | 4               |
| 23  | `V.x`, `V.branch`                                                               | still `0` and `null`: `takePoint` never places the vertex                              | 4               |

Also observed: `pointOf(V) !== pointOf(V)`, and two calls of `connectionTo` that find the same lane return different objects.

### 4.4 Placing a vertex

`W = createVertex(7)`:

| #   | Call                                   | Effect                                                                                    |
| --- | -------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1   | `joinBranch(W, B1, 3)`                 | `W.branch` is `B1` (same object), `W.x` is 3. `W.nextX` stays 0, and no lane is occupied. |
| 2   | `pointOf(W)`                           | `{ x: 3, y: 7 }`                                                                          |
| 3   | `joinBranch(W, B2, 5)`                 | no effect: `W.branch` is still `B1`, `W.x` is still 3                                     |
| 4   | `joinBranch(W, B1, 4)`                 | no effect: `W.x` is still 3                                                               |
| 5   | Set `x` to 9 on the object from step 2 | `W.x` is still 3 and `pointOf(W)` is still `{ x: 3, y: 7 }`                               |

### 4.5 Effects visible through `computeGraphLayout`

These results depend on `layout.ts` and `branchColours.ts` as well as this module. They show what this module's rules produce in the finished layout.

**Simple merge.** Rows: `m → a, b`; `a → base`; `b → base`; `base`; head `m`. Result: `lanes` 2; each dot's `[lane, colour]` for rows 0–3 is `[0,0] [0,0] [1,1] [0,0]`. If a later branch could re-place an already placed vertex, rows 0 and 3 would change colour to 1.

**Merge into a parent that another branch reached first.** Rows: `t → m, c`; `m → a, b`; `c → b`; `a → b`; `b`; head `t`. Result: `lanes` 3; dot lanes `[0, 0, 1, 0, 0]`; dot colours `[0, 0, 1, 0, 0]`. The edge from `m` (row 1) to its second parent `b` (row 4) is drawn on the branch with colour 0 as exactly three lines: `(0,1)→(2,2)`, `(2,2)→(2,3)`, `(2,3)→(0,4)`. It ends on `b`'s dot at lane 0.

- If an occupied lane's record could be replaced, the last line would end at `(1,4)`, beside the dot, and the edge would be disconnected.
- If `connectionTo` ignored the branch, the edge would join `c`'s line at `(1,3)` instead.

---

## 5. Non-functional requirements

1. **Cost.** The graph renders every loaded row: the UI benchmark measures 300, 1,000 and 3,000 rows, and the layout benchmark lays out 10,000. The pixel functions are called for every dot and every line endpoint on each render. The bookkeeping functions are called many times per row during layout.
   - `laneX`, `rowY`, `graphWidth`, `graphHeight`, `expandOffset`, `pointOf`, `nextPointOf`, `takePoint` and `joinBranch` must take constant time.
   - `connectionTo` may take time proportional to the number of occupied lanes in that one row, and no more.
   - Nothing may scan other rows, the whole layout, or the list of vertices.
   - The pixel functions allocate nothing. The point-returning functions allocate only the returned point.
   - For reference, `graphLayout10000` in `docs/benchmarks/2026-09-18.json` (`pnpm benchmark`) has a median of 33.7 ms with the current code; a replacement must not make it measurably slower.
2. **No module state.** The module holds no mutable state between calls. Every effect is on the `Vertex` passed in (§3.7). Layouts may be computed repeatedly and interleaved, for example on every re-render and in every test, without affecting each other. Nothing needs to be cleaned up.
3. **No hidden mutation.** `graphWidth`, `graphHeight` and `expandOffset` must not modify the layout or the expansion. `strokes.test.ts` checks that a layout is unchanged after it has been measured and drawn. `pointOf`, `nextPointOf` and `connectionTo` must not modify the vertex. `takePoint` and `joinBranch` modify only the fields described in §3.11 and §3.12.
4. **Plain values.** Returned points are ordinary object literals with exactly the own enumerable data properties `x` and `y`: no getters, no special prototype, no extra fields. They become part of the layout's output lines, which tests `structuredClone` and compare with `toEqual`.
5. **No exceptions for valid input.** For any number arguments, a `GraphExpansion` or `null`, and vertices whose lane records were made only through `takePoint`, no export throws.
6. **Synchronous and deterministic.** Every function returns synchronously, and the same inputs always give the same results.

---

## 6. Test coverage

### 6.1 What the existing tests check

| Test file and case                                                                                                                                                         | What it pins about this module                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/webview/graph/strokes.test.ts`, "keeps %s connected with expanded details" (both graph styles, five fixture histories, no panel and a 250 px panel under every row) | Every path coordinate lies between 0 and `graphWidth(layout)` and between 0 and `graphHeight(layout, expansion)`. This is a bound only: the width may be too large, or up to 8 px too small, and the height too large, without failing. Dot centres are computed with `laneX`, `rowY` and `expandOffset`. Every path must start at a dot centre or on a drawn segment, and every commit that has a child must have a segment ending at its dot centre. This pins the "strictly below the expanded row" rule of `expandOffset` and its agreement with `strokes.ts`. The layout must be unchanged afterwards.          |
| `tests/webview/graph/strokes.test.ts`, "keeps lane-change corners outside details"                                                                                         | Through `strokes.ts`: `laneX(0)` = 8, `laneX(1)` = 24, `rowY(0)` = 12, and `rowY(1)` + 250 = 286.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `tests/webview/graph/layout.test.ts` (all cases)                                                                                                                           | Through `computeGraphLayout`: every loaded parent is connected, every line moves down exactly one row, no line passes through an unrelated dot, and every lane is below `lanes`. It also checks lane counts: "reused lanes" uses 2 lanes, with rows 2 and 6 in lane 1 and sharing a colour; "octopus merge" uses 4 lanes, with distinct lanes for rows 1–4; the empty history gives `lanes` 0. Together these pin that `pointOf` and `nextPointOf` report the right lanes, that `takePoint` occupies lanes left to right and advances `nextX`, that `connectionTo` matches the target, and that snapshots are taken. |
| `tests/webview/graph/focus.test.ts`                                                                                                                                        | Only incidentally, through layout and strokes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `tests/webview/components/commit/GraphScroll.test.ts`                                                                                                                      | Reads each dot's `cx` (which is `laneX`) and checks that horizontal scrolling reveals it. This checks consistent use, not the values.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `tests/webview/components/commit/WorkingTreeDetails.test.ts`, `WorkingTreeTiming.test.ts`                                                                                  | Render `CommitTable`; incidental.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

**How the gaps were found.** I changed one behaviour at a time in a scratch copy of the module and ran every test that reaches it: `tests/webview/graph/*`, `GraphScroll.test.ts`, `WorkingTreeDetails.test.ts` and `WorkingTreeTiming.test.ts`. All of them still passed with each of these changes:

- `graphWidth` 100 px too wide, or 8 px too narrow;
- `graphHeight` 1,000 px too tall;
- `connectionTo` ignoring the branch, or returning the highest matching lane instead of the lowest;
- `takePoint` also occupying lanes beyond the lowest free one;
- `takePoint` not recording lanes whose target is `null`;
- `takePoint` replacing an occupied lane's record;
- `joinBranch` re-placing an already placed vertex (branch, lane, or both);
- returned points carrying an extra property.

### 6.2 Gaps, with ready-to-add cases

All cases below passed against the current code, in a new file in the Vitest `webview` project (default Node environment, no DOM needed). Each of the changes listed in §6.1 makes at least one of them fail.

Setup:

- Vertices: `createVertex(y)` from `@/webview/graph/vertex`.
- Branches: `{ colour: 0, lines: [], uncommitted: 0 }`, with a fresh object for each distinct branch.
- Layouts: `{ lanes: L, branches: [], vertices: [...] }`, with `N` entries of the form `{ x: 0, y: i, colour: 0, isCommitted: true, isCurrent: false }`.
- Commits: `commit(hash, ...parents)` from `tests/webview/graph/fixtures.ts`.
- Use `toStrictEqual` for points, so that extra properties fail.

**G1. `laneX` exact values.** `[0, 1, 2, 3, 10]` → `[8, 24, 40, 56, 168]`.

**G2. `rowY` exact values.** `[0, 1, 2, 5, 100]` → `[12, 36, 60, 132, 2412]`.

**G3. `graphWidth` exact values.**

- 5 rows with 0, 1, 3 and 10 lanes → `[0, 16, 48, 160]`.
- 3 lanes and 0 rows → 48.
- For 3 lanes, `graphWidth` equals `laneX(2) + 8`.

**G4. `graphHeight` exact values.**

- 0 rows, `null` → 0.
- 3 rows, `null` → 72.
- 3 rows and 7 lanes, `null` → 72.
- 3 rows, `{ row: 1, height: 250 }` → 322.
- 3 rows, `{ row: 2, height: 250 }` → 322.
- 0 rows, `{ row: 0, height: 250 }` → 250.
- For 3 rows with no panel, `graphHeight` equals `rowY(2) + 12`.

**G5. `expandOffset` directly.**

- With `null`, rows 0, 1 and 5 → `[0, 0, 0]`.
- With `{ row: 2, height: 250 }`, rows 0, 1, 2, 3 and 10 → `[0, 0, 0, 250, 250]`.
- `expandOffset(3, { row: 2, height: 0 })` → 0.

**G6. Points are exact, fresh snapshots.** `v = createVertex(4)`, branch `b`:

- `before = nextPointOf(v)` is strictly `{ x: 0, y: 4 }`, and `pointOf(v)` is strictly `{ x: 0, y: 4 }`.
- `pointOf(v) !== pointOf(v)` and `nextPointOf(v) !== nextPointOf(v)`.
- Then call `takePoint(v, 0, v, b)`, `joinBranch(v, b, 0)` and `takePoint(v, 1, null, b)`. After that, `before` is still `{ x: 0, y: 4 }`, and `nextPointOf(v)` is strictly `{ x: 2, y: 4 }`.
- `w = createVertex(7)`; `joinBranch(w, b, 3)`; `p = pointOf(w)` is strictly `{ x: 3, y: 7 }`. Setting `p.x = 9` leaves `w.x === 3`, and `pointOf(w)` is still `{ x: 3, y: 7 }`.

**G7. `connectionTo` matching.** `v = createVertex(4)`; targets `t = createVertex(9)` and `other = createVertex(9)`; branches `b1` and `b2`:

- `connectionTo(v, t, b1)` and `connectionTo(v, null, b1)` → `null`.
- After `takePoint(v, 0, t, b1)`:
  - `connectionTo(v, t, b1)` is strictly `{ x: 0, y: 4 }`, and a second call returns a different object;
  - `connectionTo(v, t, b2)` → `null`;
  - `connectionTo(v, other, b1)` → `null`;
  - `connectionTo(v, t, { ...b1 })` → `null`;
  - `connectionTo(v, null, b1)` → `null`.
- After `takePoint(v, 1, null, b2)`: `connectionTo(v, null, b2)` is strictly `{ x: 1, y: 4 }`.
- After `takePoint(v, 2, t, b1)`: `connectionTo(v, t, b1)` is still `{ x: 0, y: 4 }`, and `v.nextX` is 3.

**G8. `takePoint` only occupies the lowest free lane, and never overwrites.** `v = createVertex(2)`, `t = createVertex(5)`, branches `b1` and `b2`:

- `takePoint(v, 1, t, b1)` → `v.nextX` is 0, and `connectionTo(v, t, b1)` is `null`.
- `takePoint(v, 0, t, b1)` → `v.nextX` is 1.
- `takePoint(v, 0, null, b2)` → `v.nextX` is 1, `connectionTo(v, t, b1)` is `{ x: 0, y: 2 }`, and `connectionTo(v, null, b2)` is `null`.
- `takePoint(v, 5, null, b2)` → `v.nextX` is 1, and `connectionTo(v, null, b2)` is `null`.
- `takePoint(v, 1, null, b2)` → `v.nextX` is 2, and `connectionTo(v, null, b2)` is `{ x: 1, y: 2 }`.
- Throughout, `v.x` is 0 and `v.branch` is `null`.

**G9. `joinBranch` places once.** `v = createVertex(3)`, branches `b1` and `b2`:

- `joinBranch(v, b1, 2)` → `v.branch` is `b1` (by identity), `v.x` is 2, `v.nextX` is 0, and `connectionTo(v, v, b1)` is `null`.
- `joinBranch(v, b2, 5)` → `v.branch` is still `b1`, and `v.x` is still 2.
- `joinBranch(v, b1, 4)` → `v.x` is still 2.

**G10. A merge into a parent that another branch reached first** (§4.5). Lay out `commit("t","m","c")`, `commit("m","a","b")`, `commit("c","b")`, `commit("a","b")`, `commit("b")` with head `"t"`. Expect:

- `lanes` 3; dot lanes `[0, 0, 1, 0, 0]`; dot colours `[0, 0, 1, 0, 0]`.
- The lines with `child` 1 and `parent` 4, collected together with their branch's colour, are exactly `{ colour: 0, p1: {x:0,y:1}, p2: {x:2,y:2} }`, `{ colour: 0, p1: {x:2,y:2}, p2: {x:2,y:3} }` and `{ colour: 0, p1: {x:2,y:3}, p2: {x:0,y:4} }`.

Also adding this history to the `histories` map in `tests/webview/graph/fixtures.ts` makes the existing layout and strokes tests run it. For example, it can go under the name "merge into a parent another branch reached first", with hashes `tip → merge, side`; `merge → main, base`; `side → base`; `main → base`; `base`. All existing tests pass with it, and the topology test then fails if an occupied lane's record can be replaced.

**G11. A merge commit and its base keep the colour of their first placement** (§4.5). Lay out `commit("m","a","b")`, `commit("a","base")`, `commit("b","base")`, `commit("base")` with head `"m"`. Expect `lanes` 2 and each dot's `[x, colour]` to be `[[0,0],[0,0],[1,1],[0,0]]`.

Not worth a test: the out-of-contract behaviours in §3.13. The questions below decide whether any of them should become required.

---

## 7. Questions

Each question states the current behaviour, then what may have been intended. This document does not decide between them.

**Q1. `takePoint` silently ignores a lane beyond the lowest free one.** Asking to occupy lane 5 when lane 1 is the lowest free lane does nothing, with no signal to the caller. The layout never makes such a request; if it did, the line would be drawn through a lane that is not recorded as occupied, and a later line could be given the same lane. The silent no-op for an already-occupied lane is relied on (§3.11). The no-op for a lane beyond the free one is not.

- _May be intended:_ treat a lane beyond the lowest free one as a programming error, for example by throwing in development. The alternative is to keep the silent no-op.

**Q2. `connectionTo` throws when the record storage has holes.** If code outside this module writes a record into the vertex's `connections` beyond the next index, leaving a gap, `connectionTo` throws a `TypeError` once its search reaches the gap. Nothing in the repository does this today.

- _May be intended:_ that this module is the only writer, so the case cannot arise. The alternative is to treat a missing record as a free lane.

**Q3. `graphHeight` adds the panel height for a panel outside the layout.** An expansion whose `row` is beyond the last row (for example 99 of 3), or negative, still adds its full height. `expandOffset` then moves no row (row 99) or every row (row −1), so for row 99 the extra space is empty space at the bottom. `CommitTable` only creates an expansion for a row it found, so this does not happen in the product.

- _May be intended:_ add the height only when `0 ≤ row < number of rows`. Otherwise keep it as is, since callers guarantee it.

**Q4. `null` and `undefined` differ between two functions.** The declared type allows only `GraphExpansion | null`. For `undefined`, `graphHeight` behaves as if no panel is open, but `expandOffset` throws a `TypeError`.

- _May be intended:_ both treat any missing expansion the same way. Since the type forbids `undefined`, a replacement may also leave it unspecified.

**Q5. The pixel functions accept any number.** Negative, fractional and non-finite lanes and rows go straight through the arithmetic, for example `laneX(-1)` → −8 and `laneX(NaN)` → `NaN`. A `NaN` would reach the SVG as an invalid attribute. Callers only pass non-negative integers.

- _May be intended:_ leave them unchecked, which is cheapest on a hot path, or validate them.

**Q6. `pointOf` on a vertex that has not been placed.** It returns the vertex's `x` field whatever that holds, which is 0 for a fresh vertex. That looks like a real position in lane 0, although the vertex is on no branch. The layout never asks before placing the vertex.

- _May be intended:_ that it is only ever called after `joinBranch`, with no defined result before that. It could instead return `null` or throw, but that would change the signature or the no-throw guarantee.

**Q7. `joinBranch` ignores a conflicting lane silently.** When a placed vertex is offered another branch or another lane, the offer is dropped without any signal. The layout depends on the branch part: the first branch's colour must be kept. In the fixtures, though, the layout never offers a different lane for a vertex that is already placed.

- _May be intended:_ the silent first-placement-wins rule as it is. A different lane for a placed vertex may instead be meant as an error.

**Q8. `graphWidth` does not use `LANE_OFFSET`.** The width is lanes × 16. The drawing has equal 8 px margins on both sides only because `LANE_OFFSET` is exactly half of `LANE_WIDTH`. If the offset were raised, for example to 12, the rightmost dot (radius 4) would touch the right edge and its outline would be cut off. If it were lowered, the right margin would grow while the left one shrank.

- _May be intended:_ that the width always leaves the same margin to the right of the last lane as to the left of the first. That is the same value as today's, but it would follow a change to `LANE_OFFSET`.

---

## 8. Decisions on §7 (from the project maintainer's side)

These decisions replace the "current behaviour" wherever they differ. Build to these, and test the decided behaviour.

- **Q1: keep.** A lane beyond the lowest free one is ignored silently.
- **Q2: keep.** Holes in `connections` are outside the contract.
- **Q3: only a visible panel adds height.** `graphHeight` adds the details panel's height only when its row is one of the layout's rows (at least 0 and less than the row count).
- **Q4: treat `undefined` as none.** Both `graphHeight` and `expandOffset` treat an `undefined` expansion the same as `null`.
- **Q5: keep.** Pixel functions do not validate their input.
- **Q6: keep.** `pointOf` is only called on placed vertices; anything else is outside the contract.
- **Q7: keep.** The first placement wins; a later different lane is ignored.
- **Q8: margins from the offset.** `graphWidth` must leave the same margin on both sides whatever `LANE_OFFSET` is: for n lanes, the rightmost dot's centre plus `LANE_OFFSET`, and 0 for no lanes. With the current constants that gives the same widths as today.
