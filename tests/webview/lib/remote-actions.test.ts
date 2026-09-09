// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { QueryResult } from "@/backend/types";
import { closeDialog, openErrorDialog } from "@/webview/lib/actions";
import { handleActionResult } from "@/webview/lib/handler/action-result";
import { refMenu } from "@/webview/lib/menus";
import { handleLoadRemotes, openRemoteAction } from "@/webview/lib/remote-actions";
import { dialog, selectedRepo } from "@/webview/lib/stores";

const mocks = vi.hoisted(() => {
  vi.stubGlobal("viewState", {
    initialLoadCommits: 300,
    lastActiveRepo: null,
    repos: {},
    showCurrentBranchByDefault: false
  });
  return { postMessage: vi.fn() };
});
vi.mock("@/webview/lib/vscode", () => ({
  vscode: { postMessage: mocks.postMessage, getState: vi.fn(), setState: vi.fn() }
}));

beforeEach(() => {
  mocks.postMessage.mockClear();
  selectedRepo.value = "/repo";
  dialog.value = null;
  Object.defineProperty(window, "l10n", {
    configurable: true,
    value: new Proxy({}, { get: (_target, key) => String(key) })
  });
});

function respond(
  request: { repo: string; requestId: string },
  overrides: Partial<QueryResult<"loadRemotes">> = {}
) {
  handleLoadRemotes({
    ...request,
    remotes: ["origin", "upstream"],
    upstream: null,
    pushRemote: null,
    status: null,
    ...overrides
  });
}

function prepare(
  action: "push" | "pull" | "fetch",
  overrides: Partial<QueryResult<"loadRemotes">> = {}
) {
  openRemoteAction(action, "feature/navigation");
  const request = mocks.postMessage.mock.lastCall![0] as { repo: string; requestId: string };
  respond(request, overrides);
  const form = dialog.value;
  if (form?.kind !== "form") {
    throw new Error("Expected a remote action form");
  }
  return { form, request };
}

describe("remote action dialogs", () => {
  it("publishes the clicked branch to the chosen remote and destination with upstream tracking", () => {
    const { form, request } = prepare("push");
    expect(form.inputs.map((input) => input.value)).toEqual([
      "origin",
      "feature/navigation",
      true,
      false
    ]);
    form.onSubmit(["upstream", "review/navigation", true]);
    expect(mocks.postMessage).toHaveBeenLastCalledWith({
      command: "pushBranch",
      repo: "/repo",
      requestId: request.requestId,
      branchName: "feature/navigation",
      remote: "upstream",
      remoteBranch: "review/navigation",
      setUpstream: true
    });
    expect(dialog.value?.kind).toBe("running");
    handleActionResult({
      command: "pushBranch",
      repo: "/repo",
      requestId: request.requestId,
      status: null
    });
    expect(dialog.value).toBeNull();
  });

  it("uses an existing upstream name and preserves tracking by default", () => {
    const { form } = prepare("push", {
      upstream: { remote: "upstream", branchName: "release/stable" },
      pushRemote: "upstream"
    });
    expect(form.inputs.map((input) => input.value)).toEqual([
      "upstream",
      "release/stable",
      false,
      false
    ]);
  });

  it("uses the local branch name when pushing to a different default remote", () => {
    const { form } = prepare("push", {
      upstream: { remote: "upstream", branchName: "release/stable" },
      pushRemote: "origin"
    });
    expect(form.inputs.map((input) => input.value)).toEqual([
      "origin",
      "feature/navigation",
      false,
      false
    ]);
  });

  it("pulls the clicked current branch from its configured upstream", () => {
    const { form, request } = prepare("pull", {
      upstream: { remote: "upstream", branchName: "release/stable" }
    });
    expect(form.inputs.map((input) => input.value)).toEqual(["upstream", "release/stable"]);
    form.onSubmit(["upstream", "release/stable"]);
    expect(mocks.postMessage).toHaveBeenLastCalledWith({
      command: "pullBranch",
      repo: "/repo",
      requestId: request.requestId,
      branchName: "feature/navigation",
      remote: "upstream",
      remoteBranch: "release/stable"
    });
  });

  it("offers fetch for all remotes with explicit pruning", () => {
    const { form, request } = prepare("fetch");
    expect(form.inputs.map((input) => input.value)).toEqual(["", false]);
    form.onSubmit(["", true]);
    expect(mocks.postMessage).toHaveBeenLastCalledWith({
      command: "fetchRemote",
      repo: "/repo",
      requestId: request.requestId,
      remote: null,
      prune: true
    });
  });

  it("identifies a remote containing slashes when fetching from a remote branch menu", () => {
    openRemoteAction("fetch", "", "team/origin/feature/navigation");
    const request = mocks.postMessage.mock.lastCall![0] as { repo: string; requestId: string };
    respond(request, { remotes: ["team", "team/origin"] });
    const form = dialog.value;
    expect(form?.kind === "form" && form.inputs[0]?.value).toBe("team/origin");
  });

  it("does not submit an action to a different repository after an SCM switch", () => {
    const { form } = prepare("push");
    selectedRepo.value = "/another-repo";
    mocks.postMessage.mockClear();
    form.onSubmit(["origin", "feature/navigation", true]);
    expect(mocks.postMessage).not.toHaveBeenCalled();
    expect(dialog.value).toBeNull();
  });

  it("ignores late discovery results after another dialog opens", () => {
    openRemoteAction("push", "main");
    const request = mocks.postMessage.mock.lastCall![0] as { repo: string; requestId: string };
    openErrorDialog("new dialog");
    const current = dialog.value;
    respond(request);
    expect(dialog.value).toBe(current);
  });

  it("does not let a late action result replace another repository's dialog", () => {
    const { form, request } = prepare("push");
    form.onSubmit(["origin", "feature/navigation", true]);
    selectedRepo.value = "/another-repo";
    openErrorDialog("new dialog");
    const current = dialog.value;
    handleActionResult({
      command: "pushBranch",
      repo: "/repo",
      requestId: request.requestId,
      status: "push rejected"
    });
    expect(dialog.value).toBe(current);
  });

  it("does not let an older result close a newer action in the same repository", () => {
    const first = prepare("push");
    first.form.onSubmit(["origin", "feature/navigation", true]);
    closeDialog();
    const second = prepare("push");
    second.form.onSubmit(["origin", "feature/navigation", true]);
    const current = dialog.value;
    handleActionResult({
      command: "pushBranch",
      repo: "/repo",
      requestId: first.request.requestId,
      status: null
    });
    expect(dialog.value).toBe(current);
  });

  it("explains when a repository has no remotes", () => {
    openRemoteAction("push", "main");
    const request = mocks.postMessage.mock.lastCall![0] as { repo: string; requestId: string };
    respond(request, { remotes: [] });
    expect(dialog.value).toMatchObject({ kind: "error", message: "noRemotesConfigured" });
  });

  it("offers push on every local branch and pull on the checked-out branch", () => {
    const branch = { type: "head" as const, name: "main", hash: "commit" };
    const inactive = refMenu(branch, false)
      .filter((entry) => entry !== null)
      .map((entry) => entry.title);
    const active = refMenu(branch, true)
      .filter((entry) => entry !== null)
      .map((entry) => entry.title);
    expect(inactive).toContain("pushBranch…");
    expect(inactive).not.toContain("pullBranch…");
    expect(active).toContain("pushBranch…");
    expect(active).toContain("pullBranch…");
  });
});
