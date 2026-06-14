import { Injectable } from '@angular/core';
import {
  LegacyFlowEdge,
  LegacyFlowGateway,
  LegacyProcess,
  LegacyProcessNode,
} from '../editor/process-editor-legacy-adapter';

export interface ProcessFlowLayoutOffset {
  dx?: number;
  dy?: number;
}

export interface ProcessFlowSwimlaneLayout {
  laneOrder?: string[];
  items?: Record<string, ProcessFlowLayoutOffset>;
  labels?: Record<string, ProcessFlowLayoutOffset>;
}

@Injectable({ providedIn: 'root' })
export class ProcessFlowModelService {
  // 模块意图：流程视图的模型写操作只修改文档数据，不触发旧 DOM 渲染。
  tasks(process: LegacyProcess | null | undefined): LegacyProcessNode[] {
    if (!process) return [];
    process.nodes ||= process.tasks || [];
    return process.nodes;
  }

  gateways(process: LegacyProcess | null | undefined): LegacyFlowGateway[] {
    return this.normalizeFlow(process).nodes || [];
  }

  edges(process: LegacyProcess | null | undefined): LegacyFlowEdge[] {
    return this.normalizeFlow(process).edges || [];
  }

  addTask(process: LegacyProcess): LegacyProcessNode {
    const list = this.tasks(process);
    const id = this.nextId('T', list);
    const task: LegacyProcessNode = {
      id,
      uid: id,
      name: `新节点${list.length + 1}`,
      userSteps: [],
      forms: [],
      entity_ops: [],
      orchestrationTasks: [],
      businessRules: [],
    };
    list.push(task);
    return task;
  }

  addGateway(process: LegacyProcess): LegacyFlowGateway {
    const list = this.gateways(process);
    const id = this.nextId('B', list);
    const gateway: LegacyFlowGateway = { id, uid: id, kind: 'gateway', gatewayType: 'exclusive', title: '网关', role_id: '' };
    list.push(gateway);
    return gateway;
  }

  addEdge(process: LegacyProcess, from = '', to = ''): LegacyFlowEdge {
    const list = this.edges(process);
    const id = this.nextId('L', list);
    const edge: LegacyFlowEdge = { id, uid: id, from, to, label: '', condition: '' };
    list.push(edge);
    return edge;
  }

  setProcessField(process: LegacyProcess, field: 'name' | 'trigger' | 'outcome', value: string): void {
    process[field] = value;
  }

  setTaskName(task: LegacyProcessNode, value: string): void {
    task.name = value;
  }

  setTaskRoleIds(task: LegacyProcessNode, roleIds: string[]): void {
    // 关键流程：保留旧模型兼容字段，同时以 roleIds 作为多角色事实来源。
    const ids = roleIds.map((item) => String(item || '').trim()).filter(Boolean);
    task.roleIds = ids;
    task.role_id = ids[0] || '';
    task.role = ids[0] || '';
  }

  setGateway(gateway: LegacyFlowGateway, field: 'title' | 'role_id', value: string): void {
    gateway[field] = value;
  }

  setEdge(edge: LegacyFlowEdge, field: 'from' | 'to' | 'label', value: string): void {
    edge[field] = value;
    if (field === 'label') edge.condition = value;
  }

  removeElement(process: LegacyProcess, id: string): void {
    if (!id || id === 'START' || id === 'END') return;
    process.nodes = this.tasks(process).filter((task) => this.nodeId(task) !== id);
    const flow = this.normalizeFlow(process);
    flow.nodes = (flow.nodes || []).filter((gateway) => this.nodeId(gateway) !== id);
    flow.edges = (flow.edges || []).filter((edge) => this.nodeId(edge) !== id && edge.from !== id && edge.to !== id);
  }

  swimlaneLayout(process: LegacyProcess): ProcessFlowSwimlaneLayout {
    const flow = this.normalizeFlow(process);
    const layout = (flow.layout && typeof flow.layout === 'object') ? flow.layout as { swimlane?: ProcessFlowSwimlaneLayout } : {};
    layout.swimlane ||= { laneOrder: [], items: {}, labels: {} };
    layout.swimlane.laneOrder ||= [];
    layout.swimlane.items ||= {};
    layout.swimlane.labels ||= {};
    flow.layout = layout;
    return layout.swimlane;
  }

  setFlowOffset(process: LegacyProcess, key: string, dx: number, dy: number): void {
    // 边界细节：布局属于流程图私有展示数据，不能通过旧 setProcessField 绕路触发旧渲染。
    const layout = this.swimlaneLayout(process);
    layout.items ||= {};
    layout.items[key] = { dx: Math.round(dx), dy: Math.round(dy) };
  }

  private normalizeFlow(process: LegacyProcess | null | undefined): NonNullable<LegacyProcess['flow']> {
    if (!process) return { version: 2, orientation: 'horizontal', nodes: [], edges: [] };
    const rawFlow = process.flow && typeof process.flow === 'object' ? process.flow : {};
    rawFlow.version = Number(rawFlow.version || 2) || 2;
    rawFlow.orientation = rawFlow.orientation === 'vertical' ? 'vertical' : 'horizontal';
    rawFlow.nodes = Array.isArray(rawFlow.nodes) ? rawFlow.nodes : [];
    rawFlow.edges = Array.isArray(rawFlow.edges) ? rawFlow.edges : [];
    process.flow = rawFlow;
    return rawFlow;
  }

  private nextId(prefix: string, items: Array<{ id?: string; uid?: string }>): string {
    const used = new Set(items.map((item) => this.nodeId(item)));
    for (let index = items.length + 1; index < items.length + 200; index += 1) {
      const id = `${prefix}${index}`;
      if (!used.has(id)) return id;
    }
    return `${prefix}${Date.now()}`;
  }

  private nodeId(item: { id?: string; uid?: string }): string {
    return String(item.id || item.uid || '').trim();
  }
}
