import { existsSync } from "node:fs";

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

let builtInGitPath: string | undefined;

/** Use the Git executable that VS Code's own Git extension found, once it has started. */
export async function resolveBuiltInGitPath() {
  try {
    const extension = vscode.extensions.getExtension<{
      getAPI(version: 1): { git: { path: string } };
    }>("vscode.git");
    const api = (extension?.isActive ? extension.exports : await extension?.activate())?.getAPI(1);
    builtInGitPath = api?.git.path || undefined;
  } catch {
    // The Git extension is disabled or unavailable; the setting still applies.
    builtInGitPath = undefined;
  }
}

/** VS Code's `git.path` holds a path or a list of paths to try in order. */
export function configuredGitPath(value: unknown): string {
  const candidates = (Array.isArray(value) ? value : [value]).filter(
    (path): path is string => typeof path === "string" && path.trim() !== ""
  );
  return candidates.find((path) => existsSync(path)) ?? candidates[0] ?? "git";
}

function getConfig<T>(key: string, defaultValue: T): T {
  return vscode.workspace.getConfiguration("neo-git-graph").get(key, defaultValue);
}

export const extConfig = {
  autoCenterCommitDetailsView: (): boolean => getConfig("autoCenterCommitDetailsView", true),
  dateFormat: (): DateFormat => getConfig("dateFormat", "Date & Time"),
  dateType: (): DateType => getConfig("dateType", "Author Date"),
  gitPath: (): string =>
    builtInGitPath ?? configuredGitPath(vscode.workspace.getConfiguration("git").get("path")),
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
