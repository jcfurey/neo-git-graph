// @vitest-environment jsdom
import { beforeAll, beforeEach, expect, it, vi } from "vitest";

import { loadMoreCommits, selectBranch, selectRepo, setBranchDisplay } from "@/webview/lib/actions";
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
  stores.branchList.value = ["main", "topic"];
  stores.commitList.value = [];
  stores.maxCommits.value = 600;
  vi.clearAllMocks();
});

it("focuses the current branch from Show All without replacing rows or checking out", () => {
  const rows = stores.commitList.value;
  setBranchDisplay("focus");
  expect(stores.selectedBranch.value).toBe("main");
  selectBranch("topic");
  setBranchDisplay("ancestors");
  expect(stores.commitList.value).toBe(rows);
  expect(stores.maxCommits.value).toBe(600);
  expect(vscodeApi.postMessage).not.toHaveBeenCalled();
  selectBranch("*");
  expect(stores.commitList.value).toBe(rows);
});

it("loads all branches for focus and ignores an older filtered response", () => {
  stores.selectedBranch.value = "main";
  setBranchDisplay("focus");
  expect(vscodeApi.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({ command: "loadCommits", branchName: "" })
  );
  const response = {
    command: "loadCommits" as const,
    repo: "/repo",
    branchName: "main",
    commits: [],
    head: null,
    moreCommitsAvailable: false,
    hard: true,
    uncommittedChanges: 0
  };
  handleLoadCommits(response);
  expect(stores.commitList.value).toBeUndefined();
  handleLoadCommits({ ...response, branchName: "" });
  expect(stores.commitList.value).toEqual([]);
  loadMoreCommits();
  expect(vscodeApi.postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({ command: "loadCommits", branchName: "" })
  );
  setBranchDisplay("filter");
  expect(vscodeApi.postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({ command: "loadCommits", branchName: "main" })
  );
  handleLoadCommits({ ...response, branchName: "" });
  expect(stores.commitList.value).toBeUndefined();
});

it("restores the view per repository and falls back when the focused branch disappears", () => {
  setBranchDisplay("focus");
  selectRepo("/other");
  expect(stores.branchDisplay.value).toBe("filter");
  selectRepo("/repo");
  expect(stores.branchDisplay.value).toBe("focus");
  handleLoadBranches({
    command: "loadBranches",
    repo: "/repo",
    head: "main",
    branches: ["main"],
    hard: true,
    isRepo: true
  });
  expect(stores.selectedBranch.value).toBe("main");
  selectBranch("topic");
  handleLoadBranches({
    command: "loadBranches",
    repo: "/repo",
    head: "main",
    branches: ["main"],
    hard: true,
    isRepo: true
  });
  expect(stores.selectedBranch.value).toBe("main");
});
