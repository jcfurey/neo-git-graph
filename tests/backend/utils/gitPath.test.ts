import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterAll, beforeAll, expect, it } from "vitest";

import { gitClientFactory } from "@/backend/gitClient";
import { loadCommits } from "@/backend/queries/loadCommits";
import { searchDirectoryForRepos } from "@/backend/utils/repoSearch";

import { makeRepo } from "@tests/backend/helpers";

let repo: string;
let dir: string;
let gitPath: string;

beforeAll(() => {
  repo = makeRepo();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ngg-portable "));
  if (process.platform === "win32") {
    // Git for Windows installs below "C:\Program Files".
    gitPath = execFileSync("where", ["git"]).toString().split(/\r?\n/)[0]!.trim();
  } else {
    const real = execFileSync("sh", ["-c", "command -v git"]).toString().trim();
    gitPath = path.join(dir, "Git (portable)", "git");
    fs.mkdirSync(path.dirname(gitPath));
    fs.symlinkSync(real, gitPath);
  }
});

afterAll(() => {
  fs.rmSync(repo, { recursive: true, force: true });
  fs.rmSync(dir, { recursive: true, force: true });
});

it("loads the graph and finds repositories with a Git path containing spaces", async () => {
  expect(gitPath).toMatch(/ /);
  const graph = await loadCommits(gitClientFactory(repo, gitPath).getInstance(), {
    branchName: "",
    maxCommits: 10,
    showRemoteBranches: true,
    hard: false,
    dateType: "Author Date",
    showUncommittedChanges: true
  });
  expect(graph.commits.map((commit) => commit.message)).toEqual(["init"]);
  expect(await searchDirectoryForRepos(repo, 0, gitPath, [])).toEqual([repo]);
});
