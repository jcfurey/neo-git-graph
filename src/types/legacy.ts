import type {
  ActionRequest,
  ActionResponse,
  GitFileChangeType,
  GraphQueryCommand,
  QueryRequest,
  QueryResponse
} from "@/backend/types";

export type GitRepoSet = { [repo: string]: GitRepoState };
export type BranchDisplay = "filter" | "focus" | "ancestors";
export type FocusDimming = "subtle" | "strong";
export type GraphPreferences = {
  branchDisplay: BranchDisplay;
  /** `*` explicitly clears focus; an absent target uses the current branch. */
  focusBranch?: string;
  focusPaused: boolean;
  focusDimming: FocusDimming;
  showRemoteBranches: boolean;
};
export type GitRepoState = {
  /**
   * Width of the graph, date, author and commit column of the commit table, in
   * pixels, padding included. `null` while the browser sizes the table itself.
   * The description column takes the width the others leave.
   */
  columnWidths: number[] | null;
  /** Remote groups hidden from this repository's graph. */
  hiddenRemotes?: string[];
  /** View choices kept per repository in this VS Code workspace. */
  graphPreferences?: GraphPreferences;
};

/* Infrastructure Request / Response Messages */

export type RequestSelectRepo = {
  command: "selectRepo";
  repo: string;
};

export type RequestSaveRepoState = {
  command: "saveRepoState";
  repo: string;
  /** Only changed fields, so independent preference updates cannot overwrite each other. */
  state: Partial<GitRepoState>;
};

export type RequestViewDiff = {
  command: "viewDiff";
  repo: string;
  commitHash: string;
  oldFilePath: string;
  newFilePath: string;
  type: GitFileChangeType;
};
export type ResponseViewDiff = {
  command: "viewDiff";
  success: boolean;
};

export type ResponseRefresh = {
  command: "refresh";
};

export type RequestMessage =
  | { command: "cancelAction"; repo: string; requestId: string }
  | { command: "cancelRepositoryQuery"; repo: string; requestId: string }
  | { command: "viewReady" }
  | ActionRequest
  | QueryRequest
  | RequestSelectRepo
  | RequestSaveRepoState
  | RequestViewDiff;

export type ResponseMessage =
  | { command: "repoState"; repo: string; state: GitRepoState }
  | {
      command: "graphQueryError";
      query: GraphQueryCommand;
      repo: string;
      requestId: string;
      message: string;
    }
  | { command: "fileHistory"; repo: string; path: string }
  | ActionResponse
  | QueryResponse
  | ResponseViewDiff
  | ResponseRefresh;
