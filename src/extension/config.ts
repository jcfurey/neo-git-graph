import * as vscode from "vscode";

import type { DateType } from "@/backend/types";
import type { DateFormat, GraphStyle } from "@/types";

type TabIconColourTheme = "colour" | "grey";

const GRAPH_COLOUR =
  /^\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8}|rgb[a]?\s*\(\d{1,3},\s*\d{1,3},\s*\d{1,3}\))\s*$/;

/**
 * Fallbacks for settings VS Code cannot resolve. They mirror the defaults
 * declared in package.json; `tests/extension/config.test.ts` keeps them equal.
 */
const DEFAULT_GRAPH_COLOURS = [
  "#0085d9",
  "#d9008f",
  "#00d90a",
  "#d98500",
  "#a300d9",
  "#ff0000",
  "#00d9cc",
  "#e138e8",
  "#85d900",
  "#dc5b23",
  "#6f24d6",
  "#ffcc00"
];

function getConfig<T>(key: string, defaultValue: T): T {
  return vscode.workspace.getConfiguration("neo-git-graph").get(key, defaultValue);
}

export const extConfig = {
  autoCenterCommitDetailsView: (): boolean => getConfig("autoCenterCommitDetailsView", true),
  dateFormat: (): DateFormat => getConfig("dateFormat", "Date & Time"),
  dateType: (): DateType => getConfig("dateType", "Author Date"),
  fetchAvatars: (): boolean => getConfig("fetchAvatars", false),
  gitPath: (): string => vscode.workspace.getConfiguration("git").get("path", null) ?? "git",
  graphColours: (): string[] =>
    getConfig("graphColours", DEFAULT_GRAPH_COLOURS).filter((colour) => GRAPH_COLOUR.test(colour)),
  graphStyle: (): GraphStyle => getConfig("graphStyle", "rounded"),
  initialLoadCommits: (): number => getConfig("initialLoadCommits", 300),
  loadMoreCommits: (): number => getConfig("loadMoreCommits", 100),
  maxDepthOfRepoSearch: (): number => getConfig("maxDepthOfRepoSearch", 0),
  showCurrentBranchByDefault: (): boolean => getConfig("showCurrentBranchByDefault", false),
  showUncommittedChanges: (): boolean => getConfig("showUncommittedChanges", true),
  tabIconColourTheme: (): TabIconColourTheme => getConfig("tabIconColourTheme", "colour")
};

export type Config = typeof extConfig;
