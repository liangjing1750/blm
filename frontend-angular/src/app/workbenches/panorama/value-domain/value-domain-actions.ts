import { ValueDomainDraftPort } from './value-domain-draft-port';
import {
  ValueDomainColumn,
  ValueDomainDocument,
  ValueDomainLane,
  ValueDomainStage,
  ValueDomainStageSlot,
  ensureValueDomainModel,
  ensureValueDomainStages,
  findOrCreateValueDomainCell,
  getValueDomainStageId,
} from '../../../core/document/value-domain-model';

// 模块意图：所有会修改文档的数据操作集中在这里，Angular 组件只负责展示和事件转发。
export interface ValueDomainActionsOptions {
  document: ValueDomainDocument;
  draftPort: ValueDomainDraftPort;
  nextId?: (prefix: string) => string;
  setActiveStageId?: (stageId: string) => void;
  clearStageLinkFocus?: (stageId: string) => void;
}

export interface ValueDomainActions {
  columns(): ValueDomainColumn[];
  lanes(): ValueDomainLane[];
  stages(): ValueDomainStage[];
  addColumn(afterId?: string): void;
  moveColumn(columnId: string, dir: number): void;
  removeColumn(columnId: string): Promise<void>;
  setColumn(columnId: string, key: 'name' | 'badge' | 'scope', value: string): void;
  addLane(afterId?: string): void;
  moveLane(laneId: string, dir: number): void;
  removeLane(laneId: string): Promise<void>;
  setLane(laneId: string, key: 'name' | 'badge' | 'note', value: string): void;
  addStage(afterStageId?: string, options?: { name?: string; laneId?: string; columnId?: string; slot?: ValueDomainStageSlot }): ValueDomainStage | null;
  moveStage(stageId: string, dir: number): void;
  removeStage(stageId: string): Promise<void>;
  setStage(stageId: string, key: 'name' | 'subDomain' | 'panoramaColumnUid' | 'panoramaLaneUid', value: string): void;
  setStagePlacement(stageId: string, laneId: string, columnId: string, slot: ValueDomainStageSlot): void;
  setCell(laneId: string, columnId: string, key: 'status' | 'text', value: string): void;
}

// 关键流程：每个 action 修改文档后统一调用 draftPort，保证本地草稿和协作快照链路不被绕过。
export function createValueDomainActions(options: ValueDomainActionsOptions): ValueDomainActions {
  const nextId = options.nextId ?? createDefaultId;

  function model() {
    return ensureValueDomainModel(options.document, nextId);
  }

  function stages() {
    return ensureValueDomainStages(options.document);
  }

  function commit(commitOptions: { sidebar?: boolean } = {}) {
    options.draftPort.markModified();
    if (commitOptions.sidebar) options.draftPort.renderSidebar?.();
  }

  return {
    columns: () => model().columns,
    lanes: () => model().lanes,
    stages,

    addColumn(afterId = '') {
      const columns = model().columns;
      const column = { id: nextId('panorama-column'), name: '', badge: '', scope: '' };
      const index = columns.findIndex((item) => item.id === afterId);
      columns.splice(index >= 0 ? index + 1 : columns.length, 0, column);
      commit();
    },

    moveColumn(columnId: string, dir: number) {
      const columns = model().columns;
      const index = columns.findIndex((item) => item.id === columnId);
      const targetIndex = index + dir;
      if (index < 0 || targetIndex < 0 || targetIndex >= columns.length) return;
      [columns[index], columns[targetIndex]] = [columns[targetIndex], columns[index]];
      commit();
    },

    async removeColumn(columnId: string) {
      const panorama = model();
      if (panorama.columns.length <= 1) return;
      const column = panorama.columns.find((item) => item.id === columnId);
      if (!column) return;
      const affectedStages = stages().filter((stage) => stage.panoramaColumnUid === columnId);
      const message = affectedStages.length
        ? `确认删除价值流「${column.name || column.id}」吗？其中 ${affectedStages.length} 个阶段会保留，但会变成未归类，需要重新放入其他单元格。`
        : `确认删除价值流「${column.name || column.id}」吗？`;
      if (!await confirm(message, '删除价值流')) return;
      panorama.columns = panorama.columns.filter((item) => item.id !== columnId);
      panorama.cells = panorama.cells.filter((item) => (item.columnUid || item.columnId) !== columnId);
      stages().forEach((stage) => {
        if (stage.panoramaColumnUid === columnId) stage.panoramaColumnUid = '';
      });
      commit();
    },

    setColumn(columnId: string, key: 'name' | 'badge' | 'scope', value: string) {
      const column = model().columns.find((item) => item.id === columnId);
      if (!column) return;
      column[key] = value;
      commit();
    },

    addLane(afterId = '') {
      const lanes = model().lanes;
      const lane = { id: nextId('panorama-lane'), name: '', badge: '', note: '' };
      const index = lanes.findIndex((item) => item.id === afterId);
      lanes.splice(index >= 0 ? index + 1 : lanes.length, 0, lane);
      commit();
    },

    moveLane(laneId: string, dir: number) {
      const lanes = model().lanes;
      const index = lanes.findIndex((item) => item.id === laneId);
      const targetIndex = index + dir;
      if (index < 0 || targetIndex < 0 || targetIndex >= lanes.length) return;
      [lanes[index], lanes[targetIndex]] = [lanes[targetIndex], lanes[index]];
      commit();
    },

    async removeLane(laneId: string) {
      const panorama = model();
      if (panorama.lanes.length <= 1) return;
      const lane = panorama.lanes.find((item) => item.id === laneId);
      if (!lane) return;
      const affectedStages = stages().filter((stage) => stage.panoramaLaneUid === laneId);
      const message = affectedStages.length
        ? `确认删除业务域「${lane.name || lane.id}」吗？其中 ${affectedStages.length} 个阶段会保留，但会变成未归类，需要重新放入其他业务域。`
        : `确认删除业务域「${lane.name || lane.id}」吗？`;
      if (!await confirm(message, '删除业务域')) return;
      panorama.lanes = panorama.lanes.filter((item) => item.id !== laneId);
      panorama.cells = panorama.cells.filter((item) => (item.laneUid || item.laneId) !== laneId);
      stages().forEach((stage) => {
        if (stage.panoramaLaneUid === laneId) stage.panoramaLaneUid = '';
      });
      commit();
    },

    setLane(laneId: string, key: 'name' | 'badge' | 'note', value: string) {
      const lane = model().lanes.find((item) => item.id === laneId);
      if (!lane) return;
      lane[key] = value;
      commit();
    },

    addStage(afterStageId = '', addOptions: { name?: string; laneId?: string; columnId?: string; slot?: ValueDomainStageSlot } = {}) {
      const allStages = stages();
      const sourceStage = allStages.find((stage) => getValueDomainStageId(stage) === afterStageId);
      const stage: ValueDomainStage = {
        id: nextStageId(allStages),
        name: addOptions.name || `业务阶段${allStages.length + 1}`,
        subDomain: sourceStage?.subDomain || '',
        panoramaColumnUid: addOptions.columnId || sourceStage?.panoramaColumnUid || model().columns[0]?.id || '',
        panoramaLaneUid: addOptions.laneId || sourceStage?.panoramaLaneUid || model().lanes[0]?.id || '',
        panoramaSlot: addOptions.slot || null,
      };
      const insertIndex = allStages.findIndex((item) => getValueDomainStageId(item) === afterStageId);
      allStages.splice(insertIndex >= 0 ? insertIndex + 1 : allStages.length, 0, stage);
      options.setActiveStageId?.(stage.id || '');
      commit({ sidebar: true });
      return stage;
    },

    moveStage(stageId: string, dir: number) {
      const allStages = stages();
      const index = allStages.findIndex((stage) => getValueDomainStageId(stage) === stageId);
      const targetIndex = index + dir;
      if (index < 0 || targetIndex < 0 || targetIndex >= allStages.length) return;
      [allStages[index], allStages[targetIndex]] = [allStages[targetIndex], allStages[index]];
      options.setActiveStageId?.(stageId);
      commit({ sidebar: true });
    },

    async removeStage(stageId: string) {
      const stage = stages().find((item) => getValueDomainStageId(item) === stageId);
      if (!stage) return;
      if (!await confirm(`确认删除业务阶段 ${stage.name || stageId} 吗？阶段内流程不会删除，但会变成未设置业务阶段。`, '删除业务阶段')) return;
      options.document.stages = stages().filter((item) => getValueDomainStageId(item) !== stageId);
      options.document.stageLinks = (options.document.stageLinks || []).filter((link) => (
        link.fromStageUid !== stageId && link.toStageUid !== stageId
      ));
      const removedRefIds = new Set((options.document.stageFlowRefs || [])
        .filter((ref) => ref.stageUid === stageId)
        .map((ref) => ref.id));
      options.document.stageFlowRefs = (options.document.stageFlowRefs || []).filter((ref) => ref.stageUid !== stageId);
      options.document.stageFlowLinks = (options.document.stageFlowLinks || []).filter((link) => (
        link.stageUid !== stageId && !removedRefIds.has(link.fromRefUid) && !removedRefIds.has(link.toRefUid)
      ));
      options.clearStageLinkFocus?.(stageId);
      commit({ sidebar: true });
    },

    setStage(stageId: string, key: 'name' | 'subDomain' | 'panoramaColumnUid' | 'panoramaLaneUid', value: string) {
      const stage = stages().find((item) => getValueDomainStageId(item) === stageId);
      if (!stage) return;
      stage[key] = value;
      commit({ sidebar: key === 'name' || key === 'subDomain' });
    },

    setStagePlacement(stageId: string, laneId: string, columnId: string, slot: ValueDomainStageSlot) {
      const stage = stages().find((item) => getValueDomainStageId(item) === stageId);
      if (!stage) return;
      stage.panoramaLaneUid = laneId;
      stage.panoramaColumnUid = columnId;
      stage.panoramaSlot = { row: Math.max(0, slot.row), col: Math.max(0, slot.col) };
      stage.panoramaPos = null;
      commit();
    },

    setCell(laneId: string, columnId: string, key: 'status' | 'text', value: string) {
      const cell = findOrCreateValueDomainCell(model(), laneId, columnId);
      cell[key] = value;
      commit();
    },
  };

  // 边界细节：确认框属于运行时能力，核心 action 只依赖端口，不直接访问浏览器全局对象。
  async function confirm(message: string, title: string): Promise<boolean> {
    if (options.draftPort.confirm) {
      return options.draftPort.confirm(message, { title, confirmLabel: '删除' });
    }
    return true;
  }

  function nextStageId(allStages: ValueDomainStage[]): string {
    const usedIds = new Set(allStages.map((stage) => getValueDomainStageId(stage)).filter(Boolean));
    for (let index = 1; index < 10000; index += 1) {
      const id = `S${index}`;
      if (!usedIds.has(id)) return id;
    }
    return nextId('stage');
  }
}

function createDefaultId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}
