import { isAbsolute, sep } from "node:path";

import type { SimpleGit } from "simple-git";
import * as vscode from "vscode";

import { normalizeRepoPath } from "@/backend/utils/repoPath";

const OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const EMPTY_OBJECT_ID = /^0+$/;

/**
 * Repositories this session encoded documents for. Links, other extensions, and `vscode.open`
 * can open any `neo-git-graph:` URI, so a URI naming another directory never starts Git.
 */
const openedRepos = new Set<string>();

export class DiffDocProvider implements vscode.TextDocumentContentProvider {
  public static scheme = "neo-git-graph";
  private forRepo: (repo: string) => SimpleGit;
  private isSavedRepo: (repo: string) => boolean;
  private onDidChangeEventEmitter = new vscode.EventEmitter<vscode.Uri>();
  private docs = new Map<string, DiffDocument>();
  private subscriptions: vscode.Disposable;

  /** `isSavedRepo` lets editors restored from an earlier session reopen their repositories. */
  constructor(forRepo: (repo: string) => SimpleGit, isSavedRepo: (repo: string) => boolean) {
    this.forRepo = forRepo;
    this.isSavedRepo = isSavedRepo;
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

    const request = decodeDiffDocUri(uri);
    const revision = diffDocRevision(request);
    if (
      revision === null ||
      request.repo === undefined ||
      !isAbsolute(request.repo) ||
      !(
        openedRepos.has(normalizeRepoPath(request.repo)) ||
        this.isSavedRepo(normalizeRepoPath(request.repo))
      )
    ) {
      return "";
    }
    let git: SimpleGit;
    try {
      git = this.forRepo(request.repo);
    } catch {
      return "";
    }
    return git
      .show(["--end-of-options", revision])
      .catch(() => "")
      .then((data) => {
        let doc = new DiffDocument(data);
        this.docs.set(uri.toString(), doc);
        return doc.value;
      });
  }
}

/** The object `git show` reads, or null for an empty document or a URI this extension did not create. */
function diffDocRevision(request: ReturnType<typeof decodeDiffDocUri>) {
  const commit = request.commit ?? "";
  const id = !request.blob && commit.endsWith("^") ? commit.slice(0, -1) : commit;
  if (!OBJECT_ID.test(id) || EMPTY_OBJECT_ID.test(id)) {
    return null;
  }
  return request.blob ? commit : `${commit}:${request.filePath}`;
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
  openedRepos.add(normalizeRepoPath(repo));
  return vscode.Uri.from({
    scheme: DiffDocProvider.scheme,
    path: sep === "\\" ? path.replaceAll("\\", "/") : path,
    query: "commit=" + encodeURIComponent(commit) + "&repo=" + encodeURIComponent(repo)
  });
}

export function decodeDiffDocUri(uri: vscode.Uri) {
  let queryArgs = decodeUriQueryArgs(uri.query);
  return {
    filePath: uri.path,
    commit: queryArgs.commit,
    repo: queryArgs.repo,
    ...(queryArgs.blob === "1" ? { blob: true } : {})
  };
}

export function encodeDiffBlobUri(repo: string, path: string, blob: string | null): vscode.Uri {
  const uri = encodeDiffDocUri(repo, path, blob ?? "0".repeat(40));
  return uri.with({ query: uri.query + "&blob=1" });
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
        // A malformed escape leaves the argument missing, so the document is empty.
      }
    }
  }
  return queryArgs;
}
