import * as l10n from "@vscode/l10n";
import type { SimpleGit } from "simple-git";

import type {
  DateType,
  GitCommitNode,
  GitLogEntry,
  GitRefData,
  QueryResult
} from "@/backend/types";
import { branchListRef } from "@/backend/utils/refs";
import { remoteVisibility } from "@/backend/utils/remoteVisibility";

const eolRegex = /\r\n|\r|\n/g;
const LOG_FIELDS = 6;

type LoadCommitsInput = {
  branchName: string;
  maxCommits: number;
  showRemoteBranches: boolean;
  hiddenRemotes?: string[];
  hard: boolean;
  dateType: DateType;
  showUncommittedChanges: boolean;
};

async function getRefs(
  git: SimpleGit,
  showRemoteBranches: boolean,
  excluded: ReadonlySet<string>
): Promise<GitRefData> {
  const args = ["show-ref"];
  if (!showRemoteBranches) {
    args.push("--heads", "--tags");
  }
  args.push("-d", "--head");
  const stdout = await git.raw(args);
  const refData: GitRefData = { head: null, refs: [] };
  const lines = stdout.split(eolRegex);
  for (const line of lines.slice(0, -1)) {
    const parts = line.split(" ");
    if (parts.length < 2) {
      continue;
    }
    const hash = parts.shift()!;
    const ref = parts.join(" ");
    if (ref.startsWith("refs/heads/")) {
      refData.refs.push({ hash, name: ref.substring(11), type: "head" });
    } else if (ref.startsWith("refs/tags/")) {
      refData.refs.push({
        hash,
        name: ref.endsWith("^{}") ? ref.substring(10, ref.length - 3) : ref.substring(10),
        type: "tag"
      });
    } else if (ref.startsWith("refs/remotes/") && !excluded.has(ref.substring(13))) {
      refData.refs.push({ hash, name: ref.substring(13), type: "remote" });
    } else if (ref === "HEAD") {
      refData.head = hash;
    }
  }
  return refData;
}

async function getLog(
  git: SimpleGit,
  branch: string,
  head: string | null,
  maxCommits: number,
  remoteArgs: string[],
  dateType: DateType
): Promise<GitLogEntry[]> {
  const dateField = dateType === "Author Date" ? "%at" : "%ct";
  // With -z, fields and records both end in NUL, so no character in a name or subject can
  // split a record.
  const format = ["%H", "%P", "%an", "%ae", dateField, "%s"].join("%x00");
  const args = ["log", "-z", `--max-count=${maxCommits}`, `--format=${format}`, "--date-order"];
  if (branch !== "") {
    args.push(branchListRef(branch));
  } else {
    args.push("--branches", "--tags");
    args.push(...remoteArgs);
    // Detached HEAD may not be reachable from any visible ref. Use the resolved
    // hash so an unborn HEAD never turns an otherwise valid query into an error.
    if (head !== null) {
      args.push(head);
    }
  }
  args.push("--");
  return parseLog(await git.raw(args));
}

/** Parse NUL-separated log records, refusing output that is not whole records. */
export function parseLog(stdout: string): GitLogEntry[] {
  if (stdout === "") {
    return [];
  }
  const fields = stdout.split("\0");
  // Each record ends in NUL, so a complete output leaves one empty string after the split.
  if (fields.pop() !== "" || fields.length % LOG_FIELDS !== 0) {
    throw new Error(l10n.t("Git returned an incomplete graph record."));
  }
  const commits: GitLogEntry[] = [];
  for (let index = 0; index < fields.length; index += LOG_FIELDS) {
    const [hash, parents, author, email, date, message] = fields.slice(index, index + LOG_FIELDS);
    if (!/^[0-9a-f]{40,64}$/.test(hash!) || !/^\d+$/.test(date!)) {
      throw new Error(l10n.t("Git returned an incomplete graph record."));
    }
    commits.push({
      hash: hash!,
      parentHashes: parents === "" ? [] : parents!.split(" "),
      author: author!,
      email: email!,
      date: Number(date),
      message: message!
    });
  }
  return commits;
}

async function countUnsavedChanges(git: SimpleGit) {
  const status = await git.status(["--untracked-files=all"]);
  return status.files.length;
}

/** `repo` and `branchName` are echoed back by the message layer, not by the query. */
type LoadCommitsResult = Omit<QueryResult<"loadCommits">, "repo" | "branchName">;

export async function loadCommits(
  git: SimpleGit,
  input: LoadCommitsInput
): Promise<LoadCommitsResult> {
  const { branchName, maxCommits, showRemoteBranches, hard, dateType, showUncommittedChanges } =
    input;
  const visibility = await remoteVisibility(git, input);

  const refData = await getRefs(git, showRemoteBranches, visibility.excluded);
  const rawCommits = await getLog(
    git,
    branchName,
    refData.head,
    maxCommits + 1,
    visibility.logArgs,
    dateType
  );

  let commits = rawCommits;
  const moreCommitsAvailable = commits.length === maxCommits + 1;
  if (moreCommitsAvailable) {
    commits = commits.slice(0, -1);
  }

  let uncommittedChanges = 0;
  if (refData.head !== null && showUncommittedChanges) {
    for (const commit of commits) {
      if (refData.head === commit.hash) {
        uncommittedChanges = await countUnsavedChanges(git);
        if (uncommittedChanges > 0) {
          // The webview names this row, so that the name is localized.
          commits.unshift({
            hash: "*",
            parentHashes: [refData.head],
            author: "*",
            email: "",
            date: Math.round(new Date().getTime() / 1000),
            message: ""
          });
        }
        break;
      }
    }
  }

  const commitNodes: GitCommitNode[] = [];
  const commitLookup: { [hash: string]: number } = {};
  for (const [i, commit] of commits.entries()) {
    commitLookup[commit.hash] = i;
    commitNodes.push({
      hash: commit.hash,
      parentHashes: commit.parentHashes,
      author: commit.author,
      email: commit.email,
      date: commit.date,
      message: commit.message,
      refs: []
    });
  }
  for (const ref of refData.refs) {
    const commitIndex = commitLookup[ref.hash];
    if (commitIndex !== undefined) {
      commitNodes[commitIndex]?.refs.push(ref);
    }
  }

  return {
    commits: commitNodes,
    head: refData.head,
    moreCommitsAvailable,
    hard,
    uncommittedChanges
  };
}
