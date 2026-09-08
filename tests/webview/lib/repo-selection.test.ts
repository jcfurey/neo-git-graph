import { beforeEach, expect, it, vi } from "vitest";

import { handleLoadRepos } from "@/webview/lib/handler/load-repo";
import { commitList, repoList, selectedBranch, selectedRepo } from "@/webview/lib/stores";

vi.hoisted(() => {
  vi.stubGlobal("viewState", { initialLoadCommits: 300, repos: {} });
});

beforeEach(() => {
  vi.stubGlobal("viewState", { initialLoadCommits: 300 });
  selectedRepo.value = "/workspace";
  selectedBranch.value = "main";
  commitList.value = [];
});

it("switches to the repo requested by the Source Control button", () => {
  handleLoadRepos({
    command: "loadRepos",
    repos: { "/workspace": { columnWidths: null }, "/workspace/child": { columnWidths: null } },
    lastActiveRepo: "/workspace",
    selectedRepo: "/workspace/child"
  });
  expect(selectedRepo.value).toBe("/workspace/child");
  expect(repoList.value).toContain("/workspace/child");
  expect(selectedBranch.value).toBeUndefined();
  expect(commitList.value).toBeUndefined();
});

it("preserves the current selection during ordinary refreshes", () => {
  selectedRepo.value = "/workspace/child";
  handleLoadRepos({
    command: "loadRepos",
    repos: { "/workspace": { columnWidths: null }, "/workspace/child": { columnWidths: null } },
    lastActiveRepo: "/workspace"
  });
  expect(selectedRepo.value).toBe("/workspace/child");
});
