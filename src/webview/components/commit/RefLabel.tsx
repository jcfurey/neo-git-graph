import type { GitRef } from "@/backend/types";
import { BranchFocusBadge } from "@/webview/components/commit/BranchFocusBadge";
import { BranchIcon, TagIcon } from "@/webview/components/ui/Icons";
import { openContextMenu } from "@/webview/lib/actions";
import { checkoutBranchAction, refMenu, refMenuSource } from "@/webview/lib/menus";
import { repositoryState } from "@/webview/lib/repository-actions";
import { activeSource } from "@/webview/lib/stores";

const ICON_CLASS = "mr-1.25 size-4.5 shrink-0 rounded-l-sm bg-graph fill-editor p-0.5";

export function RefLabel({ gitRef, active }: { gitRef: GitRef; active: boolean }) {
  const source = refMenuSource(gitRef);
  const menuOpen = activeSource.value === source;
  const state = repositoryState.value;
  const tracking =
    gitRef.type === "head"
      ? state?.branches.find((branch) => branch.name === gitRef.name)
      : undefined;
  const worktree =
    gitRef.type === "head"
      ? state?.worktrees.find((entry) => entry.branch === gitRef.name)
      : undefined;
  const title = [
    gitRef.name,
    active ? window.l10n.labelCurrentBranch : null,
    tracking?.upstream,
    tracking?.gone ? window.l10n.upstreamGone : null,
    worktree ? window.l10n.worktreeAt.replace("{0}", worktree.path) : null
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <span
      class={`mt-0.5 mr-1.25 inline-flex h-4.5 max-w-full items-center overflow-hidden rounded-md border pr-1.25 align-top text-xs box-content ${
        active ? "border-graph" : "border-line"
      } ${menuOpen ? "bg-btn-hover" : "bg-btn"}`}
      title={title}
      onContextMenu={(event) => openContextMenu(event, source, refMenu(gitRef, active))}
      onClick={(event) => event.stopPropagation()}
      onDblClick={(event) => {
        event.stopPropagation();
        checkoutBranchAction(gitRef);
      }}
    >
      {gitRef.type === "tag" ? <TagIcon class={ICON_CLASS} /> : <BranchIcon class={ICON_CLASS} />}
      <span class={`truncate ${active ? "font-bold" : ""}`}>{gitRef.name}</span>
      {gitRef.type !== "tag" && (
        <BranchFocusBadge
          branch={gitRef.type === "remote" ? "remotes/" + gitRef.name : gitRef.name}
        />
      )}
      {tracking?.upstream && !tracking.gone && (tracking.ahead > 0 || tracking.behind > 0) && (
        <span class="ml-1 whitespace-nowrap">
          ↑{tracking.ahead} ↓{tracking.behind}
        </span>
      )}
      {worktree && !active && <span class="ml-1">↗</span>}
    </span>
  );
}
