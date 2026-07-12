import { BlmDocument, Process, ProcessNode, Stage } from '../../../core/document/document.model';
import { identityOf } from '../../../core/document/document-model';
import { NodeExporter } from '../../../core/export/exporters/node-exporter';
import { ProcessExporter } from '../../../core/export/exporters/process-exporter';
import { StageExporter } from '../../../core/export/exporters/stage-exporter';
import { ValueStreamExporter } from '../../../core/export/exporters/value-stream-exporter';

export interface ProcessExportUiState {
  procId?: string | null;
  stageId?: string | null;
  taskId?: string | null;
}

export function createCurrentNodeExporter(
  document: BlmDocument,
  ui: ProcessExportUiState,
): NodeExporter | null {
  const process = findProcess(document, ui.procId || '');
  const node = findNode(process, ui.taskId || '');
  if (!process || !node) return null;
  return new NodeExporter(document, node, { process });
}

export function createCurrentProcessExporter(
  document: BlmDocument,
  ui: ProcessExportUiState,
): ProcessExporter | null {
  const process = findProcess(document, ui.procId || '');
  if (!process) return null;
  return new ProcessExporter(document, process);
}

export function createCurrentStageExporter(
  document: BlmDocument,
  ui: ProcessExportUiState,
): StageExporter | null {
  const stage = findStage(document, ui.stageId || '');
  if (!stage) return null;
  return new StageExporter(document, stage);
}

export function createValueStreamExporter(document: BlmDocument): ValueStreamExporter {
  return new ValueStreamExporter(document);
}

function findStage(document: BlmDocument, stageId: string): Stage | null {
  const target = String(stageId || '').trim();
  return document.stages.find((stage) => identityOf(stage) === target || stage.name === target) ||
    document.stages[0] ||
    null;
}

function findProcess(document: BlmDocument, processId: string): Process | null {
  const target = String(processId || '').trim();
  return document.processes.find((process) => identityOf(process) === target || process.name === target) || null;
}

function findNode(process: Process | null, nodeId: string): ProcessNode | null {
  const target = String(nodeId || '').trim();
  if (!process || !target) return null;
  return process.nodes.find((node) => identityOf(node) === target || node.name === target) || null;
}
