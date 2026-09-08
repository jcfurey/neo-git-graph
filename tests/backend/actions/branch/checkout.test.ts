import * as cp from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { simpleGit } from "simple-git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { checkoutBranch } from "@/backend/actions/branch";

import { git, makeRepo } from "@tests/backend/helpers";

let repo: string;
let remote: string;

function readGit(args: string[], cwd = repo): string {
  return cp.execFileSync("git", args, { cwd, stdio: "pipe" }).toString().trim();
}

function advanceRemote() {
  fs.writeFileSync(path.join(remote, "f"), "remote update");
  git(["add", "f"], remote);
  git(["commit", "-m", "remote update"], remote);
  git(["fetch", "origin"], repo);
  return readGit(["rev-parse", "origin/main"]);
}

beforeEach(() => {
  remote = makeRepo();
  repo = fs.mkdtempSync(path.join(os.tmpdir(), "ngg-checkout-"));
  git(["clone", remote, repo], remote);
  git(["config", "user.name", "T"], repo);
  git(["config", "user.email", "t@t.com"], repo);
  git(["config", "commit.gpgsign", "false"], repo);
  git(["config", "branch.autoSetupMerge", "true"], repo);
  git(["config", "merge.autoStash", "false"], repo);
  git(["branch", "other"], repo);
});

afterEach(() => {
  fs.rmSync(repo, { recursive: true, force: true });
  fs.rmSync(remote, { recursive: true, force: true });
});

describe("checkoutBranch", () => {
  it("checks out an existing local branch", async () => {
    await checkoutBranch(simpleGit(repo), { branchName: "other", remoteBranch: null });
    expect(readGit(["branch", "--show-current"])).toBe("other");
  });

  it("leaves a stale branch unchanged when checking out its local ref", async () => {
    const original = readGit(["rev-parse", "HEAD"]);
    advanceRemote();
    git(["checkout", "other"], repo);
    await checkoutBranch(simpleGit(repo), { branchName: "main", remoteBranch: null });
    expect(readGit(["branch", "--show-current"])).toBe("main");
    expect(readGit(["rev-parse", "HEAD"])).toBe(original);
  });

  it("creates a new tracking branch at the selected remote revision", async () => {
    const latest = advanceRemote();
    await checkoutBranch(simpleGit(repo), {
      branchName: "from-remote",
      remoteBranch: "origin/main"
    });
    expect(readGit(["branch", "--show-current"])).toBe("from-remote");
    expect(readGit(["rev-parse", "HEAD"])).toBe(latest);
    expect(readGit(["rev-parse", "--abbrev-ref", "@{upstream}"])).toBe("origin/main");
  });

  it("throws when checking out a nonexistent local branch", async () => {
    await expect(
      checkoutBranch(simpleGit(repo), { branchName: "nonexistent", remoteBranch: null })
    ).rejects.toThrow();
  });

  it("reuses an existing branch when it is already at the remote revision", async () => {
    await checkoutBranch(simpleGit(repo), { branchName: "other", remoteBranch: "origin/main" });
    expect(readGit(["branch", "--show-current"])).toBe("other");
    expect(readGit(["rev-parse", "HEAD"])).toBe(readGit(["rev-parse", "origin/main"]));
  });

  it("switches to a stale local branch and fast-forwards it to the selected remote", async () => {
    const latest = advanceRemote();
    git(["checkout", "other"], repo);
    await checkoutBranch(simpleGit(repo), { branchName: "main", remoteBranch: "origin/main" });
    expect(readGit(["branch", "--show-current"])).toBe("main");
    expect(readGit(["rev-parse", "HEAD"])).toBe(latest);
    expect(readGit(["rev-parse", "--abbrev-ref", "@{upstream}"])).toBe("origin/main");
    expect(fs.readFileSync(path.join(repo, "f"), "utf8")).toBe("remote update");
  });

  it("fast-forwards the current branch even when merge.ff is false", async () => {
    const latest = advanceRemote();
    git(["config", "merge.ff", "false"], repo);
    await checkoutBranch(simpleGit(repo), { branchName: "main", remoteBranch: "origin/main" });
    expect(readGit(["rev-parse", "HEAD"])).toBe(latest);
    expect(readGit(["status", "--porcelain"])).toBe("");
  });

  it("preserves local commits when the branch is ahead of the remote", async () => {
    git(["commit", "--allow-empty", "-m", "local work"], repo);
    const local = readGit(["rev-parse", "HEAD"]);
    git(["checkout", "other"], repo);
    await checkoutBranch(simpleGit(repo), { branchName: "main", remoteBranch: "origin/main" });
    expect(readGit(["branch", "--show-current"])).toBe("main");
    expect(readGit(["rev-parse", "HEAD"])).toBe(local);
  });

  it("refuses to merge diverged history and preserves local commits", async () => {
    git(["commit", "--allow-empty", "-m", "local work"], repo);
    const local = readGit(["rev-parse", "HEAD"]);
    advanceRemote();
    await expect(
      checkoutBranch(simpleGit(repo), { branchName: "main", remoteBranch: "origin/main" })
    ).rejects.toThrow(/fast-forward/i);
    expect(readGit(["rev-parse", "HEAD"])).toBe(local);
    expect(readGit(["status", "--porcelain"])).toBe("");
    expect(fs.existsSync(path.join(repo, ".git", "MERGE_HEAD"))).toBe(false);
  });

  it("preserves uncommitted changes that would be overwritten by the update", async () => {
    const original = readGit(["rev-parse", "HEAD"]);
    advanceRemote();
    fs.writeFileSync(path.join(repo, "f"), "unfinished local work");
    await expect(
      checkoutBranch(simpleGit(repo), { branchName: "main", remoteBranch: "origin/main" })
    ).rejects.toThrow(/would be overwritten/i);
    expect(readGit(["rev-parse", "HEAD"])).toBe(original);
    expect(fs.readFileSync(path.join(repo, "f"), "utf8")).toBe("unfinished local work");
    expect(fs.existsSync(path.join(repo, ".git", "MERGE_HEAD"))).toBe(false);
  });
});
