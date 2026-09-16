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
import { GearIcon, RefreshIcon, SearchIcon } from "@/webview/components/ui/Icons";
import { SHOW_ALL_BRANCHES } from "@/webview/constants";
import {
  openContextMenu,
  openFormDialog,
  refresh,
  selectBranch,
  setBranchDisplay,
  selectRepo,
  setShowRemoteBranch
} from "@/webview/lib/actions";
import { focusSearch } from "@/webview/lib/focus";
import {
  refsVisible,
  searchVisible,
  selectedCommits,
  toggleRefs,
  toggleSearch,
  toggleWorkspace,
  workspaceVisible
} from "@/webview/lib/navigation";
import { openRemoteAction } from "@/webview/lib/remote-actions";
import { rpcClient } from "@/webview/lib/rpc/rpc-client";
import {
  branchDisplay,
  branchList,
  selectedBranch,
  selectedRepo,
  showRemoteBranch
} from "@/webview/lib/stores";
import type { BranchDisplay } from "@/webview/types";

export function MainHeader({ repos }: { repos: Array<GitRepo> }) {
  const repo = selectedRepo.value;
  const choices =
    repo && !repos.some((entry) => entry.path === repo)
      ? [...repos, { path: repo, name: repo.split("/").at(-1) ?? repo }]
      : repos;
  return (
    <header class="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-line-soft bg-editor px-3 py-2 text-ui">
      <Button
        aria-expanded={refsVisible.value}
        onClick={toggleRefs}
        class={refsVisible.value ? "bg-row-selected" : ""}
      >
        {window.l10n.branchesPane}
      </Button>
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
      <Dropdown
        label={window.l10n.branchDisplay}
        class="max-w-56"
        options={[
          { label: window.l10n.filterToBranch, value: "filter" },
          { label: window.l10n.focusDirectHistory, value: "focus" },
          { label: window.l10n.focusAllAncestors, value: "ancestors" }
        ]}
        value={branchDisplay.value}
        onChange={(value) => setBranchDisplay(value as BranchDisplay)}
        disabled={branchList.value === undefined}
      />
      <div class="ml-auto flex flex-wrap items-center gap-2">
        <ActivityIndicator />
        <Button
          aria-label={window.l10n.historySearch}
          title={window.l10n.historySearch}
          aria-expanded={searchVisible.value}
          class={searchVisible.value ? "bg-row-selected" : ""}
          onClick={() => (searchVisible.value ? toggleSearch() : focusSearch())}
        >
          <SearchIcon class="size-4" />
        </Button>
        <Button onClick={refresh}>
          <RefreshIcon class="size-3.5" />
          {window.l10n.refresh}
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
          aria-label={window.l10n.settingsTools}
          title={window.l10n.settingsTools}
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
              },
              {
                title: window.l10n.gettingStarted,
                onClick: () => void rpcClient.request("walkthrough.open", null)
              },
              {
                title: window.l10n.learnMore,
                onClick: () => void rpcClient.request("docs.open", null)
              },
              {
                title: window.l10n.openSettings,
                onClick: () => void rpcClient.request("settings.open", null)
              }
            ])
          }
        >
          <GearIcon class="size-4" />
        </Button>
      </div>
    </header>
  );
}
