import type { SimpleGit } from "simple-git";
import * as vscode from "vscode";

import { checkoutBranch, createBranch, deleteBranch, renameBranch } from "@/backend/actions/branch";
import {
  checkoutCommit,
  cherrypickCommit,
  resetToCommit,
  revertCommit
} from "@/backend/actions/commit";
import { mergeBranch, mergeCommit } from "@/backend/actions/merge";
import { fetchRemote, pullBranch, pushBranch } from "@/backend/actions/remote";
import { runRepositoryAction } from "@/backend/actions/repository";
import { addTag, deleteTag, pushTag } from "@/backend/actions/tag";
import { gitClientFactory, type GitClient } from "@/backend/gitClient";
import { commitDetails } from "@/backend/queries/commitDetails";
import { loadBranches } from "@/backend/queries/loadBranches";
import { loadCommits } from "@/backend/queries/loadCommits";
import { loadRemotes } from "@/backend/queries/loadRemotes";
import { findGitRepos } from "@/backend/queries/repoSearch";
import { repositoryQuery } from "@/backend/queries/repository";
import type { ActionRequest, GitFileChangeType, QueryResult } from "@/backend/types";
import { getSubmodulePaths } from "@/backend/utils/git";
import { isRepoWithinPath, normalizeRepoPath } from "@/backend/utils/repoPath";
import { abbrevCommit } from "@/backend/utils/string";
import { selectWatchedRepo } from "@/extension/watchers/git-repo.watcher";
import { AvatarManager } from "@/old-extension/avatarManager";
import type { Config } from "@/old-extension/config";
import { encodeDiffDocUri } from "@/old-extension/diffDocProvider";
import { ExtensionState } from "@/old-extension/extensionState";
import type { ResponseMessage } from "@/types";

import type { RepoManager } from "./repoManager";
import type { WebviewBridge } from "./webviewBridge";

function viewDiff(
  repo: string,
  commitHash: string,
  oldFilePath: string,
  newFilePath: string,
  type: GitFileChangeType
): Promise<boolean> {
  const abbrevHash = abbrevCommit(commitHash);
  const pathComponents = newFilePath.split("/");
  const title =
    pathComponents[pathComponents.length - 1] +
    " (" +
    (type === "A"
      ? vscode.l10n.t("Added in {0}", abbrevHash)
      : type === "D"
        ? vscode.l10n.t("Deleted in {0}", abbrevHash)
        : abbrevCommit(commitHash) + "^ ↔ " + abbrevCommit(commitHash)) +
    ")";
  return new Promise<boolean>((resolve) => {
    vscode.commands
      .executeCommand(
        "vscode.diff",
        encodeDiffDocUri(repo, oldFilePath, commitHash + "^"),
        encodeDiffDocUri(repo, newFilePath, commitHash),
        title,
        { preview: true }
      )
      .then(() => resolve(true))
      .then(() => resolve(false));
  });
}

export function registerMessageHandlers(
  bridge: WebviewBridge,
  deps: {
    config: Config;
    gitClient: GitClient;
    repoManager: RepoManager;
    extensionState: ExtensionState;
    avatarManager: AvatarManager;
  }
) {
  const { config, gitClient, repoManager, extensionState, avatarManager } = deps;

  let currentRepo: string | null = null;
  const busyRepos = new Map<string, boolean>();
  const viewedRepos = new Set<string>();

  function setCurrentRepo(repo: string) {
    if (repo === currentRepo) {
      return;
    }
    currentRepo = repo;
    viewedRepos.add(repo);
    gitClient.setRepo(repo);
    extensionState.setLastActiveRepo(repo);
    selectWatchedRepo(repo);
  }

  function registerAction<T extends ActionRequest["command"]>(
    command: T,
    handler: (git: SimpleGit, msg: Extract<ActionRequest, { command: T }>) => Promise<void>
  ) {
    bridge.onMessage(command, async (message) => {
      const msg = message as Extract<ActionRequest, { command: T }>;
      let status: string | null = null;
      let acquired = false;
      try {
        const request: ActionRequest = msg;
        const recursive =
          request.command === "repositoryAction" && request.action.kind === "submodule";
        if (
          [...busyRepos].some(
            ([repo, descendants]) =>
              repo === msg.repo ||
              (descendants && isRepoWithinPath(msg.repo, repo)) ||
              (recursive && isRepoWithinPath(repo, msg.repo))
          )
        ) {
          throw new Error(
            "Another Git operation is running in this repository. Wait for it to finish."
          );
        }
        busyRepos.set(msg.repo, recursive);
        acquired = true;
        await handler(gitClientFactory(msg.repo, config.gitPath()).getInstance(), msg);
      } catch (e: unknown) {
        status = e instanceof Error ? e.message : String(e);
      } finally {
        if (acquired) {
          busyRepos.delete(msg.repo);
        }
      }
      bridge.post({
        command,
        status,
        ...("requestId" in msg ? { requestId: msg.requestId, repo: msg.repo } : {})
      } as ResponseMessage);
    });
  }

  // --- Action handlers ---

  registerAction("repositoryAction", async (git, msg) => {
    const effect = await runRepositoryAction(git, msg.action, config.gitPath());
    if (effect?.kind === "worktree") {
      await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(effect.path), true);
    } else if (effect?.kind === "conflict") {
      const uri = vscode.Uri.file(effect.path);
      try {
        await vscode.commands.executeCommand("git.openMergeEditor", uri);
      } catch {
        await vscode.commands.executeCommand("vscode.open", uri);
      }
    } else if (effect?.kind === "document") {
      const document = await vscode.workspace.openTextDocument({
        language: "diff",
        content: effect.text
      });
      await vscode.window.showTextDocument(document, { preview: true });
    } else if (effect?.kind === "diff") {
      const empty = "0".repeat(40);
      await vscode.commands.executeCommand(
        "vscode.diff",
        encodeDiffDocUri(msg.repo, effect.before, effect.left ?? empty),
        encodeDiffDocUri(msg.repo, effect.after, effect.right ?? empty),
        effect.after +
          " (" +
          (effect.left?.slice(0, 8) ?? "∅") +
          " ↔ " +
          (effect.right?.slice(0, 8) ?? "∅") +
          ")",
        { preview: true }
      );
    } else if (effect?.kind === "historicalFile") {
      await vscode.commands.executeCommand(
        "vscode.open",
        encodeDiffDocUri(msg.repo, effect.path, effect.hash),
        { preview: true }
      );
    } else if (effect?.kind === "restoreDiff") {
      await vscode.commands.executeCommand(
        "vscode.diff",
        effect.exists
          ? vscode.Uri.file(effect.destination)
          : encodeDiffDocUri(msg.repo, effect.sourcePath, "0".repeat(40)),
        encodeDiffDocUri(msg.repo, effect.sourcePath, effect.hash),
        effect.destination + " ↔ " + effect.hash.slice(0, 12),
        { preview: true }
      );
    }
    if (msg.action.kind === "submodule") {
      for (const repo of await getSubmodulePaths(msg.repo, config.gitPath())) {
        repoManager.addRepo(normalizeRepoPath(repo));
      }
      repoManager.sendRepos();
    }
  });

  registerAction("addTag", (git, msg) => addTag(git, msg));
  registerAction("deleteTag", (git, msg) => deleteTag(git, msg));
  registerAction("pushTag", (git, msg) => pushTag(git, msg));
  registerAction("createBranch", (git, msg) => createBranch(git, msg));
  registerAction("deleteBranch", (git, msg) => deleteBranch(git, msg));
  registerAction("renameBranch", (git, msg) => renameBranch(git, msg));
  registerAction("checkoutBranch", (git, msg) => checkoutBranch(git, msg));
  registerAction("checkoutCommit", (git, msg) => checkoutCommit(git, msg));
  registerAction("cherrypickCommit", (git, msg) => cherrypickCommit(git, msg));
  registerAction("revertCommit", (git, msg) => revertCommit(git, msg));
  registerAction("resetToCommit", (git, msg) => resetToCommit(git, msg));
  registerAction("mergeBranch", (git, msg) => mergeBranch(git, msg));
  registerAction("mergeCommit", (git, msg) => mergeCommit(git, msg));

  registerAction("pushBranch", (git, msg) => pushBranch(git, msg));
  registerAction("pullBranch", (git, msg) => pullBranch(git, msg));
  registerAction("fetchRemote", (git, msg) => fetchRemote(git, msg));

  // --- Query handlers ---

  bridge.onMessage("repositoryQuery", async (msg) => {
    let data: QueryResult<"repositoryQuery">["data"] = null;
    let status: string | null = null;
    try {
      data = await repositoryQuery(
        gitClientFactory(msg.repo, config.gitPath()).getInstance(),
        msg.query,
        {
          repos:
            msg.query.kind === "workspace"
              ? [
                  ...new Set([
                    msg.repo,
                    ...viewedRepos,
                    ...Object.keys(repoManager.getRepos()),
                    ...(await findGitRepos(
                      (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath),
                      config.gitPath(),
                      config.maxDepthOfRepoSearch()
                    ))
                  ])
                ]
              : [],
          binary: config.gitPath()
        }
      );
    } catch (error: unknown) {
      status = error instanceof Error ? error.message : String(error);
    }
    bridge.post({
      command: "repositoryQuery",
      repo: msg.repo,
      requestId: msg.requestId,
      data,
      status
    });
  });

  bridge.onMessage("loadRemotes", async (msg) => {
    let settings: Pick<QueryResult<"loadRemotes">, "remotes" | "upstream" | "pushRemote"> = {
      remotes: [],
      upstream: null,
      pushRemote: null
    };
    let status: string | null = null;
    try {
      settings = await loadRemotes(
        gitClientFactory(msg.repo, config.gitPath()).getInstance(),
        msg.branchName
      );
    } catch (error: unknown) {
      status = error instanceof Error ? error.message : String(error);
    }
    bridge.post({
      command: "loadRemotes",
      repo: msg.repo,
      requestId: msg.requestId,
      ...settings,
      status
    });
  });

  bridge.onMessage("loadCommits", async (msg) => {
    setCurrentRepo(msg.repo);
    bridge.post({
      command: "loadCommits",
      repo: msg.repo,
      branchName: msg.branchName,
      ...(await loadCommits(gitClient.getInstance(), {
        branchName: msg.branchName,
        maxCommits: msg.maxCommits,
        showRemoteBranches: msg.showRemoteBranches,
        hard: msg.hard,
        dateType: config.dateType(),
        showUncommittedChanges: config.showUncommittedChanges()
      }))
    });
  });

  bridge.onMessage("loadBranches", async (msg) => {
    setCurrentRepo(msg.repo);
    bridge.post({
      command: "loadBranches",
      ...(await loadBranches(gitClient.getInstance(), {
        showRemoteBranches: msg.showRemoteBranches,
        hard: msg.hard,
        repo: msg.repo,
        gitPath: config.gitPath()
      }))
    });
  });

  bridge.onMessage("commitDetails", async (msg) => {
    bridge.post({
      command: "commitDetails",
      ...(await commitDetails(gitClientFactory(msg.repo, config.gitPath()).getInstance(), {
        commitHash: msg.commitHash,
        dateType: config.dateType()
      }))
    });
  });

  // --- Infrastructure handlers ---

  bridge.onMessage("selectRepo", (msg) => {
    setCurrentRepo(msg.repo);
  });

  bridge.onMessage("fetchAvatar", (msg) => {
    avatarManager.fetchAvatarImage(msg.email, msg.repo, msg.commits);
  });

  bridge.onMessage("saveRepoState", (msg) => {
    repoManager.setRepoState(msg.repo, msg.state);
  });

  bridge.onMessage("viewDiff", async (msg) => {
    bridge.post({
      command: "viewDiff",
      success: await viewDiff(msg.repo, msg.commitHash, msg.oldFilePath, msg.newFilePath, msg.type)
    });
  });

  return {
    onPanelShown: () => {
      currentRepo = null;
    }
  };
}
