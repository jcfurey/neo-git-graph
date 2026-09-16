// @vitest-environment jsdom
import { beforeAll, beforeEach, expect, it, vi } from "vitest";

import {
  focusBranchInGraph,
  selectBranch,
  selectRepo,
  setRemoteVisible,
  setShowRemoteBranch
} from "@/webview/lib/actions";
import { handleLoadBranches } from "@/webview/lib/handler/load-branches";
import { handleLoadCommits } from "@/webview/lib/handler/load-commits";
import * as stores from "@/webview/lib/stores";

import { vscodeApi } from "@tests/webview/setup";
import { setupWebviewTest } from "@tests/webview/test-utils";

beforeAll(() => setupWebviewTest());
beforeEach(() => {
  stores.selectedRepo.value = "/repo";
  stores.selectedBranch.value = "*";
  stores.branchDisplay.value = "filter";
  stores.headBranch.value = "main";
  stores.branchList.value = ["main", "remotes/origin/main", "remotes/other/main"];
  stores.repoStates.value = { "/repo": { columnWidths: [100, 300, 100, 100, 100] } };
  stores.showRemoteBranch.value = true;
  stores.commitList.value = [];
  stores.maxCommits.value = 600;
  vi.clearAllMocks();
});

it("persists individual choices per repository and preserves them through the global toggle", () => {
  setRemoteVisible("origin", false);
  expect(stores.hiddenRemotes.value).toEqual(["origin"]);
  expect(vscodeApi.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      command: "saveRepoState",
      repo: "/repo",
      state: { columnWidths: [100, 300, 100, 100, 100], hiddenRemotes: ["origin"] }
    })
  );
  setShowRemoteBranch(false);
  setShowRemoteBranch(true);
  expect(stores.hiddenRemotes.value).toEqual(["origin"]);
  expect(vscodeApi.postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      command: "loadCommits",
      hiddenRemotes: ["origin"],
      showRemoteBranches: true,
      maxCommits: 600
    })
  );
  selectRepo("/other");
  expect(stores.hiddenRemotes.value).toEqual([]);
  selectRepo("/repo");
  expect(stores.hiddenRemotes.value).toEqual(["origin"]);
});

it("clears a hidden focus target and reveals only the requested remote when selected or focused", () => {
  focusBranchInGraph("remotes/origin/main");
  setRemoteVisible("origin", false);
  expect(stores.selectedBranch.value).toBe("*");
  expect(stores.branchFocusTarget.value).toBeUndefined();
  setRemoteVisible("other", false);
  selectBranch("remotes/origin/main");
  expect(stores.hiddenRemotes.value).toEqual(["other"]);
  expect(stores.branchFocusTarget.value).toBe("remotes/origin/main");
  setRemoteVisible("origin", false);
  setShowRemoteBranch(false);
  focusBranchInGraph("remotes/origin/main");
  expect(stores.showRemoteBranch.value).toBe(true);
  expect(stores.hiddenRemotes.value).toEqual(["other"]);
  expect(stores.branchFocusTarget.value).toBe("remotes/origin/main");
  expect(stores.headBranch.value).toBe("main");
  expect(
    vscodeApi.postMessage.mock.calls.every(([message]) =>
      ["loadBranches", "loadCommits", "saveRepoState"].includes(message.command)
    )
  ).toBe(true);
});

it("ignores history and branch replies from older remote visibility choices", () => {
  const previousKey = stores.remoteVisibilityKey();
  setRemoteVisible("origin", false);
  const rows = stores.commitList.value;
  const branches = stores.branchList.value;
  const commitsReply = {
    command: "loadCommits" as const,
    repo: "/repo",
    branchName: "",
    commits: [],
    head: "old",
    hard: true,
    moreCommitsAvailable: false,
    uncommittedChanges: 0,
    visibilityKey: previousKey
  };
  const branchesReply = {
    command: "loadBranches" as const,
    repo: "/repo",
    branches: ["old"],
    head: "old",
    hard: true,
    isRepo: true,
    visibilityKey: previousKey
  };
  handleLoadCommits(commitsReply);
  handleLoadBranches(branchesReply);
  expect(stores.commitList.value).toBe(rows);
  expect(stores.branchList.value).toBe(branches);
  handleLoadCommits({
    ...commitsReply,
    head: "current",
    visibilityKey: stores.remoteVisibilityKey()
  });
  handleLoadBranches({
    ...branchesReply,
    branches: ["main"],
    head: "main",
    visibilityKey: stores.remoteVisibilityKey()
  });
  expect(stores.commitHead.value).toBe("current");
  expect(stores.branchList.value).toEqual(["main"]);
});
