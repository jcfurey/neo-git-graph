import { computed, signal } from "@preact/signals";

import type { HistoryEntry, HistoryFilter } from "@/backend/types";
import type { SidebarPane } from "@/types";
import {
  branchDisplay,
  branchFocusTarget,
  focusDimming,
  focusPaused,
  selectedRepo
} from "@/webview/lib/stores";
import { vscode } from "@/webview/lib/vscode";
import type { BranchDisplay, FocusDimming } from "@/webview/types";

export const emptyFilter = (): HistoryFilter => ({
  text: "",
  author: "",
  since: "",
  until: "",
  path: "",
  revision: "",
  follow: false
});
type SavedFilter = { name: string; filter: HistoryFilter };
type SavedRepo = {
  filter: HistoryFilter;
  saved: SavedFilter[];
  scroll: number;
  branchDisplay?: BranchDisplay;
  focusBranch?: string | undefined;
  focusPaused?: boolean;
  focusDimming?: FocusDimming;
};
type NavigationState = {
  repos: Record<string, SavedRepo>;
  workspace: boolean;
  /** The branches pane is open. Absent in state saved before the pane existed. */
  refs?: boolean;
  /** Sections of the branches pane the user collapsed. */
  collapsed?: string[];
  /** The search row is open. It also opens while a filter is active. */
  search?: boolean;
};
const initial = vscode.getState() as { navigation?: NavigationState } | null;
let saved: NavigationState = initial?.navigation ?? { repos: {}, workspace: false };
export const historyFilter = signal<HistoryFilter>(emptyFilter());
export const savedFilters = signal<SavedFilter[]>([]);
export const historyOffset = signal(0);
export const historyActive = computed(() =>
  Object.values(historyFilter.value).some((value) => typeof value === "string" && value !== "")
);
export const selectedCommits = signal<HistoryEntry[]>([]);
export const workspaceVisible = signal(saved.workspace);
export const refsVisible = signal(saved.refs ?? true);
export const collapsedSections = signal<ReadonlySet<string>>(new Set(saved.collapsed ?? []));
export const searchVisible = signal(saved.search ?? false);
export const focusedCommit = signal<string | null>(null);
export const restoreScroll = signal<number | null>(null);
let selectionRows: HistoryEntry[] = [];
let selectionAnchor: string | null = null;

export function selectionInGraphOrder() {
  const selected = new Set(selectedCommits.value.map((entry) => entry.hash));
  return [
    ...selectionRows.filter((entry) => selected.has(entry.hash)),
    ...selectedCommits.value.filter(
      (entry) => !selectionRows.some((row) => row.hash === entry.hash)
    )
  ];
}

function persist() {
  const current = vscode.getState();
  vscode.setState({
    ...(typeof current === "object" && current !== null ? current : {}),
    navigation: saved
  });
}

export function leaveNavigation(repo: string | undefined) {
  if (repo === undefined) {
    return;
  }
  saved.repos[repo] = {
    filter: historyFilter.value,
    saved: savedFilters.value,
    branchDisplay: branchDisplay.value,
    focusBranch: branchFocusTarget.value,
    focusPaused: focusPaused.value,
    focusDimming: focusDimming.value,
    scroll: window.scrollY
  };
  persist();
}

export function enterNavigation(repo: string) {
  const state = saved.repos[repo];
  branchDisplay.value = state?.branchDisplay ?? "filter";
  focusPaused.value = state?.focusPaused ?? false;
  focusDimming.value = state?.focusDimming ?? "subtle";
  historyFilter.value = { ...emptyFilter(), ...state?.filter };
  savedFilters.value = state?.saved ?? [];
  historyOffset.value = 0;
  selectedCommits.value = [];
  focusedCommit.value = null;
  restoreScroll.value = state?.scroll ?? 0;
}

export function savedFocusBranch(repo: string) {
  return saved.repos[repo]?.focusBranch;
}

export function setHistoryFilter(filter: HistoryFilter) {
  historyFilter.value = filter;
  historyOffset.value = 0;
  selectedCommits.value = [];
  focusedCommit.value = null;
  leaveNavigation(selectedRepo.value);
}

export function focusHistory(hash: string) {
  setHistoryFilter({ ...emptyFilter(), revision: hash });
  focusedCommit.value = hash;
  restoreScroll.value = 0;
}

export function saveHistoryFilter(name: string) {
  if (!name.trim()) {
    return;
  }
  savedFilters.value = [
    ...savedFilters.value.filter((item) => item.name !== name.trim()),
    { name: name.trim(), filter: { ...historyFilter.value } }
  ];
  leaveNavigation(selectedRepo.value);
}

export function deleteHistoryFilter(name: string) {
  savedFilters.value = savedFilters.value.filter((item) => item.name !== name);
  leaveNavigation(selectedRepo.value);
}

export function toggleWorkspace() {
  workspaceVisible.value = !workspaceVisible.value;
  saved.workspace = workspaceVisible.value;
  persist();
}

export function toggleRefs() {
  refsVisible.value = !refsVisible.value;
  saved.refs = refsVisible.value;
  persist();
}

export function showPane(pane: SidebarPane) {
  const visible = pane === "refs" ? refsVisible : workspaceVisible;
  if (visible.value) {
    return;
  }
  visible.value = true;
  if (pane === "refs") {
    saved.refs = true;
  } else {
    saved.workspace = true;
  }
  persist();
}

export function toggleSearch() {
  searchVisible.value = !searchVisible.value;
  saved.search = searchVisible.value;
  persist();
}

export function showSearch() {
  if (searchVisible.value) {
    return;
  }
  searchVisible.value = true;
  saved.search = true;
  persist();
}

export function toggleSection(id: string) {
  const next = new Set(collapsedSections.value);
  if (!next.delete(id)) {
    next.add(id);
  }
  collapsedSections.value = next;
  saved.collapsed = [...next];
  persist();
}

export function selectCommitRows(
  commit: HistoryEntry,
  rows: HistoryEntry[],
  toggle: boolean,
  range: boolean
) {
  selectionRows = rows;
  if (selectedCommits.value.length === 0) {
    selectionAnchor = null;
  }
  if (range && selectionAnchor) {
    const a = rows.findIndex((row) => row.hash === selectionAnchor);
    const b = rows.findIndex((row) => row.hash === commit.hash);
    if (a >= 0 && b >= 0) {
      selectedCommits.value = rows
        .slice(Math.min(a, b), Math.max(a, b) + 1)
        .filter((row) => row.hash !== "*");
      return;
    }
  }
  selectionAnchor = commit.hash;
  if (toggle) {
    selectedCommits.value = selectedCommits.value.some((row) => row.hash === commit.hash)
      ? selectedCommits.value.filter((row) => row.hash !== commit.hash)
      : [...selectedCommits.value, commit];
  } else {
    selectedCommits.value = [commit];
  }
}
