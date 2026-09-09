// @vitest-environment jsdom

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { GitCommitNode } from "@/backend/types";
import type { LocalizedStrings } from "@/extension/l10n/webviewL10n";
import type { GitGraphViewState } from "@/types";
import { handleLoadRemotes } from "@/webview/lib/remote-actions";

import { vscodeApi } from "@tests/webview/setup";

let commitMenu: typeof import("@/webview/lib/menus").commitMenu;
let checkoutBranchAction: typeof import("@/webview/lib/menus").checkoutBranchAction;
let stores: typeof import("@/webview/lib/stores");

const commit: GitCommitNode = {
  hash: "commit",
  parentHashes: [],
  author: "Author",
  email: "author@example.com",
  date: 0,
  message: "Message",
  refs: []
};

beforeAll(async () => {
  const state: GitGraphViewState = {
    autoCenterCommitDetailsView: true,
    dateFormat: "Date & Time",
    fetchAvatars: false,
    graphColours: [],
    graphStyle: "rounded",
    initialLoadCommits: 300,
    lastActiveRepo: null,
    loadMoreCommits: 100,
    locale: "en",
    repos: {},
    showCurrentBranchByDefault: false
  };
  Object.defineProperty(globalThis, "viewState", { value: state, configurable: true });
  Object.defineProperty(window, "l10n", {
    value: new Proxy({}, { get: (_target, key) => String(key) }) as LocalizedStrings,
    configurable: true
  });

  ({ commitMenu, checkoutBranchAction } = await import("@/webview/lib/menus"));
  stores = await import("@/webview/lib/stores");
});

beforeEach(() => {
  vscodeApi.postMessage.mockClear();
  stores.actionRequest.value = null;
  stores.dialog.value = null;
  stores.selectedRepo.value = "repo";
});

function openAction(command: "cherrypickCommit" | "revertCommit", parentHashes: string[]) {
  const title = command === "cherrypickCommit" ? "cherryPick…" : "revert…";
  const entry = commitMenu({ ...commit, parentHashes }, new Map()).find(
    (item) => item?.title === title
  );

  expect(entry).toBeDefined();
  entry!.onClick();

  const open = stores.dialog.value;
  expect(open?.kind).toBe("form");
  if (open?.kind !== "form") {
    throw new Error("Expected a form dialog");
  }
  return open;
}

describe.each(["cherrypickCommit", "revertCommit"] as const)("%s menu", (command) => {
  it.each([
    ["root", []],
    ["normal", ["parent-1"]]
  ])("treats a %s commit as a normal commit", (_type, parentHashes) => {
    const form = openAction(command, parentHashes);

    expect(form.inputs).toEqual([]);
    form.onSubmit([]);
    expect(vscodeApi.postMessage.mock.lastCall?.[0]).toEqual({
      command,
      repo: "repo",
      requestId: expect.any(String),
      commitHash: "commit",
      parentIndex: 0
    });
  });

  it("requires a mainline parent for a merge commit", () => {
    const form = openAction(command, ["parent-1", "parent-2"]);

    expect(form.inputs).toEqual([
      {
        kind: "select",
        value: "1",
        options: [
          { label: "parent-1", value: "1" },
          { label: "parent-2", value: "2" }
        ]
      }
    ]);
    form.onSubmit(["2"]);
    expect(vscodeApi.postMessage.mock.lastCall?.[0]).toEqual({
      command,
      repo: "repo",
      requestId: expect.any(String),
      commitHash: "commit",
      parentIndex: 2
    });
  });
});

describe("remote branch checkout", () => {
  it.each([
    ["origin/main", "main"],
    ["origin/feature/navigation", "feature/navigation"],
    ["team/origin/feature/navigation", "feature/navigation"]
  ])("suggests the full local branch name for %s", (remoteBranch, branchName) => {
    checkoutBranchAction({ type: "remote", name: remoteBranch, hash: "commit" });
    const request = vscodeApi.postMessage.mock.lastCall![0];
    handleLoadRemotes({
      ...request,
      remotes: ["origin", "team", "team/origin"],
      upstream: null,
      pushRemote: null,
      status: null
    });
    const form = stores.dialog.value;
    if (form?.kind !== "form") {
      throw new Error("Expected a checkout dialog");
    }
    expect(form.inputs).toEqual([
      { kind: "ref", value: branchName },
      { kind: "checkbox", label: "fetchBeforeCheckout", value: true }
    ]);
    form.onSubmit([branchName, true]);
    expect(vscodeApi.postMessage).toHaveBeenCalledWith({
      command: "checkoutBranch",
      repo: "repo",
      requestId: request.requestId,
      branchName,
      remoteBranch,
      fetch: true
    });
  });
});
