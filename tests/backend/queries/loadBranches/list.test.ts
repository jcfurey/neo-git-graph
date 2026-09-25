import * as cp from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";

import { simpleGit } from "simple-git";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadBranches } from "@/backend/queries/loadBranches";

import { git, makeRepo } from "@tests/backend/helpers";

let simpleRepo: string;
let detachedRepo: string;
let repoWithRemote: string;

beforeAll(() => {
  simpleRepo = makeRepo();
  git(["branch", "feature/foo"], simpleRepo);

  detachedRepo = makeRepo();
  const hash = cp
    .execFileSync("git", ["rev-parse", "HEAD"], { cwd: detachedRepo })
    .toString()
    .trim();
  git(["checkout", "--detach", hash], detachedRepo);

  const remoteRepo = makeRepo();
  repoWithRemote = makeRepo();
  git(["remote", "add", "origin", remoteRepo], repoWithRemote);
  git(["fetch", "origin"], repoWithRemote);
});

afterAll(() => {
  fs.rmSync(simpleRepo, { recursive: true, force: true });
  fs.rmSync(detachedRepo, { recursive: true, force: true });
  fs.rmSync(repoWithRemote, { recursive: true, force: true });
});

describe("loadBranches", () => {
  it("head branch is first in the returned array", async () => {
    const result = await loadBranches(simpleGit(simpleRepo), {
      showRemoteBranches: false,
      hard: false,
      repo: simpleRepo,
      gitPath: "git"
    });
    expect(result).toEqual({
      repo: simpleRepo,
      branches: expect.any(Array),
      head: "main",
      hard: false,
      isRepo: true
    });
    expect(result.branches[0]).toBe("main");
  });

  it("non-head branches are present", async () => {
    const result = await loadBranches(simpleGit(simpleRepo), {
      showRemoteBranches: false,
      hard: false,
      repo: simpleRepo,
      gitPath: "git"
    });
    expect(result.branches).toContain("feature/foo");
  });

  it("detached HEAD yields head: null with branches still listed", async () => {
    const result = await loadBranches(simpleGit(detachedRepo), {
      showRemoteBranches: false,
      hard: false,
      repo: detachedRepo,
      gitPath: "git"
    });
    expect(result).toEqual({
      repo: detachedRepo,
      branches: expect.any(Array),
      head: null,
      hard: false,
      isRepo: true
    });
    expect(result.branches).toEqual(["main"]);
  });

  it("excludes remote-tracking branches when showRemoteBranches is false", async () => {
    const result = await loadBranches(simpleGit(repoWithRemote), {
      showRemoteBranches: false,
      hard: false,
      repo: repoWithRemote,
      gitPath: "git"
    });
    expect(result).toEqual({
      repo: repoWithRemote,
      branches: expect.any(Array),
      head: expect.any(String),
      hard: false,
      isRepo: true
    });
    expect(result.branches.some((b) => b.startsWith("remotes/"))).toBe(false);
  });

  it("includes remote-tracking branches when showRemoteBranches is true", async () => {
    const result = await loadBranches(simpleGit(repoWithRemote), {
      showRemoteBranches: true,
      hard: false,
      repo: repoWithRemote,
      gitPath: "git"
    });
    expect(result).toEqual({
      repo: repoWithRemote,
      branches: expect.any(Array),
      head: expect.any(String),
      hard: false,
      isRepo: true
    });
    expect(result.branches).toEqual(["main", "remotes/origin/main"]);
  });

  it("reports a non-git directory instead of returning an empty branch list", async () => {
    await expect(
      loadBranches(simpleGit(os.tmpdir()), {
        showRemoteBranches: false,
        hard: false,
        repo: os.tmpdir(),
        gitPath: "git"
      })
    ).rejects.toThrow();
  });

  it("passes hard flag through to the result", async () => {
    const result = await loadBranches(simpleGit(simpleRepo), {
      showRemoteBranches: false,
      hard: true,
      repo: simpleRepo,
      gitPath: "git"
    });
    expect(result).toEqual({
      repo: simpleRepo,
      branches: expect.any(Array),
      head: expect.any(String),
      hard: true,
      isRepo: true
    });
  });

  describe("while HEAD is not on a branch", () => {
    let repo: string;
    const branches = (showRemoteBranches = false) =>
      loadBranches(simpleGit(repo), { showRemoteBranches, hard: false, repo, gitPath: "git" });

    beforeAll(() => {
      repo = makeRepo();
      // Neither forced color nor a remote HEAD may add entries.
      git(["config", "color.ui", "always"], repo);
      git(["config", "color.branch", "always"], repo);
      git(["branch", "topic"], repo);
      git(["tag", "v1"], repo);
      git(["remote", "add", "origin", repo], repo);
      git(["fetch", "-q", "origin"], repo);
      git(["remote", "set-head", "origin", "main"], repo);
    });

    afterAll(() => fs.rmSync(repo, { recursive: true, force: true }));

    it.each([
      ["a branch tip", ["checkout", "--detach", "main"]],
      ["a tag", ["checkout", "--detach", "v1"]],
      ["a hash", ["checkout", "--detach", "HEAD"]]
    ])("lists only real branches when detached at %s", async (_, checkout) => {
      git(checkout, repo);
      try {
        expect(await branches()).toMatchObject({ head: null, branches: ["main", "topic"] });
        expect((await branches(true)).branches).toEqual([
          "main",
          "topic",
          "remotes/origin/main",
          "remotes/origin/topic"
        ]);
      } finally {
        git(["checkout", "main"], repo);
      }
    });

    it("lists only real branches during a conflicted rebase", async () => {
      fs.writeFileSync(`${repo}/f`, "main side");
      git(["commit", "-am", "main side"], repo);
      git(["checkout", "topic"], repo);
      fs.writeFileSync(`${repo}/f`, "topic side");
      git(["commit", "-am", "topic side"], repo);
      expect(() => git(["rebase", "main"], repo)).toThrow();
      try {
        expect(await branches()).toMatchObject({ head: null, branches: ["main", "topic"] });
      } finally {
        git(["rebase", "--abort"], repo);
        git(["checkout", "main"], repo);
      }
    });

    it("lists only real branches during a bisect", async () => {
      const base = cp.execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim();
      git(["commit", "--allow-empty", "-m", "middle"], repo);
      git(["commit", "--allow-empty", "-m", "last"], repo);
      // Bisect checks out the middle commit, detaching HEAD.
      git(["bisect", "start", "main", base], repo);
      try {
        expect(await branches()).toMatchObject({ head: null, branches: ["main", "topic"] });
      } finally {
        git(["bisect", "reset"], repo);
      }
      expect(await branches()).toMatchObject({ head: "main", branches: ["main", "topic"] });
    });
  });
});
