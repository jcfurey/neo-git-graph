// @vitest-environment jsdom

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { GitCommitNode } from "@/backend/types";
import type { LocalizedStrings } from "@/extension/l10n/webviewL10n";
import type { GitGraphViewState } from "@/types";

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
    expect(stores.actionRequest.value?.action).toEqual({
      command,
      repo: "repo",
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
    expect(stores.actionRequest.value?.action).toEqual({
      command,
      repo: "repo",
      commitHash: "commit",
      parentIndex: 2
    });
  });
});

describe("remote branch checkout", () => {
  it.each([
    ["origin/main", "main"],
    ["origin/feature/navigation", "feature/navigation"]
  ])("suggests the full local branch name for %s", (remoteBranch, branchName) => {
    checkoutBranchAction({ type: "remote", name: remoteBranch, hash: "commit" });
    const form = stores.dialog.value;
    if (form?.kind !== "form") {
      throw new Error("Expected a checkout dialog");
    }
    expect(form.inputs).toEqual([{ kind: "ref", value: branchName }]);
    form.onSubmit([branchName]);
    expect(stores.actionRequest.value?.action).toEqual({
      command: "checkoutBranch",
      repo: "repo",
      branchName,
      remoteBranch
    });
  });
});
