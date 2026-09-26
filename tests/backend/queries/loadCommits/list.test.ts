import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createGit } from "@/backend/gitClient";
import { loadCommits } from "@/backend/queries/loadCommits";

import { git, makeRepo } from "@tests/backend/helpers";

let repo: string;
let repoWithRemote: string;
let remoteRepo: string;

beforeAll(() => {
  repo = makeRepo();
  fs.writeFileSync(path.join(repo, "f2"), "y");
  git(["add", "."], repo);
  git(["commit", "-m", "second"], repo);

  remoteRepo = makeRepo();
  repoWithRemote = makeRepo();
  git(["remote", "add", "origin", remoteRepo], repoWithRemote);
  git(["fetch", "origin"], repoWithRemote);
});

afterAll(() => {
  fs.rmSync(repo, { recursive: true, force: true });
  fs.rmSync(repoWithRemote, { recursive: true, force: true });
  fs.rmSync(remoteRepo, { recursive: true, force: true });
});

describe("loadCommits", () => {
  it.each([true, false])(
    "includes detached-only history and dirty changes with remote visibility %s",
    async (showRemoteBranches) => {
      const detachedRepo = makeRepo();
      try {
        git(["checkout", "--detach", "HEAD"], detachedRepo);
        git(["commit", "--allow-empty", "-m", "detached-only"], detachedRepo);
        fs.writeFileSync(path.join(detachedRepo, "untracked"), "dirty");
        const client = createGit(detachedRepo, "git");
        const head = (await client.revparse(["HEAD"])).trim();
        const input = {
          branchName: "",
          maxCommits: 300,
          showRemoteBranches,
          hard: false,
          dateType: "Author Date" as const,
          showUncommittedChanges: true
        };
        const result = await loadCommits(client, input);
        expect(result.head).toBe(head);
        expect(result.commits.map((commit) => commit.hash)).toContain(head);
        expect(result.commits[0]).toMatchObject({ hash: "*", parentHashes: [head] });
        expect(result.uncommittedChanges).toBe(1);
        const filtered = await loadCommits(client, { ...input, branchName: "main" });
        expect(filtered.commits.map((commit) => commit.hash)).not.toContain(head);
        expect(filtered.uncommittedChanges).toBe(0);
      } finally {
        fs.rmSync(detachedRepo, { recursive: true, force: true });
      }
    }
  );

  it("includes detached HEAD when no branch or tag refs remain", async () => {
    const detachedRepo = makeRepo();
    try {
      git(["checkout", "--detach", "HEAD"], detachedRepo);
      git(["branch", "-D", "main"], detachedRepo);
      const result = await loadCommits(createGit(detachedRepo, "git"), {
        branchName: "",
        maxCommits: 300,
        showRemoteBranches: true,
        hard: false,
        dateType: "Author Date",
        showUncommittedChanges: true
      });
      expect(result.commits).toHaveLength(1);
      expect(result.commits[0]).toMatchObject({ hash: result.head, refs: [] });
    } finally {
      fs.rmSync(detachedRepo, { recursive: true, force: true });
    }
  });

  it("keeps checked-out hidden remote history without revealing its labels", async () => {
    const detachedRepo = makeRepo();
    try {
      git(["remote", "add", "origin", "."], detachedRepo);
      git(["checkout", "--detach", "HEAD"], detachedRepo);
      git(["commit", "--allow-empty", "-m", "hidden-remote-tip"], detachedRepo);
      git(["update-ref", "refs/remotes/origin/topic", "HEAD"], detachedRepo);
      const result = await loadCommits(createGit(detachedRepo, "git"), {
        branchName: "",
        maxCommits: 300,
        showRemoteBranches: true,
        hiddenRemotes: ["origin"],
        hard: false,
        dateType: "Author Date",
        showUncommittedChanges: false
      });
      expect(result.commits.find((commit) => commit.hash === result.head)).toMatchObject({
        message: "hidden-remote-tip",
        refs: []
      });
    } finally {
      fs.rmSync(detachedRepo, { recursive: true, force: true });
    }
  });

  it("returns empty history for an unborn repository", async () => {
    const emptyRepo = fs.mkdtempSync(path.join(os.tmpdir(), "ngg-empty-"));
    try {
      git(["init", "-b", "main"], emptyRepo);
      const result = await loadCommits(createGit(emptyRepo, "git"), {
        branchName: "",
        maxCommits: 300,
        showRemoteBranches: true,
        hard: false,
        dateType: "Author Date",
        showUncommittedChanges: true
      });
      expect(result).toMatchObject({
        commits: [],
        head: null,
        moreCommitsAvailable: false,
        uncommittedChanges: 0
      });
    } finally {
      fs.rmSync(emptyRepo, { recursive: true, force: true });
    }
  });

  it("returns commits with expected fields", async () => {
    const result = await loadCommits(createGit(repo, "git"), {
      branchName: "",
      maxCommits: 300,
      showRemoteBranches: false,
      hard: false,
      dateType: "Author Date",
      showUncommittedChanges: false
    });
    expect(result).toEqual({
      commits: expect.any(Array),
      head: expect.any(String),
      moreCommitsAvailable: false,
      hard: false,
      uncommittedChanges: 0
    });
    expect(result.commits.length).toBeGreaterThan(0);
    expect(result.commits[0]).toEqual({
      hash: expect.any(String),
      parentHashes: expect.any(Array),
      author: expect.any(String),
      email: expect.any(String),
      date: expect.any(Number),
      message: expect.any(String),
      refs: expect.any(Array)
    });
  });

  it("attaches HEAD ref to the current commit and sets head correctly", async () => {
    const result = await loadCommits(createGit(repo, "git"), {
      branchName: "",
      maxCommits: 300,
      showRemoteBranches: false,
      hard: false,
      dateType: "Author Date",
      showUncommittedChanges: false
    });
    expect(result.head).not.toBeNull();
    const headCommit = result.commits.find((c) => c.hash === result.head);
    expect(headCommit).toBeDefined();
    expect(headCommit!.refs.some((r) => r.type === "head")).toBe(true);
  });

  it("limits to maxCommits and sets moreCommitsAvailable: true", async () => {
    const result = await loadCommits(createGit(repo, "git"), {
      branchName: "",
      maxCommits: 1,
      showRemoteBranches: false,
      hard: false,
      dateType: "Author Date",
      showUncommittedChanges: false
    });
    expect(result).toEqual({
      commits: expect.any(Array),
      head: expect.any(String),
      moreCommitsAvailable: true,
      hard: false,
      uncommittedChanges: 0
    });
    expect(result.commits.length).toBe(1);
  });

  it("moreCommitsAvailable is false when all commits fit", async () => {
    const result = await loadCommits(createGit(repo, "git"), {
      branchName: "",
      maxCommits: 300,
      showRemoteBranches: false,
      hard: false,
      dateType: "Author Date",
      showUncommittedChanges: false
    });
    expect(result).toEqual({
      commits: expect.any(Array),
      head: expect.any(String),
      moreCommitsAvailable: false,
      hard: false,
      uncommittedChanges: 0
    });
  });

  it("filters commits to the given branch", async () => {
    const result = await loadCommits(createGit(repo, "git"), {
      branchName: "main",
      maxCommits: 300,
      showRemoteBranches: false,
      hard: false,
      dateType: "Author Date",
      showUncommittedChanges: false
    });
    expect(result.commits.length).toBeGreaterThan(0);
  });

  it("prepends uncommitted-changes commit when working tree is dirty", async () => {
    const dirtyRepo = makeRepo();
    try {
      fs.writeFileSync(path.join(dirtyRepo, "untracked"), "z");
      const result = await loadCommits(createGit(dirtyRepo, "git"), {
        branchName: "",
        maxCommits: 300,
        showRemoteBranches: false,
        hard: false,
        dateType: "Author Date",
        showUncommittedChanges: true
      });
      expect(result.commits[0]).toEqual({
        hash: "*",
        parentHashes: [result.head],
        author: "*",
        email: "",
        date: expect.any(Number),
        message: "",
        refs: []
      });
      expect(result.uncommittedChanges).toBe(1);
    } finally {
      fs.rmSync(dirtyRepo, { recursive: true, force: true });
    }
  });

  it("does not prepend uncommitted-changes commit when showUncommittedChanges is false", async () => {
    const dirtyRepo = makeRepo();
    try {
      fs.writeFileSync(path.join(dirtyRepo, "untracked"), "z");
      const result = await loadCommits(createGit(dirtyRepo, "git"), {
        branchName: "",
        maxCommits: 300,
        showRemoteBranches: false,
        hard: false,
        dateType: "Author Date",
        showUncommittedChanges: false
      });
      const firstCommit = result.commits[0];
      expect(firstCommit).toBeDefined();
      expect(firstCommit?.hash).not.toBe("*");
    } finally {
      fs.rmSync(dirtyRepo, { recursive: true, force: true });
    }
  });

  it("does not include remote refs when showRemoteBranches is false", async () => {
    const result = await loadCommits(createGit(repoWithRemote, "git"), {
      branchName: "",
      maxCommits: 300,
      showRemoteBranches: false,
      hard: false,
      dateType: "Author Date",
      showUncommittedChanges: false
    });
    const allRefs = result.commits.flatMap((c) => c.refs);
    expect(allRefs.every((r) => r.type !== "remote")).toBe(true);
  });

  it("uses commit date when dateType is Commit Date", async () => {
    const result = await loadCommits(createGit(repo, "git"), {
      branchName: "",
      maxCommits: 300,
      showRemoteBranches: false,
      hard: false,
      dateType: "Commit Date",
      showUncommittedChanges: false
    });
    expect(result.commits.length).toBeGreaterThan(0);
    expect(result.commits[0]?.date).toBeGreaterThan(0);
  });

  it("passes hard flag through to the result", async () => {
    const result = await loadCommits(createGit(repo, "git"), {
      branchName: "",
      maxCommits: 300,
      showRemoteBranches: false,
      hard: true,
      dateType: "Author Date",
      showUncommittedChanges: false
    });
    expect(result).toEqual({
      commits: expect.any(Array),
      head: expect.any(String),
      moreCommitsAvailable: false,
      hard: true,
      uncommittedChanges: 0
    });
  });
});
