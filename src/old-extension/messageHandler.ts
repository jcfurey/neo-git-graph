import path from "node:path";

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
import { gitClientFactory } from "@/backend/gitClient";
import { commitDetails } from "@/backend/queries/commitDetails";
import { loadBranches } from "@/backend/queries/loadBranches";
import { loadCommits } from "@/backend/queries/loadCommits";
import { loadRemotes } from "@/backend/queries/loadRemotes";
import { repositoryQuery } from "@/backend/queries/repository";
import type {
  ActionRequest,
  GitFileChangeType,
  GraphQueryCommand,
  QueryResult,
  RestoreBackup
} from "@/backend/types";
import { remoteForRef } from "@/backend/utils/remoteVisibility";
import { isRepoWithinPath, normalizeRepoPath } from "@/backend/utils/repoPath";
import { abbrevCommit } from "@/backend/utils/string";
import type { Config } from "@/extension/config";
import { openConflict } from "@/extension/conflicts";
import { logger } from "@/extension/util/logger";
import {
  muteGitRepoWatcher,
  selectWatchedRepo,
  unmuteGitRepoWatcher
} from "@/extension/watchers/git-repo.watcher";
import { invalidateWorkspaceScan, listRepos } from "@/extension/workspace-scan";
import { encodeDiffBlobUri, encodeDiffDocUri } from "@/old-extension/diffDocProvider";
import type { RequestMessage, ResponseMessage } from "@/types";

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
  return Promise.resolve(
    vscode.commands.executeCommand(
      "vscode.diff",
      encodeDiffDocUri(repo, oldFilePath, commitHash + "^"),
      encodeDiffDocUri(repo, newFilePath, commitHash),
      title,
      { preview: true }
    )
  ).then(
    () => true,
    (error: unknown) => {
      logger.error(`Unable to open the diff of ${newFilePath} at ${abbrevHash}`, error);
      return false;
    }
  );
}

/** Actions that only open an editor, so file events during them come from the user. */
/** Whether an editor holds unsaved changes to a repository file, which saving would write back. */
function hasUnsavedChanges(repo: string, file: string) {
  const target = normalizeRepoPath(path.join(repo, file));
  return vscode.workspace.textDocuments.some(
    (document) =>
      document.isDirty &&
      document.uri.scheme === "file" &&
      normalizeRepoPath(document.uri.fsPath) === target
  );
}

function viewOnly(request: ActionRequest) {
  return (
    request.command === "repositoryAction" &&
    (request.action.kind === "viewWorkingTreeFile" ||
      request.action.kind === "viewRangeFile" ||
      request.action.kind === "viewHistoricalFile" ||
      request.action.kind === "previewFileRestore")
  );
}

export function registerMessageHandlers(
  bridge: WebviewBridge,
  deps: {
    config: Config;
    repoManager: RepoManager;
  }
) {
  const { config, repoManager } = deps;

  let currentRepo: string | null = null;
  const busyRepos = new Map<string, boolean>();
  const actionControllers = new Map<string, { repo: string; controller: AbortController }>();
  const graphControllers = new Map<GraphQueryCommand, AbortController>();

  function cancelGraphQueries() {
    for (const controller of graphControllers.values()) {
      controller.abort();
    }
    graphControllers.clear();
  }

  function setCurrentRepo(repo: string) {
    if (repo === currentRepo) {
      return;
    }
    cancelGraphQueries();
    currentRepo = repo;
    selectWatchedRepo(repo, config.gitPath());
  }

  async function workspaceRepos(selected: string) {
    await repoManager.pruneMissing();
    const repos = await listRepos(config.gitPath(), config.maxDepthOfRepoSearch());
    return repos.includes(selected) ? repos : [selected, ...repos];
  }

  /**
   * Run requests for `command` under the repository lock, and return the runner. A handler can
   * return a follow-up, which runs once the lock is released.
   */
  function registerAction<T extends ActionRequest["command"]>(
    command: T,
    handler: (
      git: SimpleGit,
      msg: Extract<ActionRequest, { command: T }>
    ) => Promise<void | (() => void)>
  ) {
    const run = async (message: unknown) => {
      const msg = message as Extract<ActionRequest, { command: T }>;
      let status: string | null = null;
      let acquired = false;
      let followUp: void | (() => void) = undefined;
      try {
        const request: ActionRequest = msg;
        // Opening a diff or preview reads the repository, so it neither waits for nor blocks
        // other actions.
        const exclusive = !viewOnly(request);
        const recursive =
          request.command === "repositoryAction" &&
          (request.action.kind === "submodule" || request.action.kind === "submodulePointer");
        if (
          exclusive &&
          [...busyRepos].some(
            ([repo, descendants]) =>
              repo === msg.repo ||
              (descendants && isRepoWithinPath(msg.repo, repo)) ||
              (recursive && isRepoWithinPath(repo, msg.repo))
          )
        ) {
          throw new Error(
            vscode.l10n.t(
              "Another Git operation is running in this repository. Wait for it to finish."
            )
          );
        }
        if (exclusive) {
          busyRepos.set(msg.repo, recursive);
          acquired = true;
          muteGitRepoWatcher(msg.repo);
        }
        const controller = new AbortController();
        if ("requestId" in msg) {
          actionControllers.set(msg.requestId, { repo: msg.repo, controller });
        }
        followUp = await handler(
          gitClientFactory(msg.repo, config.gitPath(), controller.signal).getInstance(),
          msg
        ).catch((error: unknown) => {
          throw controller.signal.aborted
            ? new Error(vscode.l10n.t("The Git operation was cancelled."))
            : error;
        });
      } catch (e: unknown) {
        status = e instanceof Error ? e.message : String(e);
      } finally {
        if ("requestId" in msg) {
          actionControllers.delete(msg.requestId);
        }
        if (acquired) {
          busyRepos.delete(msg.repo);
          unmuteGitRepoWatcher(msg.repo);
        }
      }
      bridge.post({
        command,
        status,
        ...("requestId" in msg ? { requestId: msg.requestId, repo: msg.repo } : {})
      } as ResponseMessage);
      followUp?.();
      return status;
    };
    bridge.onMessage(command, async (message) => {
      await run(message);
    });
    return run;
  }

  // --- Action handlers ---

  let undoRequests = 0;
  /** Offer to put back what a restore replaced, through the lock like any other action. */
  async function offerUndo(repo: string, backup: RestoreBackup) {
    const undo = vscode.l10n.t("Undo Restore");
    const choice = await vscode.window.showInformationMessage(
      vscode.l10n.t(
        "Restored {0}. Its previous contents are kept in Git until its next garbage collection.",
        backup.path
      ),
      undo
    );
    if (choice !== undo) {
      return;
    }
    const status = await runRepositoryActionRequest({
      command: "repositoryAction",
      repo,
      requestId: `undo-restore-${++undoRequests}`,
      action: { kind: "undoRestore", backup }
    });
    bridge.post({ command: "refresh" });
    if (status !== null) {
      void vscode.window.showErrorMessage(status);
    }
  }

  const runRepositoryActionRequest = registerAction("repositoryAction", async (git, msg) => {
    if (msg.action.kind === "restoreFile" || msg.action.kind === "undoRestore") {
      const file =
        msg.action.kind === "restoreFile" ? msg.action.plan.destination : msg.action.backup.path;
      if (hasUnsavedChanges(msg.repo, file)) {
        throw new Error(
          vscode.l10n.t(
            "Save or revert the unsaved changes to {0} in the editor first; saving them later would undo the restore.",
            file
          )
        );
      }
    }
    if (
      msg.action.kind === "previewFileRestore" &&
      hasUnsavedChanges(msg.repo, msg.action.plan.destination)
    ) {
      void vscode.window.showWarningMessage(
        vscode.l10n.t(
          "The preview shows unsaved changes to {0}. Save or revert them before restoring.",
          msg.action.plan.destination
        )
      );
    }
    const effect = await runRepositoryAction(git, msg.action, config.gitPath());
    if (msg.action.kind === "renameRemote" || msg.action.kind === "removeRemote") {
      const action = msg.action;
      const hidden = repoManager.getRepos()[msg.repo]?.hiddenRemotes ?? [];
      const state = repoManager.updateHiddenRemotes(
        msg.repo,
        hidden.flatMap((name) =>
          name !== action.name ? [name] : action.kind === "renameRemote" ? [action.newName] : []
        )
      );
      if (state) {
        bridge.post({ command: "repoState", repo: msg.repo, state });
      }
    }
    if (effect?.kind === "worktree") {
      await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(effect.path), true);
    } else if (effect?.kind === "conflict") {
      await openConflict(effect.path, effect.status);
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
    } else if (effect?.kind === "workingTreeDiff") {
      await vscode.commands.executeCommand(
        "vscode.diff",
        encodeDiffBlobUri(msg.repo, effect.before, effect.left),
        effect.workingPath
          ? vscode.Uri.file(effect.workingPath)
          : encodeDiffBlobUri(msg.repo, effect.after, effect.right),
        effect.after +
          " (" +
          (effect.staged
            ? vscode.l10n.t("Staged Changes")
            : vscode.l10n.t("Working Tree Changes")) +
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
      invalidateWorkspaceScan();
    }
    if (effect?.kind === "restored" && effect.backup !== null) {
      const { backup } = effect;
      return () => void offerUndo(msg.repo, backup);
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
  registerAction("mergeBranch", (git, msg) => mergeBranch(git, msg, config.gitPath()));
  registerAction("mergeCommit", (git, msg) => mergeCommit(git, msg, config.gitPath()));

  registerAction("pushBranch", (git, msg) => pushBranch(git, msg));
  registerAction("pullBranch", (git, msg) => pullBranch(git, msg));
  registerAction("fetchRemote", (git, msg) => fetchRemote(git, msg));

  // --- Query handlers ---

  const queryControllers = new Map<string, { repo: string; controller: AbortController }>();
  // Stops the action's Git processes, such as a push waiting on an unresponsive server.
  bridge.onMessage("cancelAction", (msg) => {
    const pending = actionControllers.get(msg.requestId);
    if (pending?.repo === msg.repo) {
      pending.controller.abort();
    }
  });
  bridge.onMessage("cancelRepositoryQuery", (msg) => {
    const pending = queryControllers.get(msg.requestId);
    if (pending?.repo === msg.repo) {
      pending.controller.abort();
    }
  });
  bridge.onMessage("repositoryQuery", async (msg) => {
    const controller = new AbortController();
    queryControllers.set(msg.requestId, { repo: msg.repo, controller });
    let data: QueryResult<"repositoryQuery">["data"] = null;
    let status: string | null = null;
    const savedState = msg.query.kind === "state" ? repoManager.getRepos()[msg.repo] : undefined;
    try {
      data = await repositoryQuery(
        gitClientFactory(msg.repo, config.gitPath(), controller.signal).getInstance(),
        msg.query,
        {
          // The rows the picker offers, not every repository whose state was ever saved.
          repos: msg.query.kind === "workspace" ? await workspaceRepos(msg.repo) : [],
          binary: config.gitPath(),
          signal: controller.signal
        }
      );
    } catch (error: unknown) {
      status = error instanceof Error ? error.message : String(error);
    } finally {
      queryControllers.delete(msg.requestId);
    }
    if (controller.signal.aborted) {
      return;
    }
    if (
      data?.kind === "state" &&
      !busyRepos.has(msg.repo) &&
      repoManager.getRepos()[msg.repo] === savedState
    ) {
      const names = data.state.remotes.map((remote) => remote.name);
      // Keep orphan remote groups while their tracking refs still exist. External
      // renames are new groups: Git does not retain a reliable rename mapping.
      const groups = new Set([
        ...names,
        ...data.state.remoteBranches.map((ref) => remoteForRef(ref.name, names))
      ]);
      const state = repoManager.updateHiddenRemotes(
        msg.repo,
        (savedState?.hiddenRemotes ?? []).filter((name) => groups.has(name))
      );
      if (state) {
        bridge.post({ command: "repoState", repo: msg.repo, state });
      }
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

  function registerGraphQuery<K extends GraphQueryCommand>(
    command: K,
    query: (
      git: SimpleGit,
      message: Extract<RequestMessage, { command: K }>
    ) => Promise<QueryResult<K>>
  ) {
    bridge.onMessage(command, async (message) => {
      const { repo, requestId } = message as Extract<
        RequestMessage,
        { command: GraphQueryCommand }
      >;
      const controller = new AbortController();
      try {
        setCurrentRepo(repo);
        graphControllers.get(command)?.abort();
        graphControllers.set(command, controller);
        const data = await query(
          gitClientFactory(repo, config.gitPath(), controller.signal).getInstance(),
          message
        );
        if (!controller.signal.aborted) {
          bridge.post({
            command,
            ...data,
            repo,
            requestId
          } as ResponseMessage);
        }
      } catch (error: unknown) {
        if (!controller.signal.aborted) {
          bridge.post({
            command: "graphQueryError",
            query: command,
            repo,
            requestId,
            message: error instanceof Error ? error.message : String(error)
          });
        }
      } finally {
        if (graphControllers.get(command) === controller) {
          graphControllers.delete(command);
        }
      }
    });
  }

  registerGraphQuery("loadCommits", async (git, msg) => {
    return {
      repo: msg.repo,
      branchName: msg.branchName,
      visibilityKey: msg.visibilityKey,
      ...(await loadCommits(git, {
        branchName: msg.branchName,
        maxCommits: msg.maxCommits,
        hiddenRemotes: msg.hiddenRemotes ?? [],
        showRemoteBranches: msg.showRemoteBranches,
        hard: msg.hard,
        dateType: config.dateType(),
        showUncommittedChanges: config.showUncommittedChanges()
      }))
    };
  });

  registerGraphQuery("loadBranches", async (git, msg) => {
    return {
      visibilityKey: msg.visibilityKey,
      ...(await loadBranches(git, {
        showRemoteBranches: msg.showRemoteBranches,
        hiddenRemotes: msg.hiddenRemotes ?? [],
        hard: msg.hard,
        repo: msg.repo,
        gitPath: config.gitPath()
      }))
    };
  });

  registerGraphQuery("commitDetails", (git, msg) =>
    commitDetails(git, { commitHash: msg.commitHash, dateType: config.dateType() })
  );

  // --- Infrastructure handlers ---

  bridge.onMessage("selectRepo", (msg) => {
    bridge.post({
      command: "repoState",
      repo: msg.repo,
      state: repoManager.getRepos()[msg.repo] ?? { columnWidths: null }
    });
    // Graph queries report failures to the view, including a repository that has
    // disappeared. Selecting it alone must not leave an unhandled rejection.
    try {
      setCurrentRepo(msg.repo);
    } catch (error: unknown) {
      logger.debug(`Unable to select repository: ${msg.repo}`, error);
    }
  });

  bridge.onMessage("saveRepoState", (msg) => {
    repoManager.setRepoState(msg.repo, {
      columnWidths: null,
      ...repoManager.getRepos()[msg.repo],
      ...msg.state
    });
  });

  bridge.onMessage("viewDiff", async (msg) => {
    bridge.post({
      command: "viewDiff",
      success: await viewDiff(msg.repo, msg.commitHash, msg.oldFilePath, msg.newFilePath, msg.type)
    });
  });

  return {
    dispose: () => {
      cancelGraphQueries();
      for (const { controller } of queryControllers.values()) {
        controller.abort();
      }
      queryControllers.clear();
    },
    onPanelShown: () => {
      currentRepo = null;
    }
  };
}
