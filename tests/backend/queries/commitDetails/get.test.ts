import * as cp from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { simpleGit } from "simple-git";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { commitDetails } from "@/backend/queries/commitDetails";

import { git, makeRepo } from "@tests/backend/helpers";

let repo: string;
let commitHash: string;
const byName = (a: { newFilePath: string }, b: { newFilePath: string }) =>
  a.newFilePath < b.newFilePath ? -1 : 1;

beforeAll(() => {
  repo = makeRepo();
  commitHash = cp.execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim();
});

afterAll(() => {
  fs.rmSync(repo, { recursive: true, force: true });
});

describe("commitDetails", () => {
  it("returns commit details with expected fields", async () => {
    const result = await commitDetails(simpleGit(repo), {
      commitHash,
      dateType: "Author Date"
    });
    expect(result).toEqual({
      commitDetails: {
        hash: commitHash,
        parents: expect.any(Array),
        author: expect.any(String),
        email: expect.any(String),
        date: expect.any(Number),
        committer: expect.any(String),
        body: expect.any(String),
        fileChanges: expect.any(Array)
      }
    });
    expect(result.commitDetails!.date).toBeGreaterThan(0);
  });

  it("returns file changes for the initial commit", async () => {
    const result = await commitDetails(simpleGit(repo), { commitHash, dateType: "Author Date" });
    expect(result.commitDetails).not.toBeNull();
    expect(result.commitDetails!.fileChanges.length).toBeGreaterThan(0);
  });

  it("returns commitDetails: null for an invalid commit hash", async () => {
    const result = await commitDetails(simpleGit(repo), {
      commitHash: "deadbeef1234",
      dateType: "Author Date"
    });
    expect(result).toEqual({ commitDetails: null });
  });

  it("includes additions and deletions for a modified file", async () => {
    const repo2 = makeRepo();
    try {
      fs.writeFileSync(path.join(repo2, "f"), "modified content");
      git(["add", "."], repo2);
      git(["commit", "-m", "mod"], repo2);
      const hash = cp.execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo2 }).toString().trim();

      const result = await commitDetails(simpleGit(repo2), {
        commitHash: hash,
        dateType: "Author Date"
      });
      expect(result.commitDetails).not.toBeNull();
      const changed = result.commitDetails!.fileChanges.find((f) => f.newFilePath === "f");
      expect(changed).toBeDefined();
      expect(changed!.additions).toEqual(expect.any(Number));
      expect(changed!.deletions).toEqual(expect.any(Number));
    } finally {
      fs.rmSync(repo2, { recursive: true, force: true });
    }
  });

  it("uses commit date when dateType is Commit Date", async () => {
    const result = await commitDetails(simpleGit(repo), { commitHash, dateType: "Commit Date" });
    expect(result).toEqual({
      commitDetails: {
        hash: commitHash,
        parents: expect.any(Array),
        author: expect.any(String),
        email: expect.any(String),
        date: expect.any(Number),
        committer: expect.any(String),
        body: expect.any(String),
        fileChanges: expect.any(Array)
      }
    });
    expect(result.commitDetails!.date).toBeGreaterThan(0);
  });

  it("body contains the commit message", async () => {
    const result = await commitDetails(simpleGit(repo), { commitHash, dateType: "Author Date" });
    expect(result.commitDetails!.body).toContain("init");
  });

  it("keeps exact names, renames, and line counts for unusual file names", async () => {
    const repo2 = makeRepo();
    const names = ["中文.txt", "café.md", "tab\tname", 'quote"name', "new\nline", "back\\slash"];
    try {
      fs.writeFileSync(path.join(repo2, "old.txt"), "moved\n");
      git(["add", "old.txt"], repo2);
      git(["commit", "-m", "before"], repo2);
      for (const name of names) {
        fs.writeFileSync(path.join(repo2, name), "one\ntwo\n");
      }
      fs.writeFileSync(path.join(repo2, "binary.dat"), Buffer.from([0, 1, 2]));
      fs.mkdirSync(path.join(repo2, "目录"));
      git(["mv", "old.txt", "目录/新.txt"], repo2);
      git(["add", "-A"], repo2);
      git(["commit", "-m", "unusual names"], repo2);
      const hash = cp.execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo2 }).toString().trim();

      const result = await commitDetails(simpleGit(repo2), {
        commitHash: hash,
        dateType: "Author Date"
      });
      expect(result.commitDetails!.fileChanges.toSorted(byName)).toEqual(
        [
          ...names.map((name) => ({
            oldFilePath: name,
            newFilePath: name,
            type: "A",
            additions: 2,
            deletions: 0
          })),
          {
            oldFilePath: "binary.dat",
            newFilePath: "binary.dat",
            type: "A",
            additions: null,
            deletions: null
          },
          {
            oldFilePath: "old.txt",
            newFilePath: "目录/新.txt",
            type: "R",
            additions: 0,
            deletions: 0
          }
        ].toSorted(byName)
      );
    } finally {
      fs.rmSync(repo2, { recursive: true, force: true });
    }
  });
});
