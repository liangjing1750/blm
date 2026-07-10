import { ViewExporter } from './view-exporter';
import { buildZip, buildSimpleDocx, downloadBlob } from '../export-builders';

/** 协助切换模式并等待渲染 */
async function switchMode(
  toggleSelector: string,
  targetTestId: string,
  timeout = 2000,
): Promise<void> {
  const existing = document.querySelector(`[data-testid="${targetTestId}"]`);
  if (existing) return; // 已在目标模式
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

// ── 单个截图导出器（供组件逐项调用） ──

export class RoleScopeExporter implements ViewExporter {
  readonly label = 'role-scope';
  toMarkdown(): string { return '# 角色范围\n\n'; }
  async capture(): Promise<Uint8Array> { return captureScreenshot('[data-testid="role-summary-card"]'); }
}

export class RoleUsecaseExporter implements ViewExporter {
  readonly label = 'role-usecase';
  toMarkdown(): string { return '# 角色参与流程\n\n'; }
  async capture(): Promise<Uint8Array> { return captureScreenshot('[data-testid="role-usecase-map"]'); }
}

// ── 导出入口（供 role-workbench 调用） ──

/** 收集视图模式下的角色按钮，逐个截取"只看参与流程"的用例图 */
async function captureEachRoleUsecase(onStep?: (done: number, total: number) => void): Promise<Array<{ name: string; png: Uint8Array }>> {
  await switchMode('[data-testid="role-management-entry"]', 'role-usecase-map');
  await new Promise((r) => setTimeout(r, 500));

  const results: Array<{ name: string; png: Uint8Array }> = [];
  const roleBtns = document.querySelectorAll<HTMLElement>('.role-usecase-role');
  const toggle = document.querySelector<HTMLInputElement>('[data-testid="role-participating-only-toggle"]');

  for (const btn of Array.from(roleBtns)) {
    const name = btn.querySelector('.role-usecase-role-name')?.textContent?.trim() || 'unknown';
    // 点击角色按钮
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));

    // 勾选"只看参与流程"
    const wasChecked = toggle?.checked;
    if (toggle && !toggle.checked) {
      toggle.dispatchEvent(new MouseEvent('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 400));
    }

    // 截图
    const png = await captureScreenshot('[data-testid="role-usecase-map"]');
    results.push({ name, png });
    onStep?.(results.length, roleBtns.length);

    // 取消勾选
    if (toggle && wasChecked === false) {
      toggle.dispatchEvent(new MouseEvent('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  return results;
}

export async function exportRoleDocx(onProgress?: (pct: number, msg: string) => void): Promise<void> {
  onProgress?.(5, '正在截图角色范围…');
  const scopePng = await captureScreenshot('[data-testid="role-summary-card"]');
  onProgress?.(20, '正在切换至角色用例图…');
  const usecases = await captureEachRoleUsecase((done, total) => {
    onProgress?.(20 + Math.round(60 * done / total), `正在截图角色用例图 (${done}/${total})…`);
  });
  onProgress?.(85, '正在生成 DOCX…');
  await switchMode('[data-testid="role-view-entry"]', 'role-summary-card');
  // 只生成一个 DOCX（含角色范围图）
  const docx = buildSimpleDocx(scopePng, 'role-scope');
  onProgress?.(100, '下载中…');
  downloadBlob(docx, 'role.docx');
}

export async function exportRoleZip(onProgress?: (pct: number, msg: string) => void): Promise<void> {
  const encoder = new TextEncoder();
  onProgress?.(5, '正在截图角色范围…');
  const scopePng = await captureScreenshot('[data-testid="role-summary-card"]');
  onProgress?.(20, '正在切换至角色用例图…');
  const usecases = await captureEachRoleUsecase((done, total) => {
    onProgress?.(20 + Math.round(60 * done / total), `正在截图角色用例图 (${done}/${total})…`);
  });
  onProgress?.(85, '正在打包 ZIP…');
  await switchMode('[data-testid="role-view-entry"]', 'role-summary-card');
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
