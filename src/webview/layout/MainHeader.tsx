import type { GitRepo } from "@/types";
import { ActivityIndicator, openActivity } from "@/webview/components/history/ActivityView";
import {
  openCompare,
  openFileHistory,
  openReflog
} from "@/webview/components/history/HistoryTools";
import { openCleanup, openWorkspaceSync } from "@/webview/components/history/WorkflowTools";
import { openBisect } from "@/webview/components/repository/BisectView";
import { openRemotes } from "@/webview/components/repository/RemoteManager";
import { openStashes } from "@/webview/components/repository/StashManager";
import { openWorktrees } from "@/webview/components/repository/WorktreeManager";
import { Button } from "@/webview/components/ui/Button";
import { Dropdown } from "@/webview/components/ui/Dropdown";
import { SHOW_ALL_BRANCHES } from "@/webview/constants";
import {
  openContextMenu,
  openFormDialog,
  refresh,
  selectBranch,
  selectRepo,
  setShowRemoteBranch
} from "@/webview/lib/actions";
import { selectedCommits, toggleWorkspace, workspaceVisible } from "@/webview/lib/navigation";
import { openRemoteAction } from "@/webview/lib/remote-actions";
import { branchList, selectedBranch, selectedRepo, showRemoteBranch } from "@/webview/lib/stores";

export function MainHeader({ repos }: { repos: Array<GitRepo> }) {
  const repo = selectedRepo.value;
  const choices =
    repo && !repos.some((entry) => entry.path === repo)
      ? [...repos, { path: repo, name: repo.split("/").at(-1) ?? repo }]
      : repos;
  return (
    <header class="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-line-soft bg-editor px-3 py-2 text-ui">
      <Button
        aria-expanded={workspaceVisible.value}
        onClick={toggleWorkspace}
        class={workspaceVisible.value ? "bg-row-selected" : ""}
      >
        {window.l10n.workspaceOverview}
      </Button>
      <Dropdown
        label={window.l10n.repo}
        class="max-w-56"
        options={choices.map((entry) => ({ label: entry.name, value: entry.path }))}
        value={repo}
        onChange={selectRepo}
      />
      <Dropdown
        label={window.l10n.branch}
        class="max-w-56"
        options={[
          { label: window.l10n.showAll, value: SHOW_ALL_BRANCHES },
          ...(branchList.value ?? []).map((value) => ({
            label: value.replace(/^remotes\//, ""),
            value
          }))
        ]}
        value={selectedBranch.value}
        onChange={selectBranch}
        disabled={branchList.value === undefined}
      />
      <div class="ml-auto flex flex-wrap items-center gap-2">
        <ActivityIndicator />
        <Button aria-label={window.l10n.refresh} onClick={refresh}>
          ↻ {window.l10n.refresh}
        </Button>
        <Button disabled={!repo} onClick={() => openRemoteAction("fetch")}>
          {window.l10n.fetch}
        </Button>
        <Button
          disabled={!repo}
          onClick={() =>
            openCompare(
              selectedCommits.value[0]?.hash ?? "HEAD",
              selectedCommits.value[1]?.hash ?? "HEAD"
            )
          }
        >
          {window.l10n.compareSubmit}
        </Button>
        <Button
          disabled={!repo}
          aria-haspopup="menu"
          onClick={(event) =>
            openContextMenu(event, "repository-tools", [
              { title: window.l10n.manageRemotes, onClick: openRemotes },
              { title: window.l10n.stashes, onClick: openStashes },
              { title: window.l10n.worktrees, onClick: openWorktrees },
              { title: window.l10n.workspaceSync, onClick: openWorkspaceSync },
              { title: window.l10n.cleanupBranches, onClick: openCleanup },
              { title: window.l10n.bisectTitle, onClick: openBisect },
              null,
              { title: window.l10n.reflog, onClick: openReflog },
              {
                title: window.l10n.fileHistory,
                onClick: () =>
                  openFormDialog({
                    message: window.l10n.fileHistory,
                    inputs: [{ kind: "text", label: window.l10n.historyPath, value: "" }],
                    action: window.l10n.fileHistory,
                    source: null,
                    onSubmit: ([file]) => openFileHistory(file)
                  })
              },
              { title: window.l10n.operationActivity, onClick: openActivity },
              null,
              {
                title: (showRemoteBranch.value ? "✓ " : "") + window.l10n.showRemoteBranches,
                onClick: () => setShowRemoteBranch(!showRemoteBranch.value)
              }
            ])
          }
        >
          {window.l10n.repositoryTools} ▾
        </Button>
      </div>
    </header>
  );
}
