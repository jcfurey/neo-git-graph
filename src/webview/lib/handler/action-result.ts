import type { ActionResponse } from "@/backend/types";
import type { LocalizedStrings } from "@/extension/l10n/webviewL10n";
import { closeDialog, openErrorDialog, refresh } from "@/webview/lib/actions";
import { acceptRemoteActionResult } from "@/webview/lib/remote-actions";
import { requestRepositoryState } from "@/webview/lib/repository-actions";
import { selectedRepo } from "@/webview/lib/stores";

const ERROR_KEY: Record<ActionResponse["command"], keyof LocalizedStrings> = {
  repositoryAction: "unableToRunGitAction",
  addTag: "unableToAddTag",
  checkoutBranch: "unableToCheckoutBranch",
  checkoutCommit: "unableToCheckoutCommit",
  cherrypickCommit: "unableToCherryPick",
  createBranch: "unableToCreateBranch",
  deleteBranch: "unableToDeleteBranch",
  deleteTag: "unableToDeleteTag",
  mergeBranch: "unableToMergeBranch",
  mergeCommit: "unableToMergeCommit",
  pushTag: "unableToPushTag",
  pushBranch: "unableToPushBranch",
  pullBranch: "unableToPullBranch",
  fetchRemote: "unableToFetch",
  renameBranch: "unableToRenameBranch",
  resetToCommit: "unableToReset",
  revertCommit: "unableToRevert"
};

/** Every git command answers the same way, so one handler serves them all. */
export function handleActionResult(msg: ActionResponse) {
  if (msg.repo === undefined || msg.repo === selectedRepo.value) {
    requestRepositoryState();
  }
  if (!acceptRemoteActionResult(msg)) {
    return;
  }
  if (msg.status === null) {
    closeDialog();
    refresh();
    return;
  }

  openErrorDialog(window.l10n[ERROR_KEY[msg.command]], msg.status);
}
