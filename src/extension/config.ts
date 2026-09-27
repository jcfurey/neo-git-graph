import { existsSync } from "node:fs";

import * as vscode from "vscode";

import type { DateFormat, GraphStyle } from "@/types";

type TabIconColourTheme = "colour" | "grey";

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
function configuredGitPath(value: unknown): string {
  const candidates = (Array.isArray(value) ? value : [value]).filter(
    (path): path is string => typeof path === "string" && path.trim() !== ""
  );
  return candidates.find((path) => existsSync(path)) ?? candidates[0] ?? "git";
}

export const extConfig = {
  autoCenterCommitDetailsView: (): boolean => getConfig("autoCenterCommitDetailsView", true),
  dateFormat: (): DateFormat => getConfig("dateFormat", "Date & Time"),
  fetchAvatars: (): boolean => getConfig("fetchAvatars", false),
  gitBinary: (): string =>
    builtInGitPath ?? configuredGitPath(vscode.workspace.getConfiguration("git").get("path")),
  graphColours: (): string[] =>
    getConfig("graphColours", ["#0085d9", "#d9008f", "#00d90a", "#d98500", "#a300d9", "#ff0000"]),
  graphStyle: (): GraphStyle => getConfig("graphStyle", "rounded"),
  initialLoadCommits: (): number => getConfig("initialLoadCommits", 300),
  loadMoreCommits: (): number => getConfig("loadMoreCommits", 75),
  maxDepth: (): number => getConfig("maxDepthOfRepoSearch", 0),
  showCurrentBranchByDefault: (): boolean => getConfig("showCurrentBranchByDefault", false),
  tabIconColourTheme: (): TabIconColourTheme => getConfig("tabIconColourTheme", "colour")
};

function getConfig<T>(key: string, defaultValue: T): T {
  return vscode.workspace.getConfiguration("neo-git-graph").get(key, defaultValue);
}
