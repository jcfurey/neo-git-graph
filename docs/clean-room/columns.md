# Clean-room specification: `src/webview/utils/columns.ts`

This document states what the column-width utility module of the webview must do, as observed from outside. It is written for an engineer who will write a replacement without seeing the current source. It draws on the module's importers (`src/webview/components/commit/useColumnResize.ts`, `src/webview/lib/stores.ts`), the constants it depends on, the Vitest suites that reach it directly or indirectly, and the results of calling the current module with many inputs.

---

## 0. Background

### 0.1 The commit table's columns

The commit table has five columns. Their header-cell indices are:

| Header index | Column      | Has a stored width? | Stored slot |
| ------------ | ----------- | ------------------- | ----------- |
| 0            | Graph       | yes                 | 0           |
| 1            | Description | no                  | none        |
| 2            | Date        | yes                 | 1           |
| 3            | Author      | yes                 | 2           |
| 4            | Commit      | yes                 | 3           |

The user sets the widths of four columns. The Description column is never stored: the browser gives it whatever horizontal space is left over, so its width is only known by measuring it. A set of stored widths is therefore an array of four pixel numbers in the order **Graph, Date, Author, Commit**. The mapping from stored slot to header index is the constant `RESIZABLE_COLUMNS` (`[0, 2, 3, 4]`) in `src/webview/constants.ts`.

### 0.2 Boundaries

A boundary is the dividing line between two neighbouring columns. Boundary _n_ is the right-hand edge of the column at header index _n_, so there are four of them, numbered 0 to 3:

| Boundary | Left neighbour  | Right neighbour | Effect of moving it _m_ pixels to the right (negative _m_ = to the left) |
| -------- | --------------- | --------------- | ------------------------------------------------------------------------ |
| 0        | Graph (slot 0)  | Description     | Graph width grows by _m_. Description (not stored) shrinks by _m_.       |
| 1        | Description     | Date (slot 1)   | Description (not stored) grows by _m_. Date width shrinks by _m_.        |
| 2        | Date (slot 1)   | Author (slot 2) | Date width grows by _m_. Author width shrinks by _m_.                    |
| 3        | Author (slot 2) | Commit (slot 3) | Author width grows by _m_. Commit width shrinks by _m_.                  |

At boundaries 0 and 1 only one stored slot changes. At boundaries 2 and 3 two neighbouring stored slots change by equal and opposite amounts.

### 0.3 Where stored widths come from

Widths are kept per repository in `repoStates` (`src/webview/lib/stores.ts`) under the field `columnWidths` (declared as `number[] | null` in `src/types/legacy.ts`). They are persisted by the extension in VS Code workspace state and come back to the webview as JSON, so the webview cannot assume they are well formed. Older data may hold five entries (upstream stored a width for the Description column too; several tests use `[100, 300, 80, 80, 80]` as such a value).

---

## 1. Interface

**Module path:** `src/webview/utils/columns.ts`, imported everywhere as `@/webview/utils/columns`.

The module has exactly four named exports and no default export. Names, signatures, and constant values must stay exactly as listed. The module exports no types.

| Export            | Kind     | Signature or value                                                                                                        |
| ----------------- | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| `MIN_COLUMN`      | constant | `40`, declared with `const` (a number literal).                                                                           |
| `MIN_DESCRIPTION` | constant | `64`, declared with `const` (a number literal).                                                                           |
| `isColumnWidths`  | function | `(widths: Array<number> \| null): widths is Array<number>`, a type predicate.                                             |
| `moveBoundary`    | function | `(widths: Array<number>, boundary: number, delta: number, description: number): { widths: Array<number>; moved: number }` |

Parameter meanings for `moveBoundary`:

- `widths`: the current stored widths, in slot order (section 0.1).
- `boundary`: which boundary to move (section 0.2).
- `delta`: the requested movement in CSS pixels. Positive means to the right, negative to the left.
- `description`: the current on-screen width of the Description column in pixels, as the caller measured it.

Fields of the object `moveBoundary` returns (an inline object type, not a named export):

- `widths`: the stored widths after the move, in slot order.
- `moved`: the movement that was actually applied, in pixels, with the same sign convention as `delta`. It can differ from `delta` in size and even in sign (section 3.3).

### 1.1 Who uses what

| Importer                                           | Uses                             | How                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/webview/lib/stores.ts`                        | `isColumnWidths`                 | The computed signal `columnWidths` reads the selected repository's `columnWidths` (a missing value becomes `null`) and exposes it only if `isColumnWidths` accepts it, otherwise `null`. When accepted, the signal exposes the very same array object (a test checks identity with `toBe`).                                                                                                               |
| `src/webview/components/commit/useColumnResize.ts` | `MIN_COLUMN`, `moveBoundary`     | Uses `MIN_COLUMN` as a floor: stored or measured widths are rounded and raised to at least 40 before a move starts, and every width written to the page is raised to at least 40. For each pointer move or arrow-key press it calls `moveBoundary` with those widths, the boundary, a whole-pixel request, and the Description header cell's measured `clientWidth`. See section 5 for what it relies on. |
| `tests/webview/utils/columns.test.ts`              | `isColumnWidths`, `moveBoundary` | Direct unit tests (section 6).                                                                                                                                                                                                                                                                                                                                                                            |

`MIN_DESCRIPTION` is not imported anywhere, but it is part of the public surface and must remain exported.

Indirect users (no import, but their behaviour depends on this module): `tests/webview/components/commit/ColumnResize.test.ts` (drives the resize hook and the store), `tests/webview/lib/remote-visibility.test.ts` and `tests/webview/lib/preference-lifetime.test.ts` (read the `columnWidths` store), `tests/webview/components/commit/GraphScroll.test.ts` (renders the commit table), and `tests-ext/ui/history.test.cjs` (drags the Graph boundary in a real VS Code window).

---

## 2. Dependencies the implementation must use

| Import path           | Name                | Why                                                                                                                                                                               |
| --------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@/webview/constants` | `RESIZABLE_COLUMNS` | `[0, 2, 3, 4]`. Its length (4) is the number of entries a valid stored-width array must have. Take the count from this constant rather than writing the number 4 into the module. |

Nothing else is needed: no DOM, no Preact, no signals, no other repository module. The module must type-check under `src/webview/tsconfig.json` (strict mode, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) and pass the repository's oxlint configuration.

---

## 3. Behaviour

### 3.1 Constants

- `MIN_COLUMN` is 40. It is the smallest width, in pixels, that any stored column (Graph, Date, Author, Commit) may be given by a move.
- `MIN_DESCRIPTION` is 64. It is the smallest width, in pixels, that a move may leave for the Description column.

### 3.2 `isColumnWidths(widths)`

This function decides whether a stored value can be used as the table's column widths. It returns `true` exactly when all of the following hold, and `false` otherwise:

1. `widths` is not `null`;
2. it has exactly as many entries as `RESIZABLE_COLUMNS` (four);
3. every entry is a number that is finite and strictly greater than zero.

Consequences:

- `null` gives `false`.
- An empty array, three entries, and the legacy five-entry layout all give `false`.
- Zero, negative zero, negative numbers, `NaN`, `Infinity` and `-Infinity` entries give `false`.
- Entries that are not numbers give `false`, with no conversion: the string `"100"`, `null`, `undefined`, `true` and nested arrays are all rejected.
- Positive numbers are accepted whatever their size, including fractions and values under `MIN_COLUMN` (for example `5.5` or `0.001`) and very large values (for example `1e9`). Raising small widths to the minimum is the resize hook's job, not this function's. The hook test "treats malformed widths as none and raises widths below the minimum" relies on `[120, 90, 100, 5.5]` being accepted.
- It never modifies its argument and has no side effects.

Inputs outside the declared parameter type (current behaviour, not a requirement): `undefined`, a four-character string, and a non-array object whose `length` is 4 currently throw a `TypeError`. Strings and objects of any other length give `false`. An array of length 4 containing holes (missing entries rather than `undefined`) currently gives `true`, because holes are not examined. See questions Q6 and Q7.

### 3.3 `moveBoundary(widths, boundary, delta, description)`

The function works out how far a boundary can actually move toward the requested position without making either of its two neighbouring columns narrower than that column's minimum, applies that movement, and reports the result.

**Minimums.** A stored column's minimum is 40 (`MIN_COLUMN`). The Description column's minimum is 64 (`MIN_DESCRIPTION`). For boundaries 0 and 1, the Description's width after a movement _m_ is taken to be `description − m` (boundary 0) or `description + m` (boundary 1). Boundaries 2 and 3 do not touch the Description column, and the `description` argument has no effect on them, whatever its value (including `NaN`).

**Admissible movements.** For a given boundary, a movement _m_ is admissible when both neighbours end at or above their minimums. The admissible movements form one continuous range:

- The left neighbour limits how far left the boundary may go. It may go left by the amount the left neighbour exceeds its minimum, and no further.
- The right neighbour limits how far right the boundary may go. It may go right by the amount the right neighbour exceeds its minimum, and no further.

Stated per boundary, with _w0…w3_ the four stored widths and _D_ the `description` argument, the admissible range is:

| Boundary | Furthest left (lowest _m_) | Furthest right (highest _m_) |
| -------- | -------------------------- | ---------------------------- |
| 0        | 40 − _w0_                  | _D_ − 64                     |
| 1        | 64 − _D_                   | _w1_ − 40                    |
| 2        | 40 − _w1_                  | _w2_ − 40                    |
| 3        | 40 − _w2_                  | _w3_ − 40                    |

**Choosing `moved`.**

- If `delta` lies within the admissible range (limits included), `moved` equals `delta` exactly.
- If `delta` lies beyond the range on either side, `moved` is the nearest limit. This covers requests larger than the space available in either direction, including `Infinity` and `-Infinity` requests, which stop at the finite limit.
- If no movement is admissible (the "furthest left" value is greater than the "furthest right" value), nothing moves: `moved` is `0` (positive zero) and the widths come back unchanged. A partial improvement is not attempted.
- If the range is a single value, `moved` is that value, whatever `delta` is.

**A neighbour that is already too narrow.** If one neighbour is already below its minimum, every admissible movement pushes the boundary away from it. The boundary is then pushed at least far enough to restore that minimum, even when `delta` is zero or points the other way. So `moved` can have the opposite sign to `delta`, or be non-zero when `delta` is zero. It can also be larger than `delta` in the requested direction. This applies equally when the Description is the narrow one, for example when the caller measured it under 64.

**A neighbour exactly at its minimum.** A request toward that neighbour gives `moved` of `0` (positive zero, for any request of that sign). A request away from it moves normally.

**Applying the movement.** The returned `widths` has the same length and order as the input. The stored neighbours change as in the table in section 0.2 (at boundary 0 slot 0 gains `moved`; at boundary 1 slot 1 loses `moved`; at boundary 2 slot 1 gains and slot 2 loses `moved`; at boundary 3 slot 2 gains and slot 3 loses `moved`). All other entries are the same values as in the input. The movement is exactly the displacement applied, so `moved` and the width changes always agree.

**Arithmetic.** Values are not rounded. Fractions pass straight through with ordinary floating-point arithmetic, so results can carry floating-point noise (for example `120 − 79.999` gives `40.001000000000005`). Rounding to whole pixels is the resize hook's job.

**Boundaries that do not exist.** Any boundary other than 0, 1, 2 or 3 moves nothing when given four widths: `moved` is `0` (positive zero) and `widths` is an unchanged copy. That includes 4 and above, negative numbers, fractions such as 1.5, `NaN` and `Infinity`. Negative zero counts as boundary 0. More generally, if a stored neighbour that the boundary needs is not present in `widths` (the array is too short, or the entry is `undefined`), nothing moves. Current behaviour with arrays that are not four long (outside what any caller passes): boundary 0 works with a single entry, boundary 1 with at least two, and an integer boundary _n_ ≥ 2 moves slots _n_ − 1 and _n_ whenever both exist (so a five-entry array makes boundary 4 move slots 3 and 4). See question Q5.

**Non-finite inputs** (current behaviour, see question Q3):

- A `NaN` request gives `moved` of `NaN` and `NaN` in each stored neighbour of the boundary, unless the (finite) limits leave no admissible movement, in which case nothing moves and `moved` is 0.
- A `NaN` in a stored neighbour always gives `moved` of `NaN` and `NaN` in every stored neighbour of the boundary (both of them at boundaries 2 and 3), whatever the other inputs.
- A `NaN` `description` at boundary 0 or 1 gives `moved` of `NaN` and `NaN` in the stored neighbour. At boundaries 2 and 3 it has no effect.
- An infinite neighbour or `description` removes the corresponding limit. For example, an `Infinity` Description at boundary 1 with a `-Infinity` request gives `moved` of `-Infinity` and makes slot 1 `Infinity`. A `-Infinity` Description at boundary 0 leaves nothing admissible, so nothing moves.

**Sign of zero.** When `delta` is `-0` and lies within the range, `moved` is `-0` (it equals `delta`). Every case where nothing moves because there is no admissible movement, the boundary does not exist, or a neighbour is missing gives positive `0`. Vitest's `toEqual` tells `0` from `-0`, so the existing test "holds the boundary when both columns are already too narrow" requires positive zero.

**Return shape.** The function returns a plain object with exactly two own properties, `widths` and `moved`. `widths` is always a new array, never the one passed in, even when nothing moves. Entries missing from the input (holes) appear as `undefined` in the copy.

---

## 4. Concrete examples (observed from the current code)

Unless stated otherwise, `W` = `[100, 120, 120, 90]` and the Description is 400 wide. Each row reads `moveBoundary(widths, boundary, delta, description)` → `{ widths, moved }`.

### 4.1 Boundary 0 (Graph | Description)

| widths              | boundary | delta | description | result widths       | moved |
| ------------------- | -------- | ----- | ----------- | ------------------- | ----- |
| W                   | 0        | 30    | 400         | [130, 120, 120, 90] | 30    |
| W                   | 0        | -30   | 400         | [70, 120, 120, 90]  | -30   |
| W                   | 0        | -60   | 400         | [40, 120, 120, 90]  | -60   |
| W                   | 0        | -61   | 400         | [40, 120, 120, 90]  | -60   |
| W                   | 0        | -200  | 400         | [40, 120, 120, 90]  | -60   |
| W                   | 0        | 336   | 400         | [436, 120, 120, 90] | 336   |
| W                   | 0        | 337   | 400         | [436, 120, 120, 90] | 336   |
| W                   | 0        | 500   | 100         | [136, 120, 120, 90] | 36    |
| W                   | 0        | 0     | 400         | [100, 120, 120, 90] | 0     |
| W                   | 0        | 10    | 64          | [100, 120, 120, 90] | 0     |
| W                   | 0        | -10   | 64          | [90, 120, 120, 90]  | -10   |
| W                   | 0        | 10    | 50          | [86, 120, 120, 90]  | -14   |
| W                   | 0        | -8    | 50          | [86, 120, 120, 90]  | -14   |
| W                   | 0        | -100  | 50          | [40, 120, 120, 90]  | -60   |
| W                   | 0        | 0     | 30          | [66, 120, 120, 90]  | -34   |
| [300, 120, 120, 90] | 0        | 8     | 70          | [306, 120, 120, 90] | 6     |
| [40, 120, 120, 90]  | 0        | -8    | 400         | [40, 120, 120, 90]  | 0     |
| [10, 120, 120, 90]  | 0        | 0     | 400         | [40, 120, 120, 90]  | 30    |
| [10, 120, 120, 90]  | 0        | -30   | 400         | [40, 120, 120, 90]  | 30    |
| [10, 120, 120, 90]  | 0        | 50    | 400         | [60, 120, 120, 90]  | 50    |
| [10, 120, 120, 90]  | 0        | 50    | 94          | [40, 120, 120, 90]  | 30    |
| [10, 120, 120, 90]  | 0        | 50    | 93          | [10, 120, 120, 90]  | 0     |
| [10, 120, 120, 90]  | 0        | 50    | 80          | [10, 120, 120, 90]  | 0     |
| [60, 120, 120, 90]  | 0        | 0     | 30          | [60, 120, 120, 90]  | 0     |
| [-5, 120, 120, 90]  | 0        | 10    | 400         | [40, 120, 120, 90]  | 45    |
| [40, 40, 40, 40]    | 0        | 30    | 0           | [40, 40, 40, 40]    | 0     |
| [40, 40, 40, 40]    | 0        | -30   | 0           | [40, 40, 40, 40]    | 0     |
| [40, 40, 40, 40]    | 0        | 5     | 64          | [40, 40, 40, 40]    | 0     |
| [40, 40, 40, 40]    | 0        | -5    | 64          | [40, 40, 40, 40]    | 0     |

### 4.2 Boundary 1 (Description | Date)

| widths             | boundary | delta | description | result widths       | moved |
| ------------------ | -------- | ----- | ----------- | ------------------- | ----- |
| W                  | 1        | 20    | 400         | [100, 100, 120, 90] | 20    |
| W                  | 1        | 80    | 400         | [100, 40, 120, 90]  | 80    |
| W                  | 1        | 300   | 400         | [100, 40, 120, 90]  | 80    |
| W                  | 1        | -20   | 400         | [100, 140, 120, 90] | -20   |
| W                  | 1        | -336  | 400         | [100, 456, 120, 90] | -336  |
| W                  | 1        | -500  | 400         | [100, 456, 120, 90] | -336  |
| W                  | 1        | 0     | 400         | [100, 120, 120, 90] | 0     |
| W                  | 1        | -10   | 64          | [100, 120, 120, 90] | 0     |
| W                  | 1        | -8    | 50          | [100, 106, 120, 90] | 14    |
| W                  | 1        | 10    | 50          | [100, 106, 120, 90] | 14    |
| W                  | 1        | 100   | 50          | [100, 40, 120, 90]  | 80    |
| W                  | 1        | 0     | 30          | [100, 86, 120, 90]  | 34    |
| [100, 40, 120, 90] | 1        | 5     | 400         | [100, 40, 120, 90]  | 0     |
| [100, 40, 120, 90] | 1        | 10    | 50          | [100, 40, 120, 90]  | 0     |
| [100, 20, 120, 90] | 1        | 0     | 400         | [100, 40, 120, 90]  | -20   |
| [100, 20, 120, 90] | 1        | 30    | 400         | [100, 40, 120, 90]  | -20   |
| [100, 20, 120, 90] | 1        | -100  | 50          | [100, 20, 120, 90]  | 0     |
| [100, 20, 120, 90] | 1        | -10   | 40          | [100, 20, 120, 90]  | 0     |

### 4.3 Boundaries 2 and 3 (between stored columns)

| widths             | boundary | delta | description | result widths        | moved |
| ------------------ | -------- | ----- | ----------- | -------------------- | ----- |
| W                  | 2        | 25    | 400         | [100, 145, 95, 90]   | 25    |
| W                  | 2        | -25   | 400         | [100, 95, 145, 90]   | -25   |
| W                  | 2        | 80    | 400         | [100, 200, 40, 90]   | 80    |
| W                  | 2        | 81    | 400         | [100, 200, 40, 90]   | 80    |
| W                  | 2        | -80   | 400         | [100, 40, 200, 90]   | -80   |
| W                  | 2        | -81   | 400         | [100, 40, 200, 90]   | -80   |
| W                  | 2        | -1000 | 0           | [100, 40, 200, 90]   | -80   |
| W                  | 2        | 10    | NaN         | [100, 130, 110, 90]  | 10    |
| W                  | 3        | -15   | 400         | [100, 120, 105, 105] | -15   |
| W                  | 3        | 50    | 400         | [100, 120, 170, 40]  | 50    |
| W                  | 3        | 300   | 400         | [100, 120, 170, 40]  | 50    |
| W                  | 3        | 50    | 0           | [100, 120, 170, 40]  | 50    |
| W                  | 3        | -80   | 400         | [100, 120, 40, 170]  | -80   |
| W                  | 3        | -300  | 400         | [100, 120, 40, 170]  | -80   |
| [100, 30, 120, 90] | 2        | 0     | 400         | [100, 40, 110, 90]   | 10    |
| [100, 30, 120, 90] | 2        | -50   | 400         | [100, 40, 110, 90]   | 10    |
| [100, 30, 50, 90]  | 2        | -5    | 400         | [100, 40, 40, 90]    | 10    |
| [100, 30, 45, 90]  | 2        | 0     | 400         | [100, 30, 45, 90]    | 0     |
| [100, 120, 20, 20] | 3        | 10    | 400         | [100, 120, 20, 20]   | 0     |
| [100, 120, 30, 30] | 3        | 0     | 400         | [100, 120, 30, 30]   | 0     |

### 4.4 Fractions and floating point

| widths                | boundary | delta  | description | result widths                          | moved  |
| --------------------- | -------- | ------ | ----------- | -------------------------------------- | ------ |
| [100.5, 120, 120, 90] | 0        | 10.25  | 400         | [110.75, 120, 120, 90]                 | 10.25  |
| W                     | 0        | 0.1    | 400         | [100.1, 120, 120, 90]                  | 0.1    |
| [0.1, 120, 120, 90]   | 0        | 0.2    | 400         | [40, 120, 120, 90]                     | 39.9   |
| W                     | 0        | 1000   | 400.5       | [436.5, 120, 120, 90]                  | 336.5  |
| W                     | 1        | -1000  | 100.25      | [100, 156.25, 120, 90]                 | -36.25 |
| [100, 40.5, 120, 90]  | 1        | 10     | 400         | [100, 40, 120, 90]                     | 0.5    |
| W                     | 2        | 0.3    | 400         | [100, 120.3, 119.7, 90]                | 0.3    |
| [100, 120, 120, 90.7] | 3        | 100    | 400         | [100, 120, 170.7, 40]                  | 50.7   |
| W                     | 2        | 79.999 | 400         | [100, 199.999, 40.001000000000005, 90] | 79.999 |

### 4.5 Non-finite values

| widths                   | boundary | delta     | description | result widths            | moved     |
| ------------------------ | -------- | --------- | ----------- | ------------------------ | --------- |
| W                        | 0        | Infinity  | 400         | [436, 120, 120, 90]      | 336       |
| W                        | 0        | -Infinity | 400         | [40, 120, 120, 90]       | -60       |
| W                        | 1        | Infinity  | 400         | [100, 40, 120, 90]       | 80        |
| W                        | 3        | Infinity  | 400         | [100, 120, 170, 40]      | 50        |
| W                        | 0        | NaN       | 400         | [NaN, 120, 120, 90]      | NaN       |
| W                        | 1        | NaN       | 400         | [100, NaN, 120, 90]      | NaN       |
| W                        | 2        | NaN       | 400         | [100, NaN, NaN, 90]      | NaN       |
| W                        | 0        | 10        | NaN         | [NaN, 120, 120, 90]      | NaN       |
| W                        | 1        | 10        | NaN         | [100, NaN, 120, 90]      | NaN       |
| [40, 40, 40, 40]         | 0        | NaN       | 0           | [40, 40, 40, 40]         | 0         |
| [NaN, 120, 120, 90]      | 0        | 10        | 400         | [NaN, 120, 120, 90]      | NaN       |
| [Infinity, 120, 120, 90] | 0        | 10        | 400         | [Infinity, 120, 120, 90] | 10        |
| W                        | 0        | 10        | Infinity    | [110, 120, 120, 90]      | 10        |
| W                        | 0        | 10        | -Infinity   | [100, 120, 120, 90]      | 0         |
| W                        | 1        | -Infinity | Infinity    | [100, Infinity, 120, 90] | -Infinity |

### 4.6 Unknown boundaries and odd-length arrays

| widths                  | boundary | delta | description | result widths            | moved |
| ----------------------- | -------- | ----- | ----------- | ------------------------ | ----- |
| W                       | 4        | 10    | 400         | [100, 120, 120, 90]      | 0     |
| W                       | 7        | 10    | 400         | [100, 120, 120, 90]      | 0     |
| W                       | -1       | 10    | 400         | [100, 120, 120, 90]      | 0     |
| W                       | 1.5      | 10    | 400         | [100, 120, 120, 90]      | 0     |
| W                       | NaN      | 10    | 400         | [100, 120, 120, 90]      | 0     |
| W                       | Infinity | 10    | 400         | [100, 120, 120, 90]      | 0     |
| W                       | -0       | 10    | 400         | [110, 120, 120, 90]      | 10    |
| []                      | 0        | 10    | 400         | []                       | 0     |
| []                      | 2        | 10    | 400         | []                       | 0     |
| [100]                   | 0        | 10    | 400         | [110]                    | 10    |
| [100]                   | 1        | 10    | 400         | [100]                    | 0     |
| [100, 120]              | 1        | 10    | 400         | [100, 110]               | 10    |
| [100, 120]              | 2        | 10    | 400         | [100, 120]               | 0     |
| [100, 120, 120]         | 3        | 10    | 400         | [100, 120, 120]          | 0     |
| [100, 120, 120, 90, 80] | 4        | 10    | 400         | [100, 120, 120, 100, 70] | 10    |
| [100, 120, 120, 90, 80] | 4        | 100   | 400         | [100, 120, 120, 130, 40] | 40    |

In every row of sections 4.1 to 4.6 the input array is unchanged afterwards, and the returned `widths` is a different array object from the input.

### 4.7 `isColumnWidths`

| Input                                   | Result                  |
| --------------------------------------- | ----------------------- |
| `[100, 120, 120, 90]`                   | `true`                  |
| `[1, 1, 1, 1]`                          | `true`                  |
| `[120, 90, 100, 5.5]`                   | `true`                  |
| `[120.4, 90, 100, 70.6]`                | `true`                  |
| `[0.001, 5.5, 39.9, 1e9]`               | `true`                  |
| `[5e-324, 1, 1, 1]` (smallest positive) | `true`                  |
| `[1.7976931348623157e308, 1, 1, 1]`     | `true`                  |
| a frozen `[100, 120, 120, 90]`          | `true`                  |
| `null`                                  | `false`                 |
| `[]`                                    | `false`                 |
| `[100, 120, 120]`                       | `false`                 |
| `[100, 120, 120, 90, 80]`               | `false`                 |
| `[100, 300, 80, 80, 80]` (legacy)       | `false`                 |
| `[100, 0, 120, 90]`                     | `false`                 |
| `[100, -0, 120, 90]`                    | `false`                 |
| `[100, -1, 120, 90]`                    | `false`                 |
| `[100, NaN, 120, 90]`                   | `false`                 |
| `[100, Infinity, 120, 90]`              | `false`                 |
| `[100, -Infinity, 120, 90]`             | `false`                 |
| `["100", 120, 120, 90]`                 | `false`                 |
| `[null, 120, 120, 90]`                  | `false`                 |
| `[undefined, 120, 120, 90]`             | `false`                 |
| `[true, 120, 120, 90]`                  | `false`                 |
| `[[100], 120, 120, 90]`                 | `false`                 |
| Out of type: `"abc"`, `{}`, `5`         | `false`                 |
| Out of type: an array of 4 holes        | `true` (Q7)             |
| Out of type: `undefined`                | throws `TypeError` (Q6) |
| Out of type: `"abcd"`, `{ length: 4 }`  | throws `TypeError` (Q6) |

---

## 5. Non-functional requirements

1. **Pure and synchronous.** Both functions depend only on their arguments (and the fixed `RESIZABLE_COLUMNS`). They have no side effects: no DOM access, no signals or store reads or writes, no messages, no logging, no timers, no module-level mutable state. Importing the module has no side effects.
2. **Inputs are never modified.** `moveBoundary` must not write to the `widths` array it receives, whatever the boundary or outcome. It must also work when that array is frozen. `isColumnWidths` must not modify its argument. The `columnWidths` store hands the accepted array itself to its readers, and `tests/webview/lib/remote-visibility.test.ts` checks that identity.
3. **Fresh output array.** `moveBoundary` returns a new array every time, including when nothing moves. No current caller depends on this, since the hook builds its own rounded copy, but it keeps the no-mutation guarantee simple for future callers.
4. **Exact result shape.** The returned object has only `widths` and `moved`. The tests compare it with `toEqual`, which fails on extra defined properties and tells `0` from `-0`.
5. **`moved` is the true displacement.** The resize hook adds `moved` to the pointer position it tracks during a drag. If `moved` and the width changes disagreed, the boundary would drift away from the pointer. So `moved` must equal exactly what was added to or taken from the stored neighbours.
6. **Length and order preserved.** The hook maps the returned widths slot by slot onto the Graph, Date, Author and Commit CSS properties and compares them slot by slot with the previous widths.
7. **Cheap.** `moveBoundary` runs on every pointer move during a drag. `isColumnWidths` runs every time the `columnWidths` computed signal recomputes. Both handle four entries and should do constant work with no allocation beyond the returned array and object.
8. **How the hook actually calls `moveBoundary`**, useful for judging which edge cases the UI can reach. The widths it passes are always whole numbers of at least 40. The request is a whole number (it may be `-0`). The description is the header cell's `clientWidth`, a whole number that can be below 64 when the window is narrow. It discards any result where the sign of `moved` differs from the sign of the request, or where no rounded width changed. So the "push against the request" case (section 3.3) never shows in the UI. The "go further than asked, in the requested direction" case does show: `tests/webview/components/commit/ColumnResize.test.ts` expects an ArrowLeft press on boundary 0 with a 50-pixel Description to take the Graph column from 100 to 86.

---

## 6. Test coverage

### 6.1 What `tests/webview/utils/columns.test.ts` already checks

`isColumnWidths`:

- four positive widths `[100, 120, 120, 90]` → `true`;
- three widths → `false`;
- a zero entry and a `NaN` entry → `false`;
- `null` → `false`.

`moveBoundary` (with `W` = `[100, 120, 120, 90]`, Description 400 unless stated):

- boundary 0 widens the Graph within range (`+30` → `[130, …]`, moved 30);
- boundary 0 stops at the Graph minimum (`-200` → `[40, …]`, moved -60);
- boundary 0 stops at the Description minimum (`+500` with Description 100 → `[136, …]`, moved 36);
- boundary 1 within range (`+20` → Date 100, moved 20);
- boundary 1 stops at the Date minimum (`+300` → Date 40, moved 80);
- boundaries 2 (`+25`) and 3 (`-15`) move width between two stored columns;
- boundary 3 stops at the Commit minimum (`+300` → `[100, 120, 170, 40]`, moved 50);
- nothing moves when no movement is admissible (`[40, 40, 40, 40]`, boundary 0, `+30`, Description 0 → unchanged, moved 0);
- the input array is not modified (boundary 2 only).

### 6.2 What other tests check indirectly

`tests/webview/components/commit/ColumnResize.test.ts` goes through the resize hook, so it only sees whole-pixel values and results the hook keeps. It covers:

- `MIN_COLUMN` = 40 as a display and starting floor;
- the Description minimum of 64 (`[300, …]` with a 70-pixel Description, ArrowRight → Graph 306);
- a move toward a neighbour already at its minimum producing nothing;
- a Description measured under its minimum producing an opposite-sign `moved` that the hook discards, and a larger same-direction move that the hook keeps (Graph 100 → 86);
- boundary 7 and boundary -1 moving nothing;
- all four boundaries moving by ±8 through the keyboard;
- `isColumnWidths` rejecting a three-entry array and accepting `[120, 90, 100, 5.5]` through the store.

`tests/webview/lib/remote-visibility.test.ts` and `tests/webview/lib/preference-lifetime.test.ts` check that valid four-entry widths reach the `columnWidths` store (the former by identity).

### 6.3 Gaps: behaviours no test checks directly

Each gap is written as input → expected result. `W` = `[100, 120, 120, 90]`.

**Constants**

1. `MIN_COLUMN` → `40`, and `MIN_DESCRIPTION` → `64`.

**`isColumnWidths`**

2. Legacy five-entry layout: `[100, 300, 80, 80, 80]` → `false`.
3. Empty array: `[]` → `false`.
4. Negative, negative-zero and infinite entries: `[100, -1, 120, 90]`, `[100, -0, 120, 90]`, `[100, Infinity, 120, 90]`, `[100, -Infinity, 120, 90]` → `false` each.
5. Fractional and below-minimum positive entries are accepted: `[120, 90, 100, 5.5]` → `true`; `[120.4, 90, 100, 70.6]` → `true`; `[0.001, 5.5, 39.9, 1e9]` → `true`.
6. Non-number entries, as JSON might contain, are rejected without conversion: `["100", 120, 120, 90]` → `false`; `[null, 120, 120, 90]` → `false`.
7. The argument is not modified: after `isColumnWidths(a)` with `a = [100, 120, 120, 90]`, `a` still equals `[100, 120, 120, 90]`.

**`moveBoundary`: limits met exactly**

8. `moveBoundary(W, 0, -60, 400)` → `{ widths: [40, 120, 120, 90], moved: -60 }`, and `moveBoundary(W, 0, 336, 400)` → `{ widths: [436, 120, 120, 90], moved: 336 }`.
9. Description exactly at its minimum: `moveBoundary(W, 0, 10, 64)` → `{ widths: [100, 120, 120, 90], moved: 0 }`; `moveBoundary(W, 0, -10, 64)` → `{ widths: [90, 120, 120, 90], moved: -10 }`; `moveBoundary(W, 1, -10, 64)` → `{ widths: [100, 120, 120, 90], moved: 0 }`.

**`moveBoundary`: moving left, and the limits on the left**

10. Boundary 1 to the left, the Description giving up width: `moveBoundary(W, 1, -20, 400)` → `{ widths: [100, 140, 120, 90], moved: -20 }`.
11. Boundary 1 stopping at the Description minimum: `moveBoundary(W, 1, -500, 400)` → `{ widths: [100, 456, 120, 90], moved: -336 }`.
12. Boundary 2 stopping at the left neighbour's minimum: `moveBoundary(W, 2, -81, 400)` → `{ widths: [100, 40, 200, 90], moved: -80 }`.
13. Boundary 3 stopping at the left neighbour's minimum: `moveBoundary(W, 3, -300, 400)` → `{ widths: [100, 120, 40, 170], moved: -80 }`.
14. Boundary 2 stopping at the right neighbour's minimum: `moveBoundary(W, 2, 81, 400)` → `{ widths: [100, 200, 40, 90], moved: 80 }`.

**`moveBoundary`: a neighbour already under its minimum**

15. A stored column under 40 is restored even against the request: `moveBoundary([10, 120, 120, 90], 0, -30, 400)` → `{ widths: [40, 120, 120, 90], moved: 30 }`; with delta 0 → the same result.
16. The same between stored columns: `moveBoundary([100, 30, 120, 90], 2, -50, 400)` → `{ widths: [100, 40, 110, 90], moved: 10 }`; `moveBoundary([100, 20, 120, 90], 1, 30, 400)` → `{ widths: [100, 40, 120, 90], moved: -20 }`.
17. A Description under 64 is restored even against the request: `moveBoundary(W, 0, 10, 50)` → `{ widths: [86, 120, 120, 90], moved: -14 }`; `moveBoundary(W, 1, -10, 50)` → `{ widths: [100, 106, 120, 90], moved: 14 }`.
18. The same-direction request goes further than asked: `moveBoundary(W, 0, -8, 50)` → `{ widths: [86, 120, 120, 90], moved: -14 }`.
19. No admissible movement although one side has some room: `moveBoundary([10, 120, 120, 90], 0, 50, 80)` → unchanged, `moved: 0`; `moveBoundary([60, 120, 120, 90], 0, 0, 30)` → unchanged, `moved: 0`; `moveBoundary([100, 30, 45, 90], 2, 0, 400)` → unchanged, `moved: 0`; `moveBoundary([100, 20, 120, 90], 1, -100, 50)` → unchanged, `moved: 0`.
20. A single admissible value: `moveBoundary([10, 120, 120, 90], 0, 50, 94)` → `{ widths: [40, 120, 120, 90], moved: 30 }`.

**`moveBoundary`: the Description argument**

21. Ignored at boundaries 2 and 3: `moveBoundary(W, 2, 10, NaN)` → `{ widths: [100, 130, 110, 90], moved: 10 }`; `moveBoundary(W, 3, 50, 0)` → `{ widths: [100, 120, 170, 40], moved: 50 }`.

**`moveBoundary`: boundaries that do not exist**

22. `moveBoundary(W, b, 10, 400)` for each `b` of `4`, `-1`, `1.5`, `NaN` → `{ widths: [100, 120, 120, 90], moved: 0 }`.
23. Too few entries: `moveBoundary([], 0, 10, 400)` → `{ widths: [], moved: 0 }`; `moveBoundary([100, 120], 2, 10, 400)` → `{ widths: [100, 120], moved: 0 }`.

**`moveBoundary`: values**

24. Fractions pass through unrounded: `moveBoundary([100.5, 120, 120, 90], 0, 10.25, 400)` → `{ widths: [110.75, 120, 120, 90], moved: 10.25 }`; `moveBoundary(W, 2, 0.3, 400)` → `{ widths: [100, 120.3, 119.7, 90], moved: 0.3 }`; `moveBoundary([100, 40.5, 120, 90], 1, 10, 400)` → `{ widths: [100, 40, 120, 90], moved: 0.5 }`.
25. Infinite requests stop at the limit: `moveBoundary(W, 0, Infinity, 400)` → `{ widths: [436, 120, 120, 90], moved: 336 }`; `moveBoundary(W, 0, -Infinity, 400)` → `{ widths: [40, 120, 120, 90], moved: -60 }`.
26. `NaN` handling (only if the current behaviour is kept, see Q3): `moveBoundary(W, 0, NaN, 400)` → `{ widths: [NaN, 120, 120, 90], moved: NaN }`.

**`moveBoundary`: immutability and identity**

27. The input is not modified for boundaries 0 and 1, and for a boundary that does not exist (the current test covers boundary 2 only). For example, after `moveBoundary(a, 0, 30, 400)`, `moveBoundary(a, 1, 20, 400)` and `moveBoundary(a, 9, 20, 400)` with `a = [100, 120, 120, 90]`, `a` still equals `[100, 120, 120, 90]`.
28. The returned array is never the input: `moveBoundary(a, 0, 0, 400).widths !== a`, and the same for boundary 9.
29. A frozen input works: `moveBoundary(Object.freeze([100, 120, 120, 90]), 2, 10, 400)` → `{ widths: [100, 130, 110, 90], moved: 10 }` without throwing.
30. `moved` is positive zero when nothing can move: `Object.is(moveBoundary([40, 120, 120, 90], 0, -8, 400).moved, 0)` → `true`; `Object.is(moveBoundary(W, 4, 10, 400).moved, 0)` → `true`.

---

## 7. Questions

**Q1. Moving against the request.** When a neighbour is already under its minimum, `moveBoundary` moves the boundary to restore it even if the request is zero or points the other way (`moveBoundary([10, 120, 120, 90], 0, -30, 400)` gives `moved: 30`). The only caller discards such results, so the behaviour is invisible in the UI today. Should the function instead refuse to move against the request (for example return `moved: 0`), or is the correction intended so that a future caller can repair narrow columns? The same-direction case (moving further than asked) is visible and tested through the hook, so it should stay either way.

**Q2. No partial repair.** When no single movement satisfies both minimums, nothing moves, even if a movement could improve one neighbour without making the other worse. Example: `moveBoundary([10, 120, 120, 90], 0, 50, 80)` leaves everything unchanged, although moving right by 16 would widen the Graph and leave the Description at exactly 64. Is "all or nothing" intended?

**Q3. Non-finite inputs.** `NaN` in the request, in a stored neighbour, or in the Description (boundaries 0 and 1) puts `NaN` into the returned widths and `moved`, instead of being treated as "no move". Infinite widths or Description values remove a limit, so a width can become `Infinity`. The hook never passes such values, and `isColumnWidths` would reject the result if it were stored. Should non-finite inputs give `{ unchanged widths, moved: 0 }`, or is garbage-in, garbage-out acceptable?

**Q4. Sign of zero.** `moved` is `-0` when the request is `-0` and within range (the hook can pass `-0`, since it rounds values such as `-0.4`), but `+0` in every "nothing moved" case. Vitest's `toEqual` distinguishes the two. Should `moved` always be normalised to `+0` when it is zero?

**Q5. Array length is not checked.** `moveBoundary` does not check that `widths` has four entries. With five entries, boundary 4 moves slots 3 and 4. With fewer entries, the boundaries whose slots exist still work. Every current caller passes exactly four. Should arrays of any other length (or boundaries whose slots lie beyond `RESIZABLE_COLUMNS`) be rejected with `moved: 0`, or is the general rule harmless?

**Q6. Throwing on malformed stored data.** `isColumnWidths` is declared for `Array<number> | null`, but stored widths come from workspace JSON with no other validation. It throws a `TypeError` for `undefined`, for a four-character string, and for an object whose `length` is 4. The store turns `undefined` into `null` first, but a corrupted value such as `"abcd"` or `{ "length": 4 }` would make the `columnWidths` computed signal throw whenever it is read. Should the function return `false` for anything that is not a real array, without changing its declared signature?

**Q7. Holes pass validation.** An array of length 4 with missing entries (holes) is accepted, because holes are not examined. JSON cannot produce holes, so this cannot happen with persisted data, but an in-memory caller could produce it. Should every one of the four positions be required to hold a finite positive number?

**Q8. No upper bound or minimum in validation.** `isColumnWidths` accepts widths far below `MIN_COLUMN` (such as `0.001`) and absurdly large ones (such as `1e308`). The hook raises small widths to 40 when showing them. Nothing limits large ones, so a corrupted huge width would make the table extremely wide. Is accepting any finite positive value intended? A hook test depends on `5.5` being accepted.

---

## 8. Decisions on §7 (from the project maintainer's side)

These decisions replace the "current behaviour" wherever they differ. Build to these, and test the decided behaviour.

- **Q1: keep.** When a neighbour is already under its minimum, the result may move the boundary against the request; the resizing hook discards such results.
- **Q2: keep.** When no movement satisfies both minimums, nothing moves.
- **Q3: non-finite means no move.** A `delta` or `description` that is NaN or infinite, or widths on either side of the boundary that are not finite, give a copy of the widths unchanged and `moved` 0.
- **Q4: zero is always +0.** `moved` is never -0.
- **Q5: four widths only.** `moveBoundary` with an array whose length is not `RESIZABLE_COLUMNS.length` returns a copy unchanged with `moved` 0.
- **Q6: never throw.** `isColumnWidths` returns false for anything that is not an array, including `undefined`, strings and array-like objects.
- **Q7: every position counts.** An array with holes is rejected.
- **Q8: keep.** No upper bound and no minimum in validation; the hook clamps widths when it applies them.
