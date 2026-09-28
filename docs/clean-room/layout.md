# Clean-room specification: `src/webview/graph/layout.ts`

This document says what the commit-graph layout module must do, as seen from outside it: what it is given, what it returns, and the rules the returned layout obeys. It is written for an engineer who will build a replacement without seeing the current source. Everything here comes from the module's callers and tests, the types and helpers around it, and results observed by running the current code.

The rules in §3 are precise enough to reproduce the current results exactly. To check that, a separate model was built from these rules alone and compared with the current module on more than 70,000 generated histories (1 to 2,000 rows; merges with up to four parents; missing, duplicate and far-away parents; with and without an uncommitted row; random head). Within the input contract of §3.1 the two gave deep-equal results every time.

---

## 0. Terms and environment

The words below are this document's own terms for the concepts. Apart from the interface's field and type names, they are not taken from the current code.

- **Row**: the index of a commit in the input list. Row 0 is the top. Row `r` is `commits[r]`.
- **Lane**: a column of the graph. Lane 0 is the leftmost. Lanes are counted separately in every row.
- **Point**: a grid cell `{ x: lane, y: row }`. It is not a pixel position.
- **Dot**: the point where a commit is drawn: `(vertices[r].x, r)`.
- **Loaded parent**: an entry of a commit's `parentHashes` that is the hash of a commit in the list. The **first loaded parent** is the first such entry. The **extra parents** are all loaded parents after the first, in `parentHashes` order, duplicates included.
- **Edge**: a pair (commit, one of its loaded parents).
- **Track**: one entry of the result's `branches`. A track follows commits from a child down to its parents and has one colour. (The word "track" avoids confusion with Git branches.)
- **Merge link**: the lines that draw an edge from a commit to an extra parent that already had its dot when the link was made. They are stored in, and coloured as, the track that gave the parent its dot.
- **Loose end**: the lines drawn below a commit that has no loaded parent. Their `parent` is `null`, and they run down to the last row.
- **Route**: a track or a merge link.
- **Placing** a commit: giving it its dot. Every commit is placed exactly once, always by a track: its **placing track**.
- **Uncommitted row**: row 0, when `commits[0].hash` equals `UNCOMMITTED_CHANGES` (`"*"`). The backend inserts it for working-tree changes; its only parent is the commit HEAD points at.

**Environment of the observations.** Node v22.22.2, Vitest 4.1.11, repository at commit `459842e` with a clean working tree. Results were observed by bundling the current module with esbuild into a scratch script. Test gaps were found by running the existing tests against deliberately altered scratch copies of the module (§6.2). All scratch files were deleted afterwards.

---

## 1. Interface

### 1.1 Module and export

**Module path:** `src/webview/graph/layout.ts`, imported as `@/webview/graph/layout`.

The module has exactly one export, a named function. It has no default export and exports no types or constants.

```ts
export function computeGraphLayout(
  commits: Array<GitCommitNode>,
  commitHead: string | null
): GraphLayout;
```

Callers pass both arguments by position, so the parameter names are free, but the name of the export, the order and types of the parameters, and the return type must stay as shown. The benchmark script imports the function by this name through esbuild (§1.5).

### 1.2 Inputs

**`commits: Array<GitCommitNode>`**: the loaded rows, in display order, top row first. `GitCommitNode` comes from `@/backend/types` (`src/backend/types/git.types.ts`):

| Field          | Type       | Meaning for the layout                                                                                                                                                                                    |
| -------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hash`         | `string`   | The commit's identity; parents refer to commits by it. `"*"` (`UNCOMMITTED_CHANGES`) for the uncommitted row.                                                                                             |
| `parentHashes` | `string[]` | The commit's parents in Git's order; the first entry is the first parent. Entries may name commits that are not in the list. Empty for a root commit, and for a shallow clone's boundary commits as well. |
| `author`       | `string`   | Ignored.                                                                                                                                                                                                  |
| `email`        | `string`   | Ignored.                                                                                                                                                                                                  |
| `date`         | `number`   | Ignored.                                                                                                                                                                                                  |
| `message`      | `string`   | Ignored.                                                                                                                                                                                                  |
| `refs`         | `GitRef[]` | Ignored.                                                                                                                                                                                                  |

`CommitTable` passes `HistoryEntry[]`, which is `GitCommitNode` plus the optional `filePath`, `previousPath` and `change`. Those are ignored too.

**`commitHead: string | null`**: the hash of the commit HEAD points at, or `null` when there is none (an unborn branch, or not known yet). It only decides which dot is marked current (§3.2). `CommitTable` passes the `commitHead` store's value, which the backend fills from `git show-ref --head`.

### 1.3 Result

All result types come from `@/webview/graph/types` (`src/webview/graph/types.ts`).

**`GraphLayout`** `{ branches: GraphBranch[]; vertices: GraphVertex[]; lanes: number }`

| Field      | Meaning                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `branches` | One entry per track, in the order of §3.10. Merge links do not add entries; their lines sit inside an existing entry.          |
| `vertices` | One entry per row, in row order: `vertices[r]` describes `commits[r]`. Its length always equals `commits.length`.              |
| `lanes`    | How many lanes the drawing needs: one more than the highest lane used by any dot or line end, and 0 for an empty list (§3.11). |

**`GraphVertex`** `{ x: number; y: number; colour: number; isCommitted: boolean; isCurrent: boolean }`: one commit's dot.

| Field         | Meaning                                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `x`           | The lane of the dot.                                                                                                                                    |
| `y`           | The row; always equal to the vertex's index.                                                                                                            |
| `colour`      | The colour number of the commit's placing track (§3.9). It is an index that the palette wraps (`branchColour` in `palette.ts`); it is not bounded here. |
| `isCommitted` | `false` only for the uncommitted row's dot; `true` for every other row.                                                                                 |
| `isCurrent`   | `true` for the one dot drawn as HEAD (an open circle), `false` for all others. At most one vertex has it (§3.2).                                        |

**`GraphBranch`** `{ colour: number; lines: GraphLine[] }`: one track.

| Field    | Meaning                                                                                                                                      |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `colour` | The track's colour number (§3.9). Every line in `lines` is drawn in it, including merge-link lines stored here.                              |
| `lines`  | The track's own lines, then the lines of the merge links stored in it, in the order of §3.10. Empty for a track that starts on the last row. |

**`GraphLine`** `{ child: number; parent: number | null; p1: GraphPoint; p2: GraphPoint; isCommitted: boolean; lockedFirst: boolean }`: one piece of a drawn edge, always spanning exactly one row step.

| Field         | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `child`       | The row of the commit whose edge (or loose end) this line helps draw. It stays the same for every line of that edge, however many rows the edge crosses.                                                                                                                                                                                                                                                                                                                                                                          |
| `parent`      | The row of that edge's parent, or `null` for a loose-end line.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `p1`          | The upper end of the line.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `p2`          | The lower end of the line. Always `p2.y = p1.y + 1`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `isCommitted` | `false` for the lines that draw the uncommitted row's edge (exact rule in §3.8.4), `true` for all others. Uncommitted lines are drawn grey.                                                                                                                                                                                                                                                                                                                                                                                       |
| `lockedFirst` | Which end of the line its lane change is drawn at. `true`: next to `p1`. In the angular style the diagonal starts at `p1` and the line runs straight into `p2`. When the details panel opens between the two rows, the lane change stays above the panel. `false`: next to `p2`. The line leaves `p1` straight and changes lane just before `p2`, below the panel if one is open in between. The rounded style's curve does not depend on it otherwise. It has no visible effect when `p1.x = p2.x`, but it still follows §3.8.3. |

**`GraphPoint`** `{ x: number; y: number }`: `x` is a lane and `y` is a row.

**Exact shapes.** Every object in the result is a plain object with exactly the properties listed above and no others, not even properties set to `undefined`. The tests compare the empty result with `toEqual`, deep-copy layouts with `structuredClone`, and compare them before and after drawing.

**Other types in `types.ts`.** `GraphExpansion`, `GraphStroke` and `BranchRelation` belong to other modules and are not part of this module's interface. `Vertex`, `Branch` and `Connection` are working-state types for the lane-bookkeeping helpers (§2.2). They never appear in the result.

### 1.4 Types the current file uses from `types.ts`

`Branch`, `GraphBranch`, `GraphLayout`, `GraphLine`, `GraphVertex` and `Vertex`. The result types are required (§2.1). `Branch` and `Vertex` are only needed if the implementation uses the helpers of §2.2.

### 1.5 Who uses what

| File                                                                                                                                                                                | Uses                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/webview/components/commit/CommitTable.tsx`                                                                                                                                     | Imports `computeGraphLayout` and calls it inside `useMemo`, keyed on `[commits, head]`. From the result it uses `graphWidth(layout)` (that is, `lanes`) to size the graph column: `lanes × 16 + 16` px, clamped to 64–240 px. It reads `layout.vertices[index].colour` as the colour of each row's ref labels (falling back to 0), and `layout.vertices[i].x` to scroll a commit's lane into view. It passes the whole layout to `CommitGraph`. |
| `src/webview/components/commit/CommitGraph.tsx`                                                                                                                                     | Does not import this module; receives the layout. Sizes the `<svg>` from `lanes` and `vertices.length`. Draws one circle per vertex, in array order, at the vertex's lane and row: open when `isCurrent`, grey when `!isCommitted`, otherwise in the palette colour for `colour`. Draws each entry of `branches` with `branchStrokes`.                                                                                                          |
| `src/webview/graph/strokes.ts`                                                                                                                                                      | Does not import this module. Turns one track's lines, in order, into SVG paths. A line that starts where the previous one ended continues the same path, consecutive vertical lines are merged, a new path starts where `isCommitted` or the focus relation changes, and `lockedFirst` decides where a lane change bends.                                                                                                                       |
| `src/webview/graph/focus.ts` (`lineRelation`)                                                                                                                                       | Reads `line.child` and `line.parent` as the Git edge: a line takes its child commit's focus relation, and a "direct" child's line becomes "merged" unless the parent is the child's first parent (`parentHashes[0]`). This only works if `child` and `parent` name the edge's commits, not the rows the line passes.                                                                                                                            |
| `scripts/benchmark.mjs`                                                                                                                                                             | Bundles `computeGraphLayout` from `./src/webview/graph/layout` with esbuild for Node and times `graphLayout10000` (§5.1).                                                                                                                                                                                                                                                                                                                       |
| `tests/webview/graph/layout.test.ts`                                                                                                                                                | `computeGraphLayout` (all cases).                                                                                                                                                                                                                                                                                                                                                                                                               |
| `tests/webview/graph/strokes.test.ts`                                                                                                                                               | `computeGraphLayout` on every fixture, drawn with `branchStrokes`.                                                                                                                                                                                                                                                                                                                                                                              |
| `tests/webview/graph/utils.test.ts`                                                                                                                                                 | `computeGraphLayout` in the "layouts built on the lane bookkeeping" cases.                                                                                                                                                                                                                                                                                                                                                                      |
| `tests/webview/graph/focus.test.ts`                                                                                                                                                 | `computeGraphLayout` on one five-commit history.                                                                                                                                                                                                                                                                                                                                                                                                |
| `tests/webview/components/commit/GraphScroll.test.ts`, `ColumnResize.test.ts`, `WorkingTreeDetails.test.ts`, `WorkingTreeTiming.test.ts`; `GraphErrors.test.ts` through `GraphView` | Indirectly, by rendering `CommitTable`. `GraphScroll` and `ColumnResize` depend on the exact lanes of a 14-commit fan-in (E18).                                                                                                                                                                                                                                                                                                                 |
| `tests-ext/ui/history.test.cjs`                                                                                                                                                     | Indirectly: reads dot positions in a running VS Code and checks that changing the branch focus does not move any dot.                                                                                                                                                                                                                                                                                                                           |

---

## 2. Dependencies the implementation must use

### 2.1 Required

| What                   | Import                                                                                                             | What it is for                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Input element type     | `GitCommitNode` from `@/backend/types`                                                                             | The type of `commits`. Type-only import.                                                        |
| Uncommitted-row marker | `UNCOMMITTED_CHANGES` from `@/webview/constants`                                                                   | Recognising the uncommitted row. Compare with the constant; do not write `"*"` into the module. |
| Result types           | `GraphLayout`, `GraphBranch`, `GraphLine`, `GraphVertex` (and `GraphPoint` if needed) from `@/webview/graph/types` | The shapes of the result. Do not redeclare them. Type-only imports.                             |

The project compiles with `verbatimModuleSyntax`, so every type must be imported with `import type`.

### 2.2 Existing helpers (recommended; see Q11)

These already exist in the repository. They encode rules that §3 needs, and they are tested on their own.

| Import                                                                                                                                                                          | What it is for                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pointOf`, `nextPointOf`, `connectionTo`, `takePoint`, `joinBranch` from `@/webview/graph/utils`; `createVertex` from `@/webview/graph/vertex`; the types `Vertex` and `Branch` | A per-row lane-occupancy model that matches §3.5 to §3.7. The lanes of a row are handed out lowest first and never given back. Each occupied lane remembers which target commit and which track it was taken for, and can be looked up by that pair. A commit's first placement is permanent. The contracts are in `docs/clean-room/graph-utils.md` §3.7 to §3.12. Under those contracts, a vertex's `nextX` is the number of lanes occupied in its row, which is what §3.11 counts.              |
| `createBranchColours` from `@/webview/graph/branchColours`                                                                                                                      | A colour-number allocator. `claim(row)` returns the lowest colour number whose recorded end row is less than `row`, or else a new number (one more than the highest so far). `release(colour, row)` records `row` as the end row of that colour. A newly handed-out number counts as ending at row 0 until it is released, so each colour must be released before the next `claim`. §3.9's rule is authoritative. A track that reaches the last row must never free its colour for a later track. |

`Branch` objects are only compared by identity by those helpers. How the implementation fills their fields is up to it.

### 2.3 Not allowed

- No DOM, `window`, VS Code API, Preact, signals, timers or third-party packages. The benchmark runs the module in plain Node, and the graph tests run in Vitest's Node environment.
- Do not import `@/webview/graph/palette` or `@/webview/lib/webview-config`, which read webview settings. Colours are numbers here.
- Importing the module must have no side effects.

### 2.4 Build rules

The file belongs to the webview TypeScript project (`src/webview/tsconfig.json`, extending `tsconfig.base.json`), which enables `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters` and `verbatimModuleSyntax`. It must pass `pnpm run typecheck`, `pnpm run lint` (oxlint) and `pnpm run format` (oxfmt).

---

## 3. Behaviour

### 3.1 Reading the input, and the input contract

1. **Rows.** Row `r` is `commits[r]`, and `vertices[r]` describes it. The list's order is the drawing order.
2. **Finding commits by hash.** When a hash occurs more than once in the list, both parent references and `commitHead` resolve to its **last** occurrence. The earlier rows with that hash are then commits that nothing points at (E19b).
3. **Loaded parents.** A commit's loaded parents are its `parentHashes` entries that resolve to a row, in `parentHashes` order. Entries that resolve to nothing are dropped. Duplicate entries are kept: each is an edge of its own (E19a).
4. **First loaded parent.** If the first entry of `parentHashes` is missing from the list, the next loaded entry takes the first-parent role for the layout (E10a).
5. **Contract.** Within this contract, the result is fully determined by §3.2 to §3.11:
   - Every loaded parent lies strictly below its child (a higher row), and no commit is its own parent.
   - The uncommitted row, if any, has exactly one entry in `parentHashes`.

   Everything the extension produces meets this contract. Both sources of the list (`loadCommits` and the history search) run `git log --date-order`, which never lists a parent before its children. The backend adds the uncommitted row only in front of a page that contains HEAD's commit, with that commit as its only parent. §3.14 lists what happens outside the contract.

6. **What matters.** The result depends only on the order of the list, each commit's `hash` and `parentHashes`, and `commitHead`. Nothing else in the commits matters. Nothing outside the call matters either: focus, selection, open details and settings have no effect.
7. **No changes to the input.** The array and the commit objects must be left exactly as they were.

### 3.2 One vertex per row

- `vertices` has one entry per row, in row order, with `y` equal to its index.
- `x` and `colour` come from the commit's placement (§3.5, §3.9).
- `isCommitted` is `false` for row 0 when it is the uncommitted row, and `true` for every other vertex. A `"*"` hash in any other row is an ordinary commit (E21).
- `isCurrent`:
  - When row 0 is the uncommitted row, row 0 is current and no other vertex is. `commitHead` is then ignored completely, even when it names a loaded commit.
  - Otherwise, the vertex whose hash equals `commitHead` is current (its last occurrence, see §3.1), and no other.
  - When `commitHead` is `null` or names no loaded commit, no vertex is current.

### 3.3 Routes

Every line of the result belongs to exactly one route, and the routes are these:

- **New-tip tracks.** A track starts at every commit that is not a loaded parent of any commit in the list (with hashes resolved as in §3.1): branch tips, the uncommitted row, and commits whose children are not loaded. It places that commit. Its first target is the commit's first loaded parent. Within the contract, every other commit is placed by a track arriving at it from above.
- **For each extra parent P of a commit C**, one route:
  - a **merge link** from C to P, if P was already placed by an earlier route (in the order of §3.4);
  - otherwise a **side track**, which starts at C's dot with P as its first target.

Every edge is drawn by exactly one route. The first-parent edge of a commit is drawn by that commit's placing track, which carries on from the commit to its first loaded parent (§3.6). An extra-parent edge is drawn by the merge link or side track made for it. A commit with no loaded parents gets a loose end from its placing track instead (§3.6), unless it is on the last row.

### 3.4 Precedence

Routes are ordered as follows. This order decides who gets which lane (§3.5), which colours are free (§3.9), and the order of the output (§3.10).

1. Routes that start from a higher row come first: all routes starting at row 0, then all routes starting at row 1, and so on.
2. Within one row:
   - the new-tip track, if the commit is a tip, comes first;
   - then comes one route per extra parent, in the order of the commit's loaded parents (so a later `parentHashes` entry comes later).

Whether an extra parent gets a merge link or a side track (§3.3) depends only on routes earlier in this order.

### 3.5 Lanes

Lanes are counted separately in every row.

- **Occupying lanes.** In each row, lanes are handed out lowest first, one per occupying route, and are never handed back or reused. A route occupies at most one lane in a row. **The lane a route gets in row `r` equals the number of routes before it in precedence order that also occupy a lane in row `r`.** So the lanes occupied in any row are always exactly `0, 1, …, k − 1`.
- **Routes that occupy a lane in row `r`:**
  1. the track that places row `r`'s commit. Its lane in row `r` is the commit's dot. This is either the new-tip track starting at `r`, or a track arriving at `r`'s unplaced commit;
  2. a track passing through row `r`, whether heading for a target further down or running a loose end;
  3. a merge link passing through row `r` without joining there (§3.7).
- **Routes in row `r` that do not occupy a lane:**
  1. a track that arrives at `r`'s commit after an earlier route placed it. The track's line ends on the existing dot;
  2. a merge link that joins in row `r` (§3.7);
  3. a side track or merge link that starts at row `r`. It starts from the dot, which is already there.
- **Consequences.**
  - A commit's dot lands in the lowest lane that routes before its placing track left free in its row. When routes earlier in precedence pass through that row, the dot is pushed right: in E10b, `other` sits in lane 2.
  - A route's lane can change from row to row. It moves left in rows where fewer earlier routes are present (E12b), and right where more are.
  - Every line end is either a dot or a lane occupied by that line's own route. No line ever passes through the dot of a commit other than its own child or parent.

### 3.6 Tracks

A track starts at a commit S in row `s`.

- A **new-tip track** places S in the lane it occupies in row `s`. Its first target is S's first loaded parent, or none.
- A **side track** starts from S's existing dot and occupies nothing in row `s`. Its first target is the extra parent it was made for, which is not placed at that moment.

From there the track goes down one row at a time and draws one line per row step, from its point in the previous row to its point in the current row. At each moment it has a **latest commit**, S at first, and a **target**: the first target given above, and after each placement the first loaded parent of the newly placed commit, or none. In each row `i` that it reaches:

- **Row `i` is not the target's row, or there is no target.** The track occupies a lane in row `i` (§3.5).
- **Row `i` is the target's row, and the target is already placed.** The line ends on the target's dot.
- **Row `i` is the target's row, and the target is not placed yet.** The track occupies a lane in row `i` and places the target there, which gives the target the track's colour. The target becomes the latest commit, and the new target is its first loaded parent, or none.

The track stops as soon as it arrives at an already placed dot, or once it has drawn its line into the last row of the list, whichever comes first. The row where it stops is the track's **last row**. A track that starts on the last row stops at once and has no lines.

It follows that:

- A track follows first parents: after its first target, it always continues along first loaded parents.
- When the latest commit has no loaded parent, the track continues as a **loose end**. It draws lines with `parent: null` in each row down to the last row, occupying a lane in each. A commit with no loaded parent on the last row gets no loose end.
- A track never passes its target's row while still heading for it.

### 3.7 Merge links

A merge link draws the edge from commit C (row `c`) to its extra parent P (row `p`), where P was placed by some track T_P. The link's lines are stored in T_P's entry of `branches` and share its colour.

The link starts at C's dot and goes down one row at a time, drawing one line per row step. In each row `i` below `c`:

- **The link joins.** Row `i` may already hold, from routes earlier in precedence, a point that belongs to T_P's entry and leads into P. Such a point is either P's own dot, or the lower end (`p2`) of a line stored in T_P's entry whose `parent` is P. That means T_P's own line into P, or an earlier merge link into P. If so, the link's line ends at that point and the link stops. If there are several such points in the row, it ends at the lowest lane.
- **Otherwise** the link occupies a lane in row `i` (§3.5) and goes on.

Because P's dot is in row `p`, a link always stops at row `p` at the latest. It stops earlier when it meets the line that T_P draws into P (E7, E12a), or an earlier merge link into P (E11). Lines that other tracks draw into P do not count: a link never joins them, even when they are closer (E8).

### 3.8 Line fields

#### 3.8.1 `child` and `parent`

- A track's lines between its latest commit L and L's target P have `child = row of L` and `parent = row of P`. For a side track, L is the commit it started from until it reaches its first target.
- Loose-end lines have `child` set to the row of the commit without loaded parents, and `parent: null`.
- All lines of a merge link from C to P have `child = row of C`, `parent = row of P`.
- For every line: `child ≤ p1.y`, and when `parent` is not `null`, `p2.y ≤ parent`.

#### 3.8.2 `p1` and `p2`

- `p2.y = p1.y + 1` for every line.
- A route's lines are continuous: each line's `p1` equals the previous line's `p2`. The first line of a route starts at the dot of the commit the route starts from.
- A track's last line ends either on the already placed dot it arrived at, or in the lane it occupies in the list's last row. That lane holds the dot of the last row's commit if the track placed it there; otherwise it is a pass-through or loose-end point. A merge link's last line ends on the point it joins.

#### 3.8.3 `lockedFirst`

- `true` for every line that moves to a higher lane (`p2.x > p1.x`), whichever kind of route it belongs to.
- `true` for the last line of every merge link, the one that joins, whatever its direction, including straight down.
- `false` for every other line: straight lines that do not end a merge link, and every track line that moves to a lower lane.

#### 3.8.4 `isCommitted`

- A line can be uncommitted only if its `child` is the uncommitted row. When there is no uncommitted row, every line is committed.
- The lines whose child is the uncommitted row are the first lines of track 0 (the uncommitted row's new-tip track). They run from row 0 to the row of HEAD's commit, or to the last row as a loose end when that commit is not loaded.
- Let `m` be the smallest row from which a merge link stored in track 0 starts, or infinity when track 0 holds no merge link. Such links go into HEAD's commit or into a commit further down HEAD's first-parent chain. A line of the uncommitted row's edge that leaves row `k` is:
  - uncommitted (`isCommitted: false`) when `k ≤ m`;
  - committed (`isCommitted: true`) when `k > m`.
- Every other line is committed.

In the usual case no such link starts above HEAD's row, and the whole edge from the uncommitted row to HEAD is uncommitted (E15). E16 shows the other case, and Q1 asks whether it is intended.

### 3.9 Colours

1. **A track's colour** is chosen when it starts, from its start row `s`. It is the lowest number `c ≥ 0` for which every earlier track with colour `c` has its last row above `s` (strictly less than `s`). When no number qualifies, it is the next unused number, which is how many distinct numbers are in use so far.
2. **A track's last row** is the row where it arrives at an already placed dot, or the last row of the list when it reaches it: by placing a commit there, by running a loose end into it, or by starting there.
3. **Dots** take the colour of their placing track. The first placement is permanent, so a commit keeps that colour even when other tracks arrive at it later (E4).
4. **Merge links** take the colour of the target's placing track, because they are stored in it. Loose ends take their track's colour.

Consequences, all observed:

- The colour numbers in use are always `0 … k − 1`, with no gaps. Track 0 has colour 0, and row 0's dot is in lane 0 with colour 0.
- Two different tracks with the same colour never have a point in the same row.
- A colour becomes free again in the row right below the row where its track ended, not in that row itself (E13a against E13b).
- A track that reaches the last row keeps its colour for good (E5, E6).

### 3.10 Order of tracks and of lines

- `branches` holds one entry per track, in precedence order (§3.4). Its `colour` is the track's colour.
- An entry's `lines` hold, in this order:
  1. the track's own lines, from top to bottom, as one continuous chain;
  2. then, for each merge link stored in this track, in precedence order of the links, that link's lines from top to bottom.
- A track that starts on the last row has `lines: []`. That is the only way a track can have no lines.

The order matters to `strokes.ts`, which builds paths from consecutive lines. A different order would give different SVG paths even though the picture looks the same.

### 3.11 Number of lanes

`lanes` is the largest number of lanes occupied in any single row, which equals one more than the largest `x` of any dot, `p1` or `p2`. It is 0 for an empty list and at least 1 otherwise. Every lane from 0 to `lanes − 1` is used in at least one row. Loose ends count like any other line.

### 3.12 Invariants (summary)

For every input within the contract:

1. `vertices.length === commits.length`, and `vertices[r].y === r`.
2. Every line has `p2.y === p1.y + 1`.
3. Every `x`, whether of a dot or of a line end, is an integer from 0 to `lanes − 1`.
4. In every row, the lanes used by dots and line ends are exactly `0 … k − 1` for some `k ≥ 1`.
5. Connectivity: for every edge (C, P), repeatedly following lines whose `parent` is P, from C's dot, each time from a line's `p2` to the next line starting there, reaches P's dot.
6. A line end that coincides with a dot belongs to that dot's commit, as the line's `child` or `parent`.
7. `lines` whose `parent` is not `null` point at a real edge: `commits[parent].hash` is among `commits[child].parentHashes`.
8. Each track's own lines form one continuous chain from its start dot. Merge-link lines follow, one continuous chain per link.
9. §3.9's colour consequences hold.
10. The input is unchanged, and the result shares no objects with it.

The existing topology test checks 2, 3, 5, 6, 7 and 10.

### 3.13 Edge cases

- **Empty list.** The result is exactly `{ branches: [], vertices: [], lanes: 0 }` (E1).
- **One commit.** One track with no lines, one vertex at lane 0 with colour 0, and `lanes: 1` (E2). This is the same when the commit's parent is missing.
- **Octopus merges.** Each extra parent gets its own route, in parent order. Unplaced ones get side tracks, each with its own lanes and a colour chosen by §3.9. Placed ones get merge links (E6, E12).
- **Parents missing from the list.**
  - A commit with no loaded parent, not on the last row, gets a loose end to the bottom (E10a, E17).
  - A commit with at least one loaded parent gets nothing for its missing ones (E19c).
  - When the first parent is missing, the next loaded parent is followed as if it were the first: straight on, in the same track and colour (E10a).
  - When more commits are appended, the layout of the rows already shown can change completely (E10a against E10b; Q4).
- **Several roots, independent histories.** A root that is not on the last row gets a loose end like any commit without loaded parents (E9, E14; Q3). Independent histories are drawn side by side, and their tracks never join.
- **Uncommitted row.** Its dot is uncommitted and current. Its edge is uncommitted over every row it crosses when HEAD's commit is further down (E15b). When HEAD's commit is not loaded, it runs as an uncommitted loose end (E15c). For the effect of merge links into HEAD's track, see §3.8.4.
- **A commit on the last row.** Nothing is drawn below it. Loose ends stop there.
- **Long histories.** There is no limit on rows, tracks, lanes or colour numbers. The layout must work for at least 50,000 rows without deep recursion, and the result grows with the total length of all routes (§5).
- **Head.** A `null` or unknown `commitHead` marks nothing (E19c). A duplicated hash marks its last row (E19b).

### 3.14 Outside the contract (current behaviour; a replacement need not copy it)

- **A parent above its child, or a commit that is its own parent.**
  - For a commit whose only loaded parent is itself or lies above it, the current code never returns and keeps allocating memory. Observed with `[a → a, b]` and with `[h → b, * → h, b]`, where the `"*"` row is not row 0.
  - When a merge's extra parent lies above it, or is the merge itself, the call returns, but a merge link runs from the merge down to the last row without ever joining. Its `parent` row is not below its `child` row (observed with `[x → b, m → a, x, a → b, b]` and `[m → a, m, a]`).

  See Q6.

- **An uncommitted row with more than one parent.** Its second edge is drawn normally, but the uncommitted flags land on the wrong lines. With rows `* → h, b`, `h → b`, `x → b`, `b`, the first three lines of track 0 come out uncommitted, including the committed edge from `h` to `b`, while the merge link from `*` to `b` comes out committed. See Q2.

---

## 4. Concrete examples

All results were observed with the current code. They include every fixture in `tests/webview/graph/fixtures.ts` and every history written inline in the graph tests and the component tests.

### 4.1 Notation

In the drawings, each row of the table is one text line, and the text line between two rows shows the line pieces between them. Lanes are four characters apart.

```text
o  a commit's dot           @  the current commit (isCurrent)      ~  the uncommitted row's dot
|  a line in its lane       \  a line moving to a higher lane      /  a line moving to a lower lane
_  the flat part of a move across more than one lane                +  two lines crossing or overlapping
```

The drawings show lanes only. The lists under them are the exact result:

- **dots** as `row: lane/colour`, with `current` or `uncommitted` added when set;
- **tracks** in `branches` order. Each line is written `child→parent x1,y1→x2,y2`, with `none` for a `null` parent. `[early]` means `lockedFirst: true` and `[uncommitted]` means `isCommitted: false`. A line without a flag has `lockedFirst: false` and `isCommitted: true`.

### E1. Empty list

`computeGraphLayout([], null)` returns exactly `{ branches: [], vertices: [], lanes: 0 }`.

### E2. One commit (head `a`)

```text
@      row 0  a (no parents)
```

- lanes: 1
- dots: 0: 0/0 current
- track 0, colour 0: no lines

Exact result: `{ branches: [{ colour: 0, lines: [] }], vertices: [{ x: 0, y: 0, colour: 0, isCommitted: true, isCurrent: true }], lanes: 1 }`. The same result comes back when `a` lists a parent that is not loaded.

### E3. A straight history (head `b`)

```text
o      row 0  c → b
|
@      row 1  b → a
|
o      row 2  a (no parents)
```

- lanes: 1
- dots: 0: 0/0; 1: 0/0 current; 2: 0/0
- track 0, colour 0: `0→1 0,0→0,1`, `1→2 0,1→0,2`

### E4. A simple merge (head `m`; `utils.test.ts`, "keeps a commit in the colour of its first placement")

```text
@          row 0  m → a, b
|\_\
o   |      row 1  a → base
|   |
|   o      row 2  b → base
|/_/
o          row 3  base (no parents)
```

- lanes: 2
- dots: 0: 0/0 current; 1: 0/0; 2: 1/1; 3: 0/0
- track 0, colour 0: `0→1 0,0→0,1`, `1→3 0,1→0,2`, `1→3 0,2→0,3`
- track 1, colour 1: `0→2 0,0→1,1 [early]`, `0→2 1,1→1,2`, `2→3 1,2→0,3`

Covers: a new-tip track following first parents; a side track for an unplaced extra parent; a track arriving at a placed dot and stopping there (track 1 at `base`); first placement keeps the colour (`base` stays colour 0); a track moving right is early, moving left is not.

### E5. Fixture "reused lanes" (head `null`)

```text
o          row 0  merge → main, topic
|\_\
o   |      row 1  main → between
|   |
|   o      row 2  topic → between
|/_/
o          row 3  between → older-merge
|
o          row 4  older-merge → older-main, older-topic
|\_\
o   |      row 5  older-main → base
|   |
|   o      row 6  older-topic → base
|/_/
o          row 7  base (no parents)
```

- lanes: 2
- dots: 0: 0/0; 1: 0/0; 2: 1/1; 3: 0/0; 4: 0/0; 5: 0/0; 6: 1/1; 7: 0/0
- track 0, colour 0: `0→1 0,0→0,1`, `1→3 0,1→0,2`, `1→3 0,2→0,3`, `3→4 0,3→0,4`, `4→5 0,4→0,5`, `5→7 0,5→0,6`, `5→7 0,6→0,7`
- track 1, colour 1: `0→2 0,0→1,1 [early]`, `0→2 1,1→1,2`, `2→3 1,2→0,3`
- track 2, colour 1: `4→6 0,4→1,5 [early]`, `4→6 1,5→1,6`, `6→7 1,6→0,7`

Covers: colour reuse. Track 1 ends at row 3, so track 2, which starts at row 4, takes colour 1 again; track 0 reaches the bottom and keeps colour 0. Lanes are per row, so lane 1 is used again.

### E6. Fixture "octopus merge" (head `null`)

```text
o                  row 0  merge → main, one, two, three
|\_+___+___\
o   |   |   |      row 1  main → base
|   |   |   |
|   o   |   |      row 2  one → base
|   |   |   |
|   |   o   |      row 3  two → base
|   |   |   |
|   |   |   o      row 4  three → base
|/_+___+___/
o                  row 5  base (no parents)
```

- lanes: 4
- dots: 0: 0/0; 1: 0/0; 2: 1/1; 3: 2/2; 4: 3/3; 5: 0/0
- track 0, colour 0: `0→1 0,0→0,1`, `1→5 0,1→0,2`, `1→5 0,2→0,3`, `1→5 0,3→0,4`, `1→5 0,4→0,5`
- track 1, colour 1: `0→2 0,0→1,1 [early]`, `0→2 1,1→1,2`, `2→5 1,2→1,3`, `2→5 1,3→1,4`, `2→5 1,4→0,5`
- track 2, colour 2: `0→3 0,0→2,1 [early]`, `0→3 2,1→2,2`, `0→3 2,2→2,3`, `3→5 2,3→2,4`, `3→5 2,4→0,5`
- track 3, colour 3: `0→4 0,0→3,1 [early]`, `0→4 3,1→3,2`, `0→4 3,2→3,3`, `0→4 3,3→3,4`, `4→5 3,4→0,5`

Covers: one side track per unplaced extra parent, in parent order. Tracks 1 to 3 end at row 5, where every new track starts at row 0, so no colour is free for reuse. A track moves several lanes in one line.

### E7. Fixture "criss-cross merges" (head `null`)

```text
o              row 0  tip → left-merge, right-merge
|\_\
o   |          row 1  left-merge → left, right
|\__+__\
|   o   |      row 2  right-merge → right, left
|/_/|/_/
o   |          row 3  left → base
|   |
|   o          row 4  right → base
|/_/
o              row 5  base (no parents)
```

- lanes: 3
- dots: 0: 0/0; 1: 0/0; 2: 1/1; 3: 0/0; 4: 1/1; 5: 0/0
- track 0, colour 0: `0→1 0,0→0,1`, `1→3 0,1→0,2`, `1→3 0,2→0,3`, `3→5 0,3→0,4`, `3→5 0,4→0,5`, `2→3 1,2→0,3 [early]`
- track 1, colour 1: `0→2 0,0→1,1 [early]`, `0→2 1,1→1,2`, `2→4 1,2→1,3`, `2→4 1,3→1,4`, `4→5 1,4→0,5`, `1→4 0,1→2,2 [early]`, `1→4 2,2→1,3 [early]`

Covers: merge links in both directions. The link from `left-merge` (row 1) to `right` (row 4) is stored in `right`'s track (track 1, colour 1), not in `left-merge`'s. It crosses lane 1 in row 2, taking lane 2, and joins track 1's line into `right` at `1,3`, one row before `right`. The link from `right-merge` to `left` is stored in track 0 and joins `left`'s dot directly. A link's joining line is early even when it moves left. Link lines come after the track's own lines.

### E8. Fixture "merge into a parent another branch reached first" (head `tip`; `utils.test.ts`, "ends a merge on the dot of a parent another branch reached first")

```text
@              row 0  tip → merge, side
|\_\
o   |          row 1  merge → main, base
|\__+__\
|   o   |      row 2  side → base
|   |   |
o   |   |      row 3  main → base
|/_+___/
o              row 4  base (no parents)
```

- lanes: 3
- dots: 0: 0/0 current; 1: 0/0; 2: 1/1; 3: 0/0; 4: 0/0
- track 0, colour 0: `0→1 0,0→0,1`, `1→3 0,1→0,2`, `1→3 0,2→0,3`, `3→4 0,3→0,4`, `1→4 0,1→2,2 [early]`, `1→4 2,2→2,3`, `1→4 2,3→0,4 [early]`
- track 1, colour 1: `0→2 0,0→1,1 [early]`, `0→2 1,1→1,2`, `2→4 1,2→1,3`, `2→4 1,3→0,4`

Covers: a merge link does not join a line that another track draws into the same parent. Track 1's line into `base` passes `1,3`, but the link from `merge` goes on in lane 2 and joins `base`'s dot. A link's straight line is not early; its final line is. With head `null`, the result is the same except that no dot is current.

### E9. Fixture "shallow roots" (head `null`)

```text
o          row 0  merge → main, shallow
|\_\
o   |      row 1  main → base
|   |
|   o      row 2  shallow (no parents)
|   |
o   |      row 3  base (no parents)
```

- lanes: 2
- dots: 0: 0/0; 1: 0/0; 2: 1/1; 3: 0/0
- track 0, colour 0: `0→1 0,0→0,1`, `1→3 0,1→0,2`, `1→3 0,2→0,3`
- track 1, colour 1: `0→2 0,0→1,1 [early]`, `0→2 1,1→1,2`, `2→none 1,2→1,3`

Covers: a root that is not on the last row gets a loose end (Q3). A root on the last row (`base`) does not.

### E10a. Fixture "parents outside the page" (head `null`)

```text
o          row 0  merge → outside-main, topic
|
|   o      row 1  other → outside-other
|   |
o   |      row 2  topic → outside-topic
```

- lanes: 2
- dots: 0: 0/0; 1: 1/1; 2: 0/0
- track 0, colour 0: `0→2 0,0→0,1`, `0→2 0,1→0,2`
- track 1, colour 1: `1→none 1,1→1,2`

Covers: a missing first parent hands the first-parent role to `topic`, which sits straight below `merge` in the same track. A commit with no loaded parent (`other`) gets a loose end. The last row gets none, even though `topic`'s parent is missing too.

### E10b. The same page with older commits appended (`layout.test.ts`, "resolves page-boundary parents when older commits are appended")

```text
o              row 0  merge → outside-main, topic
|\_\
|   |   o      row 1  other → outside-other
|   |   |
|   o   |      row 2  topic → outside-topic
|   |   |
o   |   |      row 3  outside-main → base
|   |   |
|   |   o      row 4  outside-other → base
|   |   |
|   o   |      row 5  outside-topic → base
|/_+___/
o              row 6  base (no parents)
```

- lanes: 3
- dots: 0: 0/0; 1: 2/2; 2: 1/1; 3: 0/0; 4: 2/2; 5: 1/1; 6: 0/0
- track 0, colour 0: `0→3 0,0→0,1`, `0→3 0,1→0,2`, `0→3 0,2→0,3`, `3→6 0,3→0,4`, `3→6 0,4→0,5`, `3→6 0,5→0,6`
- track 1, colour 1: `0→2 0,0→1,1 [early]`, `0→2 1,1→1,2`, `2→5 1,2→1,3`, `2→5 1,3→1,4`, `2→5 1,4→1,5`, `5→6 1,5→0,6`
- track 2, colour 2: `1→4 2,1→2,2`, `1→4 2,2→2,3`, `1→4 2,3→2,4`, `4→6 2,4→2,5`, `4→6 2,5→0,6`

Covers: a dot pushed right by routes earlier in precedence (`other` in lane 2, because tracks 0 and 1 pass row 1 first). Compared with E10a, `topic` moved from lane 0, colour 0 to lane 1, colour 1 (Q4).

### E11. A merge link joining an earlier merge link (head `null`)

```text
o          row 0  m1 → m2, base
|\_\
o   |      row 1  m2 → a, base
|\_\|
o   |      row 2  a → base
|/_/
o          row 3  base (no parents)
```

- lanes: 2
- dots: 0: 0/0; 1: 0/0; 2: 0/0; 3: 0/0
- track 0, colour 0: `0→1 0,0→0,1`, `1→2 0,1→0,2`, `2→3 0,2→0,3`, `0→3 0,0→1,1 [early]`, `0→3 1,1→1,2`, `0→3 1,2→0,3 [early]`, `1→3 0,1→1,2 [early]`

Covers: the second link into `base` (from `m2`) joins the first link's line at `1,2` and stops there. It is a single line.

### E12a. Extra-parent order: `m → a, c, b` (head `null`)

```text
o              row 0  m → a, c, b
|\_+___\
o   |   |      row 1  a → b
|/__+__/
|   o          row 2  c → r
|   |
o   |          row 3  b → r
|/_/
o              row 4  r (no parents)
```

- lanes: 3
- dots: 0: 0/0; 1: 0/0; 2: 1/1; 3: 0/0; 4: 0/0
- track 0, colour 0: `0→1 0,0→0,1`, `1→3 0,1→0,2`, `1→3 0,2→0,3`, `3→4 0,3→0,4`, `0→3 0,0→2,1 [early]`, `0→3 2,1→0,2 [early]`
- track 1, colour 1: `0→2 0,0→1,1 [early]`, `0→2 1,1→1,2`, `2→4 1,2→1,3`, `2→4 1,3→0,4`

Covers: `b` is already placed by track 0 (through `a`), so it gets a merge link, which comes after the side track to `c` because `c` is listed earlier. The link takes lane 2 in row 1, crosses track 1, and joins track 0's line into `b` at `0,2`, a row before `b`.

### E12b. The same rows with the parents in another order: `m → a, b, c` (head `null`)

```text
o              row 0  m → a, b, c
|\_+___\
o   |   |      row 1  a → b
|/_/ /_/
|   o          row 2  c → r
|   |
o   |          row 3  b → r
|/_/
o              row 4  r (no parents)
```

- lanes: 3
- dots: 0: 0/0; 1: 0/0; 2: 1/1; 3: 0/0; 4: 0/0
- track 0, colour 0: `0→1 0,0→0,1`, `1→3 0,1→0,2`, `1→3 0,2→0,3`, `3→4 0,3→0,4`, `0→3 0,0→1,1 [early]`, `0→3 1,1→0,2 [early]`
- track 1, colour 1: `0→2 0,0→2,1 [early]`, `0→2 2,1→1,2`, `2→4 1,2→1,3`, `2→4 1,3→0,4`

Covers: only the order of `m`'s parents differs from E12a. Now the merge link to `b` comes before the side track to `c`, so the link takes lane 1 in row 1 and the side track lane 2. In row 2 the link has already joined, so the side track moves left to lane 1 before it places `c`. The dots are the same as in E12a; the lines are not.

### E13a. A colour is not reused in the row where its track ended (head `null`)

```text
o          row 0  t → a, b
|\_\
o   |      row 1  a → x
|   |
|   o      row 2  b → x
|/_/
o          row 3  x → y, z
|\_\
o   |      row 4  y → r
|   |
|   o      row 5  z → r
|/_/
o          row 6  r (no parents)
```

- lanes: 2
- dots: 0: 0/0; 1: 0/0; 2: 1/1; 3: 0/0; 4: 0/0; 5: 1/2; 6: 0/0
- track 0, colour 0: `0→1 0,0→0,1`, `1→3 0,1→0,2`, `1→3 0,2→0,3`, `3→4 0,3→0,4`, `4→6 0,4→0,5`, `4→6 0,5→0,6`
- track 1, colour 1: `0→2 0,0→1,1 [early]`, `0→2 1,1→1,2`, `2→3 1,2→0,3`
- track 2, colour 2: `3→5 0,3→1,4 [early]`, `3→5 1,4→1,5`, `5→6 1,5→0,6`

Covers: track 1 ends at row 3, and track 2 starts at row 3, so track 2 cannot reuse colour 1 and gets colour 2.

### E13b. A colour is reused in the row after (head `null`)

```text
o          row 0  t → a, b
|\_\
o   |      row 1  a → x
|   |
|   o      row 2  b → x
|/_/
o          row 3  x → y
|
|   o      row 4  m → y, z
|/_/|
o   |      row 5  y → r
|   |
|   o      row 6  z → r
|/_/
o          row 7  r (no parents)
```

- lanes: 2
- dots: 0: 0/0; 1: 0/0; 2: 1/1; 3: 0/0; 4: 1/1; 5: 0/0; 6: 1/2; 7: 0/0
- track 0, colour 0: `0→1 0,0→0,1`, `1→3 0,1→0,2`, `1→3 0,2→0,3`, `3→5 0,3→0,4`, `3→5 0,4→0,5`, `5→7 0,5→0,6`, `5→7 0,6→0,7`
- track 1, colour 1: `0→2 0,0→1,1 [early]`, `0→2 1,1→1,2`, `2→3 1,2→0,3`
- track 2, colour 1: `4→5 1,4→0,5`
- track 3, colour 2: `4→6 1,4→1,5`, `4→6 1,5→1,6`, `6→7 1,6→0,7`

Covers: `m` is a tip at row 4, so its new-tip track (track 2) starts at row 4 and reuses colour 1, which track 1 freed at row 3. Track 2 arrives at the placed `y` at once and ends at row 5. So the side track to `z`, which also starts at row 4, cannot have colour 1 and gets colour 2. `m`'s dot has colour 1.

### E14a. Two independent histories (head `null`)

```text
o          row 0  x2 → x1
|
|   o      row 1  y2 → y1
|   |
o   |      row 2  x1 (no parents)
|   |
|   o      row 3  y1 (no parents)
```

- lanes: 2
- dots: 0: 0/0; 1: 1/1; 2: 0/0; 3: 1/1
- track 0, colour 0: `0→2 0,0→0,1`, `0→2 0,1→0,2`, `2→none 0,2→0,3`
- track 1, colour 1: `1→3 1,1→1,2`, `1→3 1,2→1,3`

### E14b. Two roots only (head `null`)

```text
o          row 0  x1 (no parents)
|
|   o      row 1  y1 (no parents)
```

- lanes: 2
- dots: 0: 0/0; 1: 1/1
- track 0, colour 0: `0→none 0,0→0,1`
- track 1, colour 1: no lines

Covers: roots get loose ends, and a tip on the last row has a track with no lines.

### E15a. Uncommitted row directly above HEAD (head `head`; `layout.test.ts`, "handles empty history and keeps uncommitted edges separate from committed edges")

```text
~      row 0  * → head
|
o      row 1  head → base
|
o      row 2  base (no parents)
```

- lanes: 1
- dots: 0: 0/0 current uncommitted; 1: 0/0; 2: 0/0
- track 0, colour 0: `0→1 0,0→0,1 [uncommitted]`, `1→2 0,1→0,2`

`commitHead` names `head`, but row 0 is the current one. With `commitHead` `"base"` the result is the same.

### E15b. Uncommitted row with newer commits of another branch above HEAD (head `h`)

```text
~          row 0  * → h
|
|   o      row 1  f2 → f1
|   |
|   o      row 2  f1 → b
|   |
o   |      row 3  h → b
|/_/
o          row 4  b (no parents)
```

- lanes: 2
- dots: 0: 0/0 current uncommitted; 1: 1/1; 2: 1/1; 3: 0/0; 4: 0/0
- track 0, colour 0: `0→3 0,0→0,1 [uncommitted]`, `0→3 0,1→0,2 [uncommitted]`, `0→3 0,2→0,3 [uncommitted]`, `3→4 0,3→0,4`
- track 1, colour 1: `1→2 1,1→1,2`, `2→4 1,2→1,3`, `2→4 1,3→0,4`

### E15c. Uncommitted row whose parent is not loaded (head `h`)

```text
~          row 0  * → h
|
|   o      row 1  x → b
|   |
|   o      row 2  b (no parents)
```

- lanes: 2
- dots: 0: 0/0 current uncommitted; 1: 1/1; 2: 1/1
- track 0, colour 0: `0→none 0,0→0,1 [uncommitted]`, `0→none 0,1→0,2 [uncommitted]`
- track 1, colour 1: `1→2 1,1→1,2`

### E16a. A merge link into HEAD below the uncommitted row (head `h`; Q1)

```text
~          row 0  * → h
|
|   o      row 1  a → x, h
|/_/|
|   o      row 2  x (no parents)
|   |
o   |      row 3  h (no parents)
```

- lanes: 2
- dots: 0: 0/0 current uncommitted; 1: 1/1; 2: 1/1; 3: 0/0
- track 0, colour 0: `0→3 0,0→0,1 [uncommitted]`, `0→3 0,1→0,2 [uncommitted]`, `0→3 0,2→0,3`, `1→3 1,1→0,2 [early]`
- track 1, colour 1: `1→2 1,1→1,2`, `2→none 1,2→1,3`

Here `m = 1`. The piece of the uncommitted edge that leaves row 2 is committed. It is also where `a`'s link has joined it.

### E16b. A merge link into a commit below HEAD (head `h`; Q1)

```text
~                  row 0  * → h
|
|   o              row 1  z → y
|   |
|   |   o          row 2  a → b, q
|   |   |\_\
|   o   |   |      row 3  y → q
|   |   |   |
|   |   o   |      row 4  b → q
|   |   |   |
o   |   |   |      row 5  h → q
|/_+___+___/
o                  row 6  q (no parents)
```

- lanes: 4
- dots: 0: 0/0 current uncommitted; 1: 1/1; 2: 2/2; 3: 1/1; 4: 2/2; 5: 0/0; 6: 0/0
- track 0, colour 0: `0→5 0,0→0,1 [uncommitted]`, `0→5 0,1→0,2 [uncommitted]`, `0→5 0,2→0,3 [uncommitted]`, `0→5 0,3→0,4`, `0→5 0,4→0,5`, `5→6 0,5→0,6`, `2→6 2,2→3,3 [early]`, `2→6 3,3→3,4`, `2→6 3,4→3,5`, `2→6 3,5→0,6 [early]`
- track 1, colour 1: `1→3 1,1→1,2`, `1→3 1,2→1,3`, `3→6 1,3→1,4`, `3→6 1,4→1,5`, `3→6 1,5→0,6`
- track 2, colour 2: `2→4 2,2→2,3`, `2→4 2,3→2,4`, `4→6 2,4→2,5`, `4→6 2,5→0,6`

Here `m = 2`. The uncommitted edge's pieces leaving rows 3 and 4 are committed, although the link runs in lane 3 and never touches them.

### E17. Search results whose parents are all missing (head `null`)

```text
o              row 0  p → x
|
|   o          row 1  q → y
|   |
|   |   o      row 2  r → z
```

- lanes: 3
- dots: 0: 0/0; 1: 1/1; 2: 2/2
- track 0, colour 0: `0→none 0,0→0,1`, `0→none 0,1→0,2`
- track 1, colour 1: `1→none 1,1→1,2`
- track 2, colour 2: no lines

Covers: with `n` such rows the graph has `n` lanes and `n(n − 1)/2` lines. A history-search page of 100 unrelated results gives 100 lanes and 4,950 lines (Q5).

### E18. Fan-in of thirteen tips (`GraphScroll.test.ts`, `ColumnResize.test.ts`; head `null`)

Rows 0 to 12 are `commit0` … `commit12`, each with the single parent `commit13`; row 13 is `commit13`, a root.

- lanes: 13, which gives the graph column width of 224 px that `ColumnResize.test.ts` expects.
- dots: row `k` (0 ≤ k ≤ 12) at lane `k` with colour `k`; row 13 at lane 0 with colour 0.
- 13 tracks; track `k` has colour `k` and `13 − k` lines, all with `child` k and `parent` 13: straight down lane `k` from `k,k` to `k,12`, then `k,12→0,13`. There are no flags on any line. Track 0 is straight down lane 0 and places `commit13`.

With the uncommitted row `* → commit0` in front (as in `GraphScroll.test.ts`), everything moves down one row. Row 0 is `0/0 current uncommitted`, `commit0` is `0/0`, and `commit(k)` is at lane `k` with colour `k`. Track 0 starts `0→1 0,0→0,1 [uncommitted]`. `lanes` stays 13.

### E19a. A duplicated parent entry (head `null`; Q8)

```text
o      row 0  m → a, a
|
o      row 1  a → b
|
o      row 2  b (no parents)
```

- lanes: 1
- dots: 0: 0/0; 1: 0/0; 2: 0/0
- track 0, colour 0: `0→1 0,0→0,1`, `1→2 0,1→0,2`, `0→1 0,0→0,1 [early]`

### E19b. A duplicated hash (head `a`; Q7)

```text
o          row 0  m → a
|
|   o      row 1  a → b
|   |
@   |      row 2  a → b
|/_/
o          row 3  b (no parents)
```

- lanes: 2
- dots: 0: 0/0; 1: 1/1; 2: 0/0 current; 3: 0/0
- track 0, colour 0: `0→2 0,0→0,1`, `0→2 0,1→0,2`, `2→3 0,2→0,3`
- track 1, colour 1: `1→3 1,1→1,2`, `1→3 1,2→0,3`

### E19c. A missing extra parent, and a head that is not loaded (head `zzz`)

```text
o      row 0  m → a, zz
|
o      row 1  a → b
|
o      row 2  b (no parents)
```

- lanes: 1
- dots: 0: 0/0; 1: 0/0; 2: 0/0 (none current)
- track 0, colour 0: `0→1 0,0→0,1`, `1→2 0,1→0,2`

### E20. The history in `focus.test.ts` (head `merge`)

```text
o              row 0  other → base
|
|   @          row 1  merge → main, topic
|   |\_\
|   |   o      row 2  topic → base
|   |   |
|   o   |      row 3  main → base
|/_+___/
o              row 4  base (no parents)
```

- lanes: 3
- dots: 0: 0/0; 1: 1/1 current; 2: 2/2; 3: 1/1; 4: 0/0
- track 0, colour 0: `0→4 0,0→0,1`, `0→4 0,1→0,2`, `0→4 0,2→0,3`, `0→4 0,3→0,4`
- track 1, colour 1: `1→3 1,1→1,2`, `1→3 1,2→1,3`, `3→4 1,3→0,4`
- track 2, colour 2: `1→2 1,1→2,2 [early]`, `2→4 2,2→2,3`, `2→4 2,3→0,4`

The test relies on a line with `child` 1 and `parent` 2 (track 2's first line), and on `child` and `parent` naming Git edges.

### E21. `"*"` outside row 0 is an ordinary commit (head `*`)

```text
o      row 0  a → *
|
@      row 1  * → b
|
o      row 2  b (no parents)
```

- lanes: 1
- dots: 0: 0/0; 1: 0/0 current; 2: 0/0
- track 0, colour 0: `0→1 0,0→0,1`, `1→2 0,1→0,2`

### E22. The benchmark input (`scripts/benchmark.mjs`, head `"0"`)

There are 10,000 commits with hashes `"0"` … `"9999"`. Commit `i` has parent `i + 1` (except the last). When `i` is a multiple of 20 below 9,970, it also has parent `i + 20`.

- lanes: 2; one track (colour 0); every dot is at lane 0 with colour 0; row 0 is current.
- 19,979 lines. The first 9,999 are the straight chain `i→i+1 0,i→0,i+1`. They are followed by 499 merge links (from rows 0, 20, …, 9960) of 20 lines each. The link from row `i` is `i→i+20 0,i→1,i+1 [early]`, then 18 straight lines in lane 1, then `i→i+20 1,i+19→0,i+20 [early]`.

---

## 5. Non-functional requirements

### 5.1 Time

| Input                                                                                          | Rows                         | Result size                       | Current time                                  |
| ---------------------------------------------------------------------------------------------- | ---------------------------- | --------------------------------- | --------------------------------------------- |
| `graphLayout10000` (E22), `docs/benchmarks/2026-09-18.json`, Node v24.18.0, Threadripper 3970X | 10,000                       | 2 lanes, 1 track, 19,979 lines    | samples 33.7 / 64.2 / 28.1 ms, median 33.7 ms |
| Same input, this environment (Node v22.22.2), 15 samples                                       | 10,000                       | same                              | 14.5–55 ms, median 26 ms                      |
| Straight history                                                                               | 300 / 1,000 / 3,000 / 50,000 | 1 lane                            | 0.3 / 1.0 / 3.8 / about 64 ms                 |
| 16 interleaved branches (each commit's parent 16 rows lower), with a merge every 50 rows       | 10,000                       | 16 lanes, about 160,000 lines     | median about 52 ms                            |
| Every other row a merge of a one-commit side branch                                            | 10,000 / 30,000              | 5,000 / 15,000 tracks             | about 111 ms / 1,291 ms                       |
| Every other row a new tip whose parent is 9 rows lower on the main line                        | 10,000 / 30,000              | 5,001 / 15,001 tracks             | about 123 ms / 1,245 ms                       |
| Rows whose parents are all missing (E17)                                                       | 100 / 1,000 / 3,000          | 4,950 / 499,500 / 4,498,500 lines | 0.7 ms / about 0.3 s / about 6.7 s            |

Requirements:

1. On the benchmark input and on the page sizes the product uses (300 rows at first, 100 more per "load more", history-search pages of 100), the replacement must not be measurably slower than the current code. CI records `pnpm benchmark` without enforcing a threshold, so compare on the same machine.
2. The work is at least proportional to the size of the result (the total number of lines). Beyond that, the current code slows down super-linearly as the number of tracks grows (the merge-heavy rows above; Q10). A replacement may be faster; it must not be slower on any row of the table.
3. No recursion or stack depth that grows with the number of rows. 50,000 rows must work.

### 5.2 Memory

- The result is proportional to the number of lines. For E22 it retains about 3.1 MB, and for a 100-row page of E17 about 0.6 MB.
- Working memory beyond the result should be proportional to rows plus lines. The all-missing-parents case is quadratic in the result itself (3,000 rows used about 3 GB), which is inherent in the loose-end rule (Q5).
- The result must not keep references to the input's objects.

### 5.3 Purity and what callers rely on beyond the return value

1. **No side effects.** The call does not modify `commits`, the commit objects or their arrays. `layout.test.ts` checks this with `structuredClone` and `toEqual`. It writes no globals, and it keeps no state between calls: the colour allocation and the lane bookkeeping start fresh every time. Calls may be repeated and interleaved freely (every render and every test does).
2. **A new result every call.** `CommitTable` memoises on `[commits, head]`, and `CommitGraph` memoises its strokes on the layout object's identity. Each call must return new objects. It must not return a cached or shared layout that could later change.
3. **Deterministic.** The same input always gives a deep-equal result.
4. **Synchronous**, and it does not throw for any input within the contract (including an empty list and an unknown or `null` head).
5. **Plain data.** Only plain objects and arrays with the exact properties of §1.3. The current code uses the same point object as one line's `p2` and the next line's `p1`. No caller mutates the result (`strokes.test.ts` and `focus.test.ts` check that drawing leaves it unchanged), so sharing points or not is equally acceptable.
6. **Row alignment.** `CommitGraph` draws `vertices` in array order and `CommitTable` indexes them by row. Each vertex must be at its row's index.
7. **Independence from focus.** Changing the branch focus must not move a dot (checked by the UI test in `tests-ext/ui/history.test.cjs`). The layout takes no focus input, so this holds as long as §3.1 point 6 holds.

---

## 6. Test coverage

### 6.1 What the existing tests check

| Test file and case                                                                                                                | What it pins                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/webview/graph/layout.test.ts`, "connects all loaded parents in %s" (all six fixtures, head = row 0's hash)                 | `vertices[r].y === r`; only row 0 is current; invariants 2, 3, 5, 6 and 7 of §3.12; the input is unchanged.                                                                                                                                 |
| `layout.test.ts`, "reuses lanes and colours once a merged branch has ended"                                                       | E5: `lanes` 2; rows 2 and 6 in lane 1 with equal colours.                                                                                                                                                                                   |
| `layout.test.ts`, "fans out every octopus parent without sharing commit positions"                                                | E6: `lanes` 4; rows 1 to 4 in four different lanes.                                                                                                                                                                                         |
| `layout.test.ts`, "resolves page-boundary parents when older commits are appended"                                                | E10a has three vertices; E10b passes the topology checks. The lanes of neither are checked.                                                                                                                                                 |
| `layout.test.ts`, "handles empty history and keeps uncommitted edges separate from committed edges"                               | E1 exactly; E15a: `isCommitted` of the dots is `[false, true, true]`, `isCurrent` is `[true, false, false]` although the head names row 1, and the only uncommitted line has `child` 0 and `parent` 1.                                      |
| `tests/webview/graph/utils.test.ts`, "ends a merge on the dot of a parent another branch reached first"                           | E8: `lanes` 3; dot lanes and colours; the three lines with `child` 1 and `parent` 4, with their track's colour, points and order.                                                                                                           |
| `utils.test.ts`, "keeps a commit in the colour of its first placement"                                                            | E4: `lanes` 2 and every dot's lane and colour.                                                                                                                                                                                              |
| `tests/webview/graph/strokes.test.ts`, "keeps %s connected with expanded details" (both graph styles, every fixture, head `null`) | That the drawn paths are connected, start at dots or on drawn segments, reach every commit that has a child, and stay within `graphWidth` and `graphHeight` (so no point is at or beyond lane `lanes`). The layout is unchanged afterwards. |
| `tests/webview/graph/focus.test.ts`, "keeps incoming unrelated edges gray…"                                                       | E20: a line with `child` 1 and `parent` 2 exists; `child` and `parent` classify lines correctly; the layout is unchanged after drawing.                                                                                                     |
| `tests/webview/components/commit/ColumnResize.test.ts`, `GraphScroll.test.ts`                                                     | Indirectly, E18: `lanes` 13 (column width 224 px), and dot `k` in lane `k` (scroll positions).                                                                                                                                              |
| `WorkingTreeDetails.test.ts`, `WorkingTreeTiming.test.ts`, `GraphErrors.test.ts`                                                  | Incidental: a table with an uncommitted row renders.                                                                                                                                                                                        |

### 6.2 How the gaps were found

On a scratch copy of the repository, I changed one behaviour of the current module at a time and ran every test that reaches it (`tests/webview/graph/*`, `GraphScroll.test.ts`, `ColumnResize.test.ts`, `WorkingTreeDetails.test.ts` and `WorkingTreeTiming.test.ts`).

**Changes that the tests catch:**

- no colour reuse at all;
- `lanes` one too high;
- every dot coloured 0;
- `commitHead` also marked when row 0 is the uncommitted row;
- a merge link's lines stored in reverse order at the front of the track.

**Changes that every test survives:**

- `lockedFirst` always `false`;
- `lockedFirst` inverted for track lines;
- a merge link's joining line flagged by its direction instead of always `true`;
- a colour reused by a track that starts in the very row where the colour's previous track ended;
- `branches` in reverse order;
- uncommitted flags set purely by "child is the uncommitted row" (which differs from §3.8.4 only in cases like E16);
- no loose ends at all;
- duplicate hashes resolving to the first occurrence;
- merge links that only ever join the target's dot, never a line into it;
- extra parents handled in reverse order;
- merge links stored in, and coloured as, the merging commit's track instead of the target's.

### 6.3 Gaps, with test cases to add

All cases below pass against the current code, in a new file of the Vitest `webview` project (Node environment, no DOM needed). Build commits with `commit(hash, ...parents)` from `tests/webview/graph/fixtures.ts`. The full expected results are in §4; compare with `toEqual` wherever a whole result is given.

Every change that §6.2 lists as surviving the existing tests makes at least one of G1 to G16 fail, with one exception. Setting the uncommitted flags purely by "child is the uncommitted row" is only caught by E16, which G10 holds back until Q1 is decided.

**G1. `lockedFirst`.** Lay out the "criss-cross merges" fixture (E7). Across all tracks, the lines with `lockedFirst: true` are exactly these four: `2→3 1,2→0,3`, `0→2 0,0→1,1`, `1→4 0,1→2,2` and `1→4 2,2→1,3`. Every other line has `false`. Also lay out E8 and expect `1→4 2,2→2,3` to be `false`, `1→4 2,3→0,4` to be `true`, and `2→4 1,3→0,4` to be `false`.

**G2. Merge links carry the target's colour.** In E7, the line `child 2, parent 3` is in the track with colour 0, and both lines `child 1, parent 4` are in the track with colour 1, although `right-merge` (row 2) has colour 1 and `left-merge` (row 1) colour 0.

**G3. A merge link joins the line into its target before the target's row.**

- E12a: the lines with `child 0, parent 3` are exactly `0,0→2,1` and `2,1→0,2`, both `lockedFirst: true`, in the colour-0 track.
- E7: the last line with `child 1, parent 4` ends at `{ x: 1, y: 3 }`.

**G4. A merge link joins an earlier link to the same parent.** E11: the result equals the listing, in particular track 0's last line is `1→3 0,1→1,2 [early]`, and `lanes` is 2.

**G5. Extra parents are handled in parent order.** E12a and E12b have the same rows, and both have dot lanes `[0, 0, 1, 0, 0]`.

- E12a: the link lines (`child 0, parent 3`) are `0,0→2,1` and `2,1→0,2`, and track 1 begins `0→2 0,0→1,1 [early]`, `0→2 1,1→1,2`.
- E12b: the link lines are `0,0→1,1` and `1,1→0,2`, and track 1 begins `0→2 0,0→2,1 [early]`, `0→2 2,1→1,2`.

**G6. Colour reuse boundary.** E13a dot colours `[0, 0, 1, 0, 0, 2, 0]`, and track colours `[0, 1, 2]`. E13b dot colours `[0, 0, 1, 0, 1, 0, 2, 0]`, and track colours `[0, 1, 1, 2]`.

**G7. Track order and line order.** Each fixture's result equals E5 to E10a exactly (E8 with head `null`, which only clears `isCurrent`). This single test also covers G1 to G3 for the fixtures.

**G8. Loose ends.**

- E10a: track 1 is exactly `[{ child: 1, parent: null, p1: {x:1,y:1}, p2: {x:1,y:2}, isCommitted: true, lockedFirst: false }]`.
- E9: track 1 ends with `2→none 1,2→1,3`.
- E17: `lanes` 3; the three tracks have 2, 1 and 0 lines, all with `parent: null`.
- E14b: track 0 is `0→none 0,0→0,1`, and track 1 has no lines.

**G9. Missing parents.**

- E10a: dots `0/0, 1/1, 0/0`, and track 0 is two straight lines `0→2`.
- E19c: `lanes` 1, two lines only.
- E15c: the uncommitted row's loose end, two lines, both uncommitted.

**G10. Uncommitted edge across several rows.** E15b exactly: the three lines `0→3` are uncommitted, the rest committed, and `f2` is in lane 1. E16a and E16b pin §3.8.4 as it stands. Add them only once Q1 is decided, with the decided expectation.

**G11. Head handling.**

- Any fixture with head `null`: no vertex is current.
- E19c (head `"zzz"`): no vertex is current.
- E19b (head `"a"`): only row 2 is current, and row 1 is a separate tip in lane 1 with colour 1 (subject to Q7).
- E21: row 1 (`"*"` outside row 0) is committed and current.

**G12. Duplicate parent entries.** E19a: track 0 has three lines, the third being `0→1 0,0→0,1 [early]` (subject to Q8).

**G13. Single commit and several roots.** E2 exactly; E2 with a missing parent (`commit("a", "gone")`) gives the same result; E14a and E14b exactly.

**G14. A dot pushed right by earlier routes.** E10b dot lanes `[0, 2, 1, 0, 2, 1, 0]` and colours `[0, 2, 1, 0, 2, 1, 0]`.

**G15. No state between calls; fresh results.** Lay out E7, then E13a, then E7 again: the two E7 results are deep-equal and are different objects (`!==`), as are their `vertices` arrays.

**G16. Benchmark shape as a unit test.** Lay out E22's input: `lanes` 2, one track, 19,979 lines. Lines 10,000 and 10,019 (1-based, the first link's first and last) are `0→20 0,0→1,1 [early]` and `0→20 1,19→0,20 [early]`. This runs in tens of milliseconds in Node.

Not worth a test: the behaviours of §3.14, until Q2 and Q6 decide what they should be.

---

## 7. Questions

Each question states the current behaviour and what may have been intended, without deciding between them.

**Q1. The uncommitted edge turns committed partway down.** When a merge link stored in the uncommitted row's track starts at row `m`, every piece of the uncommitted edge that starts at row `m + 1` or lower is flagged committed (§3.8.4). In E16a that is where a committed link into HEAD shares the lane, which may be deliberate. In E16b the link goes into a commit below HEAD, in another lane, and the grey uncommitted line still changes to the branch colour at row 3 for no visible reason. This happens in real use when a branch newer than HEAD has merged a commit on HEAD's first-parent chain.

- _May be intended:_ every line whose `child` is the uncommitted row is uncommitted. Alternatively, only the pieces that a committed edge actually shares are committed (E16a's behaviour, without E16b's).

**Q2. An uncommitted row with more than one parent.** The backend never produces one, but the layout then flags the first lines of the wrong track (§3.14).

- _May be intended:_ the per-line rule of Q1, which would also make this case right.

**Q3. Real roots get a loose end.** A commit with an empty `parentHashes` that is not on the last row gets a line to the bottom of the list, exactly like a commit whose parents are not loaded (E9, E14). The layout cannot tell the two apart, because it only sees loaded parents.

- _May be intended:_ a real root ends at its dot, and only commits with parents outside the list get a loose end.

**Q4. Partly loaded parents.** A commit whose parents are all missing gets a loose end, but a commit with at least one loaded parent gets nothing for the missing ones. A missing first parent also hands the first-parent role (straight line, same colour) to the next loaded parent. So appending the next page can move and recolour rows that were already shown (E10a against E10b: `topic` jumps from lane 0 and colour 0 to lane 1 and colour 1).

- _May be intended:_ draw every missing parent as a loose end, keep the first-parent role empty when the first parent is missing, or accept the jump.

**Q5. A staircase for search results.** In history search, a page of up to 100 results usually has no parent-child pairs in it. Every result then gets a loose end that takes a lane in every row below it: `n` results give `n` lanes and `n(n − 1)/2` lines (E17). The graph column caps at 240 px (14 lanes) and the rest scrolls.

- _May be intended:_ short stubs (one row) or no line at all for missing parents, at least in search results.

**Q6. Input outside the contract can hang.** A commit whose only loaded parent is itself or lies above it makes the call never return, while memory keeps growing. Other out-of-order cases give lines that run to the bottom (§3.14). `git log --date-order` rules this out today.

- _May be intended:_ a guarantee that the call always returns, with a defined result, for example by ignoring parents that are not below their child.

**Q7. Duplicate hashes resolve to the last row.** Parent references and `commitHead` go to the last occurrence, so the earlier row becomes an unconnected tip (E19b). Git does not produce duplicates within one page.

- _May be intended:_ the first occurrence, or treating duplicates as an error.

**Q8. Duplicate parent entries draw a second line.** `m → a, a` gives a merge link that draws over the first-parent line, flagged `lockedFirst` (E19a).

- _May be intended:_ ignore repeated parents.

**Q9. Where lane changes bend.** A track line moving left changes lane next to its lower end (`lockedFirst: false`). The last line of a merge link changes lane next to its upper end, whatever its direction (E7: `2→3 1,2→0,3 [early]`, E8: `2,3→0,4 [early]`), and a straight final line is flagged too. Two lines entering the same dot from the same side can therefore bend at different heights.

- _May be intended:_ one rule for every line, based on direction only.

**Q10. Scaling with many tracks.** The time grows faster than the size of the result when a history has thousands of tracks: 10,000 rows with a merge on every other row take about 111 ms, and 30,000 take about 1.3 s (§5.1).

- _May be intended:_ a requirement that the replacement scale linearly with rows plus lines, rather than only matching today's times.

**Q11. The lane-bookkeeping helpers.** `pointOf`, `nextPointOf`, `connectionTo`, `takePoint` and `joinBranch` in `utils.ts`, `createVertex` in `vertex.ts`, and the `Vertex`, `Branch` and `Connection` types exist only to serve this module. They have their own tests. If the replacement does not use them, they stay in the product as code that only tests call.

- _May be intended:_ the replacement must use them (as §2.2 recommends), or the maintainers remove them together with their tests once the replacement no longer needs them.

---

## 8. Decisions on §7 (from the project maintainer's side)

These decisions replace the "current behaviour" wherever they differ. Build to these, and test the decided behaviour. Everything else in §3 stands, so every example in §4 that no decision touches must come out exactly as shown.

- **Q1: the whole uncommitted edge is uncommitted.** Every line whose `child` is the uncommitted row has `isCommitted: false`, and every other line has `isCommitted: true`, whatever merge links track 0 holds. E16a and E16b change accordingly.
- **Q2:** follows from Q1: the rule is per line, so an uncommitted row with several parents flags exactly the lines whose child it is.
- **Q3: keep.** A commit without loaded parents that is not on the last row gets a loose end, whether it is a real root or not: a shallow clone's boundary commits look like roots, and the line tells the user that history goes on.
- **Q4: keep.**
- **Q5: keep.**
- **Q6: always return.** A loaded parent that is not strictly below its child (above it, in the same row, or the commit itself) is treated as not loaded. The call then always returns, and for input within the contract nothing changes.
- **Q7: keep.**
- **Q8: repeated parents count once.** Later repeats of a hash in one commit's `parentHashes` are ignored, so `m → a, a` lays out exactly like `m → a`.
- **Q9: keep.** The `lockedFirst` rules of §3.8.3 stand; `strokes.ts` and its golden tests depend on them.
- **Q10: linear is the target.** The replacement must not be slower than the current code on any row of §5.1, and should scale with rows plus lines. Report its times for every row of the §5.1 table.
- **Q11: free choice.** The replacement may use the helpers of §2.2 or not. Report which ones it does not use; unused helpers will be removed separately.

The graph tests now include `tests/webview/graph/strokes.golden.test.ts` and `strokes.cases.test.ts`, whose expected paths come from layouts computed by this module. They must keep passing, except where a §8 decision changes a layout they use.
