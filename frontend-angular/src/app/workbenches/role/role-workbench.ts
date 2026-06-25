import { CommonModule } from '@angular/common';
import { Component, Input, signal, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { confirmRuntimeAction, getAngularRuntimeState, markAngularRuntimeModified } from '../../core/runtime/angular-runtime';

interface LegacyRole {
  id?: string;
  uid?: string;
  name?: string;
  desc?: string;
  group?: string;
}

interface LegacyProcess {
  id?: string;
  uid?: string;
  name?: string;
  nodes?: LegacyNode[];
  tasks?: LegacyNode[];
}

interface LegacyNode {
  id?: string;
  uid?: string;
  name?: string;
  role?: string;
  roles?: string[];
  role_id?: string;
  role_uid?: string;
  role_ids?: string[];
  role_uids?: string[];
  orchestrationTasks?: unknown[];
}

interface LegacyStage {
  id?: string;
  uid?: string;
  name?: string;
  panoramaColumnUid?: string;
  panoramaLaneUid?: string;
}

interface LegacyStageFlowRef {
  stageUid?: string;
  stageId?: string;
  processUid?: string;
  processId?: string;
}

interface LegacyPanorama {
  columns?: Array<{ uid?: string; id?: string; name?: string }>;
  lanes?: Array<{ uid?: string; id?: string; name?: string }>;
}

interface RoleUsage {
  process: LegacyProcess;
  node: LegacyNode;
}

interface RoleMapFrame {
  name: string;
  subtitle?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RoleMapRoleNode {
  role: LegacyRole;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RoleMapProcessNode {
  process: LegacyProcess;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RoleMapLine {
  path: string;
  labelX: number;
  labelY: number;
  taskCount: number;
}

interface RoleMapLayout {
  height: number;
  roleFrames: RoleMapFrame[];
  processFrames: RoleMapFrame[];
  roleNodes: RoleMapRoleNode[];
  processNodes: RoleMapProcessNode[];
  lines: RoleMapLine[];
}

interface LegacyWindow extends Window {
  S?: {
    doc?: {
      roles?: LegacyRole[];
      processes?: LegacyProcess[];
      stages?: LegacyStage[];
      stageFlowRefs?: LegacyStageFlowRef[];
      panorama?: LegacyPanorama;
    };
    ui?: Record<string, unknown>;
  };
  markModified?: () => void;
  render?: () => void;
  switchMainTab?: (mainTabId: string) => void;
  openProcessEditor?: (processId: string, nodeId?: string | null) => void;
  showAppConfirm?: (message: string, options?: Record<string, unknown>) => Promise<boolean>;
}

@Component({
  selector: 'app-role-workbench',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './role-workbench.html',
  styleUrls: ['./role-workbench.scss', './role-management.scss', './role-usecase.scss'],
})
export class RoleWorkbenchComponent implements OnInit, OnDestroy {
  // 模块意图：角色 tab 先完成 Angular 承载，数据仍通过 legacy 文档适配，避免本轮冲击后端模型。
  // 关键流程：本地编辑通过 markChanged() 递增 version 信号触发重渲染；
  //           远端同步通过 blm-workbench-refresh 事件同样递增 version，实现双窗口数据一致。
  // 边界细节：远端同步后需校验 selectedRoleId，若角色已被另一窗口删除则回退到第一个角色。
  protected readonly mode = signal<'management' | 'view'>(this.initialMode());
  protected readonly selectedRoleId = signal(this.currentRoleId());
  protected readonly version = signal(0);
  protected readonly createOpen = signal(false);
  @Input() editing = true;
  protected newRoleName = '';
  protected selectedGroup = this.defaultRoleGroup();
  protected customGroup = '';
  protected participatingOnly = Boolean(this.legacy().S?.ui?.['roleParticipatingOnly']);

  // 远端同步刷新监听器引用，ngOnDestroy 时移除
  private readonly onRefresh = () => {
    this.version.update((v) => v + 1);
    const current = this.roles().find((r) => this.roleIdentity(r) === this.selectedRoleId());
    if (!current) {
      this.selectedRoleId.set(this.roleIdentity(this.roles()[0] || {}));
    }
  };

  ngOnInit(): void {
    window.addEventListener('blm-workbench-refresh', this.onRefresh);
  }

  ngOnDestroy(): void {
    window.removeEventListener('blm-workbench-refresh', this.onRefresh);
  }

  protected roles(): LegacyRole[] {
    this.version();
    return this.document().roles || [];
  }

  protected roleGroups(): Array<{ name: string; roles: LegacyRole[] }> {
    const groups = new Map<string, LegacyRole[]>();
    for (const role of this.roles()) {
      const group = this.roleGroup(role);
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group)?.push(role);
    }
    return Array.from(groups.entries()).map(([name, roles]) => ({ name, roles }));
  }

  protected availableGroups(): string[] {
    const names = this.roleGroups().map((group) => group.name);
    return names.length ? names : ['业务参与方'];
  }

  protected selectedRole(): LegacyRole | null {
    return this.findRole(this.selectedRoleId());
  }

  protected roleIdentity(role: LegacyRole): string {
    return String(role.uid || role.id || role.name || '').trim();
  }

  protected roleGroup(role: LegacyRole): string {
    return String(role.group || '未分组').trim() || '未分组';
  }

  protected roleUsage(role: LegacyRole | null): RoleUsage[] {
    if (!role) return [];
    const keys = new Set([role.uid, role.id, role.name].filter(Boolean).map(String));
    const usage: RoleUsage[] = [];
    for (const process of this.document().processes || []) {
      for (const node of this.processNodes(process)) {
        const nodeKeys = [
          node.role,
          node.role_id,
          node.role_uid,
          ...(node.roles || []),
          ...(node.role_ids || []),
          ...(node.role_uids || []),
        ].filter(Boolean).map(String);
        if (nodeKeys.some((key) => keys.has(key))) usage.push({ process, node });
      }
    }
    return usage;
  }

  protected roleUsageSummary(role: LegacyRole): string {
    const usage = this.roleUsage(role);
    return usage.length ? `${usage.length}N` : '未使用';
  }

  protected usedRoleCount(): number {
    return this.roles().filter((role) => this.roleUsage(role).length > 0).length;
  }

  protected processGroups(): Array<{ process: LegacyProcess; nodes: LegacyNode[] }> {
    const role = this.selectedRole();
    if (!role) return [];
    const usage = this.roleUsage(role);
    const grouped = new Map<string, { process: LegacyProcess; nodes: LegacyNode[] }>();
    for (const item of usage) {
      const key = String(item.process.uid || item.process.id || item.process.name || '');
      if (!grouped.has(key)) grouped.set(key, { process: item.process, nodes: [] });
      grouped.get(key)?.nodes.push(item.node);
    }
    return Array.from(grouped.values());
  }

  protected visibleProcesses(): LegacyProcess[] {
    if (!this.participatingOnly) return this.document().processes || [];
    return this.processGroups().map((group) => group.process);
  }

  protected visibleRoles(): LegacyRole[] {
    if (!this.participatingOnly) return this.roles();
    return this.selectedRole() ? [this.selectedRole()!] : [];
  }

  protected processLinked(process: LegacyProcess): boolean {
    return this.processGroups().some((group) => group.process === process);
  }

  protected processNodeCount(process: LegacyProcess): number {
    return this.processGroups().find((group) => group.process === process)?.nodes.length || 0;
  }

  protected roleProcessCount(role: LegacyRole): number {
    return new Set(this.roleUsage(role).map((item) => this.processIdentity(item.process))).size;
  }

  protected roleMapLayout(): RoleMapLayout {
    const selectedRole = this.selectedRole();
    const usageByProcess = this.selectedRoleUsageByProcess();
    const roleGroups = this.participatingOnly && selectedRole
      ? [{ name: this.roleGroup(selectedRole), roles: [selectedRole] }]
      : this.roleGroups();
    const processes = this.participatingOnly ? this.processGroups().map((group) => group.process) : this.document().processes || [];
    const processGroups = this.processContextGroups(processes);

    const roleFrames: RoleMapFrame[] = [];
    const roleNodes: RoleMapRoleNode[] = [];
    let roleY = 24;
    for (const group of roleGroups) {
      const frameHeight = 58 + group.roles.length * 48;
      roleFrames.push({ name: group.name, x: 24, y: roleY, width: 280, height: frameHeight });
      group.roles.forEach((role, index) => {
        roleNodes.push({ role, x: 48, y: roleY + 40 + index * 48, width: 236, height: 38 });
      });
      roleY += frameHeight + 18;
    }

    const processFrames: RoleMapFrame[] = [];
    const processNodes: RoleMapProcessNode[] = [];
    const columnX = [380, 740];
    const columnHeights = [24, 24];
    for (const group of processGroups) {
      const frameHeight = 78 + group.items.length * 44;
      const columnIndex = columnHeights[0] <= columnHeights[1] ? 0 : 1;
      const frameX = columnX[columnIndex];
      const frameY = columnHeights[columnIndex];
      processFrames.push({ name: group.name, subtitle: group.subtitle, x: frameX, y: frameY, width: 320, height: frameHeight });
      group.items.forEach((process, index) => {
        processNodes.push({ process, x: frameX + 24, y: frameY + 58 + index * 42, width: 272, height: 34 });
      });
      columnHeights[columnIndex] += frameHeight + 18;
    }

    const selectedNode = selectedRole
      ? roleNodes.find((node) => this.roleIdentity(node.role) === this.roleIdentity(selectedRole))
      : undefined;
    const lines = selectedNode
      ? processNodes
        .filter((node) => usageByProcess.has(this.processIdentity(node.process)))
        .map((node) => {
          const taskCount = usageByProcess.get(this.processIdentity(node.process))?.length || 0;
          const startX = selectedNode.x + selectedNode.width;
          const startY = selectedNode.y + selectedNode.height / 2;
          const endX = node.x;
          const endY = node.y + node.height / 2;
          const midX = startX + (endX - startX) / 2;
          return {
            path: `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`,
            taskCount,
            labelX: midX + 4,
            labelY: endY - 6,
          };
        })
      : [];

    return {
      height: Math.max(roleY, ...columnHeights) + 24,
      roleFrames,
      processFrames,
      roleNodes,
      processNodes,
      lines,
    };
  }

  protected processContextLabel(process: LegacyProcess): string {
    const stage = this.stageForProcess(process);
    if (!stage) return '';
    const doc = this.document();
    const laneId = String(stage.panoramaLaneUid || '');
    const columnId = String(stage.panoramaColumnUid || '');
    const lane = doc.panorama?.lanes?.find((item) => [item.uid, item.id].filter(Boolean).map(String).includes(laneId));
    const column = doc.panorama?.columns?.find((item) => [item.uid, item.id].filter(Boolean).map(String).includes(columnId));
    return [lane?.name, column?.name].filter(Boolean).join(' / ');
  }

  protected processStageLabel(process: LegacyProcess): string {
    const stage = this.stageForProcess(process);
    return stage?.name ? `阶段：${stage.name}` : '';
  }

  protected selectRole(role: LegacyRole): void {
    const roleId = this.roleIdentity(role);
    this.selectedRoleId.set(roleId);
    this.legacy().S!.ui!['roleId'] = roleId;
    this.mode.set('view');
    this.legacy().S!.ui!['roleWorkbenchMode'] = 'view';
  }

  protected showManagement(): void {
    this.mode.set('management');
    this.legacy().S!.ui!['roleWorkbenchMode'] = 'management';
  }

  protected showView(): void {
    const selected = this.selectedRole() || this.roles()[0];
    if (selected) this.selectedRoleId.set(this.roleIdentity(selected));
    this.mode.set('view');
    this.legacy().S!.ui!['roleWorkbenchMode'] = 'view';
  }

  protected toggleMode(): void {
    if (this.mode() === 'view') this.showManagement();
    else this.showView();
  }

  protected openCreateRole(): void {
    if (!this.editing) return;
    this.createOpen.update((value) => !value);
  }

  protected addRole(): void {
    if (!this.editing) return;
    const name = (this.newRoleName || '新角色').trim();
    const group = this.selectedGroup === '__custom__' ? this.customGroup.trim() : this.selectedGroup;
    if (!group) return;
    const role: LegacyRole = {
      uid: this.nextRoleId(),
      id: this.nextRoleId(),
      name: this.uniqueRoleName(name),
      group,
      desc: '',
    };
    this.document().roles = [...this.roles(), role];
    this.newRoleName = '';
    this.customGroup = '';
    this.selectedGroup = group;
    this.selectedRoleId.set(this.roleIdentity(role));
    this.legacy().S!.ui!['roleId'] = this.roleIdentity(role);
    this.createOpen.set(false);
    this.markChanged();
  }

  protected async removeRole(role: LegacyRole, event: Event): Promise<void> {
    event.stopPropagation();
    if (!this.editing) return;
    if (this.roleUsage(role).length) return;
    const confirmed = await (this.legacy().showAppConfirm?.(`确认删除角色”${role.name || this.roleIdentity(role)}”？`, {
      title: '删除角色',
      confirmLabel: '删除',
    }) ?? Promise.resolve(window.confirm(`确认删除角色”${role.name || this.roleIdentity(role)}”？`)));
    if (!confirmed) return;
    const target = this.roleIdentity(role);
    const beforeLength = this.roles().length;
    const beforeUids = this.roles().map(r => r.uid || r.id).join(',');
    console.log('[removeRole] 删除前 roles:', beforeLength, 'uids:', beforeUids);
    this.document().roles = this.roles().filter((item) => this.roleIdentity(item) !== target);
    const afterLength = this.roles().length;
    const afterUids = this.roles().map(r => r.uid || r.id).join(',');
    console.log('[removeRole] 删除后 roles:', afterLength, 'uids:', afterUids);
    console.log('[removeRole] runtime.doc === this.document():', getAngularRuntimeState().doc === this.document());
    this.selectedRoleId.set(this.roleIdentity(this.roles()[0] || {}));
    this.markChanged();
  }

  protected setParticipatingOnly(value: boolean): void {
    this.participatingOnly = value;
    this.legacy().S!.ui!['roleParticipatingOnly'] = value;
  }

  protected openProcessNode(process: LegacyProcess, node: LegacyNode): void {
    const processId = String(process.uid || process.id || '');
    const nodeId = String(node.uid || node.id || '');
    if (!processId) return;
    const legacy = this.legacy();
    legacy.switchMainTab?.('processWorkbench');
    legacy.openProcessEditor?.(processId, nodeId || null);
  }

  protected openProcess(process: LegacyProcess): void {
    const processId = this.processIdentity(process);
    if (!processId) return;
    const legacy = this.legacy();
    legacy.switchMainTab?.('processWorkbench');
    legacy.openProcessEditor?.(processId, null);
  }

  private document(): NonNullable<LegacyWindow['S']>['doc'] & {
    roles: LegacyRole[];
    processes: LegacyProcess[];
    stages?: LegacyStage[];
    stageFlowRefs?: LegacyStageFlowRef[];
    panorama?: LegacyPanorama;
  } {
    const legacy = this.legacy();
    if (!legacy.S) legacy.S = {};
    if (!legacy.S.doc) legacy.S.doc = {};
    if (!legacy.S.doc.roles) legacy.S.doc.roles = [];
    if (!legacy.S.doc.processes) legacy.S.doc.processes = [];
    if (!legacy.S.ui) legacy.S.ui = {};
    return legacy.S.doc as NonNullable<LegacyWindow['S']>['doc'] & {
      roles: LegacyRole[];
      processes: LegacyProcess[];
      stages?: LegacyStage[];
      stageFlowRefs?: LegacyStageFlowRef[];
      panorama?: LegacyPanorama;
    };
  }

  private initialMode(): 'management' | 'view' {
    return this.legacy().S?.ui?.['roleWorkbenchMode'] === 'view' ? 'view' : 'management';
  }

  private currentRoleId(): string {
    return String(this.legacy().S?.ui?.['roleId'] || this.roleIdentity(this.document().roles[0] || {}));
  }

  private defaultRoleGroup(): string {
    return this.availableGroups()[0] || '业务参与方';
  }

  private processNodes(process: LegacyProcess): LegacyNode[] {
    return process.nodes || process.tasks || [];
  }

  protected processIdentity(process: LegacyProcess): string {
    return String(process.uid || process.id || process.name || '').trim();
  }

  private selectedRoleUsageByProcess(): Map<string, LegacyNode[]> {
    const map = new Map<string, LegacyNode[]>();
    for (const item of this.roleUsage(this.selectedRole())) {
      const processId = this.processIdentity(item.process);
      if (!map.has(processId)) map.set(processId, []);
      map.get(processId)?.push(item.node);
    }
    return map;
  }

  private processContextGroups(processes: LegacyProcess[]): Array<{ name: string; subtitle: string; items: LegacyProcess[]; sortKey: string }> {
    const groups = new Map<string, { name: string; subtitle: string; items: LegacyProcess[]; sortKey: string }>();
    for (const process of processes) {
      const context = this.processContextLabel(process) || '未放入阶段';
      const stage = this.processStageLabel(process) || '流程尚未归入任何阶段';
      const key = `${context}::${stage}`;
      if (!groups.has(key)) groups.set(key, { name: context, subtitle: stage, items: [], sortKey: key });
      groups.get(key)?.items.push(process);
    }
    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        items: group.items.sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'zh-Hans-CN')),
      }))
      .sort((left, right) => left.sortKey.localeCompare(right.sortKey, 'zh-Hans-CN'));
  }

  private stageForProcess(process: LegacyProcess): LegacyStage | null {
    const doc = this.document();
    const processId = String(process.uid || process.id || '');
    const ref = doc.stageFlowRefs?.find((item) => [item.processUid, item.processId].filter(Boolean).map(String).includes(processId));
    const stageId = String(ref?.stageUid || ref?.stageId || '');
    if (!stageId) return null;
    return doc.stages?.find((stage) => [stage.uid, stage.id].filter(Boolean).map(String).includes(stageId)) || null;
  }

  private findRole(roleId: string): LegacyRole | null {
    return this.roles().find((role) => [role.uid, role.id, role.name].filter(Boolean).map(String).includes(roleId)) || null;
  }

  private uniqueRoleName(baseName: string): string {
    const existing = new Set(this.roles().map((role) => String(role.name || '').trim()));
    if (!existing.has(baseName)) return baseName;
    let index = 2;
    while (existing.has(`${baseName}${index}`)) index += 1;
    return `${baseName}${index}`;
  }

  private nextRoleId(): string {
    const existing = new Set(this.roles().flatMap((role) => [role.uid, role.id]).filter(Boolean).map(String));
    let index = this.roles().length + 1;
    while (existing.has(`R${index}`)) index += 1;
    return `R${index}`;
  }

  private markChanged(): void {
    this.version.update((value) => value + 1);
    this.legacy().markModified?.();
  }

  private legacy(): LegacyWindow {
    const runtime = getAngularRuntimeState();
    return {
      S: { doc: runtime.doc, ui: runtime.ui },
      markModified: () => markAngularRuntimeModified(),
      showAppConfirm: (message: string, options?: Record<string, unknown>) => confirmRuntimeAction(message, {
        title: String(options?.['title'] || ''),
        confirmLabel: String(options?.['confirmLabel'] || ''),
        cancelLabel: String(options?.['cancelLabel'] || ''),
      }),
    } as LegacyWindow;
  }
}
