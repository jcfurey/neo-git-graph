import { ROW_HEIGHT } from "@/webview/constants";
import { LANE_OFFSET, LANE_WIDTH } from "@/webview/graph/constants";
import type {
  Branch,
  GraphExpansion,
  GraphLayout,
  GraphPoint,
  Vertex
} from "@/webview/graph/types";

/* Pixels. The graph is drawn on a grid of lanes (columns) and rows. */

/** Horizontal centre of a lane: where its dots and straight lines are drawn. */
export function laneX(x: number): number {
  return LANE_OFFSET + x * LANE_WIDTH;
}

/** Vertical middle of a row, before any shift from the open commit details. */
export function rowY(y: number): number {
  return (y + 0.5) * ROW_HEIGHT;
}

/** A missing expansion, whether `null` or `undefined`, means no details are open. */
function isOpen(expansion: GraphExpansion | null): expansion is GraphExpansion {
  return expansion !== null && expansion !== undefined;
}

/**
 * Width of the drawing. The margin right of the last lane matches the one
 * left of the first, so the outer dots are never clipped.
 */
export function graphWidth(layout: GraphLayout): number {
  return layout.lanes > 0 ? laneX(layout.lanes - 1) + LANE_OFFSET : 0;
}

/**
 * Height of the drawing. Open details add their height only when they belong
 * to one of the layout's rows; anywhere else they would leave an empty gap.
 */
export function graphHeight(layout: GraphLayout, expansion: GraphExpansion | null): number {
  const rows = layout.vertices.length;
  const height = rows * ROW_HEIGHT;
  if (isOpen(expansion) && expansion.row >= 0 && expansion.row < rows) {
    return height + expansion.height;
  }
  return height;
}

/**
 * How far a row moves down to make room for the open details. They open
 * beneath their own row, so only the rows after it move. `strokes.ts` shifts
 * lines by the same rule, so that lines still meet the dots.
 */
export function expandOffset(row: number, expansion: GraphExpansion | null): number {
  return isOpen(expansion) && row > expansion.row ? expansion.height : 0;
}

/*
 * Lane bookkeeping while a layout is computed. The lanes of a row are taken
 * from the left, one at a time, and are never given back: lanes below `nextX`
 * are taken, the rest are free. `connections[lane]` records on whose behalf
 * each taken lane was claimed, as the vertex the line is heading for and the
 * branch drawing it. A record is never replaced once written.
 */

/** Where the vertex's own dot sits. Only meaningful once it has joined a branch. */
export function pointOf(vertex: Vertex): GraphPoint {
  return { x: vertex.x, y: vertex.y };
}

/** The leftmost free lane of the vertex's row. */
export function nextPointOf(vertex: Vertex): GraphPoint {
  return { x: vertex.nextX, y: vertex.y };
}

/**
 * The leftmost lane of the vertex's row already claimed for the same target on
 * the same branch, so a new line can join it; `null` when there is none. Both
 * are matched by identity.
 */
export function connectionTo(
  vertex: Vertex,
  connectsTo: Vertex | null,
  onBranch: Branch
): GraphPoint | null {
  const records = vertex.connections;
  for (let lane = 0; lane < records.length; lane++) {
    const record = records[lane];
    if (record?.connectsTo === connectsTo && record.onBranch === onBranch) {
      return { x: lane, y: vertex.y };
    }
  }
  return null;
}

/**
 * Claim lane `x` of the vertex's row. Only the leftmost free lane can be
 * claimed; any other lane is left as it is, so a lane that is already taken
 * keeps its first record.
 */
export function takePoint(
  vertex: Vertex,
  x: number,
  connectsTo: Vertex | null,
  onBranch: Branch
): void {
  if (x !== vertex.nextX) {
    return;
  }
  vertex.connections.push({ connectsTo, onBranch });
  vertex.nextX = x + 1;
}

/**
 * Put a vertex on a branch in lane `x`. The first branch to reach a vertex
 * keeps it: the dot's lane and colour do not change afterwards. This does not
 * claim the lane; see `takePoint`.
 */
export function joinBranch(vertex: Vertex, branch: Branch, x: number): void {
  if (vertex.branch !== null) {
    return;
  }
  vertex.branch = branch;
  vertex.x = x;
}
