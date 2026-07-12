import { describe, expect, it } from 'vitest';
import { BlmDocument } from '../../document/document.model';
import { RoleExporter, RoleScopeExporter, RoleUsecaseExporter, captureEachRoleUsecase } from './role-exporter';

function createDocument(): BlmDocument {
  return {
    meta: { title: '测试', domain: '仓储', author: '测试员' },
    roles: ([
      { uid: 'r1', name: '仓单监管员', group: '监管', desc: '监管仓单', subDomains: ['仓单'] },
      { uid: 'r2', name: '交割审核员', group: '监管', desc: '审核交割', subDomains: ['交割'] },
      { uid: 'r3', name: '管理员', group: '运维', desc: '系统管理', subDomains: [] },
    ] as any),
    stages: [],
    stageFlowRefs: [],
    processes: [],
    entities: [],
    businessComponents: [],
    businessConstructs: [],
    taskDefinitions: [],
    serviceGroups: [],
    services: [],
    terms: [],
    dataDictionaries: [],
    rules: [],
  };
}

describe('RoleExporter', () => {
  it('uses static label "role"', () => {
    const exporter = new RoleExporter(createDocument());
    expect(exporter.label).toBe('role');
  });

  it('builds content with role scope table and group sections', () => {
    const exporter = new RoleExporter(createDocument());
    const content = exporter.getContent();

    expect(content.title).toBe('角色管理');

    // 角色范围表格
    const roleTable = content.sections.find((s) => s.type === 'table' && s.headers?.[0] === '角色');
    expect(roleTable).toBeTruthy();
    expect(roleTable!.headers).toEqual(['角色', '分组', '说明']);
    expect(roleTable!.rows?.length).toBe(3);

    const usecaseHeadings = content.sections.filter((s) => s.type === 'heading3');
    expect(usecaseHeadings).toHaveLength(3);
    expect(content.sections).toEqual(expect.arrayContaining([
      { type: 'heading3', text: '角色用例图：仓单监管员' },
      { type: 'image', text: '角色用例图：仓单监管员', imageIndex: 0 },
    ]));
  });

  it('does not crash with empty roles', () => {
    const doc = { ...createDocument(), roles: [] };
    const exporter = new RoleExporter(doc);
    const content = exporter.getContent();
    expect(content.title).toBe('角色管理');
    expect(content.sections.length).toBeGreaterThanOrEqual(1);
  });
});

describe('RoleScopeExporter', () => {
  it('has label "role-scope"', () => {
    const exporter = new RoleScopeExporter(createDocument());
    expect(exporter.label).toBe('role-scope');
  });

  it('returns minimal content with image placeholder', () => {
    const exporter = new RoleScopeExporter(createDocument());
    const content = exporter.getContent();
    expect(content.sections).toContainEqual({ type: 'image', text: '角色范围截图', imageIndex: 0 });
  });
});

describe('RoleUsecaseExporter', () => {
  it('has label "role-usecase"', () => {
    const exporter = new RoleUsecaseExporter(createDocument());
    expect(exporter.label).toBe('role-usecase');
  });

  it('returns minimal content with image placeholder', () => {
    const exporter = new RoleUsecaseExporter(createDocument());
    const content = exporter.getContent();
    expect(content.sections).toContainEqual({ type: 'image', text: '角色用例图截图', imageIndex: 0 });
  });
});

describe('captureEachRoleUsecase', () => {
  it('requeries the current role button after turning off participating-only mode', async () => {
    const roles = [
      { id: 'r1', name: '角色一' },
      { id: 'r2', name: '角色二' },
      { id: 'r3', name: '角色三' },
    ];
    let selected = 'r1';
    let participatingOnly = false;
    const selectedAtCapture: string[] = [];

    const render = () => {
      const visible = participatingOnly ? roles.filter((role) => role.id === selected) : roles;
      document.body.innerHTML = `
        <input type="checkbox" data-testid="role-participating-only-toggle" ${participatingOnly ? 'checked' : ''}>
        <div data-testid="role-usecase-map">
          ${visible.map((role) => `
            <button class="role-usecase-role" data-role-id="${role.id}" type="button">
              <span class="role-usecase-role-name">${role.name}</span>
            </button>
          `).join('')}
        </div>
      `;
      const toggle = document.querySelector<HTMLInputElement>('[data-testid="role-participating-only-toggle"]')!;
      toggle.addEventListener('change', () => {
        participatingOnly = toggle.checked;
        render();
      });
      document.querySelectorAll<HTMLElement>('.role-usecase-role').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (!btn.isConnected) return;
          selected = String(btn.dataset['roleId'] || '');
          render();
        });
      });
    };
    render();

    await captureEachRoleUsecase(undefined, async () => {
      selectedAtCapture.push(selected);
      return new Uint8Array([selectedAtCapture.length]);
    });

    expect(selectedAtCapture).toEqual(['r1', 'r2', 'r3']);
  });
});
