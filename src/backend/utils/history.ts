import { createHash } from "node:crypto";
import { lstat, readFile, readlink } from "node:fs/promises";
import path from "node:path";

import type { SimpleGit } from "simple-git";

import type { HistoryEntry, HistoryPage } from "@/backend/types";

export const HISTORY_PAGE_SIZE = 100;
export const HISTORY_FORMAT = "NGG-HISTORY%x00%H%x00%P%x00%an%x00%ae%x00%at%x00%s";

export function pageOffset(offset: number) {
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new Error("Invalid history page.");
  }
  return offset;
}

/** NUL fields preserve tabs and newlines in file names and commit subjects. */
export function parseHistory(text: string): HistoryEntry[] {
  const fields = text.split("\0");
  const entries: HistoryEntry[] = [];
  for (let index = 0; index < fields.length;) {
    const token = fields[index++]!;
    if (token === "" || token === "\n") {
      continue;
    }
    if (token === "NGG-HISTORY" || token === "\nNGG-HISTORY") {
      const [hash, parents, author, email, date, message] = fields.slice(index, index + 6);
      if (!hash || !/^[0-9a-f]{40,64}$/.test(hash) || message === undefined) {
        throw new Error("Git returned an incomplete history record.");
      }
      entries.push({
        hash,
        parentHashes: parents ? parents.split(" ") : [],
        author: author!,
        email: email!,
        date: Number(date),
        message,
        refs: []
      });
      index += 6;
    } else {
      const status = token.replace(/^\n/, "");
      if (!/^[ACDMRTUXB][0-9]*$/.test(status) || entries.length === 0) {
        throw new Error("Git returned an unexpected history record.");
      }
      const before = fields[index++]!;
      const after = /^[RC]/.test(status) ? fields[index++]! : before;
      Object.assign(entries.at(-1)!, { previousPath: before, filePath: after, change: status });
    }
  }
  return entries;
}

export function historyPage(entries: HistoryEntry[]): HistoryPage {
  return { entries: entries.slice(0, HISTORY_PAGE_SIZE), more: entries.length > HISTORY_PAGE_SIZE };
}

export function repoFile(value: string) {
  const file = path.sep === "\\" ? value.replaceAll("\\", "/") : value;
  if (
    !file ||
    file.includes("\0") ||
    path.isAbsolute(file) ||
    file
      .split("/")
      .some((part) => !part || part === "." || part === ".." || part.toLowerCase() === ".git")
  ) {
    throw new Error("Choose a file path inside the repository.");
  }
  return file;
}

export const literalPath = (value: string) => ":(literal)" + repoFile(value);

/** Refuse traversal through a symlink; Git may create missing parent directories. */
export async function checkedWorktreePath(git: SimpleGit, file: string) {
  const root = (await git.raw(["rev-parse", "--show-toplevel"])).replace(/\n$/, "");
  const relative = repoFile(file);
  let directory = root;
  for (const part of relative.split("/").slice(0, -1)) {
    directory = path.join(directory, part);
    try {
      // Validate each ancestor before inspecting anything below it.
      // eslint-disable-next-line no-await-in-loop
      const stat = await lstat(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw new Error("A parent of this file is not a normal directory.");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }
  return path.join(root, relative);
}

export async function fileSnapshot(git: SimpleGit, file: string) {
  const absolute = await checkedWorktreePath(git, file);
  const digest = createHash("sha256");
  try {
    const stat = await lstat(absolute);
    if (!stat.isFile() && !stat.isSymbolicLink()) {
      throw new Error("Choose a file, not a directory.");
    }
    digest.update(String(stat.mode));
    digest.update(stat.isSymbolicLink() ? await readlink(absolute) : await readFile(absolute));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
    digest.update("missing");
  }
  digest.update(await git.raw(["ls-files", "--stage", "-z", "--", literalPath(file)]));
  return digest.digest("hex");
}
