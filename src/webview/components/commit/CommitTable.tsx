import { useSignal } from "@preact/signals";
import { Fragment } from "preact";
import { useMemo } from "preact/hooks";

import type { HistoryEntry } from "@/backend/types";
import { CommitDetails } from "@/webview/components/commit/CommitDetails";
import { CommitGraph } from "@/webview/components/commit/CommitGraph";
import { CommitRow } from "@/webview/components/commit/CommitRow";
import type { ColumnResize } from "@/webview/components/commit/useColumnResize";
import { useColumnResize } from "@/webview/components/commit/useColumnResize";
import { useGraphScroll } from "@/webview/components/commit/useGraphScroll";
import { WorkingTreeDetails } from "@/webview/components/commit/WorkingTreeDetails";
import { RevealIcon } from "@/webview/components/ui/Icons";
import {
  COMMIT_DETAILS_HEIGHT,
  TABLE_HEADER_HEIGHT,
  UNCOMMITTED_CHANGES
} from "@/webview/constants";
import { GRAPH_PADDING } from "@/webview/graph/constants";
import { commitRelations, lineRelation } from "@/webview/graph/focus";
import { computeGraphLayout } from "@/webview/graph/layout";
import { branchColour } from "@/webview/graph/palette";
import type { GraphExpansion } from "@/webview/graph/types";
import { graphWidth, laneX } from "@/webview/graph/utils";
import { toggleCommitDetails } from "@/webview/lib/actions";
import { focusedCommit, selectedCommits } from "@/webview/lib/navigation";
import { columnWidths, commitDetails, expandedCommit } from "@/webview/lib/stores";
import type { FocusDimming } from "@/webview/types";

type CommitTableProps = {
  commits: Array<HistoryEntry>;
  head: string | null;
  headBranch: string | null;
  focus?: { direct: string[]; merged: string[] } | null;
  keepMergedBright?: boolean;
  dimming?: FocusDimming;
};

const HEADER_CLASS =
  "relative h-8 overflow-hidden border-b border-line px-3 text-left font-semibold" +
  " text-ellipsis whitespace-nowrap";

const HANDLE_CLASS =
  "absolute top-0 h-full w-1.5 cursor-col-resize focus:outline-1 focus:-outline-offset-1 focus:outline-focus";

const GRAPH_CLIP = `width: var(--graph-viewport-width, 0px); top: var(--graph-top, ${TABLE_HEADER_HEIGHT}px);`;

/** Keep room for the graph, and for the column title when the graph is narrow. */
const MIN_GRAPH_COLUMN = 64;
/** Leave room for commit text; wider graphs can scroll inside their column. */
const MAX_GRAPH_COLUMN = 240;

/**
 * Grip that moves the boundary after column `boundary`. Both columns of a
 * boundary hold one, because a header cuts off what leaves it. The right one
 * draws the line between the two columns, the left one only widens the grip.
 */
function ResizeHandle({
  boundary,
  title,
  side,
  resize
}: {
  boundary: number;
  title: string;
  side: "left" | "right";
  resize: ColumnResize;
}) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={window.l10n.resizeColumn.replace("{0}", title)}
      tabIndex={side === "left" ? 0 : undefined}
      class={`${HANDLE_CLASS} ${side === "left" ? "left-0 border-l border-line-soft" : "right-0"}`}
      onMouseDown={(event) => resize.startResize(boundary, event)}
      onKeyDown={(event) => resize.nudge(boundary, event)}
    />
  );
}

export function CommitTable({
  commits,
  head,
  headBranch,
  focus = null,
  keepMergedBright = false,
  dimming = "subtle"
}: CommitTableProps) {
  const layout = useMemo(() => computeGraphLayout(commits, head), [commits, head]);
  const relations = useMemo(() => commitRelations(commits, focus), [commits, focus]);
  // Only the graph observes hover changes; the text rows already use CSS hover.
  const hovered = useSignal<string | null>(null);
  const selected = new Set(selectedCommits.value.map((commit) => commit.hash));
  const revealed = new Set(
    commits.flatMap((commit, index) =>
      commit.hash === head ||
      commit.hash === focusedCommit.value ||
      commit.hash === expandedCommit.value ||
      selected.has(commit.hash)
        ? [index]
        : []
    )
  );
  const messages = useMemo(
    () => new Map(commits.map((commit) => [commit.hash, commit.message])),
    [commits]
  );
  const graphContentWidth = graphWidth(layout) + GRAPH_PADDING;
  const graphColumn = Math.max(Math.min(graphContentWidth, MAX_GRAPH_COLUMN), MIN_GRAPH_COLUMN);
  const resize = useColumnResize(graphColumn);
  const graphScroll = useGraphScroll(resize.containerRef, resize.headRef, graphContentWidth);
  const sized = columnWidths.value !== null;
  const focusedHash = focusedCommit.value;
  const canReveal = commits.some((commit) => commit.hash === focusedHash);
  const tabStopHash = canReveal ? focusedHash : commits[0]?.hash;
  const commitRows = useMemo(
    () => new Map(commits.map((commit, index) => [commit.hash, index])),
    [commits]
  );
  function revealCommit(hash: string) {
    const vertex = layout.vertices[commits.findIndex((commit) => commit.hash === hash)];
    if (vertex) {
      graphScroll.revealLane(laneX(vertex.x));
    }
  }

  const expandedHash = expandedCommit.value;
  const expandedRow = commits.findIndex((commit) => commit.hash === expandedHash);
  const expansion: GraphExpansion | null =
    expandedRow === -1 ? null : { row: expandedRow, height: COMMIT_DETAILS_HEIGHT };

  const titles = [
    window.l10n.graph,
    window.l10n.description,
    window.l10n.date,
    window.l10n.author,
    window.l10n.commit
  ];

  return (
    <div class="relative" ref={resize.containerRef}>
      <div
        ref={graphScroll.viewportRef}
        data-graph-viewport
        class="pointer-events-none absolute left-0 overflow-hidden"
        style={GRAPH_CLIP}
      >
        <div style={{ width: graphContentWidth }}>
          <CommitGraph
            layout={layout}
            expansion={expansion}
            relations={relations}
            relationForLine={(line) => lineRelation(line, commits, relations)}
            keepMergedBright={keepMergedBright}
            dimming={dimming}
            revealed={revealed}
            hovered={hovered}
            commitRows={commitRows}
          />
        </div>
      </div>
      <table
        aria-label={window.l10n.graphKeyboardHint}
        onMouseOver={(event) => {
          hovered.value =
            (event.target as HTMLElement)
              .closest("tr[data-commit-hash]")
              ?.getAttribute("data-commit-hash") ?? null;
        }}
        onMouseLeave={() => {
          hovered.value = null;
        }}
        onWheel={graphScroll.onWheel}
        class={`w-full cursor-default border-collapse text-ui select-none ${
          sized ? "table-fixed" : ""
        }`}
      >
        <colgroup>
          <col style="width: var(--col-graph)" />
          <col />
          <col style="width: var(--col-date)" />
          <col style="width: var(--col-author)" />
          <col style="width: var(--col-commit)" />
        </colgroup>
        <thead class="sticky z-10 bg-editor" style="top: var(--main-header-height, 0px)">
          <tr ref={resize.headRef} class={resize.resizing ? "cursor-col-resize" : ""}>
            {titles.map((title, index) => (
              <th
                key={title}
                class={HEADER_CLASS + (index === 0 && graphScroll.overflow ? " pb-2" : "")}
              >
                {index > 0 && (
                  <ResizeHandle
                    boundary={index - 1}
                    title={titles[index - 1]!}
                    side="left"
                    resize={resize}
                  />
                )}
                {title}
                {index === 1 && graphScroll.overflow && (
                  <button
                    type="button"
                    aria-label={window.l10n.revealSelectedLane}
                    title={window.l10n.revealSelectedLane}
                    disabled={!canReveal}
                    class="ml-2 inline-flex cursor-pointer rounded p-1 align-middle hover:bg-btn-hover focus:outline-1 focus:outline-focus disabled:cursor-default disabled:opacity-50"
                    onClick={() => focusedHash && revealCommit(focusedHash)}
                  >
                    <RevealIcon class="size-3.5" />
                  </button>
                )}
                {index === 0 && (
                  <div
                    ref={graphScroll.scrollRef}
                    data-graph-scroll
                    role="region"
                    aria-label={window.l10n.scrollGraphHorizontally}
                    tabIndex={graphScroll.overflow ? 0 : undefined}
                    class={`graph-scrollbar absolute bottom-0 left-0 h-2.5 w-full overflow-x-auto overflow-y-hidden focus:outline-1 focus:-outline-offset-1 focus:outline-focus ${graphScroll.overflow ? "" : "invisible"}`}
                    onScroll={graphScroll.syncScroll}
                  >
                    <div style={{ width: graphContentWidth, height: 1 }} />
                  </div>
                )}
                {index < titles.length - 1 && (
                  <ResizeHandle boundary={index} title={title} side="right" resize={resize} />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {commits.map((commit, index) => (
            <Fragment key={commit.hash}>
              <CommitRow
                commit={commit}
                rows={commits}
                tabStop={commit.hash === tabStopHash}
                isHead={commit.hash === head}
                headBranch={headBranch}
                messages={messages}
                colour={branchColour(layout.vertices[index]?.colour ?? 0)}
                onRevealLane={revealCommit}
                relation={relations[index] ?? "normal"}
                keepMergedBright={keepMergedBright}
                expanded={index === expandedRow}
                onSelect={() => toggleCommitDetails(commit.hash)}
              />
              {index === expandedRow &&
                (commit.hash === UNCOMMITTED_CHANGES ? (
                  <WorkingTreeDetails />
                ) : (
                  <CommitDetails details={commitDetails.value} />
                ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
