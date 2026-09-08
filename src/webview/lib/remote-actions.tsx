import type { ActionResponse, QueryResult } from "@/backend/types";
import {
  closeDialog,
  openErrorDialog,
  openFormDialog,
  openRunningDialog
} from "@/webview/lib/actions";
import { dialog, selectedRepo } from "@/webview/lib/stores";
import { vscode } from "@/webview/lib/vscode";
import type { ActionCommand, DialogState } from "@/webview/types";
import { format } from "@/webview/utils/format";

type RemoteAction = "push" | "pull" | "fetch";
type RemoteCommand = Extract<
  ActionCommand,
  { command: "pushBranch" | "pullBranch" | "fetchRemote" }
>;
type Pending = {
  requestId: string;
  repo: string;
  dialog: DialogState;
};

let nextRequest = 0;
let pendingQuery:
  | (Pending & { action: RemoteAction; branchName: string; remoteRef: string | undefined })
  | undefined;
const pendingActions = new Map<string, Pending>();

export function openRemoteAction(action: RemoteAction, branchName = "", remoteRef?: string) {
  const repo = selectedRepo.value;
  if (repo === undefined) {
    return;
  }
  const requestId = `remote-${++nextRequest}`;
  openRunningDialog(window.l10n.loadingRemotes);
  pendingQuery = { requestId, repo, dialog: dialog.value!, action, branchName, remoteRef };
  vscode.postMessage({
    command: "loadRemotes",
    repo,
    requestId,
    branchName: action === "fetch" ? null : branchName
  });
}

function send(command: RemoteCommand, repo: string, message: string) {
  if (selectedRepo.value !== repo) {
    closeDialog();
    return;
  }
  openRunningDialog(message);
  pendingActions.set(command.requestId, {
    requestId: command.requestId,
    repo,
    dialog: dialog.value!
  });
  vscode.postMessage({ ...command, repo });
}

/** Ignore a late result after the user changes repositories or opens another dialog. */
export function acceptRemoteActionResult(message: ActionResponse): boolean {
  if (message.requestId === undefined) {
    return true;
  }
  const pending = pendingActions.get(message.requestId);
  pendingActions.delete(message.requestId);
  if (pending === undefined || pending.repo !== message.repo || dialog.value !== pending.dialog) {
    return false;
  }
  if (selectedRepo.value !== pending.repo) {
    closeDialog();
    return false;
  }
  return true;
}

export function handleLoadRemotes(message: QueryResult<"loadRemotes">) {
  const pending = pendingQuery;
  if (
    pending === undefined ||
    message.requestId !== pending.requestId ||
    message.repo !== pending.repo
  ) {
    return;
  }
  pendingQuery = undefined;
  if (dialog.value !== pending.dialog) {
    return;
  }
  if (selectedRepo.value !== pending.repo) {
    closeDialog();
    return;
  }
  if (message.status !== null) {
    openErrorDialog(window.l10n.unableToLoadRemotes, message.status);
    return;
  }
  if (message.remotes.length === 0) {
    openErrorDialog(window.l10n.noRemotesConfigured);
    return;
  }

  const { repo, branchName, requestId, action } = pending;
  const upstream = message.upstream;
  const preferred = action === "push" ? message.pushRemote : upstream?.remote;
  const refRemote = message.remotes
    .filter((remote) => pending.remoteRef?.startsWith(remote + "/"))
    .toSorted((a, b) => b.length - a.length)[0];
  const remote =
    refRemote ??
    message.remotes.find((name) => name === preferred) ??
    message.remotes.find((name) => name === "origin") ??
    message.remotes[0]!;
  const remoteBranch = upstream?.remote === remote ? upstream.branchName : branchName;
  const options = message.remotes.map((name) => ({ label: name, value: name }));
  const source = branchName === "" ? null : `ref:head:${branchName}`;

  if (action === "fetch") {
    openFormDialog({
      message: window.l10n.dialogFetchTitle,
      inputs: [
        {
          kind: "select",
          label: window.l10n.remote,
          value: refRemote ?? "",
          options: [{ label: window.l10n.allRemotes, value: "" }, ...options]
        },
        { kind: "checkbox", label: window.l10n.pruneRemoteBranches, value: false }
      ],
      action: window.l10n.fetch,
      source,
      onSubmit: ([selectedRemote, prune]) =>
        send(
          { command: "fetchRemote", requestId, remote: selectedRemote || null, prune },
          repo,
          window.l10n.fetching
        )
    });
  } else if (action === "push") {
    openFormDialog({
      message: format(window.l10n.dialogPushBranchTitle, <b>{branchName}</b>),
      inputs: [
        { kind: "select", label: window.l10n.remote, value: remote, options },
        { kind: "ref", label: window.l10n.remoteBranch, value: remoteBranch },
        { kind: "checkbox", label: window.l10n.setUpstream, value: upstream === null }
      ],
      action: window.l10n.pushBranch,
      source,
      onSubmit: ([selectedRemote, destination, setUpstream]) =>
        send(
          {
            command: "pushBranch",
            requestId,
            branchName,
            remote: selectedRemote,
            remoteBranch: destination,
            setUpstream
          },
          repo,
          window.l10n.pushingBranch
        )
    });
  } else {
    openFormDialog({
      message: format(window.l10n.dialogPullBranchTitle, <b>{branchName}</b>),
      inputs: [
        { kind: "select", label: window.l10n.remote, value: remote, options },
        { kind: "ref", label: window.l10n.remoteBranch, value: remoteBranch }
      ],
      action: window.l10n.pullBranch,
      source,
      onSubmit: ([selectedRemote, destination]) =>
        send(
          {
            command: "pullBranch",
            requestId,
            branchName,
            remote: selectedRemote,
            remoteBranch: destination
          },
          repo,
          window.l10n.pullingBranch
        )
    });
  }
}
