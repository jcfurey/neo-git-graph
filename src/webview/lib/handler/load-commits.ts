import { batch } from "@preact/signals";

import type { ResponseMessage } from "@/types";
import { closeCommitDetails } from "@/webview/lib/actions";
import { acceptGraphResponse } from "@/webview/lib/graph-requests";
import {
  commitHead,
  commitList,
  expandedCommit,
  displayedBranch,
  moreCommitsAvailable,
  selectedRepo,
  remoteVisibilityKey,
  uncommittedChanges
} from "@/webview/lib/stores";

type LoadCommitsMessage = Extract<ResponseMessage, { command: "loadCommits" }>;

export function handleLoadCommits(msg: LoadCommitsMessage) {
  const requested = displayedBranch();

  if (
    msg.repo !== selectedRepo.value ||
    msg.branchName !== requested ||
    (msg.visibilityKey !== undefined && msg.visibilityKey !== remoteVisibilityKey()) ||
    !acceptGraphResponse(msg)
  ) {
    return;
  }

  batch(() => {
    commitList.value = msg.commits;
    commitHead.value = msg.head;
    moreCommitsAvailable.value = msg.moreCommitsAvailable;
    uncommittedChanges.value = msg.uncommittedChanges;

    const expanded = expandedCommit.value;
    if (expanded !== null && !msg.commits.some((commit) => commit.hash === expanded)) {
      closeCommitDetails();
    }
  });
}
