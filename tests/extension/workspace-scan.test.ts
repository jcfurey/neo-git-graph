import { beforeEach, expect, it, vi } from "vitest";

import { invalidateWorkspaceScan, scanWorkspaceRepos } from "@/extension/workspace-scan";

const mocks = vi.hoisted(() => ({
  findGitRepos: vi.fn(),
  folders: [{ uri: { fsPath: "/ws" } }]
}));
vi.mock("vscode", () => ({
  workspace: {
    get workspaceFolders() {
      return mocks.folders;
    }
  }
}));
vi.mock("@/backend/queries/repoSearch", () => ({ findGitRepos: mocks.findGitRepos }));

beforeEach(() => {
  invalidateWorkspaceScan();
  mocks.findGitRepos.mockReset();
  mocks.folders = [{ uri: { fsPath: "/ws" } }];
});

it("walks the workspace once until the folders, Git path or depth change", async () => {
  mocks.findGitRepos.mockResolvedValue(["/ws/a"]);
  await expect(scanWorkspaceRepos("git", 1)).resolves.toEqual(["/ws/a"]);
  await scanWorkspaceRepos("git", 1);
  expect(mocks.findGitRepos).toHaveBeenCalledTimes(1);
  expect(mocks.findGitRepos).toHaveBeenCalledWith(["/ws"], "git", 1);

  await scanWorkspaceRepos("git", 2);
  await scanWorkspaceRepos("/usr/bin/git", 2);
  mocks.folders = [{ uri: { fsPath: "/other" } }];
  await scanWorkspaceRepos("/usr/bin/git", 2);
  expect(mocks.findGitRepos).toHaveBeenCalledTimes(4);
  expect(mocks.findGitRepos).toHaveBeenLastCalledWith(["/other"], "/usr/bin/git", 2);
});

it("walks again after a repository appears or vanishes", async () => {
  mocks.findGitRepos.mockResolvedValue([]);
  await scanWorkspaceRepos("git", 0);
  invalidateWorkspaceScan();
  await scanWorkspaceRepos("git", 0);
  expect(mocks.findGitRepos).toHaveBeenCalledTimes(2);
});

it("does not keep a failed walk", async () => {
  mocks.findGitRepos.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(["/ws/b"]);
  await expect(scanWorkspaceRepos("git", 0)).rejects.toThrow("boom");
  await expect(scanWorkspaceRepos("git", 0)).resolves.toEqual(["/ws/b"]);
  expect(mocks.findGitRepos).toHaveBeenCalledTimes(2);
});
