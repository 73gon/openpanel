export interface ConfirmAction {
  /** The question being decided: "Delete the library “Manga”?" */
  title: string
  /** What is lost and what is kept. */
  description: string
  /** The action, named: "Delete library". */
  confirmLabel: string
  onConfirm: () => void
}
