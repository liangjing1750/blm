import { BlmDocument, Process, ProcessNode } from '../../../core/document/document.model';
import { identityOf } from '../../../core/document/document-model';
import { NodeExporter } from '../../../core/export/exporters/node-exporter';

export interface ProcessExportUiState {
  procId?: string | null;
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

function findProcess(document: BlmDocument, processId: string): Process | null {
  const target = String(processId || '').trim();
  return document.processes.find((process) => identityOf(process) === target || process.name === target) || null;
}

function findNode(process: Process | null, nodeId: string): ProcessNode | null {
  const target = String(nodeId || '').trim();
  if (!process || !target) return null;
  return process.nodes.find((node) => identityOf(node) === target || node.name === target) || null;
}
