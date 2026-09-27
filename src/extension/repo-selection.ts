import path from "node:path";

import type * as vscode from "vscode";

import { getRepoRoot } from "@/backend/utils/git";
import { extConfig } from "@/extension/config";
import { rpcNotify } from "@/extension/rpc/rpc-notify";
import type { GitRepo } from "@/types";

export function getSourceControlRepo(sourceControl?: Pick<vscode.SourceControl, "rootUri">) {
  const repoPath = sourceControl?.rootUri?.fsPath;
  return typeof repoPath === "string" && repoPath.length > 0 ? repoPath : undefined;
}

/**
 * Hold the repositories clicked in Source Control until the webview has loaded its repository
 * list. Every clicked repository is added to the list, and the latest click is selected.
 */
export function createRepoSelection(webview: vscode.Webview) {
  let ready = false;
  let latestClick = 0;
  let selected: string | undefined;
  const added = new Set<string>();

  const flush = () => {
    if (!ready) {
      return;
    }
    for (const repo of added) {
      if (repo !== selected) {
        void rpcNotify.notify("repo.changed", { type: "created", repo: toGitRepo(repo) });
      }
    }
    added.clear();
    if (selected !== undefined) {
      void rpcNotify.notify("repo.select", toGitRepo(selected));
      selected = undefined;
    }
  };

  const listener = webview.onDidReceiveMessage((message: unknown) => {
    if (
      typeof message === "object" &&
      message !== null &&
      "command" in message &&
      message.command === "viewReady"
    ) {
      ready = true;
      flush();
    }
  });

  return {
    select(folder: string) {
      const click = ++latestClick;
      void getRepoRoot(folder, extConfig.gitBinary()).then((root) => {
        const repo = root ?? folder;
        added.add(repo);
        if (click === latestClick) {
          selected = repo;
        }
        flush();
      });
    },
    dispose() {
      listener.dispose();
      ready = false;
      selected = undefined;
      added.clear();
    }
  };
}

function toGitRepo(repoPath: string): GitRepo {
  return { name: path.basename(repoPath), path: repoPath };
}
