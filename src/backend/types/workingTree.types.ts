export type WorkingTreeGroup = "unstaged" | "staged" | "untracked" | "conflicts";

export type WorkingTreeFile = {
  path: string;
  oldPath: string;
  status: string;
  group: WorkingTreeGroup;
};
