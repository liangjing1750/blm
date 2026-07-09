import { ValueDomainColumn, ValueDomainLane, ensureValueDomainModel } from '../../../core/document/value-domain-model';
import { emitRuntimeRefresh, getAngularRuntimeState, markAngularRuntimeModified, navigateAngularWorkbench } from '../../../core/runtime/angular-runtime';

export interface LegacyStage {
  uid?: string;
  id?: string;
  name?: string;
  subDomain?: string;
  panoramaColumnUid?: string;
  panoramaColumnId?: string;
  panoramaLaneUid?: string;
  panoramaLaneId?: string;
  panoramaSlot?: { row?: number; col?: number } | null;
  virtual?: boolean;
}

export interface LegacyProcess {
  uid?: string;
  id?: string;
  name?: string;
  subDomain?: string;
  flowGroup?: string;
  stageUid?: string;
  stageId?: string;
  nodes?: unknown[];
}

export interface LegacyStageFlowRef {
  uid?: string;
  id?: string;
  stageUid?: string;
  stageId?: string;
  processUid?: string;
  processId?: string;
  order?: number;
  pos?: { x?: number; y?: number };
}

export interface LegacyStageFlowLink {
  uid?: string;
  id?: string;
  stageUid?: string;
  stageId?: string;
  fromRefUid?: string;
  fromRefId?: string;
  toRefUid?: string;
  toRefId?: string;
}

export interface ProcessStageDocument {
  stages?: LegacyStage[];
  processes?: LegacyProcess[];
  stageFlowRefs?: LegacyStageFlowRef[];
  stageFlowLinks?: LegacyStageFlowLink[];
  stageLinks?: Array<{ fromStageUid?: string; fromStageId?: string; toStageUid?: string; toStageId?: string }>;
  panorama?: unknown;
}

interface LegacyState {
  doc?: ProcessStageDocument;
  ui?: {
    stageId?: string;
    stageViewMode?: 'panorama' | 'detail';
    stageEditorCollapsed?: boolean;
    procView?: string;
    procId?: string;
    taskId?: string | null;
  };
}

interface LegacyWindow {
  S?: LegacyState;
  markModified?: () => void;
  renderSidebar?: () => void;
  renderProcessTab?: () => void;
  navigate?: (tab: string, options?: Record<string, unknown>) => void;
}

export interface ProcessStageLegacyAdapter {
  document(): ProcessStageDocument;
  ui(): NonNullable<LegacyState['ui']>;
  columns(): ValueDomainColumn[];
  lanes(): ValueDomainLane[];
  stages(): LegacyStage[];
  processes(): LegacyProcess[];
  stageId(stage: LegacyStage | null | undefined): string;
  processId(process: LegacyProcess | null | undefined): string;
  refId(ref: LegacyStageFlowRef | null | undefined): string;
  stageRefs(stageId: string): LegacyStageFlowRef[];
  stageProcesses(stageId: string): Array<{ ref: LegacyStageFlowRef; process: LegacyProcess | null }>;
  stageLinks(stageId: string): LegacyStageFlowLink[];
  processCount(stageId: string): number;
  openPanorama(): void;
  openDetail(stageId: string): void;
  openProcess(processId: string): void;
  setStageName(stageId: string, value: string): void;
  setProcessName(processId: string, value: string): void;
  setProcessGroup(processId: string, value: string): void;
  setRefOffset(refId: string, offset: { x: number; y: number }): void;
  addProcess(stageId: string): void;
  addExistingProcess(stageId: string, processId: string): void;
  duplicateProcess(processId: string): void;
  removeProcessFromStage(stageId: string, processId: string): void;
  deleteProcess(processId: string): void;
  addLink(stageId: string, fromRefId: string, toRefId: string): void;
  removeLink(stageId: string, linkId: string): void;
}

export function createProcessStageLegacyAdapter(legacyWindow: LegacyWindow = getAngularRuntimeState() as LegacyWindow): ProcessStageLegacyAdapter {
  const state = () => {
    const direct = legacyWindow as LegacyWindow & { doc?: ProcessStageDocument; ui?: LegacyState['ui'] };
    if (direct.doc || direct.ui) return { doc: direct.doc, ui: direct.ui };
    return legacyWindow.S || {};
  };
  const document = () => state().doc || {};
  const ui = () => {
    state().ui ||= {};
    return state().ui as NonNullable<LegacyState['ui']>;
  };

  function markModified(sidebar = false): void {
    if (legacyWindow.markModified) legacyWindow.markModified();
    else markAngularRuntimeModified();
    if (sidebar) {
      if (legacyWindow.renderSidebar) legacyWindow.renderSidebar();
      else emitRuntimeRefresh();
    }
  }

  function stageId(stage: LegacyStage | null | undefined): string {
    return String(stage?.id || stage?.uid || '').trim();
  }

  function processId(process: LegacyProcess | null | undefined): string {
    return String(process?.id || process?.uid || '').trim();
  }

  function refId(ref: LegacyStageFlowRef | null | undefined): string {
    return String(ref?.id || ref?.uid || '').trim();
  }

  function findStage(targetId: string): LegacyStage | undefined {
    return (document().stages || []).find((stage) => stageId(stage) === targetId || stage.id === targetId || stage.uid === targetId);
  }

  function findProcess(targetId: string): LegacyProcess | undefined {
    return (document().processes || []).find((process) => processId(process) === targetId || process.id === targetId || process.uid === targetId);
  }

  function refsForStage(targetStageId: string): LegacyStageFlowRef[] {
    const stage = findStage(targetStageId);
    const keys = new Set([targetStageId, stage?.uid, stage?.id].filter(Boolean));
    return (document().stageFlowRefs || [])
      .filter((ref) => keys.has(ref.stageUid || '') || keys.has(ref.stageId || ''))
      .sort((left, right) => Number(left.order || 0) - Number(right.order || 0));
  }

  function processForRef(ref: LegacyStageFlowRef): LegacyProcess | null {
    return findProcess(ref.processUid || ref.processId || '') || null;
  }

  function nextProcessId(): string {
    const used = new Set((document().processes || []).map((process) => process.id || process.uid).filter(Boolean));
    for (let index = 1; index < 10000; index += 1) {
      const id = `P${index}`;
      if (!used.has(id)) return id;
    }
    return `P${Date.now()}`;
  }

  function nextRefId(): string {
    const used = new Set((document().stageFlowRefs || []).map((ref) => ref.id || ref.uid).filter(Boolean));
    for (let index = 1; index < 10000; index += 1) {
      const id = `SFR${index}`;
      if (!used.has(id)) return id;
    }
    return `SFR${Date.now()}`;
  }

  function nextLinkId(): string {
    const used = new Set((document().stageFlowLinks || []).map((link) => link.id || link.uid).filter(Boolean));
    for (let index = 1; index < 10000; index += 1) {
      const id = `SFL${index}`;
      if (!used.has(id)) return id;
    }
    return `SFL${Date.now()}`;
  }

  function nextId(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  return {
    document,
    ui,
    columns: () => ensureValueDomainModel(document() as never, nextId).columns,
    lanes: () => ensureValueDomainModel(document() as never, nextId).lanes,
    stages: () => document().stages || [],
    processes: () => document().processes || [],
    stageId,
    processId,
    refId,
    stageRefs: refsForStage,
    stageProcesses: (targetStageId: string) => refsForStage(targetStageId).map((ref) => ({ ref, process: processForRef(ref) })),
    stageLinks: (targetStageId: string) => {
      const refIds = new Set(refsForStage(targetStageId).map(refId));
      return (document().stageFlowLinks || []).filter((link) => (
        (link.stageUid === targetStageId || link.stageId === targetStageId)
        || (refIds.has(link.fromRefUid || link.fromRefId || '') && refIds.has(link.toRefUid || link.toRefId || ''))
      ));
    },
    processCount: (targetStageId: string) => refsForStage(targetStageId).length,
    openPanorama() {
      ui().procView = 'stage';
      ui().stageViewMode = 'panorama';
      ui().stageEditorCollapsed = true;
      if (legacyWindow.renderProcessTab) legacyWindow.renderProcessTab();
      else emitRuntimeRefresh();
    },
    openDetail(targetStageId: string) {
      ui().procView = 'stage';
      ui().stageViewMode = 'detail';
      ui().stageId = targetStageId;
      if (legacyWindow.renderProcessTab) legacyWindow.renderProcessTab();
      else emitRuntimeRefresh();
    },
    openProcess(targetProcessId: string) {
      if (legacyWindow.navigate) legacyWindow.navigate('process', { procId: targetProcessId, taskId: null });
      else navigateAngularWorkbench('process', { procId: targetProcessId, taskId: null });
    },
    setStageName(targetStageId: string, value: string) {
      const stage = findStage(targetStageId);
      if (!stage) return;
      stage.name = value;
      markModified(true);
    },
    setProcessName(targetProcessId: string, value: string) {
      const process = findProcess(targetProcessId);
      if (!process) return;
      process.name = value;
      markModified(true);
    },
    setProcessGroup(targetProcessId: string, value: string) {
      const process = findProcess(targetProcessId);
      if (!process) return;
      process.flowGroup = value;
      markModified();
    },
    setRefOffset(targetRefId: string, offset: { x: number; y: number }) {
      const ref = (document().stageFlowRefs || []).find((item) => refId(item) === targetRefId);
      if (!ref) return;
      ref.pos = {
        x: Math.round(Number(offset.x) || 0),
        y: Math.round(Number(offset.y) || 0),
      };
      console.log('[stage-adapter] setRefOffset', targetRefId, ref.pos);
      markModified();
    },
    addProcess(targetStageId: string) {
      const id = nextProcessId();
      const stage = findStage(targetStageId);
      const doc = document();
      doc.processes ||= [];
      doc.stageFlowRefs ||= [];
      doc.processes.push({ id, name: `新流程${doc.processes.length + 1}`, stageId: stage?.id || targetStageId, flowGroup: '', nodes: [] });
      doc.stageFlowRefs.push({ id: nextRefId(), stageId: stage?.id || targetStageId, processId: id, order: refsForStage(targetStageId).length + 1 });
      markModified(true);
    },
    addExistingProcess(targetStageId: string, targetProcessId: string) {
      const process = findProcess(targetProcessId);
      const stage = findStage(targetStageId);
      if (!process || !stage) return;
      const alreadyInStage = refsForStage(targetStageId).some((ref) => {
        const refProcess = processForRef(ref);
        return processId(refProcess) === processId(process);
      });
      if (alreadyInStage) return;
      const doc = document();
      doc.stageFlowRefs ||= [];
      doc.stageFlowRefs.push({
        id: nextRefId(),
        stageId: stage.id || targetStageId,
        stageUid: stage.uid || stage.id || targetStageId,
        processId: process.id || process.uid,
        processUid: process.uid || process.id,
        order: refsForStage(targetStageId).length + 1,
      });
      markModified(true);
    },
    duplicateProcess(targetProcessId: string) {
      const source = findProcess(targetProcessId);
      if (!source) return;
      const doc = document();
      doc.processes ||= [];
      doc.stageFlowRefs ||= [];
      // 防重复：检查是否已有同名副本（防止快速多次点击）
      const baseName = String(source.name || '未命名流程').replace(/\s*[-–—]?\s*副本(\d*)$/, '');
      const existingNames = new Set(doc.processes.map((p) => String(p.name || '').trim()));
      let copies = doc.processes.filter((p) => String(p.name || '').startsWith(baseName)).length;
      let cloneName = `${baseName}${copies > 0 ? ` - 副本${copies}` : ' - 副本'}`;
      while (existingNames.has(cloneName)) { copies++; cloneName = `${baseName} - 副本${copies}`; }
      const procId = `P${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const clone = JSON.parse(JSON.stringify(source)) as LegacyProcess;
      clone.id = procId;
      clone.uid = procId;
      clone.name = cloneName;
      const raw = clone as any;
      raw.stageUid = '';
      raw.stageId = '';
      raw.prototypeFiles = [];
      // 复制节点并重新生成 ID
      const nodes = Array.isArray(raw.nodes) ? raw.nodes : [];
      const taskIdMap = new Map<string, string>();
      for (const node of nodes) {
        const oldId = String(node.id || node.uid || '');
        const newId = nextProcessId();
        node.id = newId;
        node.uid = newId;
        node.name = String(node.name || '') + ' 副本';
        taskIdMap.set(oldId, newId);
      }
      // 复制网关并重新生成 ID
      const flow: any = raw.flow || {};
      const gateways = Array.isArray(flow.nodes) ? flow.nodes : [];
      const gatewayIdMap = new Map<string, string>();
      for (const gw of gateways) {
        const oldId = String(gw.id || gw.uid || '');
        const newId = `B${Date.now()}` + (gatewayIdMap.size + 1);
        gw.id = newId;
        gw.uid = newId;
        gatewayIdMap.set(oldId, newId);
      }
      // 复制边线并映射端点
      flow.edges = (Array.isArray(flow.edges) ? flow.edges : []).map((edge: any) => {
        const eid = `L${Date.now()}` + Math.random().toString(16).slice(2, 6);
        const from = edge.from && edge.from !== 'START' && edge.from !== 'END' ? (taskIdMap.get(edge.from) || gatewayIdMap.get(edge.from) || '') : (edge.from || '');
        const to = edge.to && edge.to !== 'START' && edge.to !== 'END' ? (taskIdMap.get(edge.to) || gatewayIdMap.get(edge.to) || '') : (edge.to || '');
        return from && to ? { ...edge, id: eid, uid: eid, from, to } : null;
      }).filter(Boolean);
      // 复制 stageFlowRefs，按 stage 去重
      const existingRefs = (doc.stageFlowRefs || []).filter((ref) => ref.processUid === targetProcessId || ref.processId === targetProcessId || ref.processId === source.id || ref.processUid === source.uid);
      const seenStages = new Set<string>();
      for (const ref of existingRefs) {
        const stageKey = ref.stageUid || ref.stageId || '';
        if (!stageKey || seenStages.has(stageKey)) continue;
        seenStages.add(stageKey);
        doc.stageFlowRefs.push({
          id: nextRefId(),
          stageId: ref.stageId || '',
          stageUid: ref.stageUid || '',
          processId: procId,
          processUid: procId,
          order: (doc.stageFlowRefs.length + 1),
        });
      }
      doc.processes.push(raw);
      markModified(true);
    },
    removeProcessFromStage(targetStageId: string, targetProcessId: string) {
      const refs = refsForStage(targetStageId);
      const removedRefIds = new Set(refs
        .filter((ref) => {
          const process = processForRef(ref);
          return processId(process) === targetProcessId || process?.id === targetProcessId || process?.uid === targetProcessId;
        })
        .map(refId));
      document().stageFlowRefs = (document().stageFlowRefs || []).filter((ref) => !removedRefIds.has(refId(ref)));
      document().stageFlowLinks = (document().stageFlowLinks || []).filter((link) => (
        !removedRefIds.has(link.fromRefUid || link.fromRefId || '')
        && !removedRefIds.has(link.toRefUid || link.toRefId || '')
      ));
      markModified(true);
    },
    deleteProcess(targetProcessId: string) {
      const process = findProcess(targetProcessId);
      if (!process) return;
      const keys = new Set([process.id, process.uid, targetProcessId].filter(Boolean));
      const removedRefIds = new Set((document().stageFlowRefs || [])
        .filter((ref) => keys.has(ref.processId || '') || keys.has(ref.processUid || ''))
        .map(refId));
      document().processes = (document().processes || []).filter((item) => !keys.has(item.id || '') && !keys.has(item.uid || ''));
      document().stageFlowRefs = (document().stageFlowRefs || []).filter((ref) => !removedRefIds.has(refId(ref)));
      document().stageFlowLinks = (document().stageFlowLinks || []).filter((link) => (
        !removedRefIds.has(link.fromRefUid || link.fromRefId || '')
        && !removedRefIds.has(link.toRefUid || link.toRefId || '')
      ));
      markModified(true);
    },
    addLink(targetStageId: string, fromRefId: string, toRefId: string) {
      if (!fromRefId || !toRefId || fromRefId === toRefId) return;
      document().stageFlowLinks ||= [];
      const duplicate = document().stageFlowLinks?.some((link) => (
        (link.stageUid === targetStageId || link.stageId === targetStageId)
        && (link.fromRefUid || link.fromRefId) === fromRefId
        && (link.toRefUid || link.toRefId) === toRefId
      ));
      if (duplicate) return;
      document().stageFlowLinks?.push({ id: nextLinkId(), stageId: targetStageId, fromRefId, toRefId });
      markModified();
    },
    removeLink(_targetStageId: string, linkId: string) {
      document().stageFlowLinks = (document().stageFlowLinks || []).filter((link) => (link.id || link.uid) !== linkId);
      markModified();
    },
  };
}
