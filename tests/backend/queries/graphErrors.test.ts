import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { simpleGit } from "simple-git";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { loadBranches } from "@/backend/queries/loadBranches";
import { loadCommits } from "@/backend/queries/loadCommits";

import { git, makeRepo } from "@tests/backend/helpers";

let repo: string;
beforeEach(() => {
  repo = makeRepo();
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));
const input = {
  branchName: "",
  maxCommits: 300,
  showRemoteBranches: true,
  hard: true,
  dateType: "Author Date" as const,
  showUncommittedChanges: true
};

it("reports an invalid revision instead of successful empty history", async () => {
  await expect(
    loadCommits(simpleGit(repo), { ...input, branchName: "missing-branch" })
  ).rejects.toThrow();
});

it.each(["removed repository", "invalid Git executable"])(
  "reports %s for both graph queries",
  async (failure) => {
    const client = simpleGit({
      baseDir: repo,
      binary: failure === "invalid Git executable" ? join(repo, "missing-git") : "git"
    });
    if (failure === "removed repository") {
      rmSync(repo, { recursive: true, force: true });
    }
    await expect(loadCommits(client, input)).rejects.toThrow();
    await expect(
      loadBranches(client, { showRemoteBranches: true, hard: true, repo, gitPath: "git" })
    ).rejects.toThrow();
  }
);

it.each(["show-ref", "log", "remote"])("propagates %s failures", async (command) => {
  const client = simpleGit(repo);
  const original = client.raw.bind(client);
  vi.spyOn(client, "raw").mockImplementation((...args) => {
    if (Array.isArray(args[0]) && args[0][0] === command) {
      return Promise.reject(new Error("Git read denied")) as ReturnType<typeof client.raw>;
    }
    return original(...args);
  });
  await expect(
    loadCommits(client, { ...input, hiddenRemotes: command === "remote" ? ["origin"] : [] })
  ).rejects.toThrow("Git read denied");
});

it("does not report a clean working tree when status fails", async () => {
  const client = simpleGit(repo);
  vi.spyOn(client, "status").mockRejectedValue(new Error("index unreadable"));
  await expect(loadCommits(client, input)).rejects.toThrow("index unreadable");
});

it("treats an unborn repository as a successful empty result", async () => {
  const empty = mkdtempSync(join(tmpdir(), "ngg-empty-"));
  try {
    git(["init", "-b", "main"], empty);
    expect(await loadCommits(simpleGit(empty), input)).toMatchObject({ commits: [], head: null });
    expect(
      await loadBranches(simpleGit(empty), {
        showRemoteBranches: true,
        hard: true,
        repo: empty,
        gitPath: "git"
      })
    ).toMatchObject({ branches: [], isRepo: true });
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});
