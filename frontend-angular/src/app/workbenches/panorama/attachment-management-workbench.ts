import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AttachmentRow, processAttachmentRows, stageAttachmentGroups } from '../../core/export/exporters/attachment-exporter';
import { getAngularRuntimeState } from '../../core/runtime/angular-runtime';
import {
  createProcessEditorLegacyAdapter,
  LegacyPrototypeFile,
  LegacyPrototypeVersion,
  ProcessEditorLegacyAdapter,
} from '../process/editor/process-editor-legacy-adapter';

export interface AttachmentGroup {
  processId: string;
  processName: string;
  processAttachmentCount: number;
  nodeAttachmentCount: number;
  attachedNodeCount: number;
  attachments: AttachmentRow[];
}

export interface AttachmentStageTab {
  id: string;
  name: string;
  processCount: number;
  attachmentCount: number;
}

@Component({
  selector: 'app-attachment-management-workbench',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './attachment-management-workbench.html',
  styleUrls: ['../knowledge/knowledge-workbench.scss', './attachment-management-workbench.scss'],
})
export class AttachmentManagementWorkbench implements OnInit, OnDestroy {
  protected readonly keyword = signal('');
  protected readonly selectedStageId = signal('');
  protected readonly expandedGroupId = signal('');
  protected readonly stageDropdownOpen = signal(false);
  protected readonly version = signal(0);
  private readonly adapter: ProcessEditorLegacyAdapter = createProcessEditorLegacyAdapter();
  private readonly onRefresh = () => this.version.update((value) => value + 1);

  ngOnInit(): void {
    window.addEventListener('blm-workbench-refresh', this.onRefresh);
  }

  ngOnDestroy(): void {
    window.removeEventListener('blm-workbench-refresh', this.onRefresh);
  }

  protected attachmentGroups(): AttachmentGroup[] {
    this.version();
    return buildAttachmentGroups(getAngularRuntimeState().doc as any, this.selectedStageId(), this.keyword());
  }

  protected stageTabs(): AttachmentStageTab[] {
    this.version();
    return buildAttachmentStageTabs(getAngularRuntimeState().doc as any);
  }

  protected visibleStageTabs(): AttachmentStageTab[] {
    return this.stageTabs().slice(0, 5);
  }

  protected overflowStageTabs(): AttachmentStageTab[] {
    return this.stageTabs().slice(5);
  }

  protected totalAttachmentCount(): number {
    return this.attachmentGroups().reduce((sum, group) => sum + group.attachments.length, 0);
  }

  protected processSummary(group: AttachmentGroup): string {
    const parts = [`${group.attachments.length} 个附件`];
    if (group.processAttachmentCount) parts.push(`流程附件 ${group.processAttachmentCount}`);
    if (group.nodeAttachmentCount) parts.push(`节点附件 ${group.nodeAttachmentCount}`);
    return parts.join(' · ');
  }

  protected setKeyword(value: string): void {
    this.keyword.set(value);
  }

  protected selectStage(stageId: string): void {
    this.selectedStageId.set(stageId);
    this.stageDropdownOpen.set(false);
  }

  protected isStageSelected(stageId: string): boolean {
    return this.selectedStageId() === stageId;
  }

  protected toggleStageDropdown(): void {
    this.stageDropdownOpen.update((value) => !value);
  }

  protected toggleExpand(processId: string): void {
    this.expandedGroupId.set(this.expandedGroupId() === processId ? '' : processId);
  }

  protected isExpanded(processId: string): boolean {
    return this.expandedGroupId() === processId;
  }

  protected prototypeUid(attachment: AttachmentRow): string {
    return String(attachment.file?.uid || attachment.file?.id || '').trim();
  }

  protected prototypeMeta(attachment: AttachmentRow): string {
    return `${attachment.version} · ${attachment.uploadedAt} · ${attachment.size}`;
  }

  protected prototypeKind(attachment: AttachmentRow): string {
    return this.adapter.prototypeKind(attachment.file as LegacyPrototypeFile);
  }

  protected prototypeVersions(attachment: AttachmentRow): LegacyPrototypeVersion[] {
    return Array.isArray(attachment.file?.versions) ? attachment.file.versions : [];
  }

  protected isPrototypeExpanded(attachment: AttachmentRow): boolean {
    const prototypeUid = this.prototypeUid(attachment);
    return Boolean(prototypeUid && this.adapter.isPrototypeExpanded(attachment.ownerId || attachment.processId, prototypeUid));
  }

  protected canPreviewPrototype(attachment: AttachmentRow, version: LegacyPrototypeVersion | null = null): boolean {
    return this.adapter.canPreviewPrototype(attachment.file as LegacyPrototypeFile, version);
  }

  protected togglePrototypeVersions(attachment: AttachmentRow): void {
    const prototypeUid = this.prototypeUid(attachment);
    if (!prototypeUid) return;
    this.adapter.togglePrototypeVersions(attachment.ownerId || attachment.processId, prototypeUid);
    this.onRefresh();
  }

  protected openPrototype(attachment: AttachmentRow, version: LegacyPrototypeVersion | null = null): void {
    const prototypeUid = this.prototypeUid(attachment);
    if (!prototypeUid) return;
    this.adapter.openPrototype(attachment.ownerId || attachment.processId, prototypeUid, String(version?.uid || ''));
  }

  protected previewPrototype(attachment: AttachmentRow, version: LegacyPrototypeVersion | null = null): void {
    const prototypeUid = this.prototypeUid(attachment);
    if (!prototypeUid) return;
    this.adapter.previewPrototype(attachment.ownerId || attachment.processId, prototypeUid, String(version?.uid || ''));
  }

  protected downloadPrototype(attachment: AttachmentRow, version: LegacyPrototypeVersion | null = null): void {
    const prototypeUid = this.prototypeUid(attachment);
    if (!prototypeUid) return;
    this.adapter.downloadPrototype(attachment.ownerId || attachment.processId, prototypeUid, String(version?.uid || ''));
  }
}

export function buildAttachmentStageTabs(document: unknown): AttachmentStageTab[] {
  return stageAttachmentGroups(document as any)
    .map((group) => {
      const attachmentCount = group.processes.reduce((sum, process) => sum + processAttachmentRows(process).length, 0);
      return {
        id: group.stageId,
        name: group.stageName,
        processCount: group.processes.length,
        attachmentCount,
      };
    })
    .filter((tab) => tab.attachmentCount > 0);
}

export function buildAttachmentGroups(document: unknown, selectedStageId = '', keywordValue = ''): AttachmentGroup[] {
  const keyword = String(keywordValue || '').trim().toLowerCase();
  return stageAttachmentGroups(document as any)
    .filter((group) => !selectedStageId || group.stageId === selectedStageId)
    .flatMap((group) => group.processes.map((process: any) => {
      const rows = processAttachmentRows(process);
      const attachments = rows.filter((attachment) => !keyword || [
        process.name,
        attachment.name,
        attachment.nodeName,
        attachment.kind,
        attachment.scope,
      ].some((value) => String(value || '').toLowerCase().includes(keyword)));
      const attachedNodeNames = new Set(attachments
        .filter((attachment) => attachment.scope === '节点附件' && attachment.nodeName !== '-')
        .map((attachment) => attachment.nodeName));
      return {
        processId: String(process.uid || process.id || process.name || ''),
        processName: String(process.name || '未命名流程'),
        processAttachmentCount: attachments.filter((attachment) => attachment.scope === '流程附件').length,
        nodeAttachmentCount: attachments.filter((attachment) => attachment.scope === '节点附件').length,
        attachedNodeCount: attachedNodeNames.size,
        attachments,
      };
    }))
    .filter((group) => group.attachments.length)
    .sort((left, right) => left.processName.localeCompare(right.processName, 'zh-Hans-CN'));
}
