import * as cp from "node:child_process";
import * as fs from "node:fs";

import { simpleGit } from "simple-git";
import { afterEach, describe, expect, it } from "vitest";

import { loadCommits } from "@/backend/queries/loadCommits";

import { makeRepo } from "@tests/backend/helpers";

let repo: string;

afterEach(() => {
  fs.rmSync(repo, { recursive: true, force: true });
});

function commit(message: string, author = "T") {
  cp.execFileSync("git", ["commit", "--allow-empty", "-m", message], {
    cwd: repo,
    env: { ...process.env, GIT_AUTHOR_NAME: author },
    stdio: "pipe"
  });
}

describe("loadCommits records", () => {
  it("keeps every commit when a subject or author contains a carriage return", async () => {
    repo = makeRepo();
    commit("carriage\rreturn subject");
    commit("line feed\r\nsubject");
    commit("plain", "Carriage\rReturn Author");
    commit("last");

    const result = await loadCommits(simpleGit(repo), {
      branchName: "",
      maxCommits: 4,
      showRemoteBranches: false,
      hard: false,
      dateType: "Author Date",
      showUncommittedChanges: false
    });
    expect(result.commits.map(({ message, author }) => [message, author])).toEqual([
      ["last", "T"],
      ["plain", "Carriage\rReturn Author"],
      ["line feed subject", "T"],
      ["carriage\rreturn subject", "T"]
    ]);
    expect(result.moreCommitsAvailable).toBe(true);
    const hashes = cp
      .execFileSync("git", ["rev-list", "--max-count=4", "HEAD"], { cwd: repo })
      .toString()
      .trim()
      .split("\n");
    expect(result.commits.map((c) => c.hash)).toEqual(hashes);
  });
});
