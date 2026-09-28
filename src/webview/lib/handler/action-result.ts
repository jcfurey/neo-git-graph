import type { ActionResponse } from "@/backend/types";
import type { LocalizedStrings } from "@/old-extension/l10n/webviewL10n";
import { closeDialog, openErrorDialog, refresh } from "@/webview/lib/actions";
import { acceptRemoteActionResult, actionMutates } from "@/webview/lib/remote-actions";
import { selectedRepo } from "@/webview/lib/stores";

/** The string that titles the error dialog when each action fails. */
const failureTitles: Record<ActionResponse["command"], keyof LocalizedStrings> = {
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

/**
 * Settle the extension's answer to a Git action. The graph is reloaded when the action may have
 * changed the repository being viewed, failed or not. Then the running dialog closes, or shows
 * the failure, unless the answer is outdated or its sender reports the outcome itself.
 */
export function handleActionResult(msg: ActionResponse): void {
  // Asked before the answer is accepted, which forgets the action and whether it changes things.
  // An answer without a repository cannot be placed, so it counts as one for the repository shown.
  const reload = actionMutates(msg) && (msg.repo === undefined || msg.repo === selectedRepo.value);
  if (reload) {
    refresh();
  }

  if (!acceptRemoteActionResult(msg)) {
    return;
  }
  if (msg.status === null) {
    closeDialog();
  } else {
    openErrorDialog(window.l10n[failureTitles[msg.command]], msg.status);
  }
}
