import type { ReadonlySignal } from "@preact/signals";
import { useMemo } from "preact/hooks";

import { VERTEX_RADIUS } from "@/webview/graph/constants";
import { focusColour } from "@/webview/graph/focus";
import { branchColour, UNCOMMITTED_COLOUR } from "@/webview/graph/palette";
import { branchStrokes } from "@/webview/graph/strokes";
import type { BranchRelation, GraphExpansion, GraphLayout, GraphLine } from "@/webview/graph/types";
import { expandOffset, graphHeight, graphWidth, laneX, rowY } from "@/webview/graph/utils";
import { getWebviewConfig } from "@/webview/lib/webview-config";
import type { FocusDimming } from "@/webview/types";

const SHADOW_CLASS = "fill-none stroke-editor/75 stroke-4";
const LINE_CLASS = "fill-none stroke-2";
const HEAD_DOT_CLASS = "fill-editor stroke-2";
const DOT_CLASS = "stroke-editor/75 stroke-1";

/**
 * The branch lines and commit dots, drawn behind the first column of the commit
 * table. The table rows set the scale: a row is `ROW_HEIGHT` high. The caller
 * places the graph, and cuts it off when the column is too narrow for it.
 */
export function CommitGraph({
  layout,
  expansion,
  relations,
  relationForLine,
  keepMergedBright,
  dimming,
  revealed,
  hovered,
  commitRows
}: {
  layout: GraphLayout;
  expansion: GraphExpansion | null;
  relations: BranchRelation[];
  relationForLine: (line: GraphLine) => BranchRelation;
  keepMergedBright: boolean;
  dimming: FocusDimming;
  revealed: ReadonlySet<number>;
  hovered: ReadonlySignal<string | null>;
  commitRows: ReadonlyMap<string, number>;
}) {
  const angular = getWebviewConfig().graphStyle === "angular";
  const strokes = useMemo(
    () =>
      layout.branches.flatMap((branch) =>
        branchStrokes(branch, angular, expansion, relationForLine)
      ),
    [layout, angular, expansion, relationForLine]
  );
  const hoveredRow = hovered.value === null ? undefined : commitRows.get(hovered.value);

  return (
    <svg
      class="block"
      width={graphWidth(layout)}
      height={graphHeight(layout, expansion)}
      aria-hidden="true"
    >
      {strokes.map((stroke, index) => (
        <g key={index}>
          <path class={SHADOW_CLASS} d={stroke.path} />
          <path
            class={LINE_CLASS}
            d={stroke.path}
            data-branch-relation={stroke.relation}
            stroke={
              stroke.isCommitted
                ? focusColour(
                    branchColour(stroke.colour),
                    stroke.relation,
                    keepMergedBright,
                    dimming
                  )
                : UNCOMMITTED_COLOUR
            }
          />
        </g>
      ))}
      {layout.vertices.map((vertex) => {
        const relation = relations[vertex.y] ?? "normal";
        const colour = vertex.isCommitted
          ? focusColour(
              branchColour(vertex.colour),
              revealed.has(vertex.y) || hoveredRow === vertex.y || vertex.isCurrent
                ? "normal"
                : relation,
              keepMergedBright,
              dimming
            )
          : UNCOMMITTED_COLOUR;

        return (
          <circle
            key={vertex.y}
            data-branch-relation={relation}
            cx={laneX(vertex.x)}
            cy={rowY(vertex.y) + expandOffset(vertex.y, expansion)}
            r={VERTEX_RADIUS}
            class={vertex.isCurrent ? HEAD_DOT_CLASS : DOT_CLASS}
            stroke={vertex.isCurrent ? colour : undefined}
            fill={vertex.isCurrent ? undefined : colour}
          />
        );
      })}
    </svg>
  );
}
