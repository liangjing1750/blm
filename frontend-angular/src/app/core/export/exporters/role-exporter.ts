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
async function captureEachRoleUsecase(): Promise<Array<{ name: string; png: Uint8Array }>> {
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

    // 取消勾选
    if (toggle && wasChecked === false) {
      toggle.dispatchEvent(new MouseEvent('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  return results;
}

export async function exportRoleDocx(): Promise<void> {
  const encoder = new TextEncoder();
  // 1. 角色范围
  const scopePng = await captureScreenshot('[data-testid="role-summary-card"]');
  // 2. 每个角色的参与流程
  const usecases = await captureEachRoleUsecase();
  // 3. 切回管理模式
  await switchMode('[data-testid="role-view-entry"]', 'role-summary-card');
  // 4. 输出第一个角色的 DOCX 作为主文档，完整 zip 作为补充
  const docx = usecases.length > 0
    ? buildSimpleDocx(usecases[0].png, 'role-' + usecases[0].name)
    : buildSimpleDocx(scopePng, 'role-scope');
  downloadBlob(docx, 'role.docx');
  // 完整 zip：角色范围 + 每个角色的用例图
  const files: Array<{ name: string; data: Uint8Array }> = [
    { name: 'role-scope.png', data: scopePng },
  ];
  usecases.forEach((u) => {
    files.push({ name: `role-${u.name}.png`, data: u.png });
  });
  downloadBlob(buildZip(files), 'role-all.zip');
}

export async function exportRoleZip(): Promise<void> {
  const encoder = new TextEncoder();
  const scopePng = await captureScreenshot('[data-testid="role-summary-card"]');
  const usecases = await captureEachRoleUsecase();
  await switchMode('[data-testid="role-view-entry"]', 'role-summary-card');
  const files: Array<{ name: string; data: Uint8Array }> = [
    { name: 'role-scope.md', data: encoder.encode('# 角色范围\n\n![role-scope](role-scope.png)\n') },
    { name: 'role-scope.png', data: scopePng },
  ];
  usecases.forEach((u) => {
    files.push({ name: `role-${u.name}.md`, data: encoder.encode(`# ${u.name}\n\n![${u.name}](role-${u.name}.png)\n`) });
    files.push({ name: `role-${u.name}.png`, data: u.png });
  });
  downloadBlob(buildZip(files), 'role-all.zip');
}
