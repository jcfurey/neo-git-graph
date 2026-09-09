import { useLayoutEffect } from "preact/hooks";

import { CommitTable } from "@/webview/components/commit/CommitTable";
import { openBatch, openCompare } from "@/webview/components/history/HistoryTools";
import { PageControls, QueryStatus } from "@/webview/components/history/QueryControls";
import { Button } from "@/webview/components/ui/Button";
import { Loading } from "@/webview/components/ui/Loading";
import { loadMoreCommits } from "@/webview/lib/actions";
import {
  historyActive,
  historyFilter,
  historyOffset,
  restoreScroll,
  selectedCommits
} from "@/webview/lib/navigation";
import {
  commitHead,
  commitList,
  headBranch,
  maxCommits,
  moreCommitsAvailable,
  selectedBranch,
  selectedRepo
} from "@/webview/lib/stores";
import { useRepositoryQuery } from "@/webview/lib/use-repository-query";
import { NoCommitsPage } from "@/webview/pages/NoCommitsPage";

export function GraphView() {
  const filter = historyFilter.value;
  const active = historyActive.value;
  const query = useRepositoryQuery<"history">(
    active
      ? {
          kind: "history",
          filter: {
            ...filter,
            revision:
              filter.revision || (selectedBranch.value === "*" ? "" : (selectedBranch.value ?? ""))
          },
          offset: historyOffset.value
        }
      : null
  );
  const commits = active ? query.data?.page.entries : commitList.value;
  const repo = selectedRepo.value;
  useLayoutEffect(() => {
    if (commits === undefined || restoreScroll.value === null) {
      return;
    }
    const position = restoreScroll.value;
    const frame = requestAnimationFrame(() => {
      window.scrollTo(0, position);
      restoreScroll.value = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [repo, commits]);

  if (active && (query.error || (query.loading && !commits))) {
    return (
      <main class="p-3">
        <QueryStatus {...query} />
      </main>
    );
  }

  if (commits === undefined) {
    return (
      <main class="grid flex-1 place-items-center">
        <Loading />
      </main>
    );
  }

  if (!active && commits.length === 0 && commitHead.value === null) {
    return <NoCommitsPage />;
  }

  const loadingMore = commits.length < maxCommits.value;

  return (
    <main class="relative">
      {active && (
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-3 py-2 text-xs text-muted">
          <span>
            {filter.path ||
              (filter.revision
                ? window.l10n.historyAt.replace("{0}", filter.revision.slice(0, 12))
                : window.l10n.filteredHistory)}
          </span>
          <span>{window.l10n.filteredHistoryHint}</span>
        </div>
      )}
      {selectedCommits.value.length > 1 && (
        <div class="flex flex-wrap items-center gap-2 border-b border-line-soft bg-row-head px-3 py-2 text-ui">
          <span>
            {window.l10n.selectedCount.replace("{0}", String(selectedCommits.value.length))}
          </span>
          {selectedCommits.value.length === 2 && (
            <Button
              onClick={() =>
                openCompare(selectedCommits.value[0]!.hash, selectedCommits.value[1]!.hash)
              }
            >
              {window.l10n.compareSelected}
            </Button>
          )}
          <Button
            disabled={selectedCommits.value.length > 100}
            onClick={() => openBatch("cherry-pick")}
          >
            {window.l10n.batchCherryPick}
          </Button>
          <Button disabled={selectedCommits.value.length > 100} onClick={() => openBatch("revert")}>
            {window.l10n.batchRevert}
          </Button>
          <Button
            onClick={() => {
              selectedCommits.value = [];
            }}
          >
            {window.l10n.clearSelection}
          </Button>
        </div>
      )}
      {active && commits.length === 0 && (
        <p class="p-6 text-muted">{window.l10n.noHistoryMatches}</p>
      )}
      <CommitTable commits={commits} head={commitHead.value} headBranch={headBranch.value} />
      {active && query.data && (
        <div class="px-3">
          <PageControls
            offset={historyOffset.value}
            count={commits.length}
            more={query.data.page.more}
            change={(offset) => {
              historyOffset.value = offset;
              selectedCommits.value = [];
            }}
          />
        </div>
      )}
      {!active &&
        moreCommitsAvailable.value &&
        (loadingMore ? (
          <Loading />
        ) : (
          <div class="flex justify-center py-4">
            <Button onClick={loadMoreCommits}>{window.l10n.loadMore}</Button>
          </div>
        ))}
    </main>
  );
}
