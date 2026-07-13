export interface RelationEndpointEntity {
  uid?: string;
  id?: string | null;
  name?: string | null;
}

export interface RelationEndpointValue {
  from?: string;
  to?: string;
  source?: string;
  target?: string;
  fromUid?: string;
  toUid?: string;
  sourceUid?: string;
  targetUid?: string;
  fromId?: string;
  toId?: string;
  sourceId?: string;
  targetId?: string;
  sourceEntityUid?: string;
  targetEntityUid?: string;
  sourceEntityId?: string;
  targetEntityId?: string;
  fromEntityUid?: string;
  toEntityUid?: string;
  fromEntityId?: string;
  toEntityId?: string;
  source_entity_uid?: string;
  target_entity_uid?: string;
  source_entity_id?: string;
  target_entity_id?: string;
  from_entity_uid?: string;
  to_entity_uid?: string;
  from_entity_id?: string;
  to_entity_id?: string;
}

function entityId(entity: RelationEndpointEntity | null | undefined): string {
  return String(entity?.uid || entity?.id || '').trim();
}

function matchEndpointByIdentity(entities: RelationEndpointEntity[], raw: string): string {
  const target = String(raw || '').trim();
  if (!target) return '';
  const entity = entities.find((item) => entityId(item) === target || item.uid === target || item.id === target);
  return entity ? entityId(entity) : '';
}

function matchEndpointByName(entities: RelationEndpointEntity[], raw: string): string {
  const target = String(raw || '').trim();
  if (!target) return '';
  const entity = entities.find((item) => String(item.name || '').trim() === target);
  return entity ? entityId(entity) : '';
}

export function resolveRelationEndpoint(entities: RelationEndpointEntity[], relation: RelationEndpointValue, side: 'from' | 'to'): string {
  // 模块意图：把多代实体关系字段归一成当前下拉框使用的 uid/id，避免旧显示名覆盖真实端点。
  // 关键流程：先在所有候选字段里查找可匹配实体 uid/id 的值，再兼容只保存名称的旧数据。
  // 边界细节：如果候选值都无法匹配实体，返回第一个原始值，保留未知旧数据而不是静默清空。
  const candidates = side === 'from'
    ? [
      relation.sourceEntityUid,
      relation.sourceEntityId,
      relation.fromEntityUid,
      relation.fromEntityId,
      relation.source_entity_uid,
      relation.source_entity_id,
      relation.from_entity_uid,
      relation.from_entity_id,
      relation.sourceUid,
      relation.sourceId,
      relation.fromUid,
      relation.fromId,
      relation.source,
      relation.from,
    ]
    : [
      relation.targetEntityUid,
      relation.targetEntityId,
      relation.toEntityUid,
      relation.toEntityId,
      relation.target_entity_uid,
      relation.target_entity_id,
      relation.to_entity_uid,
      relation.to_entity_id,
      relation.targetUid,
      relation.targetId,
      relation.toUid,
      relation.toId,
      relation.target,
      relation.to,
    ];
  const rawValues = candidates.map((candidate) => String(candidate || '').trim()).filter(Boolean);
  const identityMatched = rawValues.map((value) => matchEndpointByIdentity(entities, value)).find(Boolean);
  if (identityMatched) return identityMatched;
  const nameMatched = rawValues.map((value) => matchEndpointByName(entities, value)).find(Boolean);
  if (nameMatched) return nameMatched;
  return rawValues[0] || '';
}
