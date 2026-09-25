import * as cp from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createGit } from "@/backend/gitClient";
import { commitDetails } from "@/backend/queries/commitDetails";
import { loadHistory, loadRestorePlan, sourceFile } from "@/backend/queries/history";

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
    const result = await commitDetails(createGit(repo, "git"), {
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
    const result = await commitDetails(createGit(repo, "git"), {
      commitHash,
      dateType: "Author Date"
    });
    expect(result.commitDetails).not.toBeNull();
    expect(result.commitDetails!.fileChanges.length).toBeGreaterThan(0);
  });

  it("returns commitDetails: null for an invalid commit hash", async () => {
    const result = await commitDetails(createGit(repo, "git"), {
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

      const result = await commitDetails(createGit(repo2, "git"), {
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
    const result = await commitDetails(createGit(repo, "git"), {
      commitHash,
      dateType: "Commit Date"
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

  it("body contains the commit message", async () => {
    const result = await commitDetails(createGit(repo, "git"), {
      commitHash,
      dateType: "Author Date"
    });
    expect(result.commitDetails!.body).toContain("init");
  });

  it("keeps exact names, renames, and line counts for unusual file names", async () => {
    const dir = makeRepo();
    // Windows does not allow tabs, quotes, newlines, or backslashes in file names.
    const names = [
      "中文.txt",
      "café.md",
      ...(process.platform === "win32"
        ? []
        : ["tab\tname", 'quote"name', "new\nline", "back\\slash", "0:foo"])
    ];
    try {
      fs.writeFileSync(path.join(dir, "old.txt"), "moved\n");
      git(["add", "--", "old.txt"], dir);
      git(["commit", "-m", "before"], dir);
      for (const name of names) {
        fs.writeFileSync(path.join(dir, name), "one\ntwo\n");
      }
      fs.writeFileSync(path.join(dir, "binary.dat"), Buffer.from([0, 1, 2]));
      fs.mkdirSync(path.join(dir, "目录"));
      git(["mv", "old.txt", "目录/新.txt"], dir);
      git(["add", "-A"], dir);
      git(["commit", "-m", "unusual names"], dir);
      const hash = cp.execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir }).toString().trim();
      const client = createGit(dir, "git");

      const { fileChanges } = (
        await commitDetails(client, {
          commitHash: hash,
          dateType: "Author Date"
        })
      ).commitDetails!;
      expect(fileChanges.toSorted(byName)).toEqual(
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

      await Promise.all(
        [...names, "目录/新.txt"].map(async (name) => {
          // The diff and Open at Revision documents read `<commit>:<path>`.
          expect(await client.show(["--end-of-options", `${hash}:${name}`])).toBe(
            name === "目录/新.txt" ? "moved\n" : "one\ntwo\n"
          );
          expect((await sourceFile(client, hash, name)).hash).toBe(hash);
          const history = await loadHistory(
            client,
            {
              text: "",
              author: "",
              since: "",
              until: "",
              path: name,
              revision: "",
              follow: false
            },
            0
          );
          expect(history.entries[0]?.hash).toBe(hash);
          expect((await loadRestorePlan(client, hash, name, name)).destination).toBe(name);
        })
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("lists the first parent's changes for a merge and none for an empty commit", async () => {
    const dir = makeRepo();
    try {
      git(["checkout", "-b", "side"], dir);
      fs.writeFileSync(path.join(dir, "side"), "side\n");
      git(["add", "side"], dir);
      git(["commit", "-m", "side"], dir);
      git(["checkout", "main"], dir);
      fs.writeFileSync(path.join(dir, "main"), "main\n");
      git(["add", "main"], dir);
      git(["commit", "-m", "main"], dir);
      git(["merge", "--no-edit", "side"], dir);
      const client = createGit(dir, "git");
      const merge = (await commitDetails(client, { commitHash: "HEAD", dateType: "Author Date" }))
        .commitDetails!;
      expect(merge.fileChanges.map((change) => change.newFilePath)).toEqual(["side"]);
      git(["commit", "--allow-empty", "-m", "empty"], dir);
      const empty = (await commitDetails(client, { commitHash: "HEAD", dateType: "Author Date" }))
        .commitDetails!;
      expect(empty.fileChanges).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
