/** Open dialogs and inline editors may contain drafts that a reload would discard. */
export function approveWorkspaceReload(root: Pick<ParentNode, 'querySelector'>, confirmDiscard: () => boolean) {
  return !root.querySelector('dialog[open] form, .inline-editor form') || confirmDiscard()
}
