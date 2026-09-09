import type { GitCommitDetails, GitCommitNode } from "./git.types";
import type { RepositoryQuery, RepositoryQueryData } from "./repository.types";

type QueryPayloads = {
  repositoryQuery: {
    request: { repo: string; requestId: string; query: RepositoryQuery };
    response: {
      repo: string;
      requestId: string;
      data: RepositoryQueryData | null;
      status: string | null;
    };
  };
  loadRemotes: {
    request: { repo: string; requestId: string; branchName: string | null };
    response: {
      repo: string;
      requestId: string;
      remotes: string[];
      upstream: { remote: string; branchName: string } | null;
      pushRemote: string | null;
      status: string | null;
    };
  };
  commitDetails: {
    request: { repo: string; commitHash: string };
    response: { commitDetails: GitCommitDetails | null };
  };
  loadBranches: {
    request: { repo: string; showRemoteBranches: boolean; hard: boolean };
    response: {
      repo: string;
      branches: string[];
      head: string | null;
      hard: boolean;
      isRepo: boolean;
    };
  };
  loadCommits: {
    request: {
      repo: string;
      branchName: string;
      maxCommits: number;
      showRemoteBranches: boolean;
      hard: boolean;
    };
    response: {
      repo: string;
      branchName: string;
      commits: GitCommitNode[];
      head: string | null;
      moreCommitsAvailable: boolean;
      hard: boolean;
      /** Number of unsaved changes. `0` when the uncommitted row is absent. */
      uncommittedChanges: number;
    };
  };
};

export type QueryRequest = {
  [K in keyof QueryPayloads]: { command: K } & QueryPayloads[K]["request"];
}[keyof QueryPayloads];

export type QueryResponse = {
  [K in keyof QueryPayloads]: { command: K } & QueryPayloads[K]["response"];
}[keyof QueryPayloads];

export type QueryResult<T extends keyof QueryPayloads> = QueryPayloads[T]["response"];
