import type { HistoryEntry, GitRef } from "@/backend/types";
import { abbrevCommit } from "@/backend/utils/string";
import { RefLabel } from "@/webview/components/commit/RefLabel";
import { fileContextMenu } from "@/webview/components/history/file-menu";
import { UNCOMMITTED_CHANGES } from "@/webview/constants";
import { openContextMenu } from "@/webview/lib/actions";
import type { CommitMessages } from "@/webview/lib/menus";
import { commitMenu, commitMenuSource } from "@/webview/lib/menus";
import {
  historyFilter,
  focusedCommit,
  selectCommitRows,
  selectedCommits
} from "@/webview/lib/navigation";
import { activeSource, uncommittedChanges } from "@/webview/lib/stores";
import { getCommitDate } from "@/webview/utils/date";
import { format } from "@/webview/utils/format";

type CommitRowProps = {
  commit: HistoryEntry;
  rows?: HistoryEntry[];
  tabStop?: boolean;
  isHead: boolean;
  headBranch: string | null;
  /** Commit messages by hash, so the menu can name the parents of a merge. */
  messages: CommitMessages;
  /** Colour of the graph branch this commit sits on. */
  colour: string | undefined;
  /** The details view of this commit is open. */
  expanded: boolean;
  /** Open or close the details view. Absent for the uncommitted changes row. */
  onSelect: (() => void) | undefined;
};

const CELL_CLASS = "h-6 overflow-hidden text-ellipsis whitespace-nowrap px-1 leading-6";

function isActiveRef(gitRef: GitRef, headBranch: string | null) {
  return gitRef.type === "head" && gitRef.name === headBranch;
}

/** The checked out branch is shown first, the remaining refs keep their order. */
function orderRefs(refs: Array<GitRef>, headBranch: string | null) {
  return refs.toSorted(
    (a, b) => Number(isActiveRef(b, headBranch)) - Number(isActiveRef(a, headBranch))
  );
}

/** One background per state. Two unprefixed `bg-*` classes would race on CSS order. */
function rowBackground(isHead: boolean, expanded: boolean, menuOpen: boolean) {
  if (expanded) {
    return "bg-row-selected hover:bg-row-selected-hover";
  }
  if (menuOpen) {
    return "bg-row-hover";
  }
  if (isHead) {
    return "bg-row-head hover:bg-row-hover";
  }
  return "hover:bg-row-hover";
}

function rowClass(isHead: boolean, expanded: boolean, selectable: boolean, menuOpen: boolean) {
  return [rowBackground(isHead, expanded, menuOpen), selectable ? "cursor-pointer" : ""]
    .filter(Boolean)
    .join(" ");
}

export function CommitRow({
  commit,
  rows = [commit],
  tabStop = true,
  isHead,
  headBranch,
  messages,
  colour,
  expanded,
  onSelect
}: CommitRowProps) {
  const uncommitted = commit.hash === UNCOMMITTED_CHANGES;
  const message = uncommitted
    ? format(window.l10n.uncommittedChanges, uncommittedChanges.value)
    : commit.message;
  const date = getCommitDate(commit.date);
  const source = commitMenuSource(commit.hash);
  const menuOpen = activeSource.value === source;
  const refs = orderRefs(commit.refs, headBranch);
  const marked = selectedCommits.value.some((row) => row.hash === commit.hash);
  const menu = () => [
    ...commitMenu(commit, messages),
    ...(commit.filePath
      ? [
          null,
          ...fileContextMenu(
            commit.hash,
            commit.filePath,
            commit.previousPath ?? commit.filePath,
            commit.change?.startsWith("D") === true,
            historyFilter.value.path
          )
        ]
      : [])
  ];

  return (
    <tr
      class={
        rowClass(isHead, expanded || marked, onSelect !== undefined, menuOpen) +
        " focus:outline-1 focus:-outline-offset-1 focus:outline-focus"
      }
      data-commit-hash={uncommitted ? undefined : commit.hash}
      tabIndex={uncommitted ? undefined : tabStop ? 0 : -1}
      aria-selected={marked}
      title={window.l10n.selectCommitsHint}
      style={colour === undefined ? undefined : `--color-graph: ${colour}`}
      onClick={(event) => {
        if (uncommitted) {
          return;
        }
        focusedCommit.value = commit.hash;
        event.currentTarget.focus({ preventScroll: true });
        selectCommitRows(commit, rows, event.ctrlKey || event.metaKey, event.shiftKey);
        if (!event.ctrlKey && !event.metaKey && !event.shiftKey) {
          onSelect?.();
        }
      }}
      onKeyDown={(event) => {
        if (uncommitted || event.target !== event.currentTarget) {
          return;
        }
        if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const available = rows.filter((row) => row.hash !== "*");
          const index = available.findIndex((row) => row.hash === commit.hash);
          const next =
            available[
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? available.length - 1
                  : Math.max(
                      0,
                      Math.min(available.length - 1, index + (event.key === "ArrowDown" ? 1 : -1))
                    )
            ];
          if (next) {
            focusedCommit.value = next.hash;
            selectCommitRows(next, rows, false, event.shiftKey);
            event.currentTarget
              .closest("table")
              ?.querySelector<HTMLElement>(`tr[data-commit-hash="${next.hash}"]`)
              ?.focus();
          }
        } else if (event.key === "Enter") {
          event.preventDefault();
          onSelect?.();
        } else if (event.key === " ") {
          event.preventDefault();
          selectCommitRows(commit, rows, true, event.shiftKey);
        } else if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          openContextMenu(
            new MouseEvent("contextmenu", { clientX: rect.left + 80, clientY: rect.bottom }),
            source,
            menu()
          );
        }
      }}
      onContextMenu={uncommitted ? undefined : (event) => openContextMenu(event, source, menu())}
    >
      <td class={CELL_CLASS} />
      <td class={`${CELL_CLASS} w-full max-w-0 pl-2.5 ${isHead ? "shadow-head" : ""}`}>
        <div class="flex min-w-0 items-center">
          {isHead && (
            <span class="mr-1.25 size-1.5 shrink-0 box-content rounded-full border-2 border-graph" />
          )}
          {refs.length > 0 && (
            <span class="flex min-w-0 max-w-1/2 shrink-0 overflow-hidden">
              {refs.map((gitRef) => (
                <RefLabel
                  key={`${gitRef.type}-${gitRef.name}`}
                  gitRef={gitRef}
                  active={isActiveRef(gitRef, headBranch)}
                />
              ))}
            </span>
          )}
          <span
            class="min-w-0 flex-1 truncate"
            title={typeof message === "string" ? message : message.join("")}
          >
            {isHead || uncommitted ? <b>{message}</b> : message}
          </span>
        </div>
      </td>
      <td class={CELL_CLASS} title={date.title}>
        {date.value}
      </td>
      <td class={`${CELL_CLASS} max-w-31`} title={`${commit.author} <${commit.email}>`}>
        {commit.author}
      </td>
      <td class={`${CELL_CLASS} font-mono`} title={commit.hash}>
        {abbrevCommit(commit.hash)}
      </td>
    </tr>
  );
}
