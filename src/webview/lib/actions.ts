import { batch } from "@preact/signals";
import type { ComponentChildren } from "preact";

import type { GitFileChange } from "@/backend/types";
import { SHOW_ALL_BRANCHES } from "@/webview/constants";
import { captureFocus, restoreFocus } from "@/webview/lib/focus";
import { enterNavigation, leaveNavigation } from "@/webview/lib/navigation";
import { sendRemoteAction } from "@/webview/lib/remote-actions";
import {
  repositoryRevision,
  requestRepositoryState,
  resetRepositoryState
} from "@/webview/lib/repository-actions";
import {
  branchList,
  commitDetails,
  commitHead,
  commitList,
  contextMenu,
  dialog,
  expandedCommit,
  headBranch,
  maxCommits,
  moreCommitsAvailable,
  repoStates,
  selectedBranch,
  selectedRepo,
  showRemoteBranch,
  uncommittedChanges
} from "@/webview/lib/stores";
import { vscode } from "@/webview/lib/vscode";
import { getWebviewConfig } from "@/webview/lib/webview-config";
import type {
  ActionCommand,
  CommitBranchType,
  ContextMenuEntry,
  DialogBody,
  DialogInput,
  DialogValues
} from "@/webview/types";

function requestBranches(repo: string) {
  vscode.postMessage({
    command: "loadBranches",
    repo,
    showRemoteBranches: showRemoteBranch.value,
    hard: true
  });
}

function requestCommits(repo: string, branch: CommitBranchType) {
  vscode.postMessage({
    command: "loadCommits",
    repo,
    branchName: branch === SHOW_ALL_BRANCHES ? "" : branch,
    maxCommits: maxCommits.value,
    showRemoteBranches: showRemoteBranch.value,
    hard: true
  });
}

function clearCommits() {
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
  if (branch === selectedBranch.value) {
    return;
  }

  batch(() => {
    selectedBranch.value = branch;
    clearCommits();
  });

  const repo = selectedRepo.value;
  if (repo !== undefined) {
    requestCommits(repo, branch);
  }
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
    state
  });
}

export function setShowRemoteBranch(value: boolean) {
  if (value === showRemoteBranch.value) {
    return;
  }

  showRemoteBranch.value = value;

  const repo = selectedRepo.value;
  if (repo === undefined) {
    return;
  }

  requestBranches(repo);
  const branch = selectedBranch.value;
  if (branch !== undefined) {
    requestCommits(repo, branch);
  }
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
  batch(() => {
    expandedCommit.value = hash;
    commitDetails.value = null;
  });

  if (repo === undefined) {
    return;
  }

  vscode.postMessage({ command: "commitDetails", repo, commitHash: hash });
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
  onSubmit
}: FormDialog<T>) {
  const repo = selectedRepo.value;
  openDialog({
    kind: "form",
    message,
    inputs: [...inputs],
    action,
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
  context: { detail: string; started: number } | undefined = undefined
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
