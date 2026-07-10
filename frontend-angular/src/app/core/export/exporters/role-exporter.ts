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

export async function exportRoleDocx(): Promise<void> {
  const encoder = new TextEncoder();
  // 1. 截角色范围
  const scopePng = await captureScreenshot('[data-testid="role-summary-card"]');
  // 2. 切换到"角色参与流程"模式
  await switchMode('[data-testid="role-management-entry"]', 'role-usecase-map');
  const usecasePng = await captureScreenshot('[data-testid="role-usecase-map"]');
  // 3. 切回管理模式
  await switchMode('[data-testid="role-view-entry"]', 'role-summary-card');
  // 4. 两张图合并为一个 zip（内含两个 PNG），再生成 DOCX（仅第一张）
  const docx = buildSimpleDocx(scopePng, 'role-scope');
  // 简单方式：只下载第一张图的 DOCX + 一个 zip 含双图
  downloadBlob(docx, 'role-scope.docx');
  // 额外提供一个完整 zip
  const zip = buildZip([
    { name: 'role-scope.png', data: scopePng },
    { name: 'role-usecase.png', data: usecasePng },
  ]);
  downloadBlob(zip, 'role.zip');
}

export async function exportRoleZip(): Promise<void> {
  const encoder = new TextEncoder();
  const scopePng = await captureScreenshot('[data-testid="role-summary-card"]');
  await switchMode('[data-testid="role-management-entry"]', 'role-usecase-map');
  const usecasePng = await captureScreenshot('[data-testid="role-usecase-map"]');
  await switchMode('[data-testid="role-view-entry"]', 'role-summary-card');
  const zip = buildZip([
    { name: 'role-scope.md', data: encoder.encode('# 角色范围\n\n![role-scope](role-scope.png)\n') },
    { name: 'role-scope.png', data: scopePng },
    { name: 'role-usecase.md', data: encoder.encode('# 角色参与流程\n\n![role-usecase](role-usecase.png)\n') },
    { name: 'role-usecase.png', data: usecasePng },
  ]);
  downloadBlob(zip, 'role.zip');
}
