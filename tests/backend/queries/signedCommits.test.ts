import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, expect, it } from "vitest";

import { createGit } from "@/backend/gitClient";
import { commitDetails } from "@/backend/queries/commitDetails";
import { loadBatchPlan, loadHistory } from "@/backend/queries/history";
import { loadCommits } from "@/backend/queries/loadCommits";
import { repositoryQuery } from "@/backend/queries/repository";
import { loadSyncPlan } from "@/backend/queries/workflows";

import { makeRepo } from "@tests/backend/helpers";

let repo: string;
let remote: string;
const read = (args: string[], cwd = repo) =>
  execFileSync("git", args, { cwd, stdio: "pipe" }).toString();
const client = () => createGit(repo, "git");

/**
 * Commit the staged tree with an SSH signature header. It is never verified: the fixture global
 * configuration names no allowed signers file, so Git prints "No signature" into log output
 * without running any program.
 */
function signedCommit(file: string, subject: string) {
  fs.writeFileSync(path.join(repo, file), subject + "\n");
  read(["add", "--", file]);
  const tree = read(["write-tree"]).trim();
  const parent = read(["rev-parse", "HEAD"]).trim();
  const object = [
    `tree ${tree}`,
    `parent ${parent}`,
    "author T <t@t.com> 1700000000 +0000",
    "committer T <t@t.com> 1700000000 +0000",
    "gpgsig -----BEGIN SSH SIGNATURE-----",
    " U1NIU0lHAAAAAQ==",
    " -----END SSH SIGNATURE-----",
    "",
    subject,
    ""
  ].join("\n");
  const hash = execFileSync("git", ["hash-object", "-t", "commit", "-w", "--stdin"], {
    cwd: repo,
    input: object
  })
    .toString()
    .trim();
  read(["update-ref", "HEAD", hash]);
  return hash;
}

beforeEach(() => {
  repo = makeRepo();
  remote = makeRepo();
  read(["remote", "add", "origin", remote]);
  read(["fetch", "-q", "origin"]);
  // The user's configuration asks for signature output and color everywhere.
  read(["config", "log.showSignature", "true"]);
  read(["config", "color.ui", "always"]);
});

afterEach(() => {
  fs.rmSync(repo, { recursive: true, force: true });
  fs.rmSync(remote, { recursive: true, force: true });
});

it("parses signed commits in every view that reads commit subjects", async () => {
  const base = read(["rev-parse", "HEAD"]).trim();
  const first = signedCommit("a", "first signed");
  const second = signedCommit("b", "second signed");
  // Without the backend's overrides, the configuration corrupts parsed output.
  expect(read(["log", "--format=%s", "-2"])).not.toBe("second signed\nfirst signed\n");

  const graph = await loadCommits(client(), {
    branchName: "",
    maxCommits: 10,
    showRemoteBranches: true,
    hard: false,
    dateType: "Author Date",
    showUncommittedChanges: true
  });
  expect(graph.commits.map((commit) => commit.message)).toEqual([
    "second signed",
    "first signed",
    "init"
  ]);
  expect(graph.moreCommitsAvailable).toBe(false);

  const details = (await commitDetails(client(), { commitHash: second, dateType: "Author Date" }))
    .commitDetails;
  expect(details).toMatchObject({ hash: second, body: "second signed" });
  expect(details?.fileChanges.map((change) => change.newFilePath)).toEqual(["b"]);

  const history = await loadHistory(
    client(),
    { text: "", author: "", since: "", until: "", path: "", revision: "", follow: false },
    0
  );
  expect(history.entries.map((entry) => entry.message)).toEqual([
    "second signed",
    "first signed",
    "init"
  ]);

  const batch = await loadBatchPlan(client(), [first, second]);
  expect(batch.entries.map((entry) => entry.message)).toEqual(["first signed", "second signed"]);

  const rebase = await repositoryQuery(client(), { kind: "rebasePlan", base, autosquash: false });
  expect(rebase.kind === "rebasePlan" && rebase.plan.entries.map((entry) => entry.message)).toEqual(
    ["first signed", "second signed"]
  );

  const sync = await loadSyncPlan(client(), "main", "origin", "main");
  expect(sync.outgoing.entries.map((entry) => entry.message)).toEqual([
    "second signed",
    "first signed"
  ]);

  read(["bisect", "start", second, base]);
  try {
    const bisect = await repositoryQuery(client(), { kind: "bisect" });
    expect(bisect.kind === "bisect" && bisect.state?.subject).toBe("first signed");
  } finally {
    read(["bisect", "reset"]);
  }
});
