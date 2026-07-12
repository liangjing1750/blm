import { BlmDocument } from '../../document/document.model';
import { captureFullElement } from './process-exporter';
import { ViewExporter, ViewContent, ViewSection } from './view-exporter';

/** 按选择器查找元素并截图，委托给公共 captureFullElement */
async function captureBySelector(selector: string): Promise<Uint8Array> {
  if (typeof document === 'undefined') return new Uint8Array();
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return new Uint8Array();
  return captureFullElement(el);
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

  constructor(private readonly document: BlmDocument) {}

  toMarkdown(): string { return '# 角色管理\n\n'; }

  /**
   * 产出纯文本内容（表格 + 列表）。
   * 图片段不在此生成 —— 由调用方根据实际截图数量动态追加，
   * 保证 getContent 的 imageIndex 与实际 screenshots 数组始终一致。
   */
  getContent(): ViewContent {
    return buildRoleContent(this.document, { headingType: 'heading1' });
  }

  async capture(): Promise<Uint8Array> {
    // 确保在 view 模式截图
    if (document.querySelector('[data-testid="role-usecase-map"]')) {
      document.querySelector<HTMLElement>('[data-testid="role-management-entry"]')?.click();
      await new Promise((r) => setTimeout(r, 500));
    }
    return captureBySelector('[data-testid="role-summary-card"]');
  }

  /** 多截图：角色范围 + 每角色用例图（只看参与流程） */
  async captureAll(onProgress?: (done: number, total: number, label?: string) => void): Promise<Uint8Array[]> {
    // 切换到用例图模式
    if (!document.querySelector('[data-testid="role-usecase-map"]')) {
      document.querySelector<HTMLElement>('[data-testid="role-view-entry"]')?.click();
      await new Promise((r) => setTimeout(r, 2000));
    }
    await new Promise((r) => setTimeout(r, 500));

    const usecases = await captureEachRoleUsecase(onProgress);

    // 切回 view 模式
    if (document.querySelector('[data-testid="role-usecase-map"]')) {
      document.querySelector<HTMLElement>('[data-testid="role-management-entry"]')?.click();
      await new Promise((r) => setTimeout(r, 300));
    }

    return usecases.map(u => u.png);
  }
}

export function buildRoleContent(
  document: BlmDocument,
  options: { headingType?: 'heading1' | 'heading2'; imageOffset?: number } = {},
): ViewContent {
  const roles = document.roles || [];
  const headingType = options.headingType || 'heading1';
  const imageOffset = options.imageOffset || 0;
  const sections: ViewSection[] = [
    { type: headingType, text: '角色管理' },
    {
      type: 'table',
      headers: ['角色', '分组', '说明'],
      rows: roles.length
        ? roles.map((r: any) => [
          r.name || '',
          r.group || '',
          r.desc || '',
        ])
        : [['未配置', '', '']],
    },
  ];

  roles.forEach((role: any, index) => {
    const name = role.name || role.uid || role.id || `角色${index + 1}`;
    sections.push({ type: 'heading3', text: `角色用例图：${name}` });
    sections.push({ type: 'image', text: `角色用例图：${name}`, imageIndex: imageOffset + index });
  });

  return { title: '角色管理', sections };
}

// ── 子导出器（单用途，复用 RoleExporter 的内容但不截图） ──

export class RoleScopeExporter implements ViewExporter {
  readonly label = 'role-scope';

  constructor(private readonly document: BlmDocument) {}

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
  async capture(): Promise<Uint8Array> {
    if (document.querySelector('[data-testid="role-usecase-map"]')) {
      document.querySelector<HTMLElement>('[data-testid="role-management-entry"]')?.click();
      await new Promise((r) => setTimeout(r, 500));
    }
    return captureBySelector('[data-testid="role-summary-card"]');
  }
}

export class RoleUsecaseExporter implements ViewExporter {
  readonly label = 'role-usecase';

  constructor(private readonly document: BlmDocument) {}

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
  async capture(): Promise<Uint8Array> {
    return captureBySelector('[data-testid="role-usecase-map"]');
  }
}

// ── 逐角色用例图截取 ──

export async function captureEachRoleUsecase(
  onStep?: (done: number, total: number, label?: string) => void,
  captureFn: () => Promise<Uint8Array> = () => captureBySelector('[data-testid="role-usecase-map"]'),
): Promise<Array<{ name: string; png: Uint8Array }>> {
  const results: Array<{ name: string; png: Uint8Array }> = [];
  const roles = Array.from(document.querySelectorAll<HTMLElement>('.role-usecase-role'))
    .map((btn) => ({
      id: String(btn.dataset['roleId'] || '').trim(),
      name: btn.querySelector('.role-usecase-role-name')?.textContent?.trim() || 'unknown',
    }))
    .filter((role) => role.id);
  const toggle = document.querySelector<HTMLInputElement>('[data-testid="role-participating-only-toggle"]');
  const initialChecked = Boolean(toggle?.checked);

  for (const role of roles) {
    if (toggle?.checked) {
      toggle.checked = false;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 300));
    }

    const btn = Array.from(document.querySelectorAll<HTMLElement>('.role-usecase-role'))
      .find((item) => String(item.dataset['roleId'] || '').trim() === role.id);
    if (!btn) continue;
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));

    if (toggle && !toggle.checked) {
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 400));
    }

    const png = await captureFn();
    results.push({ name: role.name, png });
    onStep?.(results.length, roles.length, `角色用例图：${role.name}`);

    if (toggle?.checked) {
      toggle.checked = false;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  if (toggle && initialChecked && !toggle.checked) {
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
  }

  return results;
}
