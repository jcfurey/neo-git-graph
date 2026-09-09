import { useState } from "preact/hooks";

import type { RemoteDetails, RepositoryState } from "@/backend/types";
import { Button } from "@/webview/components/ui/Button";
import { Select } from "@/webview/components/ui/Select";
import { openFormDialog } from "@/webview/lib/actions";
import {
  confirmRepositoryAction,
  openRepositoryManager,
  requestRepositoryQuery,
  sendRepositoryAction
} from "@/webview/lib/repository-actions";
import { selectedRepo } from "@/webview/lib/stores";
import { format } from "@/webview/utils/format";

function addRemote(repo: string) {
  openFormDialog({
    message: window.l10n.addRemote,
    inputs: [
      { kind: "ref", label: window.l10n.dialogAddTagName, value: "" },
      { kind: "text", label: window.l10n.remoteUrl, value: "" },
      { kind: "checkbox", label: window.l10n.fetchAfterAdding, value: true }
    ],
    action: window.l10n.addRemote,
    source: null,
    onSubmit: ([name, url, fetch]) =>
      sendRepositoryAction({ kind: "addRemote", name, url, fetch }, repo)
  });
}

function urls(value: string) {
  return value
    .split(/\r?\n/)
    .map((url) => url.trim())
    .filter(Boolean);
}

function editRemote(remote: RemoteDetails, repo: string) {
  openFormDialog({
    message: (
      <>
        {window.l10n.editRemote}: <b>{remote.name}</b>
      </>
    ),
    inputs: [
      { kind: "textarea", label: window.l10n.fetchUrls, value: remote.fetchUrls.join("\n") },
      { kind: "textarea", label: window.l10n.pushUrls, value: remote.pushUrls.join("\n") }
    ],
    action: window.l10n.save,
    source: null,
    onSubmit: ([fetchUrls, pushUrls]) =>
      sendRepositoryAction(
        {
          kind: "editRemote",
          name: remote.name,
          fetchUrls: urls(fetchUrls),
          pushUrls: urls(pushUrls)
        },
        repo
      )
  });
}

export function RemoteManager({ state, repo }: { state: RepositoryState; repo: string }) {
  const [pushDefault, setPushDefault] = useState(state.pushDefault ?? "");
  return (
    <div class="space-y-3 text-left">
      <Button onClick={() => addRemote(repo)}>{window.l10n.addRemote}</Button>
      {state.remotes.map((remote) => (
        <div key={remote.name} class="space-y-2 rounded border border-line p-2">
          <b>{remote.name}</b>
          <p class="whitespace-pre-wrap break-all select-text">{remote.fetchUrls.join("\n")}</p>
          {remote.pushUrls.length > 0 && (
            <p class="whitespace-pre-wrap break-all select-text">
              {window.l10n.pushUrls}: {remote.pushUrls.join("\n")}
            </p>
          )}
          <div class="flex flex-wrap gap-2">
            <Button onClick={() => editRemote(remote, repo)}>{window.l10n.editRemote}</Button>
            <Button
              onClick={() =>
                openFormDialog({
                  message: window.l10n.renameRemote,
                  inputs: [{ kind: "ref", value: remote.name }],
                  action: window.l10n.renameRemote,
                  source: null,
                  onSubmit: ([newName]) =>
                    sendRepositoryAction({ kind: "renameRemote", name: remote.name, newName }, repo)
                })
              }
            >
              {window.l10n.renameRemote}
            </Button>
            <Button
              onClick={() =>
                confirmRepositoryAction(
                  format(window.l10n.removeRemoteConfirm, <b>{remote.name}</b>),
                  window.l10n.removeRemote,
                  { kind: "removeRemote", name: remote.name },
                  repo
                )
              }
            >
              {window.l10n.removeRemote}
            </Button>
          </div>
        </div>
      ))}
      <label class="block">
        {window.l10n.defaultPushRemote}
        <Select
          value={pushDefault}
          onChange={setPushDefault}
          options={[
            { label: window.l10n.defaultSetting, value: "" },
            ...state.remotes.map(({ name }) => ({ label: name, value: name }))
          ]}
        />
      </label>
      <Button
        onClick={() =>
          sendRepositoryAction({ kind: "pushDefault", remote: pushDefault || null }, repo)
        }
      >
        {window.l10n.save}
      </Button>
    </div>
  );
}

export function openRemotes() {
  openRepositoryManager(window.l10n.manageRemotes, (state, repo) => (
    <RemoteManager state={state} repo={repo} />
  ));
}

export function openTracking(branch: string) {
  const repo = selectedRepo.value;
  if (repo === undefined) {
    return;
  }
  requestRepositoryQuery(
    { kind: "state" },
    (data) => {
      if (data.kind !== "state") {
        return;
      }
      const state = data.state;
      const upstream = state.branches.find((entry) => entry.name === branch)?.upstream ?? "";
      const options = [
        { label: window.l10n.none, value: "" },
        ...state.remoteBranches.map((name) => ({ label: name, value: `refs/remotes/${name}` })),
        ...state.branches
          .filter((entry) => entry.name !== branch)
          .map(({ name }) => ({ label: name, value: `refs/heads/${name}` }))
      ];
      const current = options.find((option) => option.label === upstream)?.value ?? "";
      openFormDialog({
        message: (
          <>
            {window.l10n.configureUpstream}: <b>{branch}</b>
          </>
        ),
        inputs: [{ kind: "select", label: window.l10n.upstreamBranch, value: current, options }],
        action: window.l10n.save,
        source: `ref:head:${branch}`,
        onSubmit: ([ref]) => {
          if (ref === "" && upstream === "") {
            return;
          }
          sendRepositoryAction({ kind: "setTracking", branch, upstream: ref || null }, repo);
        }
      });
    },
    repo
  );
}
