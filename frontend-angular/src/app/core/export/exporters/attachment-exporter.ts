import { BlmDocument, Process, Stage } from '../../document/document.model';
import { identityOf } from '../../document/document-model';
import { ViewAttachment, ViewContent, ViewExporter, ViewSection } from './view-exporter';

export interface AttachmentRow {
  id: string;
  processId: string;
  ownerId: string;
  name: string;
  scope: string;
  nodeName: string;
  kind: string;
  version: string;
  uploadedAt: string;
  size: string;
  file: any;
  versionUid: string;
  contentType: string;
  data?: Uint8Array;
}

export class AttachmentExporter implements ViewExporter {
  readonly label = 'attachments';

  constructor(
    private readonly document: BlmDocument,
    private readonly documentName = '',
  ) {}

  toMarkdown(): string {
    return this.getContent().sections.map((section) => section.text || '').filter(Boolean).join('\n');
  }

  getContent(): ViewContent {
    return buildAttachmentContent(this.document);
  }

  async prepareContent(): Promise<ViewContent> {
    await hydratePersistedAttachmentBytes(this.document, this.documentName);
    return this.getContent();
  }

  async capture(): Promise<Uint8Array> {
    return new Uint8Array();
  }

  async captureAll(): Promise<Uint8Array[]> {
    return [];
  }
}

/**
 * 模块意图：把流程和节点上的附件统一组织为“文档索引 + ZIP 附件包”，供全景导出拼接复用。
 * 关键流程：价值流环节 -> 阶段 -> 流程 -> 附件标题；真实文件只登记 ZIP 文件路径，不再尝试嵌入 DOCX。
 * 边界细节：老数据可能只有附件引用没有 content，此时保留描述和附件包路径，不阻断整份导出。
 */
export function buildAttachmentContent(document: BlmDocument): ViewContent {
  const sections: ViewSection[] = [{ type: 'heading1', text: '价值流环节' }];
  const attachments: ViewAttachment[] = [];
  let hasAttachment = false;

  for (const group of stageAttachmentGroups(document)) {
    const processGroups = group.processes
      .map((process) => ({ process, attachments: processAttachmentRows(process) }))
      .filter((item) => item.attachments.length);
    if (!processGroups.length) continue;
    hasAttachment = true;
    sections.push({ type: 'heading2', text: `阶段：${group.stageName}` });
    for (const item of processGroups) {
      const processName = display((item.process as any).name, identityOf(item.process), '未命名流程');
      sections.push({ type: 'heading3', text: `流程：${processName}` });
      for (const attachment of item.attachments) {
        const zipPath = attachmentZipPath(group.stageName, processName, attachment);
        sections.push({ type: 'heading4', text: `附件名称：${attachment.name}` });
        sections.push({
          type: 'table',
          headers: ['字段', '内容'],
          rows: [
            ['所属层级', attachment.scope],
            ['所属节点', attachment.nodeName],
            ['类型', attachment.kind],
            ['版本', attachment.version],
            ['上传时间', attachment.uploadedAt],
            ['大小', attachment.size],
            ['附件包路径', zipPath],
          ],
        });
        if (attachment.data?.length) {
          const attachmentId = uniqueAttachmentId(attachments, attachment.id);
          attachments.push({
            id: attachmentId,
            name: attachment.name,
            contentType: attachment.contentType || 'application/octet-stream',
            data: attachment.data,
            path: zipPath,
          });
        } else {
          sections.push({ type: 'paragraph', text: '附件内容未内嵌：当前文档仅保存了附件引用或缺少本地二进制内容。' });
        }
      }
    }
  }

  if (!hasAttachment) {
    sections.push({ type: 'paragraph', text: '暂无附件。' });
  }
  return { title: '价值流环节', sections, attachments };
}

export function stageAttachmentGroups(document: BlmDocument): Array<{ stageId: string; stageName: string; processes: Process[] }> {
  const processes = document.processes || [];
  const usedProcessIds = new Set<string>();
  const groups: Array<{ stageId: string; stageName: string; processes: Process[] }> = [];

  for (const stage of document.stages || []) {
    const stageId = identityOf(stage);
    const stageProcesses = processesForStage(document, stage);
    stageProcesses.forEach((process) => usedProcessIds.add(identityOf(process)));
    const processesWithAttachments = stageProcesses.filter((process) => processAttachmentRows(process).length);
    if (processesWithAttachments.length) {
      groups.push({
        stageId,
        stageName: display((stage as Stage).name, stageId, '未命名阶段'),
        processes: processesWithAttachments,
      });
    }
  }

  const unassigned = processes
    .filter((process) => !usedProcessIds.has(identityOf(process)))
    .filter((process) => processAttachmentRows(process).length);
  if (unassigned.length) {
    groups.push({ stageId: '__unassigned__', stageName: '未归类', processes: unassigned });
  }
  return groups;
}

export function processAttachmentRows(process: Process): AttachmentRow[] {
  const rows: AttachmentRow[] = [];
  const processId = identityOf(process);
  for (const file of asArray((process as any).prototypeFiles)) {
    rows.push(fileToRow(file, '流程附件', '', processId, processId));
  }
  for (const node of asArray((process as any).nodes || (process as any).tasks)) {
    const nodeName = display((node as any).name, identityOf(node as any), '未命名节点');
    for (const file of asArray((node as any).prototypeFiles)) {
      rows.push(fileToRow(file, '节点附件', nodeName, processId, identityOf(node as any)));
    }
  }
  return rows;
}

function attachmentZipPath(stageName: string, processName: string, attachment: AttachmentRow): string {
  return [
    '价值流环节',
    `阶段：${safePathSegment(stageName)}`,
    `流程：${safePathSegment(processName)}`,
    safePathSegment(attachment.name),
  ].join('/');
}

function safePathSegment(value: string): string {
  return String(value || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim() || '未命名';
}

function processesForStage(document: BlmDocument, stage: Stage): Process[] {
  const stageId = identityOf(stage);
  const processIds = new Set((document.stageFlowRefs || [])
    .filter((ref: any) => String(ref.stageUid || ref.stageId || '').trim() === stageId)
    .map((ref: any) => String(ref.processUid || ref.processId || '').trim())
    .filter(Boolean));
  const direct = (document.processes || []).filter((process: any) =>
    String(process.stageUid || process.stageId || '').trim() === stageId,
  );
  const byRef = (document.processes || []).filter((process) => processIds.has(identityOf(process)));
  const merged = new Map<string, Process>();
  [...byRef, ...direct].forEach((process) => merged.set(identityOf(process), process));
  return [...merged.values()];
}

function fileToRow(file: any, scope: string, nodeName: string, processId: string, ownerId: string): AttachmentRow {
  const version = currentVersion(file);
  const size = Number(file?.size || version?.size || 0);
  const uid = display(file?.uid || file?.id, version?.uid, 'attachment');
  const versionUid = String(version?.uid || file?.versionUid || '').trim();
  const contentType = display(file?.contentType || version?.contentType, '', 'application/octet-stream');
  return {
    id: `${processId}-${uid}-${versionUid || 'current'}`,
    processId,
    ownerId,
    name: display(file?.name || version?.name, file?.uid || file?.id, '未命名附件'),
    scope,
    nodeName: nodeName || '-',
    kind: contentType,
    version: display(version?.name, version?.uid || file?.versionUid, '-'),
    uploadedAt: display(version?.uploadedAt, '', '-'),
    size: size > 0 ? `${size} B` : '-',
    file,
    versionUid,
    contentType,
    data: fileBytes(file, version),
  };
}

function currentVersion(file: any): any {
  const versions = asArray(file?.versions);
  const versionUid = String(file?.versionUid || '').trim();
  return versions.find((version: any) => String(version?.uid || '') === versionUid) || versions[versions.length - 1] || null;
}

function asArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function display(primary: unknown, fallback: unknown, empty: string): string {
  return String(primary || fallback || empty).trim();
}

function fileBytes(file: any, version: any): Uint8Array | undefined {
  const encoded = String(version?.content || file?.content || version?.dataBase64 || file?.dataBase64 || '').trim();
  const encoding = String(version?.contentEncoding || file?.contentEncoding || 'base64').toLowerCase();
  if (!encoded || encoding !== 'base64') return undefined;
  const base64 = encoded.includes(',') ? encoded.split(',').pop() || '' : encoded;
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return undefined;
  }
}

export async function hydratePersistedAttachmentBytes(document: BlmDocument, documentName: string): Promise<void> {
  const docName = String(documentName || '').trim();
  if (!docName || typeof fetch !== 'function') return;
  const jobs: Promise<void>[] = [];
  for (const process of document.processes || []) {
    for (const file of asArray((process as any).prototypeFiles)) {
      jobs.push(hydrateFileBytes(docName, file));
    }
    for (const node of asArray((process as any).nodes || (process as any).tasks)) {
      for (const file of asArray((node as any).prototypeFiles)) {
        jobs.push(hydrateFileBytes(docName, file));
      }
    }
  }
  await Promise.all(jobs);
}

async function hydrateFileBytes(documentName: string, file: any): Promise<void> {
  const version = currentVersion(file);
  if (fileBytes(file, version)?.length) return;
  const attachmentUid = String(file?.uid || file?.id || '').trim();
  const versionUid = String(version?.uid || file?.versionUid || '').trim();
  if (!attachmentUid || !versionUid) return;
  const url = `/api/attachment/${encodeURIComponent(documentName)}/${encodeURIComponent(attachmentUid)}/${encodeURIComponent(versionUid)}`;
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length) return;
    const base64 = bytesToBase64(bytes);
    file.contentEncoding = 'base64';
    file.content = base64;
    file.contentType = file.contentType || version?.contentType || response.headers.get('Content-Type') || 'application/octet-stream';
    file.size = file.size || bytes.length;
  } catch {
    // 边界细节：附件拉取失败时仍保留元数据表格，让导出不中断并显示“未内嵌”提示。
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function uniqueAttachmentId(existing: ViewAttachment[], baseId: string): string {
  const safeBase = baseId.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'attachment';
  let candidate = safeBase;
  let index = 2;
  while (existing.some((attachment) => attachment.id === candidate)) {
    candidate = `${safeBase}-${index}`;
    index += 1;
  }
  return candidate;
}
