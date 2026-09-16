import type { GitCommitNode } from "@/backend/types";
import type { BranchRelation, GraphLine } from "@/webview/graph/types";

export function commitRelations(
  commits: GitCommitNode[],
  focus: { direct: string[]; merged: string[] } | null
): BranchRelation[] {
  if (focus === null) {
    return commits.map(() => "normal");
  }
  const direct = new Set(focus.direct);
  const merged = new Set(focus.merged);
  return commits.map(({ hash }) =>
    hash === "*"
      ? "normal"
      : direct.has(hash)
        ? "direct"
        : merged.has(hash)
          ? "merged"
          : "unrelated"
  );
}

/** Colour the Git edge, not whichever commit happens to share its lane or row. */
export function lineRelation(
  line: GraphLine,
  commits: GitCommitNode[],
  relations: BranchRelation[]
): BranchRelation {
  const relation = relations[line.child] ?? "normal";
  if (relation !== "direct" || line.parent === null) {
    return relation;
  }
  return commits[line.child]?.parentHashes[0] === commits[line.parent]?.hash ? "direct" : "merged";
}

export function focusColour(
  colour: string | undefined,
  relation: BranchRelation,
  keepMergedBright = false
): string {
  const base = colour ?? "var(--vscode-focusBorder)";
  if (relation === "unrelated") {
    return "var(--vscode-descriptionForeground, #808080)";
  }
  if (relation === "merged" && !keepMergedBright) {
    return `color-mix(in srgb, ${base} 40%, var(--vscode-descriptionForeground, #808080))`;
  }
  return base;
}
