import { isAbsolute, normalize, sep } from "node:path";

import type { SimpleGit } from "simple-git";
import * as vscode from "vscode";

import { getPathFromStr } from "@/backend/utils/path";

const OBJECT_ID_REGEX = /^(?:[0-9a-f]{40}|[0-9a-f]{64})\^?$/;

/** Repositories that diff documents have been encoded for in this session. */
const encodedRepos = new Set<string>();

export class DiffDocProvider implements vscode.TextDocumentContentProvider {
  public static scheme = "neo-git-graph";
  private getGit: (repo: string) => SimpleGit;
  private getSavedRepos: () => string[];
  private onDidChangeEventEmitter = new vscode.EventEmitter<vscode.Uri>();
  private docs = new Map<string, DiffDocument>();
  private subscriptions: vscode.Disposable;

  constructor(getGit: (repo: string) => SimpleGit, getSavedRepos: () => string[]) {
    this.getGit = getGit;
    this.getSavedRepos = getSavedRepos;
    this.subscriptions = vscode.workspace.onDidCloseTextDocument((doc) =>
      this.docs.delete(doc.uri.toString())
    );
  }

  public dispose() {
    this.subscriptions.dispose();
    this.docs.clear();
    this.onDidChangeEventEmitter.dispose();
  }

  get onDidChange() {
    return this.onDidChangeEventEmitter.event;
  }

  public provideTextDocumentContent(uri: vscode.Uri): string | Thenable<string> {
    let document = this.docs.get(uri.toString());
    if (document) {
      return document.value;
    }

    // Any link or extension can open a URI with this scheme, so only full object IDs in
    // repositories known to the extension are passed to Git.
    let request = decodeDiffDocUri(uri);
    if (
      request.repo === undefined ||
      request.commit === undefined ||
      !OBJECT_ID_REGEX.test(request.commit) ||
      !this.isKnownRepo(request.repo)
    ) {
      return "";
    }
    let git: SimpleGit;
    try {
      git = this.getGit(request.repo);
    } catch {
      // simple-git throws when the repository no longer exists.
      return "";
    }
    return git
      .show(["--end-of-options", `${request.commit}:${request.filePath}`])
      .catch(() => "")
      .then((data) => {
        let doc = new DiffDocument(data);
        this.docs.set(uri.toString(), doc);
        return doc.value;
      });
  }

  private isKnownRepo(repo: string) {
    if (!isAbsolute(repo)) {
      return false;
    }
    const normalized = normalizeRepoPath(repo);
    return (
      encodedRepos.has(normalized) ||
      this.getSavedRepos().some((savedRepo) => normalizeRepoPath(savedRepo) === normalized) ||
      // Diff editors that VS Code restores after a restart name repositories in the workspace.
      (vscode.workspace.workspaceFolders ?? []).some((folder) =>
        isWithin(normalized, normalizeRepoPath(folder.uri.fsPath))
      )
    );
  }
}

class DiffDocument {
  private body: string;

  constructor(body: string) {
    this.body = body;
  }

  get value() {
    return this.body;
  }
}

export function encodeDiffDocUri(repo: string, path: string, commit: string): vscode.Uri {
  encodedRepos.add(normalizeRepoPath(repo));
  return vscode.Uri.parse(
    DiffDocProvider.scheme +
      ":" +
      getPathFromStr(path) +
      "?commit=" +
      encodeURIComponent(commit) +
      "&repo=" +
      encodeURIComponent(repo)
  );
}

export function decodeDiffDocUri(uri: vscode.Uri) {
  let queryArgs = decodeUriQueryArgs(uri.query);
  return { filePath: uri.path, commit: queryArgs.commit, repo: queryArgs.repo };
}

function decodeUriQueryArgs(query: string) {
  let queryComps = query.split("&"),
    queryArgs: { [key: string]: string } = {};
  for (const queryComp of queryComps) {
    const separatorIndex = queryComp.indexOf("=");
    if (separatorIndex !== -1) {
      const key = queryComp.slice(0, separatorIndex);
      const value = queryComp.slice(separatorIndex + 1);
      try {
        queryArgs[key] = decodeURIComponent(value);
      } catch {
        // Leave a malformed argument undefined, so the document is empty.
      }
    }
  }
  return queryArgs;
}

/** Whether `dir` is `folder` or a folder below it. */
function isWithin(dir: string, folder: string) {
  return dir === folder || dir.startsWith(folder.endsWith(sep) ? folder : folder + sep);
}

/** Normalize a repository path, so that its separators and drive letter case do not matter. */
function normalizeRepoPath(repo: string) {
  const normalized = normalize(repo);
  return sep === "\\" ? normalized.replace(/^[A-Z]:/, (drive) => drive.toLowerCase()) : normalized;
}
