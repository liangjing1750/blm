export interface ValueDomainDraftPort {
  markModified(): void;
  renderSidebar?(): void;
  confirm?(message: string, options?: { title?: string; confirmLabel?: string }): Promise<boolean>;
}
