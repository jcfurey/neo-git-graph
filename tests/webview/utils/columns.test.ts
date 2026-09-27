import { describe, expect, it } from "vitest";

import { isColumnWidths, MIN_COLUMN, MIN_DESCRIPTION, moveBoundary } from "@/webview/utils/columns";

const WIDTHS = [100, 120, 120, 90];
const DESCRIPTION = 400;

/** Four widths with nothing at all in the last slot, as opposed to `undefined`. */
function withHole() {
  const widths = [100, 120, 120];
  widths.length = 4;
  return widths;
}

describe("column minimums", () => {
  it("keeps stored columns at 40 pixels and the description at 64", () => {
    expect(MIN_COLUMN).toBe(40);
    expect(MIN_DESCRIPTION).toBe(64);
  });
});

describe("isColumnWidths", () => {
  it("takes one usable width per resizable column", () => {
    expect(isColumnWidths(WIDTHS)).toBe(true);
  });

  it("rejects widths of a table with another number of columns", () => {
    expect(isColumnWidths([100, 120, 120])).toBe(false);
  });

  it("rejects a width the table cannot use", () => {
    expect(isColumnWidths([100, 0, 120, 90])).toBe(false);
    expect(isColumnWidths([100, Number.NaN, 120, 90])).toBe(false);
  });

  it("rejects missing widths", () => {
    expect(isColumnWidths(null)).toBe(false);
  });

  it("rejects no widths, and the five widths of the older layout", () => {
    expect(isColumnWidths([])).toBe(false);
    expect(isColumnWidths([100, 300, 80, 80, 80])).toBe(false);
  });

  it("rejects negative, negative zero and infinite widths", () => {
    for (const width of [-1, -0, Infinity, -Infinity]) {
      expect(isColumnWidths([100, width, 120, 90])).toBe(false);
    }
  });

  it("takes fractions and widths under the minimum, which the table raises when showing them", () => {
    expect(isColumnWidths([120, 90, 100, 5.5])).toBe(true);
    expect(isColumnWidths([120.4, 90, 100, 70.6])).toBe(true);
    expect(isColumnWidths([0.001, 5.5, 39.9, 1e9])).toBe(true);
    expect(isColumnWidths(Object.freeze([100, 120, 120, 90]) as Array<number>)).toBe(true);
  });

  it("rejects stored values that are not numbers without converting them", () => {
    for (const width of ["100", null, undefined, true, [100]]) {
      expect(isColumnWidths([width, 120, 120, 90] as Array<number>)).toBe(false);
    }
  });

  it("returns false rather than throwing for stored values that are not arrays", () => {
    const stored: Array<unknown> = [
      undefined,
      "abcd",
      "abc",
      5,
      {},
      { length: 4 },
      { 0: 100, 1: 120, 2: 120, 3: 90, length: 4 }
    ];
    for (const value of stored) {
      expect(isColumnWidths(value as Array<number> | null)).toBe(false);
    }
  });

  it("rejects widths with a slot left empty", () => {
    const empty: Array<number> = [];
    empty.length = 4;

    expect(isColumnWidths(withHole())).toBe(false);
    expect(isColumnWidths(empty)).toBe(false);
  });

  it("leaves the widths it checks unchanged", () => {
    const widths = [100, 120, 120, 90];
    isColumnWidths(widths);

    expect(widths).toEqual([100, 120, 120, 90]);
  });
});

describe("moveBoundary", () => {
  it("widens the graph column, and leaves the other columns alone", () => {
    expect(moveBoundary(WIDTHS, 0, 30, DESCRIPTION)).toEqual({
      widths: [130, 120, 120, 90],
      moved: 30
    });
  });

  it("keeps the graph column at its minimum width", () => {
    expect(moveBoundary(WIDTHS, 0, -200, DESCRIPTION)).toEqual({
      widths: [40, 120, 120, 90],
      moved: -60
    });
  });

  it("keeps the description column at its minimum width", () => {
    expect(moveBoundary(WIDTHS, 0, 500, 100)).toEqual({
      widths: [136, 120, 120, 90],
      moved: 36
    });
  });

  it("widens the description column at the cost of the date column", () => {
    expect(moveBoundary(WIDTHS, 1, 20, DESCRIPTION)).toEqual({
      widths: [100, 100, 120, 90],
      moved: 20
    });
  });

  it("keeps the date column at its minimum width", () => {
    expect(moveBoundary(WIDTHS, 1, 300, DESCRIPTION)).toEqual({
      widths: [100, 40, 120, 90],
      moved: 80
    });
  });

  it("takes from one column what it gives to the other", () => {
    expect(moveBoundary(WIDTHS, 2, 25, DESCRIPTION)).toEqual({
      widths: [100, 145, 95, 90],
      moved: 25
    });
    expect(moveBoundary(WIDTHS, 3, -15, DESCRIPTION)).toEqual({
      widths: [100, 120, 105, 105],
      moved: -15
    });
  });

  it("stops at the minimum width of the column it takes from", () => {
    expect(moveBoundary(WIDTHS, 3, 300, DESCRIPTION)).toEqual({
      widths: [100, 120, 170, 40],
      moved: 50
    });
  });

  it("holds the boundary when both columns are already too narrow", () => {
    expect(moveBoundary([40, 40, 40, 40], 0, 30, 0)).toEqual({
      widths: [40, 40, 40, 40],
      moved: 0
    });
  });

  it("leaves the given widths unchanged", () => {
    moveBoundary(WIDTHS, 2, 25, DESCRIPTION);

    expect(WIDTHS).toEqual([100, 120, 120, 90]);
  });

  it("goes exactly as far as the minimums allow", () => {
    expect(moveBoundary(WIDTHS, 0, -60, DESCRIPTION)).toEqual({
      widths: [40, 120, 120, 90],
      moved: -60
    });
    expect(moveBoundary(WIDTHS, 0, 336, DESCRIPTION)).toEqual({
      widths: [436, 120, 120, 90],
      moved: 336
    });
  });

  it("moves only away from a description at its minimum", () => {
    expect(moveBoundary(WIDTHS, 0, 10, 64)).toEqual({ widths: WIDTHS, moved: 0 });
    expect(moveBoundary(WIDTHS, 0, -10, 64)).toEqual({ widths: [90, 120, 120, 90], moved: -10 });
    expect(moveBoundary(WIDTHS, 1, -10, 64)).toEqual({ widths: WIDTHS, moved: 0 });
  });

  it("widens the date column at the cost of the description, down to its minimum", () => {
    expect(moveBoundary(WIDTHS, 1, -20, DESCRIPTION)).toEqual({
      widths: [100, 140, 120, 90],
      moved: -20
    });
    expect(moveBoundary(WIDTHS, 1, -500, DESCRIPTION)).toEqual({
      widths: [100, 456, 120, 90],
      moved: -336
    });
  });

  it("stops at the minimum of either stored column beside the boundary", () => {
    expect(moveBoundary(WIDTHS, 2, -81, DESCRIPTION)).toEqual({
      widths: [100, 40, 200, 90],
      moved: -80
    });
    expect(moveBoundary(WIDTHS, 2, 81, DESCRIPTION)).toEqual({
      widths: [100, 200, 40, 90],
      moved: 80
    });
    expect(moveBoundary(WIDTHS, 3, -300, DESCRIPTION)).toEqual({
      widths: [100, 120, 40, 170],
      moved: -80
    });
  });

  it("gives a stored column under its minimum its width back, even against the request", () => {
    for (const delta of [-30, 0]) {
      expect(moveBoundary([10, 120, 120, 90], 0, delta, DESCRIPTION)).toEqual({
        widths: [40, 120, 120, 90],
        moved: 30
      });
    }
    expect(moveBoundary([100, 30, 120, 90], 2, -50, DESCRIPTION)).toEqual({
      widths: [100, 40, 110, 90],
      moved: 10
    });
    expect(moveBoundary([100, 20, 120, 90], 1, 30, DESCRIPTION)).toEqual({
      widths: [100, 40, 120, 90],
      moved: -20
    });
  });

  it("gives a description under its minimum its width back, even against the request", () => {
    expect(moveBoundary(WIDTHS, 0, 10, 50)).toEqual({ widths: [86, 120, 120, 90], moved: -14 });
    expect(moveBoundary(WIDTHS, 1, -10, 50)).toEqual({ widths: [100, 106, 120, 90], moved: 14 });
  });

  it("goes further than asked to give the description its minimum back", () => {
    expect(moveBoundary(WIDTHS, 0, -8, 50)).toEqual({ widths: [86, 120, 120, 90], moved: -14 });
  });

  it("holds the boundary when no position gives both columns their minimum", () => {
    expect(moveBoundary([10, 120, 120, 90], 0, 50, 80)).toEqual({
      widths: [10, 120, 120, 90],
      moved: 0
    });
    expect(moveBoundary([60, 120, 120, 90], 0, 0, 30)).toEqual({
      widths: [60, 120, 120, 90],
      moved: 0
    });
    expect(moveBoundary([100, 30, 45, 90], 2, 0, DESCRIPTION)).toEqual({
      widths: [100, 30, 45, 90],
      moved: 0
    });
    expect(moveBoundary([100, 20, 120, 90], 1, -100, 50)).toEqual({
      widths: [100, 20, 120, 90],
      moved: 0
    });
  });

  it("takes the only position that gives both columns their minimum", () => {
    expect(moveBoundary([10, 120, 120, 90], 0, 50, 94)).toEqual({
      widths: [40, 120, 120, 90],
      moved: 30
    });
  });

  it("ignores the description between two stored columns", () => {
    for (const description of [Number.NaN, Infinity, 0]) {
      expect(moveBoundary(WIDTHS, 2, 10, description)).toEqual({
        widths: [100, 130, 110, 90],
        moved: 10
      });
    }
    expect(moveBoundary(WIDTHS, 3, 50, 0)).toEqual({ widths: [100, 120, 170, 40], moved: 50 });
  });

  it("moves nothing for a boundary the table does not have", () => {
    for (const boundary of [4, 7, -1, 1.5, Number.NaN, Infinity]) {
      expect(moveBoundary(WIDTHS, boundary, 10, DESCRIPTION)).toEqual({ widths: WIDTHS, moved: 0 });
    }
    expect(moveBoundary(WIDTHS, -0, 10, DESCRIPTION)).toEqual({
      widths: [110, 120, 120, 90],
      moved: 10
    });
  });

  it("moves nothing unless there is one width per resizable column", () => {
    expect(moveBoundary([], 0, 10, DESCRIPTION)).toEqual({ widths: [], moved: 0 });
    expect(moveBoundary([100], 0, 10, DESCRIPTION)).toEqual({ widths: [100], moved: 0 });
    expect(moveBoundary([100, 120], 1, 10, DESCRIPTION)).toEqual({ widths: [100, 120], moved: 0 });
    expect(moveBoundary([100, 120], 2, 10, DESCRIPTION)).toEqual({ widths: [100, 120], moved: 0 });
    for (const boundary of [0, 4]) {
      expect(moveBoundary([100, 120, 120, 90, 80], boundary, 10, DESCRIPTION)).toEqual({
        widths: [100, 120, 120, 90, 80],
        moved: 0
      });
    }
  });

  it("keeps fractions as they are", () => {
    expect(moveBoundary([100.5, 120, 120, 90], 0, 10.25, DESCRIPTION)).toEqual({
      widths: [110.75, 120, 120, 90],
      moved: 10.25
    });
    expect(moveBoundary(WIDTHS, 2, 0.3, DESCRIPTION)).toEqual({
      widths: [100, 120.3, 119.7, 90],
      moved: 0.3
    });
    expect(moveBoundary([100, 40.5, 120, 90], 1, 10, DESCRIPTION)).toEqual({
      widths: [100, 40, 120, 90],
      moved: 0.5
    });
  });

  it("moves nothing for a request that is not a finite number", () => {
    for (const delta of [Number.NaN, Infinity, -Infinity]) {
      for (const boundary of [0, 1, 2, 3]) {
        expect(moveBoundary(WIDTHS, boundary, delta, DESCRIPTION)).toEqual({
          widths: WIDTHS,
          moved: 0
        });
      }
    }
  });

  it("moves nothing beside a description that is not a finite number", () => {
    for (const description of [Number.NaN, Infinity, -Infinity]) {
      for (const boundary of [0, 1]) {
        expect(moveBoundary(WIDTHS, boundary, 10, description)).toEqual({
          widths: WIDTHS,
          moved: 0
        });
      }
    }
    expect(moveBoundary(WIDTHS, 1, -Infinity, Infinity)).toEqual({ widths: WIDTHS, moved: 0 });
  });

  it("moves nothing beside a stored width that is not a finite number", () => {
    for (const width of [Number.NaN, Infinity]) {
      expect(moveBoundary([width, 120, 120, 90], 0, 10, DESCRIPTION)).toEqual({
        widths: [width, 120, 120, 90],
        moved: 0
      });
      expect(moveBoundary([100, width, 120, 90], 1, 10, DESCRIPTION)).toEqual({
        widths: [100, width, 120, 90],
        moved: 0
      });
      expect(moveBoundary([100, width, 120, 90], 2, 10, DESCRIPTION)).toEqual({
        widths: [100, width, 120, 90],
        moved: 0
      });
      expect(moveBoundary([100, 120, 120, width], 3, -10, DESCRIPTION)).toEqual({
        widths: [100, 120, 120, width],
        moved: 0
      });
    }
    expect(moveBoundary(withHole(), 3, 10, DESCRIPTION)).toEqual({
      widths: [100, 120, 120, undefined],
      moved: 0
    });
  });

  it("still moves a boundary whose columns are usable when another width is not", () => {
    expect(moveBoundary([100, 120, 120, Infinity], 0, 10, DESCRIPTION)).toEqual({
      widths: [110, 120, 120, Infinity],
      moved: 10
    });
  });

  it("reports no move as positive zero", () => {
    expect(Object.is(moveBoundary([40, 120, 120, 90], 0, -8, DESCRIPTION).moved, 0)).toBe(true);
    expect(Object.is(moveBoundary(WIDTHS, 4, 10, DESCRIPTION).moved, 0)).toBe(true);
    expect(Object.is(moveBoundary(WIDTHS, 0, Number.NaN, DESCRIPTION).moved, 0)).toBe(true);
    for (const boundary of [0, 1, 2, 3]) {
      expect(moveBoundary(WIDTHS, boundary, -0, DESCRIPTION)).toEqual({ widths: WIDTHS, moved: 0 });
    }
  });

  it("never changes the given widths, and always returns new ones", () => {
    const widths = [100, 120, 120, 90];
    for (const boundary of [0, 1, 2, 3, 9]) {
      expect(moveBoundary(widths, boundary, 20, DESCRIPTION).widths).not.toBe(widths);
      expect(moveBoundary(widths, boundary, 0, DESCRIPTION).widths).not.toBe(widths);
    }

    expect(widths).toEqual([100, 120, 120, 90]);
  });

  it("moves frozen widths", () => {
    const widths = Object.freeze([100, 120, 120, 90]) as Array<number>;

    expect(moveBoundary(widths, 2, 10, DESCRIPTION)).toEqual({
      widths: [100, 130, 110, 90],
      moved: 10
    });
    expect(moveBoundary(widths, 0, 10, DESCRIPTION)).toEqual({
      widths: [110, 120, 120, 90],
      moved: 10
    });
  });
});
