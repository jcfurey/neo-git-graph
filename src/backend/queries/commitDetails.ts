import type { SimpleGit } from "simple-git";

import type { DateType, GitCommitDetails, GitFileChangeType, QueryResult } from "@/backend/types";

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
  const stdout = await git.raw(["show", "--quiet", commitHash, `--format=${format}`]);
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

async function fetchNameStatus(git: SimpleGit, commitHash: string): Promise<string[]> {
  const stdout = await git.raw([
    "diff-tree",
    "--name-status",
    "-z",
    "-r",
    "-m",
    "--root",
    "--find-renames",
    "--diff-filter=AMDR",
    commitHash
  ]);
  return stdout.split("\0");
}

async function fetchNumStat(git: SimpleGit, commitHash: string): Promise<string[]> {
  const stdout = await git.raw([
    "diff-tree",
    "--numstat",
    "-z",
    "-r",
    "-m",
    "--root",
    "--find-renames",
    "--diff-filter=AMDR",
    commitHash
  ]);
  return stdout.split("\0");
}

export async function commitDetails(
  git: SimpleGit,
  input: CommitDetailsInput
): Promise<QueryResult<"commitDetails">> {
  try {
    const [details, nameStatusFields, numStatFields] = await Promise.all([
      fetchCommitInfo(git, input.commitHash, input.dateType),
      fetchNameStatus(git, input.commitHash),
      fetchNumStat(git, input.commitHash)
    ]);

    // With -z, fields end in NUL and paths are not quoted. The first field is the commit hash,
    // which -m repeats before each further parent's changes.
    const fileLookup: { [file: string]: number } = {};
    for (let i = 1; i < nameStatusFields.length - 1;) {
      const status = nameStatusFields[i++]!;
      const oldFilePath = nameStatusFields[i++];
      const newFilePath = status.startsWith("R") ? nameStatusFields[i++] : oldFilePath;
      if (!/^[AMDR]\d*$/.test(status) || oldFilePath === undefined || newFilePath === undefined) {
        break;
      }
      fileLookup[newFilePath] = details.fileChanges.length;
      details.fileChanges.push({
        oldFilePath,
        newFilePath,
        type: status[0] as GitFileChangeType,
        additions: null,
        deletions: null
      });
    }

    for (let i = 1; i < numStatFields.length - 1;) {
      const [, additions, deletions, path] =
        /^(\d+|-)\t(\d+|-)\t(.*)$/s.exec(numStatFields[i++]!) ?? [];
      if (additions === undefined || deletions === undefined || path === undefined) {
        break;
      }
      // A rename leaves the path empty and gives its old and new paths as the next two fields.
      let fileName = path;
      if (fileName === "") {
        fileName = numStatFields[i + 1] ?? "";
        i += 2;
      }
      const fileChange = details.fileChanges[fileLookup[fileName] ?? -1];
      if (fileChange !== undefined) {
        // Binary files have no line counts.
        fileChange.additions = additions === "-" ? null : parseInt(additions);
        fileChange.deletions = deletions === "-" ? null : parseInt(deletions);
      }
    }

    return { commitDetails: details };
  } catch {
    return { commitDetails: null };
  }
}
