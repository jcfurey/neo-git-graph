import { signal } from "@preact/signals";
import type { ComponentChildren } from "preact";

import type {
  QueryResult,
  RepositoryAction,
  RepositoryQuery,
  RepositoryQueryData,
  RepositoryState
} from "@/backend/types";
import {
  closeDialog,
  openContentDialog,
  openErrorDialog,
  openFormDialog,
  openRunningDialog
} from "@/webview/lib/actions";
import { sendRemoteAction } from "@/webview/lib/remote-actions";
import { dialog, selectedRepo } from "@/webview/lib/stores";
import { vscode } from "@/webview/lib/vscode";
import type { DialogState } from "@/webview/types";

export const repositoryState = signal<RepositoryState | null>(null);
export const repositoryStateError = signal<string | null>(null);
let nextRequest = 0;
let stateRequest = "";
const queries = new Map<
  string,
  { repo: string; dialog: DialogState; callback: (data: RepositoryQueryData) => void }
>();

export function resetRepositoryState() {
  repositoryState.value = null;
  repositoryStateError.value = null;
  stateRequest = "";
}

export function requestRepositoryState() {
  const repo = selectedRepo.value;
  if (repo === undefined) {
    return;
  }
  stateRequest = `repository-state-${++nextRequest}`;
  vscode.postMessage({
    command: "repositoryQuery",
    repo,
    requestId: stateRequest,
    query: { kind: "state" }
  });
}

export function requestRepositoryQuery(
  query: RepositoryQuery,
  callback: (data: RepositoryQueryData) => void,
  repo = selectedRepo.value
) {
  if (repo === undefined || repo !== selectedRepo.value) {
    return;
  }
  const requestId = `repository-query-${++nextRequest}`;
  openRunningDialog(window.l10n.loadingRepository);
  queries.clear();
  queries.set(requestId, { repo, dialog: dialog.value!, callback });
  vscode.postMessage({ command: "repositoryQuery", repo, requestId, query });
}

export function handleRepositoryQuery(message: QueryResult<"repositoryQuery">) {
  if (message.repo !== selectedRepo.value) {
    queries.delete(message.requestId);
    return;
  }
  if (message.requestId === stateRequest) {
    repositoryStateError.value = message.status;
    repositoryState.value = message.data?.kind === "state" ? message.data.state : null;
    return;
  }
  const pending = queries.get(message.requestId);
  queries.delete(message.requestId);
  if (pending === undefined || pending.repo !== message.repo || dialog.value !== pending.dialog) {
    return;
  }
  if (message.status !== null || message.data === null) {
    openErrorDialog(window.l10n.unableToLoadRepository, message.status);
    return;
  }
  closeDialog();
  pending.callback(message.data);
}

export function sendRepositoryAction(action: RepositoryAction, repo = selectedRepo.value) {
  if (repo === undefined) {
    return;
  }
  sendRemoteAction(
    { command: "repositoryAction", requestId: `repository-action-${++nextRequest}`, action },
    repo,
    window.l10n.runningGitAction
  );
}

export function confirmRepositoryAction(
  message: ComponentChildren,
  actionLabel: string,
  action: RepositoryAction,
  repo = selectedRepo.value
) {
  openFormDialog({
    message,
    inputs: [],
    action: actionLabel,
    source: null,
    onSubmit: () => sendRepositoryAction(action, repo)
  });
}

export function openRepositoryManager(
  title: string,
  render: (state: RepositoryState, repo: string) => ComponentChildren
) {
  const repo = selectedRepo.value;
  if (repo === undefined) {
    return;
  }
  requestRepositoryQuery(
    { kind: "state" },
    (data) => {
      if (data.kind === "state") {
        openContentDialog(title, render(data.state, repo));
      }
    },
    repo
  );
}
