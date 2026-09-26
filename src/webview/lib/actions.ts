import { batch } from "@preact/signals";
import type { ComponentChildren } from "preact";

import type { GitFileChange } from "@/backend/types";
import { remoteForRef } from "@/backend/utils/remoteVisibility";
import type { ResponseMessage } from "@/types";
import { SHOW_ALL_BRANCHES, UNCOMMITTED_CHANGES } from "@/webview/constants";
import { captureFocus, restoreFocus } from "@/webview/lib/focus";
import {
  invalidateGraphRequest,
  resetGraphRequests,
  startGraphRequest
} from "@/webview/lib/graph-requests";
import {
  enterNavigation,
  historyOffset,
  leaveNavigation,
  restoreGraphPreferences
} from "@/webview/lib/navigation";
import { sendRemoteAction } from "@/webview/lib/remote-actions";
import {
  repositoryRevision,
  repositoryState,
  requestRepositoryState,
  resetRepositoryState
} from "@/webview/lib/repository-actions";
import {
  branchList,
  branchDisplay,
  branchFocusTarget,
  commitDetails,
  commitHead,
  commitList,
  contextMenu,
  dialog,
  displayedBranch,
  expandedCommit,
  focusDimming,
  focusPaused,
  graphErrors,
  headBranch,
  hiddenRemotes,
  maxCommits,
  moreCommitsAvailable,
  repoStates,
  remoteVisibilityKey,
  selectedBranch,
  selectedRepo,
  showRemoteBranch,
  uncommittedChanges
} from "@/webview/lib/stores";
import { vscode } from "@/webview/lib/vscode";
import { getWebviewConfig } from "@/webview/lib/webview-config";
import type {
  ActionCommand,
  BranchDisplay,
  CommitBranchType,
  ContextMenuEntry,
  DialogBody,
  DialogInput,
  DialogValues,
  FocusDimming
} from "@/webview/types";

function requestBranches(repo: string) {
  graphErrors.value = { ...graphErrors.value, loadBranches: undefined };
  vscode.postMessage({
    command: "loadBranches",
    requestId: startGraphRequest("loadBranches", repo),
    repo,
    showRemoteBranches: showRemoteBranch.value,
    hiddenRemotes: hiddenRemotes.value,
    visibilityKey: remoteVisibilityKey(),
    hard: true
  });
}

function requestCommits(repo: string, branch: CommitBranchType) {
  graphErrors.value = { ...graphErrors.value, loadCommits: undefined };
  vscode.postMessage({
    command: "loadCommits",
    requestId: startGraphRequest("loadCommits", repo),
    repo,
    branchName: displayedBranch(branch),
    maxCommits: maxCommits.value,
    showRemoteBranches: showRemoteBranch.value,
    hiddenRemotes: hiddenRemotes.value,
    visibilityKey: remoteVisibilityKey(),
    hard: true
  });
}

function clearCommits() {
  graphErrors.value = { ...graphErrors.value, loadCommits: undefined };
  invalidateGraphRequest("loadCommits");
  commitList.value = undefined;
  commitHead.value = null;
  moreCommitsAvailable.value = false;
  uncommittedChanges.value = 0;
  maxCommits.value = getWebviewConfig().initialLoadCommits;
  closeCommitDetails();
}

export function selectRepo(repo: string) {
  if (repo === selectedRepo.value) {
    return;
  }

  leaveNavigation(selectedRepo.value);
  resetGraphRequests();
  graphErrors.value = {};
  batch(() => {
    selectedRepo.value = repo;
    enterNavigation(repo);
    branchList.value = undefined;
    headBranch.value = null;
    selectedBranch.value = undefined;
    clearCommits();
    resetRepositoryState();
    closeDialog();
  });

  vscode.postMessage({ command: "selectRepo", repo });
  requestBranches(repo);
  requestRepositoryState();
}

export function selectBranch(branch: CommitBranchType) {
  const revealed = revealBranchRemote(branch);
  if (branch === selectedBranch.value && !revealed) {
    return;
  }

  const previous = displayedBranch();
  batch(() => {
    selectedBranch.value = branch;
    if (branch === SHOW_ALL_BRANCHES) {
      focusPaused.value = false;
    }
    if (previous !== displayedBranch()) {
      clearCommits();
    }
  });

  const repo = selectedRepo.value;
  if (repo !== undefined) {
    if (revealed) {
      requestBranches(repo);
    }
    if (revealed || commitList.value === undefined) {
      requestCommits(repo, branch);
    }
  }
  leaveNavigation(repo);
}

export function setBranchDisplay(value: BranchDisplay) {
  if (value === branchDisplay.value) {
    return;
  }
  const previous = displayedBranch();
  batch(() => {
    branchDisplay.value = value;
    focusPaused.value = false;
    if (value !== "filter" && selectedBranch.value === SHOW_ALL_BRANCHES) {
      selectedBranch.value = headBranch.value ?? branchList.value?.[0] ?? SHOW_ALL_BRANCHES;
    }
    if (previous !== displayedBranch()) {
      clearCommits();
    }
  });
  const repo = selectedRepo.value;
  if (repo !== undefined && selectedBranch.value !== undefined && commitList.value === undefined) {
    requestCommits(repo, selectedBranch.value);
  }
  leaveNavigation(repo);
}

/** A view action: it never checks out or modifies the selected branch. */
export function focusBranchInGraph(branch: string) {
  const previous = displayedBranch();
  const revealRemote = revealBranchRemote(branch);
  batch(() => {
    if (branchDisplay.value === "filter") {
      branchDisplay.value = "focus";
    }
    selectedBranch.value = branch;
    focusPaused.value = false;
    if (previous !== displayedBranch()) {
      clearCommits();
    }
  });
  const repo = selectedRepo.value;
  if (repo !== undefined) {
    if (revealRemote) {
      requestBranches(repo);
    }
    if (revealRemote || commitList.value === undefined) {
      requestCommits(repo, branch);
    }
  }
  leaveNavigation(repo);
}

export function toggleBranchFocus() {
  if (branchFocusTarget.value === undefined) {
    return;
  }
  focusPaused.value = !focusPaused.value;
  leaveNavigation(selectedRepo.value);
}

export function setFocusDimming(value: FocusDimming) {
  focusDimming.value = value;
  leaveNavigation(selectedRepo.value);
}

/** Resize the columns of the commit table, while the user drags a boundary. */
export function setColumnWidths(widths: Array<number>) {
  const repo = selectedRepo.value;
  if (repo === undefined) {
    return;
  }

  repoStates.value = {
    ...repoStates.value,
    [repo]: { ...repoStates.value[repo], columnWidths: widths }
  };
}

/** Resize the columns of the commit table, and keep the widths for the next session. */
export function saveColumnWidths(widths: Array<number>) {
  const repo = selectedRepo.value;
  if (repo === undefined) {
    return;
  }

  setColumnWidths(widths);
  const state = repoStates.value[repo];
  if (state === undefined) {
    return;
  }
  vscode.postMessage({
    command: "saveRepoState",
    repo,
    state: { columnWidths: state.columnWidths }
  });
}

export function setShowRemoteBranch(value: boolean) {
  if (value === showRemoteBranch.value) {
    return;
  }

  showRemoteBranch.value = value;
  refreshRemoteVisibility();
}

function remoteOfBranch(branch: string | undefined) {
  return branch?.startsWith("remotes/")
    ? remoteForRef(branch.slice(8), [
        ...(repositoryState.value?.remotes.map((remote) => remote.name) ?? []),
        ...hiddenRemotes.value
      ])
    : undefined;
}

function saveHiddenRemotes(remotes: string[]) {
  const repo = selectedRepo.value;
  if (repo === undefined) {
    return;
  }
  const state = {
    columnWidths: null,
    ...repoStates.value[repo],
    hiddenRemotes: remotes.toSorted()
  };
  repoStates.value = { ...repoStates.value, [repo]: state };
  vscode.postMessage({
    command: "saveRepoState",
    repo,
    state: { hiddenRemotes: state.hiddenRemotes }
  });
}

/** Apply persisted preferences without overwriting a column resize in progress. */
export function receiveRepoState(message: Extract<ResponseMessage, { command: "repoState" }>) {
  const current = repoStates.value[message.repo];
  const restorePreferences =
    current?.graphPreferences === undefined && message.state.graphPreferences !== undefined;
  const hidden = message.state.hiddenRemotes ?? [];
  const changed = JSON.stringify(current?.hiddenRemotes ?? []) !== JSON.stringify(hidden);
  repoStates.value = {
    ...repoStates.value,
    [message.repo]: {
      ...message.state,
      ...current,
      hiddenRemotes: hidden
    }
  };
  if (message.repo === selectedRepo.value) {
    batch(() => {
      if (restorePreferences && selectedBranch.value === undefined) {
        restoreGraphPreferences(message.repo);
      }
      if (changed || restorePreferences) {
        refreshRemoteVisibility();
      }
    });
  }
}

/** Selecting a hidden branch reveals only its owning remote. */
function revealBranchRemote(branch: string) {
  const remote = remoteOfBranch(branch);
  if (remote === undefined) {
    return false;
  }
  const hidden = hiddenRemotes.value.includes(remote);
  const changed = hidden || !showRemoteBranch.value;
  batch(() => {
    showRemoteBranch.value = true;
    if (hidden) {
      saveHiddenRemotes(hiddenRemotes.value.filter((name) => name !== remote));
    }
  });
  return changed;
}

export function setRemoteVisible(remote: string, visible: boolean) {
  const next = new Set(hiddenRemotes.value);
  if (visible) {
    next.delete(remote);
  } else {
    next.add(remote);
  }
  batch(() => {
    saveHiddenRemotes([...next]);
    if (visible) {
      showRemoteBranch.value = true;
    }
  });
  refreshRemoteVisibility();
}

function refreshRemoteVisibility() {
  batch(() => {
    const remote = remoteOfBranch(selectedBranch.value);
    if (remote !== undefined && (!showRemoteBranch.value || hiddenRemotes.value.includes(remote))) {
      selectedBranch.value = SHOW_ALL_BRANCHES;
      focusPaused.value = false;
    }
    historyOffset.value = 0;
  });

  const repo = selectedRepo.value;
  if (repo === undefined) {
    return;
  }

  requestBranches(repo);
  const branch = selectedBranch.value;
  if (branch !== undefined) {
    requestCommits(repo, branch);
  }
  leaveNavigation(repo);
}

export function loadMoreCommits() {
  maxCommits.value += getWebviewConfig().loadMoreCommits;

  const repo = selectedRepo.value;
  const branch = selectedBranch.value;
  if (repo !== undefined && branch !== undefined) {
    requestCommits(repo, branch);
  }
}

export function refresh() {
  const repo = selectedRepo.value;
  if (repo === undefined) {
    return;
  }

  requestBranches(repo);
  repositoryRevision.value++;
  requestRepositoryState();
  const branch = selectedBranch.value;
  if (branch !== undefined) {
    requestCommits(repo, branch);
  }
}

export function closeCommitDetails() {
  invalidateGraphRequest("commitDetails");
  batch(() => {
    expandedCommit.value = null;
    commitDetails.value = null;
  });
}

/** Open the details view of a commit, or close it when it is already open. */
export function toggleCommitDetails(hash: string) {
  if (hash === expandedCommit.value) {
    closeCommitDetails();
    return;
  }

  const repo = selectedRepo.value;
  invalidateGraphRequest("commitDetails");
  batch(() => {
    expandedCommit.value = hash;
    commitDetails.value = null;
  });

  if (repo === undefined || hash === UNCOMMITTED_CHANGES) {
    return;
  }

  vscode.postMessage({
    command: "commitDetails",
    requestId: startGraphRequest("commitDetails", repo),
    repo,
    commitHash: hash
  });
}

/**
 * Open a context menu at the pointer. The default menu of the host is
 * suppressed, because browser-based VS Code draws it on top of ours.
 */
export function openContextMenu(
  event: MouseEvent,
  source: string,
  entries: Array<ContextMenuEntry>
) {
  event.preventDefault();
  event.stopPropagation();
  captureFocus(event.target);
  contextMenu.value = { x: event.clientX, y: event.clientY, entries, source };
}

export function closeContextMenu() {
  contextMenu.value = null;
  restoreFocus();
}

/** Open a dialog. The context menu that asked for it closes. */
let nextDialogToken = 0;
function openDialog(body: DialogBody) {
  captureFocus();
  batch(() => {
    contextMenu.value = null;
    dialog.value = { ...body, token: ++nextDialogToken };
  });
}

export function closeDialog() {
  dialog.value = null;
  restoreFocus();
}

export function openContentDialog(message: string, content: ComponentChildren, wide = false) {
  openDialog({ kind: "content", message, content, wide });
}

type FormDialog<T extends ReadonlyArray<DialogInput>> = {
  message: ComponentChildren;
  inputs: T;
  /** Label of the button that submits the form. */
  action: string;
  /** Context menu key of the element the dialog belongs to. */
  source: string | null;
  onSubmit: (values: DialogValues<T>) => void;
  /** The dialog opens with focus on Cancel, so a stray Enter cannot confirm it. */
  destructive?: boolean;
};

/**
 * Ask the user to fill in a form, or to confirm when `inputs` is empty.
 * The dialog fills one value per input, in order, so the tuple type holds.
 */
export function openFormDialog<const T extends ReadonlyArray<DialogInput>>({
  message,
  inputs,
  action,
  source,
  onSubmit,
  destructive
}: FormDialog<T>) {
  const repo = selectedRepo.value;
  openDialog({
    kind: "form",
    message,
    inputs: [...inputs],
    action,
    destructive: destructive === true,
    onSubmit: (values) => {
      if (selectedRepo.value === repo) {
        onSubmit(values as DialogValues<T>);
      } else {
        closeDialog();
      }
    },
    source
  });
}

/** Report a command that failed. `reason` holds the output of git. */
export function openErrorDialog(message: string, reason: string | null = null) {
  openDialog({ kind: "error", message, reason });
}

/** Report a command that runs longer than the others. The response replaces it. */
export function openRunningDialog(
  message: string,
  context: { detail: string; started: number; onCancel?: () => void } | undefined = undefined
) {
  openDialog({ kind: "running", message, ...context });
}

/** Ask the editor to run a git command on the selected repo. */
let nextActionRequest = 0;
export function runAction(command: ActionCommand) {
  const repo = selectedRepo.value;
  if (repo === undefined) {
    return;
  }

  sendRemoteAction(
    { ...command, requestId: `action-${++nextActionRequest}` },
    repo,
    window.l10n.runningGitAction
  );
}

/** Ask the editor to open the diff of a file of a commit. */
export function viewDiff(commitHash: string, file: GitFileChange) {
  const repo = selectedRepo.value;
  if (repo === undefined) {
    return;
  }

  vscode.postMessage({
    command: "viewDiff",
    repo,
    commitHash,
    oldFilePath: file.oldFilePath,
    newFilePath: file.newFilePath,
    type: file.type
  });
}
