import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LegacyEntity,
  LegacyProcess,
  LegacyProcessNode,
  LegacyTaskDefinition,
  LegacyTaskForm,
  LegacyTaskFormSection,
  LegacyFormField,
  LegacyUserStep,
  LegacyBusinessRule,
  LegacyFlowGateway,
  LegacyFlowEdge,
  LegacyRole,
  ProcessStageDisplay,
  ProcessEditorLegacyAdapter,
  createProcessEditorLegacyAdapter,
} from './process-editor-legacy-adapter';

interface ProcessEditorGraphNode {
  id: string;
  kind: 'start' | 'task' | 'gateway' | 'end';
  name: string;
  role: string;
  x: number;
  y: number;
  selected: boolean;
  task?: LegacyProcessNode;
}

interface ProcessEditorGraphEdge {
  id: string;
  label: string;
  d: string;
  labelX: number;
  labelY: number;
}

interface ProcessEditorGraphLane {
  name: string;
  top: number;
  height: number;
}

@Component({
  selector: 'app-process-editor-workbench',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './process-editor-workbench.component.html',
  styleUrl: './process-editor-workbench.component.scss',
})
export class ProcessEditorWorkbenchComponent {
  // 模块意图：流程编辑器先承接旧版抽屉编辑能力，后续再把流程图算法从 legacy 中完整迁出。
  protected readonly version = signal(0);
  protected readonly adapter: ProcessEditorLegacyAdapter = createProcessEditorLegacyAdapter();
  protected readonly entityOps = ['C', 'R', 'U', 'D'];
  protected selectedEntityId = '';
  protected readonly graphWidth = 980;
  protected readonly graphZoom = signal(1);
  private readonly graphLaneHeight = 120;
  private readonly graphLeftGutter = 116;
  private readonly graphStartX = 146;
  private readonly graphNodeStartX = 198;
  private readonly graphColumnGap = 170;
  protected readonly drawerWidthValue = signal(480);

  protected currentProcess(): LegacyProcess | null {
    this.version();
    return this.adapter.currentProcess();
  }

  protected currentTask(): LegacyProcessNode | null {
    this.version();
    return this.adapter.currentTask();
  }

  protected isNodeEditor(): boolean {
    return !!this.currentTask();
  }

  protected processes(): LegacyProcess[] {
    this.version();
    return this.adapter.processes();
  }

  protected tasks(process: LegacyProcess | null): LegacyProcessNode[] {
    this.version();
    return this.adapter.tasks(process);
  }

  protected entities(): LegacyEntity[] {
    this.version();
    return this.adapter.entities();
  }

  protected processId(process: LegacyProcess | null | undefined): string {
    return this.adapter.processId(process);
  }

  protected taskId(task: LegacyProcessNode | null | undefined): string {
    return this.adapter.taskId(task);
  }

  protected taskDefinitions(task: LegacyProcessNode): LegacyTaskDefinition[] {
    task.orchestrationTasks ||= [];
    return task.orchestrationTasks;
  }

  protected gateways(process: LegacyProcess): LegacyFlowGateway[] {
    this.version();
    return this.adapter.gateways(process);
  }

  protected edges(process: LegacyProcess): LegacyFlowEdge[] {
    this.version();
    return this.adapter.edges(process);
  }

  protected graphNodes(process: LegacyProcess, selectedTask: LegacyProcessNode | null): ProcessEditorGraphNode[] {
    // 模块意图：编辑态左侧只负责表达流程结构，所有写操作仍通过 adapter 进入旧数据模型，避免画布和数据维护互相耦合。
    const tasks = this.tasks(process);
    const gateways = this.gateways(process);
    const orderedIds = this.graphOrder(process);
    const taskById = new Map(tasks.map((task) => [this.taskId(task), task]));
    const gatewayById = new Map(gateways.map((gateway) => [this.gatewayId(gateway), gateway]));
    const laneByName = new Map(this.graphLanes(process).map((lane, index) => [lane.name, index]));
    const nodes = orderedIds.map((id, index) => {
      const isStart = id === 'START';
      const isEnd = id === 'END';
      const task = taskById.get(id);
      const gateway = gatewayById.get(id);
      const kind: ProcessEditorGraphNode['kind'] = isStart ? 'start' : isEnd ? 'end' : gateway ? 'gateway' : 'task';
      const laneName = this.displayRoleName(task?.role || task?.role_id || this.taskRoleIds(task || ({} as LegacyProcessNode))[0] || gateway?.role_id || tasks[0]?.role || '业务人员');
      const laneIndex = laneByName.get(laneName) ?? 0;
      const laneTop = laneIndex * this.graphLaneHeight;
      const graphIndex = Math.max(0, index - 1);
      const x = kind === 'start'
        ? this.graphStartX
        : kind === 'end'
        ? this.graphNodeStartX + graphIndex * this.graphColumnGap
        : this.graphNodeStartX + graphIndex * this.graphColumnGap;
      const y = kind === 'gateway' ? laneTop + 74 : laneTop + 54;
      return {
        id,
        kind,
        name: isStart ? '开始' : isEnd ? '结束' : task?.name || gateway?.title || '未命名节点',
        role: isStart || isEnd ? '' : this.displayRoleName(task?.role || task?.role_id || this.taskRoleIds(task || ({} as LegacyProcessNode))[0] || gateway?.role_id || ''),
        x,
        y,
        selected: Boolean(task && selectedTask && this.taskId(task) === this.taskId(selectedTask)),
        task,
      };
    });
    return nodes;
  }

  protected graphLanes(process: LegacyProcess): ProcessEditorGraphLane[] {
    const names = this.tasks(process).map((task) => this.displayRoleName(task.role || task.role_id || this.taskRoleIds(task)[0] || '业务人员'));
    for (const gateway of this.gateways(process)) {
      const name = this.displayRoleName(gateway.role_id || '');
      if (name) names.push(name);
    }
    const unique = [...new Set(names.length ? names : ['业务人员'])];
    return unique.map((name, index) => ({ name, top: index * this.graphLaneHeight, height: this.graphLaneHeight }));
  }

  protected graphCanvasHeight(process: LegacyProcess): number {
    return Math.max(240, this.graphLanes(process).length * this.graphLaneHeight);
  }

  protected graphEdges(process: LegacyProcess, selectedTask: LegacyProcessNode | null): ProcessEditorGraphEdge[] {
    // 关键流程：连线使用直折线，先水平到中点、再垂直、再水平到目标，复刻旧版“流程图编辑”的可读连接方式。
    const nodes = this.graphNodes(process, selectedTask);
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    return this.edges(process)
      .map((edge, index) => {
        const from = nodeById.get(String(edge.from || ''));
        const to = nodeById.get(String(edge.to || ''));
        if (!from || !to) return null;
        const startX = from.x + (from.kind === 'start' ? 24 : 132);
        const startY = from.y + (from.kind === 'start' || from.kind === 'end' ? 12 : 34);
        const endX = to.x + (to.kind === 'end' ? 0 : 0);
        const endY = to.y + (to.kind === 'start' || to.kind === 'end' ? 12 : 34);
        const midX = Math.max(startX + 24, Math.round((startX + endX) / 2));
        return {
          id: String(edge.id || edge.uid || `edge-${index}`),
          label: String(edge.label || edge.condition || ''),
          d: `M ${startX} ${startY} H ${midX} V ${endY} H ${endX}`,
          labelX: midX + 6,
          labelY: Math.min(startY, endY) + Math.abs(endY - startY) / 2 - 6,
        };
      })
      .filter((edge): edge is ProcessEditorGraphEdge => Boolean(edge));
  }

  protected graphCanvasWidth(process: LegacyProcess): number {
    const nodeCount = Math.max(this.graphOrder(process).length, 1);
    return Math.max(this.graphWidth, this.graphNodeStartX + Math.max(0, nodeCount - 2) * this.graphColumnGap + 220);
  }

  protected nudgeGraphZoom(delta: number): void {
    const next = Math.max(0.5, Math.min(1.8, Math.round((this.graphZoom() + delta) * 10) / 10));
    this.graphZoom.set(next);
  }

  protected resetGraphZoom(): void {
    this.graphZoom.set(1);
  }

  protected displayRoleName(roleId: string | undefined): string {
    const raw = String(roleId || '').trim();
    if (!raw) return '';
    const role = this.roles().find((item) => this.roleId(item) === raw || item.name === raw);
    return role?.name || raw;
  }

  protected graphOrder(process: LegacyProcess): string[] {
    // 边界细节：旧数据里可能只有节点、没有连线；此时保持“开始 -> 任务 -> 分支 -> 结束”的稳定顺序，避免空画布。
    const taskIds = this.tasks(process).map((task) => this.taskId(task)).filter(Boolean);
    const gatewayIds = this.gateways(process).map((gateway) => this.gatewayId(gateway)).filter(Boolean);
    const allIds = ['START', ...taskIds, ...gatewayIds, 'END'];
    const ordered: string[] = ['START'];
    const edges = this.edges(process);
    let current = 'START';
    const visited = new Set(ordered);
    for (let guard = 0; guard < allIds.length + edges.length; guard += 1) {
      const next = edges.find((edge) => String(edge.from || '') === current && !visited.has(String(edge.to || '')))?.to;
      if (!next) break;
      ordered.push(String(next));
      visited.add(String(next));
      current = String(next);
      if (current === 'END') break;
    }
    for (const id of allIds) {
      if (!visited.has(id)) ordered.push(id);
    }
    return ordered;
  }

  protected gatewayId(gateway: LegacyFlowGateway): string {
    return String(gateway.id || gateway.uid || '');
  }

  protected edgeId(edge: LegacyFlowEdge): string {
    return String(edge.id || edge.uid || '');
  }

  protected flowNodeOptions(process: LegacyProcess, side: 'from' | 'to'): Array<{ id: string; label: string }> {
    this.version();
    return this.adapter.flowNodeOptions(process, side);
  }

  protected prototypeInputId(process: LegacyProcess): string {
    return `proc-prototype-input-${this.processId(process).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  }

  protected prototypeCount(process: LegacyProcess): number {
    this.version();
    return this.adapter.prototypeFiles(process).length;
  }

  protected uploadPrototypeFiles(process: LegacyProcess): void {
    this.adapter.uploadPrototypeFiles(this.processId(process), this.prototypeInputId(process));
    this.refresh();
  }

  protected roles(): LegacyRole[] {
    this.version();
    return this.adapter.roles();
  }

  protected roleId(role: LegacyRole): string {
    return String(role.id || role.uid || '');
  }

  protected taskRoleIds(task: LegacyProcessNode): string[] {
    this.version();
    return this.adapter.taskRoleIds(task);
  }

  protected taskRoleSummary(task: LegacyProcessNode): string {
    const names = this.taskRoleIds(task).map((roleId) => this.displayRoleName(roleId)).filter(Boolean);
    return names.length ? names.join('、') : '未分配角色';
  }

  protected setTaskRoleIds(task: LegacyProcessNode, roleIds: string[]): void {
    this.adapter.setTaskRoleIds(task, roleIds);
    this.refresh();
  }

  protected stageRefs(process: LegacyProcess): ProcessStageDisplay[] {
    this.version();
    return this.adapter.stageRefs(process);
  }

  protected openStage(stageId: string): void {
    this.adapter.openStage(stageId);
  }

  protected forms(task: LegacyProcessNode): LegacyTaskForm[] {
    task.forms ||= [];
    // 模块意图：节点视图负责把旧版扁平表单升级为“表单-分组-字段”的维护界面。
    // 关键流程：读取表单时统一规范化，后续模板和操作方法只面对稳定结构。
    // 边界细节：仍同步回 form.fields，保证尚未迁移的统计和导出逻辑不失效。
    task.forms.forEach((form, index) => this.normalizeForm(form, index));
    return task.forms;
  }

  protected fields(form: LegacyTaskForm): LegacyFormField[] {
    return this.sections(form).flatMap((section) => section.fields || []);
  }

  protected sections(form: LegacyTaskForm): LegacyTaskFormSection[] {
    this.normalizeForm(form, 0);
    return form.sections || [];
  }

  protected formFieldCount(form: LegacyTaskForm): number {
    return this.sections(form).reduce((sum, section) => sum + (section.fields || []).length, 0);
  }

  protected taskFieldCount(task: LegacyProcessNode): number {
    return this.forms(task).reduce((sum, form) => sum + this.formFieldCount(form), 0);
  }

  protected userSteps(task: LegacyProcessNode): LegacyUserStep[] {
    task.userSteps ||= [];
    return task.userSteps;
  }

  protected businessRules(task: LegacyProcessNode): Array<LegacyBusinessRule | string> {
    task.businessRules ||= [];
    return task.businessRules;
  }

  protected businessRuleKey(rule: LegacyBusinessRule | string, index: number): string {
    return typeof rule === 'string' ? `${index}-${rule}` : String(rule.id || rule.uid || index);
  }

  protected businessRuleValue(rule: LegacyBusinessRule | string): string {
    return typeof rule === 'string' ? rule : String(rule.content || rule.name || '');
  }

  protected businessRuleName(rule: LegacyBusinessRule | string, index: number): string {
    return typeof rule === 'string' ? `规则${index + 1}` : String(rule.name || `规则${index + 1}`);
  }

  protected entityName(entityId: string): string {
    return this.entities().find((entity) => String(entity.id || entity.uid) === entityId)?.name || entityId || '未命名实体';
  }

  protected entityId(entity: LegacyEntity): string {
    return String(entity.id || entity.uid || '');
  }

  protected entityOpId(item: { entity_id?: string; entityId?: string }): string {
    return String((item as { entity_uid?: string }).entity_uid || item.entity_id || item.entityId || '');
  }

  protected hasEntityOp(task: LegacyProcessNode, entityId: string, op: string): boolean {
    const item = (task.entity_ops || []).find((entry) => this.entityOpId(entry) === entityId);
    return Boolean(item?.ops?.includes(op));
  }

  protected availableEntities(task: LegacyProcessNode): LegacyEntity[] {
    const used = new Set((task.entity_ops || []).map((item) => this.entityOpId(item)));
    return this.entities().filter((entity) => !used.has(this.entityId(entity)));
  }

  protected selectTask(task: LegacyProcessNode | null): void {
    this.adapter.selectTask(task ? this.taskId(task) : null);
    this.refresh();
  }

  protected closeEditor(): void {
    this.adapter.closeEditor();
  }

  protected drawerWidth(): number {
    return this.drawerWidthValue();
  }

  protected startDrawerResize(event: MouseEvent): void {
    // 关键流程：Angular 编辑器使用 CSS grid 管理左右两栏；不能复用旧版 startDrawerResize，
    // 旧函数会写 process-flow-view.marginRight，导致左侧流程图被二次挤压甚至消失。
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = this.drawerWidthValue();
    const bodyCursor = document.body.style.cursor;
    const bodyUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';

    const move = (moveEvent: MouseEvent) => {
      const maxWidth = Math.max(360, Math.round(window.innerWidth * 0.72));
      const nextWidth = Math.min(maxWidth, Math.max(360, startWidth + startX - moveEvent.clientX));
      this.drawerWidthValue.set(nextWidth);
      this.adapter.setDrawerWidth(nextWidth);
      this.refresh();
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.body.style.cursor = bodyCursor;
      document.body.style.userSelect = bodyUserSelect;
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }

  protected setProcessField(field: 'name' | 'trigger' | 'outcome', value: string): void {
    this.adapter.setProcessField(field, value);
    this.refresh();
  }

  protected setTaskField(task: LegacyProcessNode, field: 'name' | 'role' | 'description', value: string): void {
    this.adapter.setTaskField(task, field, value);
    this.refresh();
  }

  protected addTask(afterTaskId?: string): void {
    this.adapter.addTask(afterTaskId);
    this.refresh();
  }

  protected removeTask(taskId: string): void {
    this.adapter.removeTask(taskId);
    this.refresh();
  }

  protected moveTask(taskId: string, delta: number): void {
    this.adapter.moveTask(taskId, delta);
    this.refresh();
  }

  protected addGateway(afterGatewayId?: string): void {
    this.adapter.addGateway(afterGatewayId);
    this.refresh();
  }

  protected setGateway(gateway: LegacyFlowGateway, field: 'title' | 'role_id', value: string): void {
    this.adapter.setGateway(gateway, field, value);
    this.refresh();
  }

  protected moveGateway(gatewayId: string, delta: number): void {
    this.adapter.moveGateway(gatewayId, delta);
    this.refresh();
  }

  protected removeGateway(gatewayId: string): void {
    this.adapter.removeGateway(gatewayId);
    this.refresh();
  }

  protected addEdge(afterEdgeId?: string): void {
    this.adapter.addEdge(afterEdgeId);
    this.refresh();
  }

  protected setEdge(edge: LegacyFlowEdge, field: 'from' | 'to' | 'label', value: string): void {
    this.adapter.setEdge(edge, field, value);
    this.refresh();
  }

  protected moveEdge(edgeId: string, delta: number): void {
    this.adapter.moveEdge(edgeId, delta);
    this.refresh();
  }

  protected removeEdge(edgeId: string): void {
    this.adapter.removeEdge(edgeId);
    this.refresh();
  }

  protected addSelectedEntity(task: LegacyProcessNode): void {
    this.adapter.addEntityOp(task, this.selectedEntityId);
    this.selectedEntityId = '';
    this.refresh();
  }

  protected toggleEntityOp(task: LegacyProcessNode, entityId: string, op: string, checked: boolean): void {
    this.adapter.toggleEntityOp(task, entityId, op, checked);
    this.refresh();
  }

  protected removeEntityOp(task: LegacyProcessNode, entityId: string): void {
    this.adapter.removeEntityOp(task, entityId);
    this.refresh();
  }

  protected addUserStep(task: LegacyProcessNode): void {
    this.adapter.addUserStep(task);
    this.refresh();
  }

  protected setUserStep(task: LegacyProcessNode, index: number, value: string): void {
    this.adapter.setUserStep(task, index, value);
    this.refresh();
  }

  protected moveUserStep(task: LegacyProcessNode, index: number, delta: number): void {
    this.adapter.moveUserStep(task, index, delta);
    this.refresh();
  }

  protected removeUserStep(task: LegacyProcessNode, index: number): void {
    this.adapter.removeUserStep(task, index);
    this.refresh();
  }

  protected addForm(task: LegacyProcessNode): void {
    task.forms ||= [];
    const id = this.nextLocalId('F', task.forms);
    task.forms.push({
      id,
      uid: id,
      name: `表单${task.forms.length + 1}`,
      purpose: '',
      sections: [{ id: 'SEC1', uid: 'SEC1', name: '基本信息', note: '', entity_id: '', fields: [] }],
    });
    this.adapter.touch();
    this.refresh();
  }

  protected setFormName(task: LegacyProcessNode, form: LegacyTaskForm, value: string): void {
    this.adapter.setFormName(task, form, value);
    this.refresh();
  }

  protected removeForm(task: LegacyProcessNode, form: LegacyTaskForm): void {
    this.adapter.removeForm(task, form);
    this.refresh();
  }

  protected duplicateForm(task: LegacyProcessNode, form: LegacyTaskForm): void {
    task.forms ||= [];
    const clone = structuredClone(form);
    const id = this.nextLocalId('F', task.forms);
    clone.id = id;
    clone.uid = id;
    clone.name = `${form.name || '表单'} 副本`;
    this.sections(clone).forEach((section, sectionIndex) => {
      const sectionId = `SEC${Date.now()}${sectionIndex}`;
      section.id = sectionId;
      section.uid = sectionId;
      (section.fields || []).forEach((field, fieldIndex) => {
        const fieldId = `FLD${Date.now()}${sectionIndex}${fieldIndex}`;
        field.id = fieldId;
        field.uid = fieldId;
      });
    });
    const index = task.forms.indexOf(form);
    task.forms.splice(index >= 0 ? index + 1 : task.forms.length, 0, clone);
    this.adapter.touch();
    this.refresh();
  }

  protected setFormPurpose(form: LegacyTaskForm, value: string): void {
    form.purpose = value;
    this.adapter.touch();
    this.refresh();
  }

  protected addFormSection(form: LegacyTaskForm, afterSection?: LegacyTaskFormSection): void {
    const sections = this.sections(form);
    const id = this.nextLocalId('SEC', sections);
    const section: LegacyTaskFormSection = { id, uid: id, name: `分组${sections.length + 1}`, note: '', entity_id: '', fields: [] };
    const index = afterSection ? sections.indexOf(afterSection) : -1;
    sections.splice(index >= 0 ? index + 1 : sections.length, 0, section);
    this.adapter.touch();
    this.refresh();
  }

  protected moveFormSection(form: LegacyTaskForm, section: LegacyTaskFormSection, delta: number): void {
    const sections = this.sections(form);
    const index = sections.indexOf(section);
    const nextIndex = index + delta;
    if (index < 0 || nextIndex < 0 || nextIndex >= sections.length) return;
    [sections[index], sections[nextIndex]] = [sections[nextIndex], sections[index]];
    this.adapter.touch();
    this.refresh();
  }

  protected removeFormSection(form: LegacyTaskForm, section: LegacyTaskFormSection): void {
    const sections = this.sections(form);
    if (sections.length <= 1) return;
    form.sections = sections.filter((item) => item !== section);
    this.adapter.touch();
    this.refresh();
  }

  protected setFormSection(section: LegacyTaskFormSection, key: 'name' | 'note' | 'entity_id', value: string): void {
    section[key] = value;
    this.adapter.touch();
    this.refresh();
  }

  protected addFormField(section: LegacyTaskFormSection, afterField?: LegacyFormField): void {
    section.fields ||= [];
    const id = this.nextLocalId('FLD', section.fields);
    const field: LegacyFormField = { id, uid: id, name: '', type: 'Text', required: false, entity_field: '', note: '' };
    const index = afterField ? section.fields.indexOf(afterField) : -1;
    section.fields.splice(index >= 0 ? index + 1 : section.fields.length, 0, field);
    this.adapter.touch();
    this.refresh();
  }

  protected setFormField(field: LegacyFormField, key: 'name' | 'type' | 'note' | 'entity_field', value: string): void {
    field[key] = value;
    this.adapter.touch();
    this.refresh();
  }

  protected setFormFieldRequired(field: LegacyFormField, value: boolean): void {
    this.adapter.setFormFieldRequired(field, value);
    this.refresh();
  }

  protected moveFormField(section: LegacyTaskFormSection, field: LegacyFormField, delta: number): void {
    section.fields ||= [];
    const index = section.fields.indexOf(field);
    const nextIndex = index + delta;
    if (index < 0 || nextIndex < 0 || nextIndex >= section.fields.length) return;
    [section.fields[index], section.fields[nextIndex]] = [section.fields[nextIndex], section.fields[index]];
    this.adapter.touch();
    this.refresh();
  }

  protected removeFormField(section: LegacyTaskFormSection, field: LegacyFormField): void {
    section.fields = (section.fields || []).filter((item) => item !== field);
    this.adapter.touch();
    this.refresh();
  }

  protected addTaskDefinition(task: LegacyProcessNode): void {
    this.adapter.addTaskDefinition(task);
    this.refresh();
  }

  protected setTaskDefinition(taskDefinition: LegacyTaskDefinition, key: 'name' | 'target' | 'address', value: string): void {
    this.adapter.setTaskDefinition(taskDefinition, key, value);
    this.refresh();
  }

  protected removeTaskDefinition(task: LegacyProcessNode, taskDefinition: LegacyTaskDefinition): void {
    this.adapter.removeTaskDefinition(task, taskDefinition);
    this.refresh();
  }

  protected addBusinessRule(task: LegacyProcessNode): void {
    this.adapter.addBusinessRule(task);
    this.refresh();
  }

  protected setBusinessRule(task: LegacyProcessNode, index: number, value: string): void {
    this.adapter.setBusinessRule(task, index, value);
    this.refresh();
  }

  protected setBusinessRuleName(task: LegacyProcessNode, index: number, value: string): void {
    task.businessRules ||= [];
    const current = task.businessRules[index];
    if (!current || typeof current === 'string') {
      task.businessRules[index] = { id: `BR${index + 1}`, uid: `BR${index + 1}`, name: value, content: typeof current === 'string' ? current : '' };
    } else {
      current.name = value;
    }
    this.adapter.touch();
    this.refresh();
  }

  protected moveBusinessRule(task: LegacyProcessNode, index: number, delta: number): void {
    task.businessRules ||= [];
    const nextIndex = index + delta;
    if (index < 0 || nextIndex < 0 || nextIndex >= task.businessRules.length) return;
    [task.businessRules[index], task.businessRules[nextIndex]] = [task.businessRules[nextIndex], task.businessRules[index]];
    this.adapter.touch();
    this.refresh();
  }

  protected removeBusinessRule(task: LegacyProcessNode, index: number): void {
    this.adapter.removeBusinessRule(task, index);
    this.refresh();
  }

  protected refresh(): void {
    this.version.update((value) => value + 1);
  }

  private normalizeForm(form: LegacyTaskForm, index: number): void {
    // 模块意图：兼容旧文档中的 flat fields，同时支撑新版分组编辑。
    // 关键流程：缺少 sections 时创建默认分组，把既有 fields 原样挂进去。
    // 边界细节：不要删除 form.fields，它仍是跨工作台和历史数据的兼容出口。
    form.id ||= form.uid || `F${index + 1}`;
    form.uid ||= form.id;
    if (!Array.isArray(form.sections)) {
      form.sections = [{ id: 'SEC1', uid: 'SEC1', name: '基本信息', note: '', entity_id: form.entity_id || form.entityId || '', fields: form.fields || [] }];
    }
    if (!form.sections.length) {
      form.sections.push({ id: 'SEC1', uid: 'SEC1', name: '基本信息', note: '', entity_id: form.entity_id || form.entityId || '', fields: [] });
    }
    form.sections.forEach((section, sectionIndex) => {
      section.id ||= section.uid || `SEC${sectionIndex + 1}`;
      section.uid ||= section.id;
      section.name ||= `分组${sectionIndex + 1}`;
      section.note ||= '';
      section.entity_id = String(section.entity_id || section.entityId || form.entity_id || form.entityId || '').trim();
      section.fields ||= [];
      section.fields.forEach((field, fieldIndex) => {
        field.id ||= field.uid || `FLD${fieldIndex + 1}`;
        field.uid ||= field.id;
        field.type ||= 'Text';
        field.note ||= '';
        field.entity_field ||= '';
      });
    });
    form.fields = form.sections.flatMap((section) => section.fields || []);
  }

  private nextLocalId(prefix: string, items: Array<{ id?: string; uid?: string }>): string {
    // 模块意图：前端草稿内生成稳定局部 ID，避免新增项在同一轮编辑中互相覆盖。
    // 关键流程：优先按当前集合长度递增，冲突时继续寻找空位。
    // 边界细节：这里不承担后端全局 ID 语义，保存/同步仍由外层文档机制处理。
    const used = new Set(items.map((item) => String(item.id || item.uid || '')));
    for (let index = items.length + 1; index < items.length + 200; index += 1) {
      const id = `${prefix}${index}`;
      if (!used.has(id)) return id;
    }
    return `${prefix}${Date.now()}`;
  }
}
