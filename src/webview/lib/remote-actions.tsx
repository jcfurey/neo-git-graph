import type { ActionResponse, QueryResult } from "@/backend/types";
import {
  closeDialog,
  openErrorDialog,
  openFormDialog,
  openRunningDialog
} from "@/webview/lib/actions";
import { requestRepositoryQuery, sendRepositoryAction } from "@/webview/lib/repository-actions";
import { dialog, selectedRepo } from "@/webview/lib/stores";
import { vscode } from "@/webview/lib/vscode";
import type { ActionCommand, DialogState } from "@/webview/types";
import { format } from "@/webview/utils/format";

type RemoteAction =
  | "push"
  | "pull"
  | "fetch"
  | "checkout"
  | "tagPush"
  | "tagDelete"
  | "branchDelete";
type RemoteCommand = ActionCommand & { requestId: string };
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
    branchName: action === "push" || action === "pull" ? branchName : null
  });
}

export function sendRemoteAction(command: RemoteCommand, repo: string, message: string) {
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

const send = sendRemoteAction;

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
  const preferred =
    action === "push" || action === "tagPush" ? message.pushRemote : upstream?.remote;
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

  if (action === "checkout") {
    const remoteRef = pending.remoteRef!;
    openFormDialog({
      message: format(window.l10n.dialogCheckoutRemoteTitle, <b>{remoteRef}</b>),
      inputs: [
        { kind: "ref", value: remoteRef.slice(remote.length + 1) },
        { kind: "checkbox", label: window.l10n.fetchBeforeCheckout, value: true }
      ],
      action: window.l10n.checkoutBranch,
      source: `ref:remote:${remoteRef}`,
      onSubmit: ([localBranch, fetch]) =>
        send(
          {
            command: "checkoutBranch",
            requestId,
            branchName: localBranch,
            remoteBranch: remoteRef,
            fetch
          },
          repo,
          window.l10n.runningGitAction
        )
    });
  } else if (action === "tagPush" || action === "tagDelete" || action === "branchDelete") {
    const name =
      action === "branchDelete" ? pending.remoteRef!.slice(remote.length + 1) : branchName;
    const label =
      action === "tagPush"
        ? window.l10n.pushTag
        : action === "tagDelete"
          ? window.l10n.deleteRemoteTag
          : window.l10n.deleteRemoteBranch;
    openFormDialog({
      message: (
        <>
          {label}: <b>{name}</b>
        </>
      ),
      inputs: [{ kind: "select", label: window.l10n.remote, value: remote, options }],
      action: label,
      source: null,
      onSubmit: ([destination]) => {
        if (action === "tagPush") {
          send(
            { command: "pushTag", requestId, remote: destination, tagName: name },
            repo,
            window.l10n.pushingTag
          );
        } else {
          openFormDialog({
            message: format(
              window.l10n.deleteRemoteRefConfirm,
              <b>{name}</b>,
              <b>{destination}</b>
            ),
            inputs: [],
            action: label,
            source: null,
            onSubmit: () =>
              sendRepositoryAction(
                {
                  kind: "deleteRemoteRef",
                  remote: destination,
                  name,
                  refType: action === "tagDelete" ? "tag" : "branch"
                },
                repo
              )
          });
        }
      }
    });
  } else if (action === "fetch") {
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
        { kind: "checkbox", label: window.l10n.setUpstream, value: upstream === null },
        { kind: "checkbox", label: window.l10n.forceWithLease, value: false }
      ],
      action: window.l10n.pushBranch,
      source,
      onSubmit: ([selectedRemote, destination, setUpstream, force]) => {
        const command = {
          command: "pushBranch" as const,
          requestId,
          branchName,
          remote: selectedRemote,
          remoteBranch: destination,
          setUpstream
        };
        if (!force) {
          send(command, repo, window.l10n.pushingBranch);
          return;
        }
        requestRepositoryQuery(
          { kind: "lease", remote: selectedRemote, branch: destination },
          (data) => {
            if (data.kind !== "lease") {
              return;
            }
            openFormDialog({
              message: format(
                window.l10n.forcePushConfirm,
                <b>{destination}</b>,
                <b>{selectedRemote}</b>,
                <code>{data.hash.slice(0, 12)}</code>
              ),
              inputs: [],
              action: window.l10n.pushBranch,
              source,
              onSubmit: () =>
                send({ ...command, expectedRemoteHash: data.hash }, repo, window.l10n.pushingBranch)
            });
          },
          repo
        );
      }
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
