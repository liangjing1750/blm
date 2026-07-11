import { ViewExporter, ViewContent, ViewSection } from './view-exporter';
import { buildZip, downloadBlob } from '../export-builders';
import { buildDocxFragment } from '../fragments/docx-fragment';

/** 协助切换模式并等待渲染 */
async function switchMode(
  toggleSelector: string,
  targetTestId: string,
  timeout = 2000,
): Promise<void> {
  const existing = document.querySelector(`[data-testid="${targetTestId}"]`);
  if (existing) return;
  const btn = document.querySelector<HTMLElement>(toggleSelector);
  btn?.click();
  await new Promise((r) => setTimeout(r, timeout));
}

/** 共享截图逻辑 */
async function captureScreenshot(selector: string): Promise<Uint8Array> {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`element not found: ${selector}`);
  const oldOverflow = el.style.overflow;
  el.style.overflow = 'visible';
  const zoomEls: HTMLElement[] = [];
  el.querySelectorAll<HTMLElement>('[style*="zoom"]').forEach((z) => {
    if (z.style.zoom !== '1') { zoomEls.push(z); (z.dataset as any).oldZoom = z.style.zoom; z.style.zoom = '1'; }
  });
  try {
    try {
      const d = (await import('dom-to-image-more')).default;
      return _d2b(await d.toPng(el, { scale: 2, style: { backgroundColor: '#ffffff', overflow: 'visible' } }));
    } catch {
      const h = (await import('html2canvas')).default;
      const c = await h(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      return new Uint8Array(await new Promise<ArrayBuffer>((r) => c.toBlob((b) => r(b!.arrayBuffer()), 'image/png')!));
    }
  } finally {
    el.style.overflow = oldOverflow;
    zoomEls.forEach((z) => { z.style.zoom = (z.dataset as any).oldZoom || ''; delete (z.dataset as any).oldZoom; });
  }
}
function _d2b(d: string): Uint8Array {
  const r = atob(d.split(',')[1]);
  const b = new Uint8Array(r.length);
  for (let i = 0; i < r.length; i++) b[i] = r.charCodeAt(i);
  return b;
}

/** 按字段分组角色 */
function groupRolesByField(roles: any[], field: string): Record<string, any[]> {
  const groups: Record<string, any[]> = {};
  for (const role of roles) {
    const key = String(role[field] || '').trim() || '未分组';
    if (!groups[key]) groups[key] = [];
    groups[key].push(role);
  }
  return groups;
}

// ── 角色导出器 ──

export class RoleExporter implements ViewExporter {
  readonly label = 'role';

  toMarkdown(): string { return '# 角色视图\n\n'; }

  /**
   * 产出纯文本内容（表格 + 列表）。
   * 图片段不在此生成 —— 由调用方根据实际截图数量动态追加，
   * 保证 getContent 的 imageIndex 与实际 screenshots 数组始终一致。
   */
  getContent(): ViewContent {
    const doc = (window as any).__ngDocument || {};
    const roles = doc.roles || [];
    const sections: ViewSection[] = [];

    sections.push({ type: 'heading1', text: '角色视图' });

    if (roles.length > 0) {
      const meta = doc.meta || {};
      const metaParts: string[] = [];
      if (meta.title) metaParts.push(`文档：${meta.title}`);
      if (meta.domain) metaParts.push(`业务域：${meta.domain}`);
      if (metaParts.length) {
        sections.push({ type: 'heading2', text: '引言' });
        sections.push({ type: 'paragraph', text: metaParts.join('　') });
      }

      sections.push({ type: 'heading2', text: '角色范围' });
      sections.push({
        type: 'table',
        headers: ['角色', '分组', '说明', '所属业务组件'],
        rows: roles.map((r: any) => [
          r.name || '',
          r.group || '',
          r.desc || '',
          (r.subDomains || []).join('、'),
        ]),
      });

      const groups = groupRolesByField(roles, 'group');
      const groupKeys = Object.keys(groups).filter(Boolean);
      if (groupKeys.length > 0) {
        sections.push({ type: 'heading2', text: '角色分组' });
        for (const group of groupKeys) {
          sections.push({ type: 'heading3', text: group });
          sections.push({
            type: 'list',
            items: groups[group].map((r: any) => {
              const desc = r.desc ? `：${r.desc}` : '';
              return `${r.name || '未命名'}${desc}`;
            }),
          });
        }
      }
    }

    return { title: '角色视图', sections };
  }

  async capture(): Promise<Uint8Array> {
    return captureScreenshot('[data-testid="role-summary-card"]');
  }

  /** 多截图：角色范围 + 每角色用例图 */
  async captureAll(): Promise<Uint8Array[]> {
    const results: Uint8Array[] = [];
    results.push(await captureScreenshot('[data-testid="role-summary-card"]'));
    const usecases = await captureEachRoleUsecase();
    results.push(...usecases.map(u => u.png));
    return results;
  }
}

/** 工具函数：为 ViewContent 追加图片段，imageIndex 与截图数组一一对应 */
export function appendImageSections(content: ViewContent, imageCount: number, labels: string[]): void {
  for (let i = 0; i < imageCount; i++) {
    content.sections.push({
      type: 'image',
      text: labels[i] || `截图 ${i + 1}`,
      imageIndex: i,
    });
  }
}

export class RoleScopeExporter implements ViewExporter {
  readonly label = 'role-scope';
  toMarkdown(): string { return '# 角色范围\n\n'; }
  getContent(): ViewContent {
    return {
      title: '角色范围',
      sections: [
        { type: 'heading1', text: '角色范围' },
        { type: 'image', text: '角色范围截图', imageIndex: 0 },
      ],
    };
  }
  async capture(): Promise<Uint8Array> { return captureScreenshot('[data-testid="role-summary-card"]'); }
}

export class RoleUsecaseExporter implements ViewExporter {
  readonly label = 'role-usecase';
  toMarkdown(): string { return '# 角色参与流程\n\n'; }
  getContent(): ViewContent {
    return {
      title: '角色参与流程',
      sections: [
        { type: 'heading1', text: '角色参与流程' },
        { type: 'image', text: '角色用例图截图', imageIndex: 0 },
      ],
    };
  }
  async capture(): Promise<Uint8Array> { return captureScreenshot('[data-testid="role-usecase-map"]'); }
}

// ── 导出入口 ──

async function captureEachRoleUsecase(onStep?: (done: number, total: number) => void): Promise<Array<{ name: string; png: Uint8Array }>> {
  await switchMode('[data-testid="role-management-entry"]', 'role-usecase-map');
  await new Promise((r) => setTimeout(r, 500));

  const results: Array<{ name: string; png: Uint8Array }> = [];
  const roleBtns = document.querySelectorAll<HTMLElement>('.role-usecase-role');
  const toggle = document.querySelector<HTMLInputElement>('[data-testid="role-participating-only-toggle"]');

  for (const btn of Array.from(roleBtns)) {
    const name = btn.querySelector('.role-usecase-role-name')?.textContent?.trim() || 'unknown';
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));

    const wasChecked = toggle?.checked;
    if (toggle && !toggle.checked) {
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 400));
    }

    const png = await captureScreenshot('[data-testid="role-usecase-map"]');
    results.push({ name, png });
    onStep?.(results.length, roleBtns.length);

    if (toggle && wasChecked === false) {
      toggle.checked = false;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  return results;
}

export async function exportRoleDocx(onProgress?: (pct: number, msg: string) => void): Promise<void> {
  // 确保从 view 模式开始：如果当前在用例图模式，先切回角色范围视图
  if (document.querySelector('[data-testid="role-usecase-map"]')) {
    onProgress?.(1, '正在切换至角色范围视图…');
    document.querySelector<HTMLElement>('[data-testid="role-view-entry"]')?.click();
    await new Promise((r) => setTimeout(r, 500));
  }

  onProgress?.(5, '正在截图角色范围…');
  const scopePng = await captureScreenshot('[data-testid="role-summary-card"]');
  onProgress?.(20, '正在切换至角色用例图…');
  const usecases = await captureEachRoleUsecase((done, total) => {
    onProgress?.(20 + Math.round(60 * done / total), `正在截图角色用例图 (${done}/${total})…`);
  });
  onProgress?.(85, '正在生成 DOCX…');

  // 切回 view 模式
  if (document.querySelector('[data-testid="role-usecase-map"]')) {
    document.querySelector<HTMLElement>('[data-testid="role-view-entry"]')?.click();
    await new Promise((r) => setTimeout(r, 300));
  }

  // 构建内容：文本来自 RoleExporter，图片段基于实际截图数量动态追加
  const content = new RoleExporter().getContent();
  const allPngs: Uint8Array[] = [scopePng, ...usecases.map(u => u.png)];

  // 追加图片段：index 0 = 角色范围截图，index 1..N = 每角色用例图
  content.sections.push({ type: 'heading2', text: '角色截图' });
  content.sections.push({ type: 'image', text: '角色范围截图', imageIndex: 0 });
  for (let i = 0; i < usecases.length; i++) {
    content.sections.push({
      type: 'image',
      text: `角色用例图: ${usecases[i].name}`,
      imageIndex: i + 1,
    });
  }

  onProgress?.(100, '下载中…');
  const blob = await buildDocxFragment(content, allPngs);
  downloadBlob(blob, 'role.docx');
}

export async function exportRoleZip(onProgress?: (pct: number, msg: string) => void): Promise<void> {
  const encoder = new TextEncoder();

  // 确保从 view 模式开始
  if (document.querySelector('[data-testid="role-usecase-map"]')) {
    onProgress?.(1, '正在切换至角色范围视图…');
    document.querySelector<HTMLElement>('[data-testid="role-view-entry"]')?.click();
    await new Promise((r) => setTimeout(r, 500));
  }

  onProgress?.(5, '正在截图角色范围…');
  const scopePng = await captureScreenshot('[data-testid="role-summary-card"]');
  onProgress?.(20, '正在切换至角色用例图…');
  const usecases = await captureEachRoleUsecase((done, total) => {
    onProgress?.(20 + Math.round(60 * done / total), `正在截图角色用例图 (${done}/${total})…`);
  });
  onProgress?.(85, '正在打包 ZIP…');

  // 切回 view 模式
  if (document.querySelector('[data-testid="role-usecase-map"]')) {
    document.querySelector<HTMLElement>('[data-testid="role-view-entry"]')?.click();
    await new Promise((r) => setTimeout(r, 300));
  }
  const files: Array<{ name: string; data: Uint8Array }> = [
    { name: '角色范围.md', data: encoder.encode('# 角色范围\n\n![角色范围](角色范围.png)\n') },
    { name: '角色范围.png', data: scopePng },
  ];
  usecases.forEach((u) => {
    files.push({ name: `${u.name}.md`, data: encoder.encode(`# ${u.name}\n\n![${u.name}](${u.name}.png)\n`) });
    files.push({ name: `${u.name}.png`, data: u.png });
  });
  onProgress?.(100, '下载中…');
  downloadBlob(buildZip(files), 'role-all.zip');
}
