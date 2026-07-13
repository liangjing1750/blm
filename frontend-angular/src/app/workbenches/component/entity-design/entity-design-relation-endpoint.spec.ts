import { describe, expect, it } from 'vitest';
import { resolveRelationEndpoint } from './entity-design-relation-endpoint';

describe('entity design relation endpoint resolution', () => {
  it('prefers concrete entity uid fields over legacy display-name fields', () => {
    const entities = [
      { uid: 'entity-point-type', name: '点位类型' },
      { uid: 'entity-order', name: '订单' },
      { uid: 'entity-detail', name: '订单明细' },
    ];
    const relation = {
      from: '点位类型',
      to: '点位类型',
      sourceEntityUid: 'entity-order',
      targetEntityUid: 'entity-detail',
    };

    expect(resolveRelationEndpoint(entities, relation, 'from')).toBe('entity-order');
    expect(resolveRelationEndpoint(entities, relation, 'to')).toBe('entity-detail');
  });

  it('uses identity candidates before legacy display-name candidates across old field names', () => {
    const entities = [
      { uid: 'entity-point-type', name: '点位类型' },
      { uid: 'entity-order', name: '订单' },
      { uid: 'entity-detail', name: '订单明细' },
    ];
    const relation = {
      from: '点位类型',
      to: '点位类型',
      source: 'entity-order',
      target: 'entity-detail',
    };

    expect(resolveRelationEndpoint(entities, relation, 'from')).toBe('entity-order');
    expect(resolveRelationEndpoint(entities, relation, 'to')).toBe('entity-detail');
  });

  it('normalizes legacy id fields to current entity uid values', () => {
    const entities = [
      { uid: 'entity-order', id: 'legacy-order-id', name: '订单' },
      { uid: 'entity-detail', id: 'legacy-detail-id', name: '订单明细' },
    ];
    const relation = {
      sourceEntityId: 'legacy-order-id',
      target_entity_id: 'legacy-detail-id',
    };

    expect(resolveRelationEndpoint(entities, relation, 'from')).toBe('entity-order');
    expect(resolveRelationEndpoint(entities, relation, 'to')).toBe('entity-detail');
  });

  it('falls back to entity names only when no identity field can be matched', () => {
    const entities = [{ uid: 'entity-point-type', name: '点位类型' }];
    const relation = {
      from: '点位类型',
      to: '点位类型',
    };

    expect(resolveRelationEndpoint(entities, relation, 'from')).toBe('entity-point-type');
    expect(resolveRelationEndpoint(entities, relation, 'to')).toBe('entity-point-type');
  });
});
