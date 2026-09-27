import * as cp from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { simpleGit } from "simple-git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { mergeBranch, mergeCommit } from "@/backend/actions/merge";

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

const binaries: Array<[string, () => string, string]> = [
  ["English", () => "git", "CONFLICT (content): Merge conflict in f"]
];
// Windows cannot run the shell script as a Git executable.
if (process.platform !== "win32") {
  binaries.push(["translated", translatedGit, "KONFLIKT (content): Merge conflict in f"]);
}

describe("merge conflicts", () => {
  it.each(binaries)("reports a conflicted merge with %s output", async (_, binary, message) => {
    const executable = binary();
    await expect(
      mergeBranch(simpleGit({ baseDir: repo, binary: executable }), {
        branchName: "topic",
        createNewCommit: true
      })
    ).rejects.toThrow(message);
    expect(fs.existsSync(path.join(repo, ".git", "MERGE_HEAD"))).toBe(true);
    git(["merge", "--abort"], repo);

    const topic = cp.execFileSync("git", ["rev-parse", "topic"], { cwd: repo }).toString().trim();
    await expect(
      mergeCommit(simpleGit({ baseDir: repo, binary: executable }), {
        commitHash: topic,
        createNewCommit: false
      })
    ).rejects.toThrow(message);
    expect(fs.existsSync(path.join(repo, ".git", "MERGE_HEAD"))).toBe(true);
  });
});
