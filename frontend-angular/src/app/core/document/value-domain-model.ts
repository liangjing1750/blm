// 模块意图：价值流与业务域矩阵是跨工作台业务模型，不归属于某个具体 tab。
export interface ValueDomainDocument {
  panorama?: {
    columns?: ValueDomainColumn[];
    lanes?: ValueDomainLane[];
    cells?: ValueDomainCell[];
  };
  processes?: Array<{ id?: string; uid?: string }>;
  stages?: ValueDomainStage[];
  stageLinks?: Array<{ fromStageUid?: string; toStageUid?: string }>;
  stageFlowRefs?: Array<{ id?: string; stageUid?: string; processUid?: string }>;
  stageFlowLinks?: Array<{ stageUid?: string; fromRefUid?: string; toRefUid?: string }>;
}

export interface ValueDomainColumn {
  uid: string;
  name?: string;
  badge?: string;
  scope?: string;
}

export interface ValueDomainLane {
  uid: string;
  name?: string;
  badge?: string;
  note?: string;
}

export interface ValueDomainCell {
  laneUid?: string;
  columnUid?: string;
  status?: string;
  text?: string;
}

export interface ValueDomainStage {
  id?: string;
  uid?: string;
  name?: string;
  subDomain?: string;
  panoramaColumnUid?: string;
  panoramaLaneUid?: string;
  panoramaSlot?: ValueDomainStageSlot | null;
  panoramaPos?: { x?: number; y?: number } | null;
}

export interface ValueDomainModel {
  columns: ValueDomainColumn[];
  lanes: ValueDomainLane[];
  cells: ValueDomainCell[];
}

// 关键流程：阶段在矩阵中不只属于某个单元格，还可以落在单元格内的精确槽位。
export interface ValueDomainStageSlot {
  row: number;
  col: number;
}

export function ensureValueDomainModel(document: ValueDomainDocument, nextId: (prefix: string) => string): ValueDomainModel {
  document.panorama ??= {};
  document.panorama.columns ??= [];
  document.panorama.lanes ??= [];
  document.panorama.cells ??= [];
  if (!document.panorama.columns.length) {
    document.panorama.columns.push({ uid: nextId('panorama-column'), name: '默认价值流', badge: '', scope: '' });
  }
  if (!document.panorama.lanes.length) {
    document.panorama.lanes.push({ uid: nextId('panorama-lane'), name: '默认业务域', badge: '', note: '' });
  }
  return document.panorama as ValueDomainModel;
}

export function ensureValueDomainStages(document: ValueDomainDocument): ValueDomainStage[] {
  if (!Array.isArray(document.stages)) document.stages = [];
  return document.stages;
}

export function getValueDomainStageId(stage: ValueDomainStage): string {
  return String(stage.id || stage.uid || '');
}

export function getValueDomainColumnUid(column: ValueDomainColumn | null | undefined): string {
  return String(column?.uid || '');
}

export function getValueDomainLaneUid(lane: ValueDomainLane | null | undefined): string {
  return String(lane?.uid || '');
}

export function findOrCreateValueDomainCell(model: ValueDomainModel, laneUid: string, columnUid: string): ValueDomainCell {
  let cell = model.cells.find((item) => (
    item.laneUid === laneUid && item.columnUid === columnUid
  ));
  if (!cell) {
    cell = { laneUid, columnUid, status: '', text: '' };
    model.cells.push(cell);
  }
  return cell;
}
