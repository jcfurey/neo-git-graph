import { batch } from "@preact/signals";

import type { ResponseMessage } from "@/types";
import { SHOW_ALL_BRANCHES } from "@/webview/constants";
import { selectBranch } from "@/webview/lib/actions";
import { acceptGraphResponse } from "@/webview/lib/graph-requests";
import { savedFocusBranch } from "@/webview/lib/navigation";
import {
  branchDisplay,
  branchList,
  headBranch,
  selectedBranch,
  selectedRepo,
  remoteVisibilityKey
} from "@/webview/lib/stores";
import { getWebviewConfig } from "@/webview/lib/webview-config";

type LoadBranchesMessage = Extract<ResponseMessage, { command: "loadBranches" }>;

export function handleLoadBranches(msg: LoadBranchesMessage) {
  if (
    msg.repo !== selectedRepo.value ||
    (msg.visibilityKey !== undefined && msg.visibilityKey !== remoteVisibilityKey()) ||
    !acceptGraphResponse(msg)
  ) {
    return;
  }

  const current = selectedBranch.value;
  const valid =
    current === SHOW_ALL_BRANCHES || (current !== undefined && msg.branches.includes(current));

  batch(() => {
    branchList.value = msg.branches;
    headBranch.value = msg.head;
  });

  if (!valid) {
    const remembered =
      current === undefined && branchDisplay.value !== "filter"
        ? savedFocusBranch(msg.repo)
        : undefined;
    const fallback =
      remembered && (remembered === SHOW_ALL_BRANCHES || msg.branches.includes(remembered))
        ? remembered
        : branchDisplay.value !== "filter" || getWebviewConfig().showCurrentBranchByDefault
          ? (msg.head ?? SHOW_ALL_BRANCHES)
          : SHOW_ALL_BRANCHES;
    selectBranch(fallback);
  }
}
