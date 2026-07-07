export interface EntityDesignField {
  uid?: string;
  id?: string;
  name?: string;
  type?: string;
  dataType?: string;
  fieldType?: string;
  valueType?: string;
  note?: string;
  is_key?: boolean;
  is_status?: boolean;
  status_role?: 'primary' | 'secondary' | '';
  state_values?: string;
  states?: string[];
  state_nodes?: EntityStateNode[];
}

export interface EntityDesignEntity {
  uid?: string;
  id?: string;
  name?: string;
  note?: string;
  fields?: EntityDesignField[];
  relations?: EntityDesignRelation[];
  state_transitions?: EntityStateTransition[];
  state_nodes?: EntityStateNode[];
  businessConstructUid?: string;
  businessConstructId?: string;
  businessConstructUids?: string[];
  constructUid?: string;
  constructId?: string;
  constructUids?: string[];
  constructName?: string;
  businessConstructName?: string;
  pos?: { x?: number; y?: number };
}

export interface EntityStateNode {
  name?: string;
  kind?: 'initial' | 'intermediate' | 'terminal';
  pos?: { x?: number; y?: number };
  markerPos?: { x?: number; y?: number };
}

export interface EntityDesignRelation {
  uid?: string;
  id?: string;
  from?: string;
  to?: string;
  source?: string;
  target?: string;
  sourceEntityUid?: string;
  targetEntityUid?: string;
  sourceEntityId?: string;
  targetEntityId?: string;
  fromEntityUid?: string;
  toEntityUid?: string;
  fromEntityId?: string;
  toEntityId?: string;
  label?: string;
  type?: string;
  cardinality?: string;
}

export interface EntityStateTransition {
  uid?: string;
  id?: string;
  from?: string;
  to?: string;
  action?: string;
  label?: string;
  note?: string;
  field_name?: string;
  labelPos?: { x?: number; y?: number };
  waypoints?: Array<{ x?: number; y?: number }>;
  route?: {
    mode?: string;
    fromAnchor?: 'auto' | 'top' | 'right' | 'bottom' | 'left';
    toAnchor?: 'auto' | 'top' | 'right' | 'bottom' | 'left';
    waypoints?: Array<{ x?: number; y?: number }>;
  };
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
