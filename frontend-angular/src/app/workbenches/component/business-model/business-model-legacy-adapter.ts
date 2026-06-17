export interface BusinessModelComponent {
  uid?: string;
  id?: string;
  name?: string;
  kind?: string;
  note?: string;
  constructUids?: string[];
  taskDefinitionUids?: string[];
  entityUids?: string[];
}

export interface BusinessModelConstruct {
  uid?: string;
  id?: string;
  name?: string;
  note?: string;
  businessComponentUid?: string;
  businessComponentId?: string;
  businessComponent?: string;
  entityUids?: string[];
  taskDefinitionUids?: string[];
}

export interface BusinessModelEntity {
  uid?: string;
  id?: string;
  name?: string;
  businessConstructUid?: string;
  businessConstructId?: string;
  constructUid?: string;
  constructId?: string;
}

export interface BusinessModelTask {
  uid?: string;
  id?: string;
  name?: string;
  type?: string;
  target?: string;
  address?: string;
  businessComponentUid?: string;
  businessComponentId?: string;
  businessComponent?: string;
  constructUid?: string;
  constructId?: string;
  businessConstructUid?: string;
  businessConstructId?: string;
  constructName?: string;
}

interface BusinessModelDocument {
  businessComponents?: BusinessModelComponent[];
  businessConstructs?: BusinessModelConstruct[];
  entities?: BusinessModelEntity[];
  taskDefinitions?: BusinessModelTask[];
}

interface LegacyWindow {
  S?: { doc?: BusinessModelDocument };
  markModified?: () => void;
  renderSidebar?: () => void;
}

export interface BusinessModelAdapter {
  components(): BusinessModelComponent[];
  constructs(): BusinessModelConstruct[];
  entities(): BusinessModelEntity[];
  tasks(): BusinessModelTask[];
  markChanged(): void;
  nextId(prefix: string, items: unknown[]): string;
}

export function createBusinessModelLegacyAdapter(runtime: unknown = getAngularRuntimeState()): BusinessModelAdapter {
  const legacyWindow = runtime as LegacyWindow;
  const document = () => {
    const direct = runtime as { doc?: BusinessModelDocument };
    if (direct.doc) return direct.doc;
    legacyWindow.S ||= {};
    legacyWindow.S.doc ||= {};
    return legacyWindow.S.doc;
  };

  return {
    components() {
      const doc = document();
      doc.businessComponents ||= [];
      return doc.businessComponents;
    },
    constructs() {
      const doc = document();
      doc.businessConstructs ||= [];
      return doc.businessConstructs;
    },
    entities() {
      const doc = document();
      doc.entities ||= [];
      return doc.entities;
    },
    tasks() {
      const doc = document();
      doc.taskDefinitions ||= [];
      return doc.taskDefinitions;
    },
    markChanged() {
      if (legacyWindow.markModified) legacyWindow.markModified();
      else markAngularRuntimeModified();
      legacyWindow.renderSidebar?.();
    },
    nextId(prefix, items) {
      const used = new Set(items.map((item) => String((item as { uid?: string; id?: string }).uid || (item as { uid?: string; id?: string }).id || '')));
      let index = items.length + 1;
      let id = `${prefix}${index}`;
      while (used.has(id)) {
        index += 1;
        id = `${prefix}${index}`;
      }
      return id;
    },
  };
}
import { getAngularRuntimeState, markAngularRuntimeModified } from '../../../core/runtime/angular-runtime';
