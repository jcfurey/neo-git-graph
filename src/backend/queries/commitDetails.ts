import type { SimpleGit } from "simple-git";

import type {
  DateType,
  GitCommitDetails,
  GitFileChange,
  GitFileChangeType,
  QueryResult
} from "@/backend/types";

const eolRegex = /\r\n|\r|\n/g;
const gitLogSeparator = "XX7Nal-YARtTpjCikii9nJxER19D6diSyk-AWkPb";

type CommitDetailsInput = {
  commitHash: string;
  dateType: DateType;
};

async function fetchCommitInfo(
  git: SimpleGit,
  commitHash: string,
  dateType: DateType
): Promise<GitCommitDetails> {
  const dateField = dateType === "Author Date" ? "%at" : "%ct";
  const format = ["%H", "%P", "%an", "%ae", dateField, "%cn"].join(gitLogSeparator) + "%n%B";
  const stdout = await git.raw([
    "show",
    "--quiet",
    `--format=${format}`,
    "--end-of-options",
    commitHash
  ]);
  const lines = stdout.split(eolRegex);
  let lastLine = lines.length - 1;
  while (lastLine >= 0 && lines[lastLine] === "") {
    lastLine--;
  }
  const firstLine = lines[0];
  if (firstLine === undefined) {
    throw new Error("No commit information returned by Git");
  }
  const [hash, parents, author, email, date, committer] = firstLine.split(gitLogSeparator);
  if (
    hash === undefined ||
    parents === undefined ||
    author === undefined ||
    email === undefined ||
    date === undefined ||
    committer === undefined
  ) {
    throw new Error("Invalid commit information returned by Git");
  }
  return {
    hash,
    parents: parents.split(" "),
    author,
    email,
    date: parseInt(date),
    committer,
    body: lines.slice(1, lastLine + 1).join("\n"),
    fileChanges: []
  };
}

const OBJECT_ID = /^[0-9a-f]{40,64}$/;

/**
 * NUL-separated records keep names with tabs, quotes, newlines, backslashes, and non-ASCII
 * characters exactly as Git stores them. With `-m`, a merge's first-parent changes come first.
 */
async function diffTree(git: SimpleGit, commitHash: string, format: "--name-status" | "--numstat") {
  const fields = (
    await git.raw([
      "diff-tree",
      format,
      "-z",
      "-r",
      "-m",
      "--root",
      "--find-renames",
      "--diff-filter=AMDR",
      "--end-of-options",
      commitHash
    ])
  ).split("\0");
  // Each parent's changes start with the commit's own ID. A commit without changes has none.
  if (fields.length === 1 && fields[0] === "") {
    return [];
  }
  if (!OBJECT_ID.test(fields[0] ?? "")) {
    throw new Error("Invalid file changes returned by Git");
  }
  return fields.slice(1);
}

function parseNameStatus(fields: string[]): GitFileChange[] {
  const changes: GitFileChange[] = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index++]!;
    if (status === "" || OBJECT_ID.test(status)) {
      break;
    }
    const type = status[0] as GitFileChangeType;
    const oldFilePath = fields[index++];
    const newFilePath = type === "R" ? fields[index++] : oldFilePath;
    if (!/^[AMDR]/.test(status) || oldFilePath === undefined || newFilePath === undefined) {
      throw new Error("Invalid file changes returned by Git");
    }
    changes.push({ oldFilePath, newFilePath, type, additions: null, deletions: null });
  }
  return changes;
}

function parseNumStat(fields: string[]) {
  const counts = new Map<string, { additions: number | null; deletions: number | null }>();
  for (let index = 0; index < fields.length;) {
    const entry = /^(\d+|-)\t(\d+|-)\t([^]*)$/.exec(fields[index++]!);
    if (entry === null) {
      break;
    }
    const [, additions, deletions] = entry;
    let file = entry[3];
    // A rename leaves the path empty; its old and new paths follow as separate fields.
    if (file === "") {
      index += 1;
      file = fields[index++];
    }
    if (file === undefined) {
      break;
    }
    // Binary files have no line counts.
    counts.set(file, {
      additions: additions === "-" ? null : Number(additions),
      deletions: deletions === "-" ? null : Number(deletions)
    });
  }
  return counts;
}

export async function commitDetails(
  git: SimpleGit,
  input: CommitDetailsInput
): Promise<QueryResult<"commitDetails">> {
  try {
    const [details, nameStatus, numStat] = await Promise.all([
      fetchCommitInfo(git, input.commitHash, input.dateType),
      diffTree(git, input.commitHash, "--name-status"),
      diffTree(git, input.commitHash, "--numstat")
    ]);
    const counts = parseNumStat(numStat);
    details.fileChanges = parseNameStatus(nameStatus).map((change) =>
      Object.assign(change, counts.get(change.newFilePath))
    );

    return { commitDetails: details };
  } catch {
    return { commitDetails: null };
  }
}
