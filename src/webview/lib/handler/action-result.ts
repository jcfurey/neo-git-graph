import type { ActionResponse } from "@/backend/types";
import type { LocalizedStrings } from "@/extension/l10n/webviewL10n";
import { closeDialog, openErrorDialog, refresh } from "@/webview/lib/actions";
import { acceptRemoteActionResult, actionMutates } from "@/webview/lib/remote-actions";

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
  const mutates = actionMutates(msg);
  if (mutates) {
    refresh();
  }
  if (!acceptRemoteActionResult(msg)) {
    return;
  }
  if (msg.status === null) {
    closeDialog();
    return;
  }

  openErrorDialog(window.l10n[ERROR_KEY[msg.command]], msg.status);
}
