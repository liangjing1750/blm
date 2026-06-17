export interface EntityDesignField {
  uid?: string;
  id?: string;
  name?: string;
  type?: string;
  note?: string;
  state_values?: string;
  states?: string[];
}

export interface EntityDesignEntity {
  uid?: string;
  id?: string;
  name?: string;
  note?: string;
  fields?: EntityDesignField[];
  relations?: EntityDesignRelation[];
  state_transitions?: EntityStateTransition[];
  businessConstructUid?: string;
  businessConstructId?: string;
  constructUid?: string;
  constructId?: string;
  pos?: { x?: number; y?: number };
}

export interface EntityDesignRelation {
  uid?: string;
  id?: string;
  from?: string;
  to?: string;
  source?: string;
  target?: string;
  label?: string;
  type?: string;
}

export interface EntityStateTransition {
  uid?: string;
  id?: string;
  from?: string;
  to?: string;
  action?: string;
  label?: string;
}

export interface EntityDesignConstruct {
  uid?: string;
  id?: string;
  name?: string;
  businessComponentUid?: string;
  businessComponentId?: string;
}

export interface EntityDesignComponent {
  uid?: string;
  id?: string;
  name?: string;
}

interface EntityDesignDocument {
  entities?: EntityDesignEntity[];
  relations?: EntityDesignRelation[];
  businessConstructs?: EntityDesignConstruct[];
  constructs?: EntityDesignConstruct[];
  businessComponents?: EntityDesignComponent[];
}

interface LegacyWindow {
  S?: { doc?: EntityDesignDocument; ui?: Record<string, unknown> };
  markModified?: () => void;
  renderSidebar?: () => void;
}

export interface EntityDesignAdapter {
  entities(): EntityDesignEntity[];
  relations(): EntityDesignRelation[];
  constructs(): EntityDesignConstruct[];
  components(): EntityDesignComponent[];
  markChanged(): void;
  nextId(prefix: string, items: unknown[]): string;
}

export function createEntityDesignLegacyAdapter(runtime: unknown = getAngularRuntimeState()): EntityDesignAdapter {
  const legacyWindow = runtime as LegacyWindow;
  const document = () => {
    const direct = runtime as { doc?: EntityDesignDocument };
    if (direct.doc) return direct.doc;
    legacyWindow.S ||= {};
    legacyWindow.S.doc ||= {};
    return legacyWindow.S.doc;
  };

  return {
    entities() {
      const doc = document();
      doc.entities ||= [];
      return doc.entities;
    },
    relations() {
      const doc = document();
      doc.relations ||= [];
      return doc.relations;
    },
    constructs() {
      const doc = document();
      return doc.businessConstructs || doc.constructs || [];
    },
    components() {
      const doc = document();
      return doc.businessComponents || [];
    },
    markChanged() {
      if (legacyWindow.markModified) legacyWindow.markModified();
      else markAngularRuntimeModified();
      legacyWindow.renderSidebar?.();
    },
    nextId(prefix, items) {
      const used = new Set(
        items.map((item) => {
          const record = item as { uid?: string; id?: string };
          return String(record.uid || record.id || '');
        }),
      );
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
