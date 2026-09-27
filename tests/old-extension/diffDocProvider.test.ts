import * as fs from "node:fs";
import * as path from "node:path";

import { simpleGit } from "simple-git";
import { afterAll, beforeEach, expect, it, vi } from "vitest";

import { DiffDocProvider, encodeDiffDocUri } from "@/old-extension/diffDocProvider";

import { git, makeRepo } from "@tests/backend/helpers";

const workspace = vi.hoisted(() => ({
  folders: [] as { uri: { fsPath: string } }[]
}));

vi.mock("vscode", () => ({
  Uri: {
    parse(value: string) {
      const [, scheme = "", uriPath = "", query = ""] =
        /^([^:]*):([^?]*)\??(.*)$/.exec(value) ?? [];
      return { scheme, path: uriPath, query, toString: () => value };
    }
  },
  EventEmitter: class {
    event = () => ({ dispose: () => {} });
    dispose() {}
  },
  workspace: {
    onDidCloseTextDocument: () => ({ dispose: () => {} }),
    get workspaceFolders() {
      return workspace.folders;
    }
  }
}));

const repo = makeRepo();
const other = makeRepo();
const output = path.join(repo, "output");
const opened: string[] = [];

afterAll(() => {
  fs.rmSync(repo, { recursive: true, force: true });
  fs.rmSync(other, { recursive: true, force: true });
});

beforeEach(() => {
  opened.length = 0;
  workspace.folders = [];
});

function provider(savedRepos: string[] = []) {
  return new DiffDocProvider(
    (dir) => {
      opened.push(dir);
      return simpleGit(dir);
    },
    () => savedRepos
  );
}

function uri(query: string, file = "f") {
  return { scheme: DiffDocProvider.scheme, path: file, query, toString: () => query } as never;
}

it("shows files at a commit and its parent from the document's repository", async () => {
  fs.writeFileSync(path.join(repo, "f"), "second");
  git(["commit", "-am", "second"], repo);
  const commit = (await simpleGit(repo).revparse(["HEAD"])).trim();
  const docs = provider();

  expect(await docs.provideTextDocumentContent(encodeDiffDocUri(repo, "f", commit))).toBe("second");
  expect(await docs.provideTextDocumentContent(encodeDiffDocUri(repo, "f", commit + "^"))).toBe(
    "x"
  );
  expect(opened).toEqual([repo, repo]);
});

it.each([
  ["--output", `commit=${encodeURIComponent(`--output=${output}`)}`],
  ["-O", `commit=${encodeURIComponent(`-O${output}`)}`],
  ["--ext-diff", "commit=--ext-diff"],
  ["a symbolic ref", "commit=HEAD"],
  ["an abbreviated hash", "commit=abc1234"]
])("rejects %s without running Git", async (_name, commit) => {
  const content = await provider([repo]).provideTextDocumentContent(
    uri(`${commit}&repo=${encodeURIComponent(repo)}`)
  );
  expect(content).toBe("");
  expect(opened).toEqual([]);
  expect(fs.existsSync(`${output}:f`)).toBe(false);
});

it("rejects relative and unknown repositories without running Git", async () => {
  const commit = (await simpleGit(other).revparse(["HEAD"])).trim();
  const relative = path.relative(process.cwd(), other);
  const docs = provider([relative, "."]);

  const contents = await Promise.all(
    [relative, ".", other].map((dir) =>
      docs.provideTextDocumentContent(uri(`commit=${commit}&repo=${encodeURIComponent(dir)}`))
    )
  );
  expect(contents).toEqual(["", "", ""]);
  expect(opened).toEqual([]);
});

it("reopens documents for repositories with saved state", async () => {
  const commit = (await simpleGit(other).revparse(["HEAD"])).trim();
  const dir = path.dirname(other) + path.sep + path.sep + path.basename(other);
  const content = await provider([other]).provideTextDocumentContent(
    uri(`commit=${commit}&repo=${encodeURIComponent(dir)}`)
  );
  expect(content).toBe("x");
  expect(opened).toEqual([dir]);
});

it("reopens documents for repositories inside a workspace folder", async () => {
  const commit = (await simpleGit(other).revparse(["HEAD"])).trim();
  const request = uri(`commit=${commit}&repo=${encodeURIComponent(other)}`);
  workspace.folders = [{ uri: { fsPath: path.join(other, "sub") } }];
  expect(await provider().provideTextDocumentContent(request)).toBe("");
  workspace.folders = [{ uri: { fsPath: `${other}-sibling` } }];
  expect(await provider().provideTextDocumentContent(request)).toBe("");
  expect(opened).toEqual([]);

  workspace.folders = [{ uri: { fsPath: path.dirname(other) } }];
  expect(await provider().provideTextDocumentContent(request)).toBe("x");
  expect(opened).toEqual([other]);
});

it("returns an empty document for a malformed escape", async () => {
  const content = await provider([repo]).provideTextDocumentContent(
    uri(`commit=%E0%A4%A&repo=${encodeURIComponent(repo)}`)
  );
  expect(content).toBe("");
  expect(opened).toEqual([]);
});
