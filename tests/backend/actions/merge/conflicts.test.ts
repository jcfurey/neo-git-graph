import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { afterEach, beforeEach, expect, it } from "vitest";

import { mergeBranch, mergeCommit } from "@/backend/actions/merge";
import { createGit } from "@/backend/gitClient";

import { git, makeRepo } from "@tests/backend/helpers";

let repo: string;
let bin: string;

beforeEach(() => {
  repo = makeRepo();
  bin = fs.mkdtempSync(path.join(path.dirname(repo), "ngg-git-"));
  git(["checkout", "-b", "topic"], repo);
  fs.writeFileSync(path.join(repo, "f"), "topic");
  git(["commit", "-am", "topic"], repo);
  git(["checkout", "main"], repo);
  fs.writeFileSync(path.join(repo, "f"), "main");
  git(["commit", "-am", "main"], repo);
});

afterEach(() => {
  fs.rmSync(repo, { recursive: true, force: true });
  fs.rmSync(bin, { recursive: true, force: true });
});

/** Git whose messages are translated, as with a non-English locale. */
function translatedGit() {
  const file = path.join(bin, "git");
  fs.writeFileSync(
    file,
    [
      "#!/bin/sh",
      'output=$(git "$@" 2>&1)',
      "status=$?",
      "printf '%s\\n' \"$output\" | sed -e 's/CONFLICT/KONFLIKT/g' -e 's/Automatic merge failed/Automatischer Merge fehlgeschlagen/g'",
      'exit "$status"'
    ].join("\n"),
    { mode: 0o755 }
  );
  return file;
}

const binaries: Array<[string, () => string]> = [
  ["English", () => "git"],
  // Windows cannot run the shell script as a Git executable.
  ...(process.platform === "win32" ? [] : [["translated", translatedGit] as [string, () => string]])
];

it.each(binaries)("reports a conflicted merge with %s output", async (_, binary) => {
  const executable = binary();
  await expect(
    mergeBranch(
      createGit(repo, executable),
      { branchName: "topic", createNewCommit: true },
      executable
    )
  ).rejects.toThrow("The merge stopped on conflicts");
  expect(fs.existsSync(path.join(repo, ".git", "MERGE_HEAD"))).toBe(true);
  git(["merge", "--abort"], repo);

  const topic = execFileSync("git", ["rev-parse", "topic"], { cwd: repo }).toString().trim();
  await expect(
    mergeCommit(
      createGit(repo, executable),
      { commitHash: topic, createNewCommit: false },
      executable
    )
  ).rejects.toThrow("The merge stopped on conflicts");
});

it("reports other merge failures with Git's own message", async () => {
  fs.writeFileSync(path.join(repo, "f"), "uncommitted");
  await expect(
    mergeBranch(createGit(repo, "git"), { branchName: "topic", createNewCommit: true }, "git")
  ).rejects.toThrow(/overwritten/);
  expect(fs.existsSync(path.join(repo, ".git", "MERGE_HEAD"))).toBe(false);
});
