import * as vscode from "vscode";

import type { DateFormat, GraphStyle } from "@/types";

type TabIconColourTheme = "colour" | "grey";

export const extConfig = {
  autoCenterCommitDetailsView: (): boolean => getConfig("autoCenterCommitDetailsView", true),
  dateFormat: (): DateFormat => getConfig("dateFormat", "Date & Time"),
  fetchAvatars: (): boolean => getConfig("fetchAvatars", false),
  gitBinary: () => vscode.workspace.getConfiguration("git").get("path", null) ?? "git",
  graphColours: (): string[] =>
    getConfig("graphColours", ["#0085d9", "#d9008f", "#00d90a", "#d98500", "#a300d9", "#ff0000"]),
  graphStyle: (): GraphStyle => getConfig("graphStyle", "rounded"),
  initialLoadCommits: (): number => wholeNumber(getConfig("initialLoadCommits", 300), 1, 300),
  loadMoreCommits: (): number => wholeNumber(getConfig("loadMoreCommits", 100), 1, 100),
  maxDepth: (): number => wholeNumber(getConfig("maxDepthOfRepoSearch", 0), 0, 0),
  showCurrentBranchByDefault: (): boolean => getConfig("showCurrentBranchByDefault", false),
  tabIconColourTheme: (): TabIconColourTheme => getConfig("tabIconColourTheme", "colour")
};

function getConfig<T>(key: string, defaultValue: T): T {
  return vscode.workspace.getConfiguration("neo-git-graph").get(key, defaultValue);
}

/**
 * A whole number of at least `minimum`. Settings files accept any number, but
 * `300.5` commits would never offer Load More, and `-1` would load none.
 */
export function wholeNumber(value: unknown, minimum: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(minimum, Math.floor(value))
    : fallback;
}
