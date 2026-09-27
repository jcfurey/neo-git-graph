import * as cp from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { gitClientFactory } from "@/backend/gitClient";
import { commitDetails } from "@/backend/queries/commitDetails";
import { loadBranches } from "@/backend/queries/loadBranches";
import { loadCommits } from "@/backend/queries/loadCommits";

import { git, makeRepo } from "@tests/backend/helpers";

let repo: string;
let signedHash: string;

/**
 * Commits the staged tree with a fake SSH signature. With `log.showSignature`, Git prints a
 * verification line such as "No signature" for it, so no signing key is needed.
 */
function commitWithSignature(message: string): string {
  const read = (args: string[]) => cp.execFileSync("git", args, { cwd: repo }).toString().trim();
  const commit = [
    `tree ${read(["write-tree"])}`,
    `parent ${read(["rev-parse", "HEAD"])}`,
    "author T <t@t.com> 1700000000 +0000",
    "committer T <t@t.com> 1700000000 +0000",
    "gpgsig -----BEGIN SSH SIGNATURE-----",
    " U1NIU0lHAAAAAQ==",
    " -----END SSH SIGNATURE-----",
    "",
    message,
    ""
  ].join("\n");
  const hash = cp
    .execFileSync("git", ["hash-object", "-t", "commit", "-w", "--stdin"], {
      cwd: repo,
      input: commit
    })
    .toString()
    .trim();
  git(["update-ref", "HEAD", hash], repo);
  return hash;
}

beforeAll(() => {
  repo = makeRepo();
  git(["branch", "feature"], repo);
  fs.writeFileSync(path.join(repo, "f2"), "y");
  git(["add", "f2"], repo);
  signedHash = commitWithSignature("signed");
  git(["config", "log.showSignature", "true"], repo);
  git(["config", "color.ui", "always"], repo);
});

afterAll(() => {
  fs.rmSync(repo, { recursive: true, force: true });
});

describe("gitClientFactory", () => {
  it("loads commits past a signed commit", async () => {
    const result = await loadCommits(gitClientFactory(repo, "git").getInstance(), {
      branchName: "",
      maxCommits: 300,
      showRemoteBranches: false,
      hard: false,
      dateType: "Author Date",
      showUncommittedChanges: false
    });
    expect(result.commits.map((c) => c.message)).toEqual(["signed", "init"]);
  });

  it("loads the details of a signed commit", async () => {
    const result = await commitDetails(gitClientFactory(repo, "git").getInstance(), {
      commitHash: signedHash,
      dateType: "Author Date"
    });
    expect(result.commitDetails).toMatchObject({ hash: signedHash, body: "signed" });
    expect(result.commitDetails?.fileChanges.map((f) => f.newFilePath)).toEqual(["f2"]);
  });

  it("loads branches without color codes", async () => {
    const result = await loadBranches(gitClientFactory(repo, "git").getInstance(), {
      showRemoteBranches: false,
      hard: false,
      repo,
      gitPath: "git"
    });
    expect(result.head).toBe("main");
    expect(result.branches).toEqual(["main", "feature"]);
  });
});
