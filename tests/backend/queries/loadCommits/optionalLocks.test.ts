import * as cp from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { afterEach, beforeEach, expect, it } from "vitest";

import { gitClientFactory } from "@/backend/gitClient";
import { loadCommits } from "@/backend/queries/loadCommits";

import { makeRepo } from "@tests/backend/helpers";

let repo: string;
const index = () => {
  const file = path.join(repo, ".git", "index");
  return { bytes: fs.readFileSync(file).toString("base64"), mtime: fs.statSync(file).mtimeMs };
};

beforeEach(() => {
  repo = makeRepo();
  // A new modification time without new contents makes `git status` refresh the index entry.
  const later = new Date(Date.now() + 60_000);
  fs.utimesSync(path.join(repo, "f"), later, later);
});

afterEach(() => fs.rmSync(repo, { recursive: true, force: true }));

it("reads the graph and uncommitted changes without rewriting the index", async () => {
  const before = index();
  await loadCommits(gitClientFactory(repo, "git").getInstance(), {
    branchName: "",
    maxCommits: 10,
    showRemoteBranches: true,
    hard: false,
    dateType: "Author Date",
    showUncommittedChanges: true
  });
  expect(index()).toEqual(before);

  // Plain `git status` takes the optional lock and refreshes the index.
  cp.execFileSync("git", ["status", "--porcelain"], { cwd: repo });
  expect(index()).not.toEqual(before);
});
