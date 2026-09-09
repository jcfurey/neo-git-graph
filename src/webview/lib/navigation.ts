import { computed, signal } from "@preact/signals";

import type { HistoryEntry, HistoryFilter } from "@/backend/types";
import { selectedRepo } from "@/webview/lib/stores";
import { vscode } from "@/webview/lib/vscode";

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
type SavedRepo = { filter: HistoryFilter; saved: SavedFilter[]; scroll: number };
type NavigationState = { repos: Record<string, SavedRepo>; workspace: boolean };
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
    scroll: window.scrollY
  };
  persist();
}

export function enterNavigation(repo: string) {
  const state = saved.repos[repo];
  historyFilter.value = { ...emptyFilter(), ...state?.filter };
  savedFilters.value = state?.saved ?? [];
  historyOffset.value = 0;
  selectedCommits.value = [];
  focusedCommit.value = null;
  restoreScroll.value = state?.scroll ?? 0;
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
