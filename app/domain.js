'use strict';

function setDomain(val) {
  if (!S.doc) return;
  const oldDomain = S.doc.meta.domain;
  const oldTitle = S.doc.meta.title;
  S.doc.meta.domain = val;
  S.doc.meta.title = val;
  if (typeof sendCollabChanges === 'function') {
    sendCollabChanges([
      { path: 'meta.domain', old: oldDomain, new: val },
      { path: 'meta.title', old: oldTitle, new: val },
    ]);
  }
  markModified();
  document.getElementById('file-name').textContent = val || '未命名';
}

function setMeta(key, val) {
  if (!S.doc) return;
  const oldValue = S.doc.meta[key];
  S.doc.meta[key] = val;
  if (typeof sendCollabChange === 'function') {
    sendCollabChange(`meta.${key}`, oldValue, val);
  }
  markModified();
}

function rerenderDomainTabPreserveScroll() {
  const scroller = document.querySelector('.domain-scroll');
  renderBusinessArchitectureTab({ scrollTop: scroller ? scroller.scrollTop : 0 });
}
function renderDomainTab(options) { renderBusinessArchitectureTab(options); }

function rerenderBusinessModelDialogContext() {
  if (S.ui.tab === 'process' && typeof rerenderProcessEditor === 'function') {
    rerenderProcessEditor();
    return;
  }
  rerenderDomainTabPreserveScroll();
}

function getSelectedRoleGroupInputValue() {
  const select = document.getElementById('role-create-group-select');
  const customInput = document.getElementById('role-create-group-custom');
  if (!select) return '';
  if (select.value === '__custom__') return normalizeRoleName(customInput?.value || '');
  return normalizeRoleName(select.value);
}

function onRoleGroupSelectChange(value) {
  const customWrap = document.getElementById('role-create-group-custom-wrap');
  const customInput = document.getElementById('role-create-group-custom');
  if (!customWrap) return;
  const showCustom = value === '__custom__';
  customWrap.classList.toggle('hidden', !showCustom);
  if (showCustom) {
    setTimeout(() => customInput?.focus(), 0);
  } else if (customInput) {
    customInput.value = '';
  }
}

function addRole() {
  if (!S.doc) return;
  const nameInput = document.getElementById('role-create-input');
  const roleName = getUniqueRoleName(nameInput?.value || '新角色');
  const roleGroup = getSelectedRoleGroupInputValue();

  if (!roleGroup) {
    alert('请先选择或填写角色分组。');
    const select = document.getElementById('role-create-group-select');
    if (select?.value === '__custom__') {
      document.getElementById('role-create-group-custom')?.focus();
    } else {
      select?.focus();
    }
    return;
  }

  if (!S.doc.roles) S.doc.roles = [];
  const role = createRoleDraft(roleName, { group: roleGroup });
  role.name = roleName;
  role.group = roleGroup;
  S.doc.roles.push(role);

  if (nameInput) nameInput.value = '';
  ensureSelectedRole(role.id);
  markModified();
  rerenderDomainTabPreserveScroll();
}

async function removeRole(roleId) {
  const usage = getRoleUsage(roleId);
  if (usage.length) {
    alert(`当前角色正在被 ${usage.length} 个任务使用，不能直接删除。`);
    return;
  }
  const role = getRoleById(roleId);
  if (!role) return;
  if (!await showAppConfirm(`确认删除角色“${role.name}”？`, {
    title: '删除角色',
    confirmLabel: '删除',
  })) return;
  S.doc.roles = getRoles().filter((item) => item.id !== roleId);
  ensureSelectedRole();
  markModified();
  rerenderDomainTabPreserveScroll();
}

function openRoleView(roleId) {
  ensureSelectedRole(roleId);
  S.ui.tab = 'process';
  S.ui.procView = 'role';
  render();
}

function addTerm() {
  addTermAfter(-1);
}

function addTermAfter(index) {
  if (!Array.isArray(S.doc.language)) S.doc.language = [];
  const insertIndex = Number.isInteger(index) ? Math.min(index + 1, S.doc.language.length) : S.doc.language.length;
  S.doc.language.splice(insertIndex, 0, { term: '', definition: '' });
  markModified();
  rerenderDomainTabPreserveScroll();
}

function removeTerm(idx) {
  S.doc.language.splice(idx, 1);
  markModified();
  rerenderDomainTabPreserveScroll();
}

function setTerm(idx, key, val) {
  S.doc.language[idx][key] = val;
  markModified();
}

function moveTerm(idx, dir) {
  if (!Array.isArray(S.doc.language)) return;
  const targetIndex = idx + dir;
  if (idx < 0 || targetIndex < 0 || targetIndex >= S.doc.language.length) return;
  [S.doc.language[idx], S.doc.language[targetIndex]] = [S.doc.language[targetIndex], S.doc.language[idx]];
  markModified();
  rerenderDomainTabPreserveScroll();
}

function getDocumentArray(key) {
  return Array.isArray(S.doc?.[key]) ? S.doc[key] : [];
}

function ensureDocumentArray(key) {
  if (!S.doc) return [];
  if (!Array.isArray(S.doc[key])) S.doc[key] = [];
  return S.doc[key];
}

function findExplicitBusinessComponent(capabilityId) {
  const targetId = String(capabilityId || '').trim();
  return getDocumentArray('businessComponents')
    .find((item) => String(item.uid || item.id || item.name || '').trim() === targetId || String(item.name || '').trim() === targetId) || null;
}

function ensureBusinessComponentRef(capabilityId) {
  const targetId = String(capabilityId || '').trim();
  let capability = findExplicitBusinessComponent(targetId);
  if (capability) {
    if (!capability.id) capability.id = targetId || capability.name;
    return capability;
  }
  const inferred = (typeof getCapabilityItems === 'function' ? getCapabilityItems(S.doc) : [])
    .find((item) => String(item.uid || item.id || item.name || '').trim() === targetId || String(item.name || '').trim() === targetId);
  capability = {
    id: targetId || nextStableId('BCP', ensureDocumentArray('businessComponents')),
    name: getUniqueBusinessComponentName(inferred?.name || targetId || '新业务组件'),
    kind: inferred?.kind === 'core' ? 'core' : 'generic',
    note: inferred?.note || '',
    entityUids: Array.isArray(inferred?.entityUids) ? inferred.entityUids.slice() : [],
    taskDefinitionUids: Array.isArray(inferred?.taskDefinitionUids) ? inferred.taskDefinitionUids.slice() : [],
    constructUids: Array.isArray(inferred?.constructUids) ? inferred.constructUids.slice() : [],
  };
  ensureDocumentArray('businessComponents').push(capability);
  return capability;
}

function findBusinessConstructRef(constructId) {
  const targetId = String(constructId || '').trim();
  return getDocumentArray('businessConstructs')
    .find((item) => String(item.uid || item.id || item.name || '').trim() === targetId || String(item.name || '').trim() === targetId) || null;
}

function findTaskDefinitionRef(taskDefinitionId) {
  const targetId = String(taskDefinitionId || '').trim();
  return getDocumentArray('taskDefinitions')
    .find((item) => String(item.uid || item.id || item.name || '').trim() === targetId || String(item.name || '').trim() === targetId) || null;
}

function modelRefValues(item, keys = ['uid', 'id', 'name']) {
  const values = [];
  keys.forEach((key) => {
    const value = item?.[key];
    if (Array.isArray(value)) values.push(...value);
    else values.push(value);
  });
  return values.map((value) => String(value || '').trim()).filter(Boolean);
}

function modelIdentitySet(item) {
  return new Set(modelRefValues(item, ['uid', 'id', 'name']));
}

function refsIncludeItem(refs, item) {
  const identities = modelIdentitySet(item);
  return refs.some((ref) => identities.has(String(ref || '').trim()));
}

function isBusinessConstructAssignedToCapability(construct, capability) {
  const constructRefs = modelRefValues(construct, [
    'businessComponentUid',
    'businessComponentId',
  ]);
  return constructRefs.some((ref) => ref === capability.id || ref === capability.uid);
}

function isBusinessConstructAssignedToAnyCapability(construct, doc = S.doc) {
  const directRefs = modelRefValues(construct, [
    'businessComponentUid',
    'businessComponentId',
  ]);
  if (directRefs.length) return true;
  return getCapabilityItems(doc).some((capability) => isBusinessConstructAssignedToCapability(construct, capability));
}

function isEntityAssignedToConstruct(entity, construct) {
  const entityRefs = modelRefValues(entity, [
    'businessConstructUid',
    'businessConstructId',
  ]);
  return entityRefs.some((ref) => ref === construct.uid || ref === construct.id);
}

function isEntityAssignedToAnyConstruct(entity, doc = S.doc) {
  const directRefs = modelRefValues(entity, [
    'businessConstructUid',
    'businessConstructId',
  ]);
  if (directRefs.length) return true;
  return getBusinessConstructItems(doc).some((construct) => isEntityAssignedToConstruct(entity, construct));
}

function isTaskDefinitionAssignedToConstruct(task, construct) {
  const taskRefs = modelRefValues(task, [
    'constructUid',
    'constructId',
    'businessConstructUid',
    'businessConstructId',
  ]);
  return taskRefs.some((ref) => ref === construct.uid || ref === construct.id);
}

function isTaskDefinitionAssignedToAnyConstruct(task, doc = S.doc) {
  const directRefs = modelRefValues(task, [
    'businessConstructUid',
    'businessConstructId',
    'businessConstructUids',
    'businessConstructIds',
    'constructUid',
    'constructId',
    'constructUids',
    'constructIds',
    'businessConstruct',
    'constructName',
  ]);
  if (directRefs.length) return true;
  return getBusinessConstructItems(doc).some((construct) => isTaskDefinitionAssignedToConstruct(task, construct));
}

function syncTaskDefinitionCapability(task, capability) {
  if (!task || !capability) return;
  task.businessComponentUid = capability.id || '';
  task.businessComponent = capability.name || capability.id || '';
}

function syncTaskDefinitionConstruct(task, construct) {
  if (!task || !construct) return;
  task.constructUid = construct.uid || '';
  task.constructName = construct.name || construct.uid || '';
  if (construct.businessComponentUid || construct.businessComponent) {
    task.businessComponentUid = construct.businessComponentUid || task.businessComponentUid || '';
    task.businessComponent = construct.businessComponent || task.businessComponent || '';
  }
}

function normalizeModelAssetName(name, fallback = '') {
  return String(name || fallback || '').trim();
}

function getUniqueBusinessComponentName(baseName = '新业务组件', ignoreCapabilityId = '') {
  const rawName = normalizeModelAssetName(baseName, '新业务组件') || '新业务组件';
  const names = new Set(ensureDocumentArray('businessComponents')
    .filter((capability) => String(capability.id || '') !== String(ignoreCapabilityId || ''))
    .map((capability) => normalizeModelAssetName(capability.name))
    .filter(Boolean));
  if (!names.has(rawName)) return rawName;
  let index = 2;
  while (names.has(`${rawName}${index}`)) index += 1;
  return `${rawName}${index}`;
}

function hasBusinessComponentNameConflict(name, ignoreCapabilityId = '') {
  const nextName = normalizeModelAssetName(name);
  if (!nextName) return false;
  return ensureDocumentArray('businessComponents').some((capability) => (
    String(capability.id || '') !== String(ignoreCapabilityId || '')
    && normalizeModelAssetName(capability.name) === nextName
  ));
}

function getConstructScopeId(construct, fallbackCapabilityId = '') {
  const explicitId = normalizeModelAssetName(fallbackCapabilityId || construct?.businessComponentUid);
  if (explicitId) return explicitId;
  const capabilityName = normalizeModelAssetName(construct?.businessComponent);
  if (!capabilityName) return '';
  const capability = findExplicitBusinessComponent(capabilityName);
  return capability?.id || capabilityName;
}

function getUniqueBusinessConstructName(baseName = '新业务构件', capabilityId = '', ignoreConstructId = '') {
  const rawName = normalizeModelAssetName(baseName, '新业务构件') || '新业务构件';
  const rawScopeId = normalizeModelAssetName(capabilityId);
  const scopeCapability = rawScopeId ? findExplicitBusinessComponent(rawScopeId) : null;
  const scopeId = scopeCapability?.id || rawScopeId;
  const names = new Set(ensureDocumentArray('businessConstructs')
    .filter((construct) => String(construct.uid || '') !== String(ignoreConstructId || ''))
    .filter((construct) => getConstructScopeId(construct) === scopeId)
    .map((construct) => normalizeModelAssetName(construct.name))
    .filter(Boolean));
  if (!names.has(rawName)) return rawName;
  let index = 2;
  while (names.has(`${rawName}${index}`)) index += 1;
  return `${rawName}${index}`;
}

function hasBusinessConstructNameConflict(name, capabilityId = '', ignoreConstructId = '') {
  const nextName = normalizeModelAssetName(name);
  if (!nextName) return false;
  const rawScopeId = normalizeModelAssetName(capabilityId);
  const scopeCapability = rawScopeId ? findExplicitBusinessComponent(rawScopeId) : null;
  const scopeId = scopeCapability?.id || rawScopeId;
  return ensureDocumentArray('businessConstructs').some((construct) => (
    String(construct.uid || '') !== String(ignoreConstructId || '')
    && getConstructScopeId(construct) === scopeId
    && normalizeModelAssetName(construct.name) === nextName
  ));
}

function addBusinessComponent(afterId = '') {
  const items = ensureDocumentArray('businessComponents');
  const capability = {
    id: nextStableId('BCP', items),
    name: getUniqueBusinessComponentName('新业务组件'),
    kind: 'core',
    note: '',
    entityUids: [],
    taskDefinitionUids: [],
    constructUids: [],
  };
  const afterIndex = items.findIndex((item) => item.id === afterId);
  items.splice(afterIndex >= 0 ? afterIndex + 1 : items.length, 0, capability);
  markModified();
  renderSidebar();
  rerenderDomainTabPreserveScroll();
  return capability;
}

function openBusinessComponentDraft(afterId = '') {
  S.ui.businessModelDialog = {
    mode: 'capabilityDraft',
    capabilityId: '',
    constructId: '',
    taskDefinitionId: '',
    returnMode: '',
    procId: '',
    taskId: '',
    afterIdx: null,
    draft: {
      afterId: String(afterId || ''),
      name: '',
      kind: 'core',
      note: '',
    },
  };
  rerenderBusinessModelDialogContext();
}

function setBusinessModelDraft(key, value) {
  const dialog = S.ui.businessModelDialog || {};
  if (!dialog.draft || typeof dialog.draft !== 'object') return;
  dialog.draft[key] = value;
}

function saveBusinessComponentDraft() {
  const draft = S.ui.businessModelDialog?.draft || {};
  const name = normalizeModelAssetName(draft.name);
  if (!name) return alert('请填写业务组件名称。');
  if (hasBusinessComponentNameConflict(name, '')) {
    return alert(`业务组件“${name}”已存在，请换一个名称。`);
  }
  const capability = addBusinessComponent(draft.afterId || '');
  if (!capability) return;
  capability.name = name;
  capability.kind = draft.kind === 'generic' ? 'generic' : 'core';
  capability.note = String(draft.note || '');
  markModified();
  openBusinessModelDialog('capability', capability.id);
}

function setBusinessComponent(capabilityId, key, value) {
  const capability = ensureBusinessComponentRef(capabilityId);
  if (!['name', 'kind', 'note', 'businessDomain', 'businessDomainId'].includes(key)) return;
  if (key === 'name') {
    const nextName = normalizeModelAssetName(value);
    if (hasBusinessComponentNameConflict(nextName, capability.id)) {
      alert(`业务组件“${nextName}”已存在，请换一个名称。`);
      rerenderDomainTabPreserveScroll();
      return;
    }
    capability.name = nextName;
    ensureDocumentArray('businessConstructs').forEach((construct) => {
      if (construct.businessComponentUid === capability.id) construct.businessComponent = nextName;
    });
    ensureDocumentArray('taskDefinitions').forEach((task) => {
      if (task.businessComponentUid === capability.id) {
        task.businessComponent = nextName;
        syncProcessTaskDefinitionFields(task);
      }
    });
  } else {
    capability[key] = key === 'kind' && value !== 'core' ? 'generic' : value;
  }
  markModified();
  renderSidebar();
}

async function removeBusinessComponent(capabilityId) {
  const capability = findExplicitBusinessComponent(capabilityId);
  if (!capability) return false;
  const constructs = ensureDocumentArray('businessConstructs').filter((construct) => (
    construct.businessComponentUid === capability.id || construct.businessComponent === capability.name
  ));
  if (constructs.length) {
    alert(`当前业务组件下还有 ${constructs.length} 个业务构件，请先调整或删除构件。`);
    return false;
  }
  if (!await showAppConfirm(`确认删除业务组件“${capability.name || capability.id}”？`, {
    title: '删除业务组件',
    confirmLabel: '删除',
  })) return false;
  ensureDocumentArray('taskDefinitions').forEach((task) => {
    if (task.businessComponentUid === capability.id || task.businessComponent === capability.name) {
      task.businessComponentUid = '';
      task.businessComponent = '';
      syncProcessTaskDefinitionFields(task);
    }
  });
  ensureDocumentArray('processes').forEach((proc) => {
    if (Array.isArray(proc.businessComponentUids)) {
      proc.businessComponentUids = proc.businessComponentUids.filter((id) => id !== capability.id);
    }
  });
  S.doc.businessComponents = ensureDocumentArray('businessComponents').filter((item) => item !== capability);
  markModified();
  renderSidebar();
  rerenderDomainTabPreserveScroll();
  return true;
}

function addBusinessConstruct(afterId = '', capabilityId = '') {
  const constructs = ensureDocumentArray('businessConstructs');
  const capability = capabilityId ? ensureBusinessComponentRef(capabilityId) : (getCapabilityItems(S.doc)[0] || null);
  const capabilityScopeId = capability?.id || '';
  const construct = {
    id: nextStableId('BC', constructs),
    name: getUniqueBusinessConstructName('新业务构件', capabilityScopeId),
    note: '',
    businessComponentUid: capabilityScopeId,
    businessComponent: capability?.name || '',
    entityUids: [],
    taskDefinitionUids: [],
    relatedProcessIds: [],
  };
  const afterIndex = constructs.findIndex((item) => item.id === afterId);
  constructs.splice(afterIndex >= 0 ? afterIndex + 1 : constructs.length, 0, construct);
  if (capability) {
    const capRef = ensureBusinessComponentRef(capability.id || capability.name);
    capRef.constructUids = [...new Set([...(capRef.constructUids || []), construct.uid])];
  }
  markModified();
  renderSidebar();
  rerenderDomainTabPreserveScroll();
  return construct;
}

function openBusinessConstructDraft(capabilityId = '', afterId = '') {
  const capability = capabilityId ? ensureBusinessComponentRef(capabilityId) : null;
  S.ui.businessModelDialog = {
    mode: 'constructDraft',
    capabilityId: String(capability?.id || capabilityId || ''),
    constructId: '',
    taskDefinitionId: '',
    returnMode: '',
    procId: '',
    taskId: '',
    afterIdx: null,
    draft: {
      afterId: String(afterId || ''),
      name: '',
      note: '',
      businessComponentId: String(capability?.id || capabilityId || ''),
    },
  };
  rerenderBusinessModelDialogContext();
}

function saveBusinessConstructDraft() {
  const dialog = S.ui.businessModelDialog || {};
  const draft = dialog.draft || {};
  const name = normalizeModelAssetName(draft.name);
  const capabilityId = String(draft.businessComponentId || dialog.capabilityId || '').trim();
  if (!name) return alert('请填写业务构件名称。');
  if (hasBusinessConstructNameConflict(name, capabilityId, '')) {
    return alert(`当前范围已存在业务构件“${name}”，请换一个名称。`);
  }
  const construct = addBusinessConstruct(draft.afterId || '', capabilityId);
  if (!construct) return;
  construct.name = name;
  construct.note = String(draft.note || '');
  markModified();
  openBusinessModelDialog('construct', construct.businessComponentUid || capabilityId, construct.uid);
}

function setBusinessConstruct(constructId, key, value) {
  const construct = findBusinessConstructRef(constructId);
  if (!construct || !['name', 'note', 'businessComponentId'].includes(key)) return;
  if (key === 'businessComponentId') {
    const previousCapabilityId = construct.businessComponentUid;
    const nextCapabilityId = normalizeModelAssetName(value);
    if (hasBusinessConstructNameConflict(construct.name, nextCapabilityId, construct.uid)) {
      const scopeLabel = nextCapabilityId ? '目标业务组件' : '未分组构件';
      alert(`${scopeLabel}中已存在业务构件“${construct.name || construct.uid}”，请先调整名称。`);
      rerenderDomainTabPreserveScroll();
      return;
    }
    if (!nextCapabilityId) {
      construct.businessComponentUid = '';
      construct.businessComponent = '';
      ensureDocumentArray('businessComponents').forEach((capability) => {
        if (capability.id === previousCapabilityId && Array.isArray(capability.constructUids)) {
          capability.constructUids = capability.constructUids.filter((id) => id !== construct.uid);
        }
      });
      markModified();
      renderSidebar();
      return;
    }
    const capability = ensureBusinessComponentRef(nextCapabilityId);
    ensureDocumentArray('businessComponents').forEach((item) => {
      if (item.id !== capability.id && Array.isArray(item.constructUids)) {
        item.constructUids = item.constructUids.filter((id) => id !== construct.uid);
      }
    });
    construct.businessComponentUid = capability.id || '';
    construct.businessComponent = capability.name || capability.id || '';
    capability.constructUids = [...new Set([...(capability.constructUids || []), construct.uid])];
    ensureDocumentArray('taskDefinitions').forEach((task) => {
      if (task.constructUid === construct.uid) {
        syncTaskDefinitionCapability(task, capability);
        syncProcessTaskDefinitionFields(task);
      }
    });
  } else {
    if (key === 'name') {
      const nextName = normalizeModelAssetName(value);
      const scopeId = getConstructScopeId(construct);
      if (hasBusinessConstructNameConflict(nextName, scopeId, construct.uid)) {
        alert(`当前范围已存在业务构件“${nextName}”，请换一个名称。`);
        rerenderDomainTabPreserveScroll();
        return;
      }
      construct.name = nextName;
      ensureDocumentArray('taskDefinitions').forEach((task) => {
        if (task.constructUid === construct.uid) {
          task.constructName = nextName;
          syncProcessTaskDefinitionFields(task);
        }
      });
    } else {
      construct[key] = value;
    }
  }
  markModified();
  renderSidebar();
}

async function removeBusinessConstruct(constructId) {
  const construct = findBusinessConstructRef(constructId);
  if (!construct) return false;
  if (!await showAppConfirm(`确认删除业务构件“${construct.name || construct.uid}”？`, {
    title: '删除业务构件',
    confirmLabel: '删除',
  })) return false;
  S.doc.businessConstructs = ensureDocumentArray('businessConstructs').filter((item) => item !== construct);
  ensureDocumentArray('businessComponents').forEach((capability) => {
    if (!Array.isArray(capability.constructUids)) return;
    capability.constructUids = capability.constructUids.filter((id) => id !== construct.uid);
  });
  ensureDocumentArray('taskDefinitions').forEach((task) => {
    if (task.constructUid === construct.uid) {
      task.constructUid = '';
      task.constructName = '';
      syncProcessTaskDefinitionConstruct(task);
    }
  });
  ensureDocumentArray('entities').forEach((entity) => {
    if (entity.businessConstructUid === construct.uid) entity.businessConstructUid = '';
    if (Array.isArray(entity.businessConstructUids)) {
      entity.businessConstructUids = entity.businessConstructUids.filter((id) => id !== construct.uid);
    }
  });
  markModified();
  renderSidebar();
  rerenderDomainTabPreserveScroll();
  return true;
}

function getUniqueTaskDefinitionName(baseName = '新任务定义', ignoreTaskId = '') {
  const rawName = String(baseName || '新任务定义').trim() || '新任务定义';
  const names = new Set(ensureDocumentArray('taskDefinitions')
    .filter((task) => task.id !== ignoreTaskId)
    .map((task) => String(task.name || '').trim())
    .filter(Boolean));
  if (!names.has(rawName)) return rawName;
  let index = 2;
  while (names.has(`${rawName}${index}`)) index += 1;
  return `${rawName}${index}`;
}

function applyTaskDefinitionToProcessNodeTask(item, taskDefinition) {
  if (!item || !taskDefinition) return;
  item.name = taskDefinition.name || item.name || '';
  item.type = taskDefinition.type || item.type || 'Service';
  item.querySourceKind = item.type === 'Query'
    ? (taskDefinition.querySourceKind || item.querySourceKind || 'Dictionary')
    : '';
  item.target = taskDefinition.target || '';
  item.address = taskDefinition.address || '';
  item.parameters = cloneTaskDefinitionParameters(taskDefinition.parameters);
  item.note = taskDefinition.note || '';
  item.constructUid = taskDefinition.constructUid || '';
  item.businessConstructUid = taskDefinition.constructUid || '';
  item.constructName = taskDefinition.constructName || '';
  item.businessComponentUid = taskDefinition.businessComponentUid || '';
  item.businessComponent = taskDefinition.businessComponent || '';
}

function cloneTaskDefinitionParameters(parameters = {}) {
  const normalizeList = (items) => (Array.isArray(items) ? items : []).map((item) => ({
    uid: String(item?.uid || createUiUid('param')),
    name: String(item?.name || ''),
    type: String(item?.type || ''),
    required: Boolean(item?.required),
    isList: String(item?.type || '') === 'list' || Boolean(item?.isList),
    description: String(item?.description || item?.note || ''),
    example: String(item?.example || ''),
    children: normalizeList(item?.children),
  }));
  return {
    inputs: normalizeList(parameters?.inputs),
    outputs: normalizeList(parameters?.outputs),
  };
}

function getTaskDefinitionParameterSummary(task) {
  const parameters = cloneTaskDefinitionParameters(task?.parameters);
  return {
    inputCount: parameters.inputs.length,
    outputCount: parameters.outputs.length,
    address: String(task?.address || ''),
  };
}

function renderProgressBar(items) {
  if (!items || !items.length) return '';
  const totalMax = items.reduce((s,i) => s + (i.max||1), 0);
  const segments = items.map((item) => {
    const pct = Math.round((item.value / Math.max(item.max, 1)) * 100);
    const width = Math.round((item.max / Math.max(totalMax, 1)) * 100);
    return `<div class="pb-seg" style="flex:0 0 ${width}%">
      <div class="pb-fill" style="width:${pct}%;background:${item.color}"></div>
      <span class="pb-label">${item.label} ${item.value}</span>
    </div>`;
  }).join('');
  return `<div class="dialog-progress-bar">${segments}</div>`;
}

function contractSummary(draft) {
  const params = cloneTaskDefinitionParameters(draft?.parameters || { inputs: [], outputs: [] });
  const address = String(draft?.address || draft?.target || '');
  return address
    ? `地址：${address} · 入参 ${params.inputs.length} · 出参 ${params.outputs.length}`
    : `入参 ${params.inputs.length} · 出参 ${params.outputs.length}`;
}

function syncProcessTaskDefinitionFields(taskDefinition) {
  if (!taskDefinition?.id) return;
  (S.doc?.processes || []).forEach((proc) => {
    getProcNodes(proc).forEach((node) => {
      getNodeOrchestrationTasks(node).forEach((item) => {
        if (item.taskDefinitionUid === taskDefinition.id) applyTaskDefinitionToProcessNodeTask(item, taskDefinition);
      });
    });
  });
}

function syncProcessTaskDefinitionName(taskDefinition) {
  syncProcessTaskDefinitionFields(taskDefinition);
}

function syncProcessTaskDefinitionConstruct(taskDefinition) {
  syncProcessTaskDefinitionFields(taskDefinition);
}

function addTaskDefinition(afterId = '', capabilityId = '', constructId = '', options = {}) {
  const tasks = ensureDocumentArray('taskDefinitions');
  const construct = constructId ? findBusinessConstructRef(constructId) : null;
  const capability = capabilityId
    ? ensureBusinessComponentRef(capabilityId)
    : (construct?.businessComponentUid ? ensureBusinessComponentRef(construct.businessComponentUid) : null);
  const task = {
    id: nextStableId('TD', tasks),
    name: getUniqueTaskDefinitionName('新任务定义'),
    type: 'Service',
    target: '',
    address: '',
    parameters: { inputs: [], outputs: [] },
    note: '',
    entityUids: [],
    processIds: [],
    usedBy: [],
  };
  if (capability) syncTaskDefinitionCapability(task, capability);
  if (construct) syncTaskDefinitionConstruct(task, construct);
  const afterIndex = tasks.findIndex((item) => item.id === afterId);
  tasks.splice(afterIndex >= 0 ? afterIndex + 1 : tasks.length, 0, task);
  if (capability) {
    const capRef = ensureBusinessComponentRef(capability.id);
    capRef.taskDefinitionUids = [...new Set([...(capRef.taskDefinitionUids || []), task.id])];
  }
  if (construct) {
    construct.taskDefinitionUids = [...new Set([...(construct.taskDefinitionUids || []), task.id])];
  }
  markModified();
  renderSidebar();
  if (!options.skipRender) rerenderBusinessModelDialogContext();
  return task;
}

function addTaskDefinitionAndOpen(capabilityId = '', constructId = '') {
  openTaskDefinitionDraft(capabilityId, constructId);
}

function openTaskDefinitionDraft(capabilityId = '', constructId = '', returnMode = '', procId = '', taskId = '', afterIdx = null) {
  const task = addTaskDefinition('', capabilityId, constructId, { skipRender: true });
  if (!task) return;
  task._isNew = true;
  openTaskDefinitionEditor(task.id, capabilityId, constructId, returnMode, procId, taskId, afterIdx);
}

function confirmNewTaskDefinition(taskId) {
  const task = findTaskDefinitionRef(taskId);
  if (!task) return;
  const name = String(task.name || '').trim();
  if (!name) return alert('请填写任务名称。');
  if (ensureDocumentArray('taskDefinitions').some((item) => String(item.name || '').trim() === name && item.id !== task.id)) {
    return alert(`任务定义”${name}”已存在，请换一个名称。`);
  }
  delete task._isNew;
  syncProcessTaskDefinitionFields(task);
  markModified();
  const dialog = S.ui.businessModelDialog || {};
  openTaskDefinitionEditor(taskId, task.businessComponentUid || '', task.constructUid || '', dialog.returnMode, dialog.procId, dialog.taskId, dialog.afterIdx);
}

function cancelNewTaskDefinition(taskId) {
  const task = findTaskDefinitionRef(taskId);
  if (task && task._isNew) {
    ensureDocumentArray('taskDefinitions').splice(ensureDocumentArray('taskDefinitions').indexOf(task), 1);
  }
  closeBusinessModelDialog();
}

function saveTaskDefinitionDraft() {
  const dialog = S.ui.businessModelDialog || {};
  const draft = dialog.draft || {};
  const name = String(draft.name || '').trim();
  if (!name) return alert('请填写任务名称。');
  if (ensureDocumentArray('taskDefinitions').some((item) => String(item.name || '').trim() === name)) {
    return alert(`任务定义”${name}”已存在，请换一个名称。`);
  }
  if (!String(draft.constructId || '').trim()) return alert('请先选择所属业务构件。');
  const task = addTaskDefinition('', draft.businessComponentId || dialog.capabilityId || '', draft.constructId || dialog.constructId || '', { skipRender: true });
  if (!task) return;
  draft._savedId = task.id;
  task.name = name;
  task.type = draft.type || 'Service';
  task.querySourceKind = task.type === 'Query' ? (draft.querySourceKind || 'Dictionary') : '';
  task.target = String(draft.target || '');
  task.address = String(draft.address || '');
  task.parameters = cloneTaskDefinitionParameters(draft.parameters);
  task.note = String(draft.note || '');
  syncProcessTaskDefinitionFields(task);
  markModified();
  if (dialog.returnMode === 'processNode') {
    openTaskDefinitionEditor(task.id, task.businessComponentUid || '', task.constructUid || '', dialog.returnMode, dialog.procId, dialog.taskId, dialog.afterIdx);
  } else {
    openTaskDefinitionEditor(task.id, task.businessComponentUid || '', task.constructUid || '');
  }
}

function setTaskDefinition(taskDefinitionId, key, value) {
  const task = findTaskDefinitionRef(taskDefinitionId);
  if (!task || !['name', 'type', 'querySourceKind', 'target', 'address', 'note', 'businessComponentId', 'constructId'].includes(key)) return false;
  if (key === 'name') {
    const nextName = String(value || '').trim();
    if (nextName && ensureDocumentArray('taskDefinitions').some((item) => item.id !== task.id && String(item.name || '').trim() === nextName)) {
      alert(`任务定义“${nextName}”已存在，请换一个名称。`);
      if (S.ui.tab === 'process') {
        const focusSelector = (S.ui.nodePerspective || 'user') === 'engineering'
          ? '[data-testid="orchestration-section"] .orch-name'
          : '[data-testid="process-task-name-input"]';
        rerenderProcessEditor({ focusSelector, selectText: false });
      } else {
        rerenderDomainTabPreserveScroll();
      }
      return false;
    }
    task.name = nextName;
    syncProcessTaskDefinitionName(task);
  } else if (key === 'businessComponentId') {
    if (value) {
      const capability = ensureBusinessComponentRef(value);
      syncTaskDefinitionCapability(task, capability);
      capability.taskDefinitionUids = [...new Set([...(capability.taskDefinitionUids || []), task.id])];
      const construct = task.constructUid ? findBusinessConstructRef(task.constructUid) : null;
      if (construct && String(construct.businessComponentUid || '') !== String(capability.id || '')) {
        task.constructUid = '';
        task.constructName = '';
      }
    } else {
      task.businessComponentUid = '';
      task.businessComponent = '';
      task.constructUid = '';
      task.constructName = '';
    }
  } else if (key === 'constructId') {
    ensureDocumentArray('businessConstructs').forEach((construct) => {
      if (Array.isArray(construct.taskDefinitionUids)) {
        construct.taskDefinitionUids = construct.taskDefinitionUids.filter((id) => id !== task.id);
      }
    });
    if (value) {
      const construct = findBusinessConstructRef(value);
      syncTaskDefinitionConstruct(task, construct);
      if (construct) {
        construct.taskDefinitionUids = [...new Set([...(construct.taskDefinitionUids || []), task.id])];
      }
    } else {
      task.constructUid = '';
      task.constructName = '';
    }
    syncProcessTaskDefinitionConstruct(task);
  } else if (key === 'type') {
    task.type = value;
    if (value !== 'Query') task.querySourceKind = '';
    if (value === 'Query' && !task.querySourceKind) task.querySourceKind = 'Dictionary';
  } else if (key !== 'name') {
    task[key] = value;
  }
  syncProcessTaskDefinitionFields(task);
  markModified();
  renderSidebar();
  return true;
}

function openTaskParameterDialog(taskDefinitionId) {
  const task = findTaskDefinitionRef(taskDefinitionId);
  if (!task) return;
  S.ui.taskParameterDialog = {
    taskDefinitionId: String(task.id || task.name || ''),
    draft: {
      address: String(task.address || ''),
      parameters: cloneTaskDefinitionParameters(task.parameters),
    },
  };
  renderTaskParameterDialog();
  openModalById('task-parameter-modal-overlay');
}

function closeTaskParameterDialog() {
  S.ui.taskParameterDialog = null;
  closeModalById('task-parameter-modal-overlay');
}

function getTaskParameterDialogDraft() {
  if (!S.ui.taskParameterDialog) S.ui.taskParameterDialog = { taskDefinitionId: '', draft: { address: '', parameters: { inputs: [], outputs: [] } } };
  const draft = S.ui.taskParameterDialog.draft || {};
  draft.address = String(draft.address || '');
  draft.parameters = cloneTaskDefinitionParameters(draft.parameters);
  S.ui.taskParameterDialog.draft = draft;
  return draft;
}

function setTaskParameterAddress(value) {
  getTaskParameterDialogDraft().address = String(value || '');
}

function setTaskParameterField(kind, index, key, value) {
  const normalizedKind = kind === 'outputs' ? 'outputs' : 'inputs';
  const draft = getTaskParameterDialogDraft();
  const row = draft.parameters[normalizedKind]?.[index];
  if (!row || !['name', 'type', 'required', 'isList', 'description', 'example'].includes(key)) return;
  row[key] = (key === 'required' || key === 'isList') ? Boolean(value) : String(value || '');
  if (key === 'type') {
    row.isList = String(value || '') === 'list';
    if (!row.isList) row.children = [];
    renderTaskParameterDialog();
  }
}

function setTaskParameterChildField(kind, parentIndex, childIndex, key, value) {
  const normalizedKind = kind === 'outputs' ? 'outputs' : 'inputs';
  const draft = getTaskParameterDialogDraft();
  const row = draft.parameters[normalizedKind]?.[parentIndex];
  if (!row || !Array.isArray(row.children)) return;
  const child = row.children[childIndex];
  if (!child || !['name', 'type', 'required', 'description', 'example'].includes(key)) return;
  child[key] = key === 'required' ? Boolean(value) : String(value || '');
}

function addTaskParameter(kind) {
  const normalizedKind = kind === 'outputs' ? 'outputs' : 'inputs';
  const draft = getTaskParameterDialogDraft();
  draft.parameters[normalizedKind].push({
    uid: createUiUid(normalizedKind === 'inputs' ? 'in' : 'out'),
    name: '', type: '', required: false, isList: false,
    description: '', example: '', children: [],
  });
  renderTaskParameterDialog();
}

function addTaskParameterChild(kind, parentIndex) {
  const normalizedKind = kind === 'outputs' ? 'outputs' : 'inputs';
  const draft = getTaskParameterDialogDraft();
  const row = draft.parameters[normalizedKind]?.[parentIndex];
  if (!row) return;
  if (!Array.isArray(row.children)) row.children = [];
  row.children.push({
    uid: createUiUid('child'),
    name: '', type: '', required: false,
    description: '', example: '',
  });
  renderTaskParameterDialog();
}

function removeTaskParameter(kind, index) {
  const normalizedKind = kind === 'outputs' ? 'outputs' : 'inputs';
  const draft = getTaskParameterDialogDraft();
  draft.parameters[normalizedKind].splice(index, 1);
  renderTaskParameterDialog();
}

function removeTaskParameterChild(kind, parentIndex, childIndex) {
  const normalizedKind = kind === 'outputs' ? 'outputs' : 'inputs';
  const draft = getTaskParameterDialogDraft();
  const row = draft.parameters[normalizedKind]?.[parentIndex];
  if (!row || !Array.isArray(row.children)) return;
  row.children.splice(childIndex, 1);
  renderTaskParameterDialog();
}

function insertTaskParameter(kind, afterIndex) {
  const normalizedKind = kind === 'outputs' ? 'outputs' : 'inputs';
  const draft = getTaskParameterDialogDraft();
  draft.parameters[normalizedKind].splice(afterIndex + 1, 0, {
    uid: createUiUid(normalizedKind === 'inputs' ? 'in' : 'out'),
    name: '', type: '', required: false, isList: false,
    description: '', example: '', children: [],
  });
  renderTaskParameterDialog();
}

function moveTaskParameter(kind, index, direction) {
  const normalizedKind = kind === 'outputs' ? 'outputs' : 'inputs';
  const draft = getTaskParameterDialogDraft();
  const list = draft.parameters[normalizedKind];
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= list.length) return;
  const [item] = list.splice(index, 1);
  list.splice(targetIndex, 0, item);
  renderTaskParameterDialog();
}

function insertTaskParameterChild(kind, parentIndex, afterIndex) {
  const normalizedKind = kind === 'outputs' ? 'outputs' : 'inputs';
  const draft = getTaskParameterDialogDraft();
  const row = draft.parameters[normalizedKind]?.[parentIndex];
  if (!row) return;
  if (!Array.isArray(row.children)) row.children = [];
  row.children.splice(afterIndex + 1, 0, {
    uid: createUiUid('child'),
    name: '', type: '', required: false,
    description: '', example: '',
  });
  renderTaskParameterDialog();
}

function moveTaskParameterChild(kind, parentIndex, childIndex, direction) {
  const normalizedKind = kind === 'outputs' ? 'outputs' : 'inputs';
  const draft = getTaskParameterDialogDraft();
  const row = draft.parameters[normalizedKind]?.[parentIndex];
  if (!row || !Array.isArray(row.children)) return;
  const list = row.children;
  const targetIndex = childIndex + direction;
  if (targetIndex < 0 || targetIndex >= list.length) return;
  const [item] = list.splice(childIndex, 1);
  list.splice(targetIndex, 0, item);
  renderTaskParameterDialog();
}

function saveTaskParameterDialog() {
  const dialog = S.ui.taskParameterDialog || {};
  const task = findTaskDefinitionRef(dialog.taskDefinitionId);
  if (!task) return closeTaskParameterDialog();
  const draft = getTaskParameterDialogDraft();
  task.address = String(draft.address || '').trim();
  task.parameters = cloneTaskDefinitionParameters(draft.parameters);
  syncProcessTaskDefinitionFields(task);
  markModified();
  rerenderBusinessModelDialogContext();
  closeTaskParameterDialog();
}

function renderTaskParameterRows(kind, rows) {
  const normalizedKind = kind === 'outputs' ? 'outputs' : 'inputs';
  if (!rows.length) return '<p class="task-param-empty">暂未定义参数，可按需补充。</p>';

  const renderOneRow = (row, index, parentIndex, isChild, totalInGroup) => {
    const isLast = index >= totalInGroup - 1;
    const kindRef = parentIndex != null ? `${normalizedKind}:${parentIndex}` : normalizedKind;
    const setterFn = parentIndex != null ? 'setTaskParameterChildField' : 'setTaskParameterField';
    const setterArgs = parentIndex != null
      ? `'${normalizedKind}',${parentIndex},${index}`   // child: kind, parentIndex, childIndex
      : `'${normalizedKind}',${index}`;                   // parent: kind, index
    const removeFn = parentIndex != null
      ? `removeTaskParameterChild('${normalizedKind}',${parentIndex},${index})`
      : `removeTaskParameter('${normalizedKind}',${index})`;
    const insertFn = parentIndex != null
      ? `insertTaskParameterChild('${normalizedKind}',${parentIndex},${index})`
      : `insertTaskParameter('${normalizedKind}',${index})`;
    const moveFn = parentIndex != null
      ? `moveTaskParameterChild('${normalizedKind}',${parentIndex},${index},`
      : `moveTaskParameter('${normalizedKind}',${index},`;
    const cls = isChild ? 'task-param-row task-param-child-row' : 'task-param-row';

    const rowHtml = `<div class="${cls}" data-testid="task-parameter-row">
      <input type="text" value="${esc(row.name || '')}" placeholder="中文名称"
        oninput="${setterFn}(${setterArgs},'name',this.value)">
      <select onchange="${setterFn}(${setterArgs},'type',this.value)">
        <option value="" ${!row.type ? 'selected' : ''}>类型</option>
        ${FIELD_TYPES.filter(t => !isChild || t.value !== 'list').map((t) => `<option value="${t.value}" ${row.type === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
      </select>
      <label class="task-param-required"><input type="checkbox" ${row.required ? 'checked' : ''}
        onchange="${setterFn}(${setterArgs},'required',this.checked)"> 必填</label>
      <textarea class="auto-resize" rows="1" placeholder="英文名称"
        oninput="${setterFn}(${setterArgs},'description',this.value);autoResize(this)"
        >${esc(row.description || '')}</textarea>
      <textarea class="auto-resize" rows="1" placeholder="说明/示例"
        oninput="${setterFn}(${setterArgs},'example',this.value);autoResize(this)"
        >${esc(row.example || '')}</textarea>
      <span class="task-param-actions">
        <button class="stage-quick-btn stage-quick-btn-text" type="button" title="在此下方插入" onclick="${insertFn}">＋</button>
        <button class="stage-quick-btn stage-quick-btn-text" type="button" title="上移" onclick="${moveFn}-1)" ${index === 0 ? 'disabled' : ''}>↑</button>
        <button class="stage-quick-btn stage-quick-btn-text" type="button" title="下移" onclick="${moveFn}1)" ${isLast ? 'disabled' : ''}>↓</button>
        <button class="stage-quick-btn danger" type="button" title="删除" onclick="${removeFn}">×</button>
      </span>
    </div>`;

    if (row.type === 'list' && Array.isArray(row.children)) {
      const childrenHtml = row.children.length
        ? row.children.map((child, ci) => renderOneRow(child, ci, index, true, row.children.length)).join('')
        : '';
      return rowHtml + `<div class="task-param-children">
        <div class="task-param-children-head">
          <span>子字段（${row.children.length}）</span>
          <button class="btn btn-outline btn-sm" type="button" onclick="addTaskParameterChild('${normalizedKind}',${index})">＋ 子字段</button>
        </div>
        ${childrenHtml || '<p class="task-param-empty">暂未定义子字段。</p>'}
      </div>`;
    }
    return rowHtml;
  };

  const total = rows.length;
  return rows.map((row, index) => renderOneRow(row, index, null, false, total)).join('');
}

function renderTaskParameterDialog() {
  const overlay = document.getElementById('task-parameter-modal-overlay');
  if (!overlay) return;
  const dialog = S.ui.taskParameterDialog || {};
  const task = findTaskDefinitionRef(dialog.taskDefinitionId);
  const draft = getTaskParameterDialogDraft();
  overlay.querySelector('.task-parameter-modal-body').innerHTML = `
    <div class="task-param-address">
      <label>任务地址</label>
      <input data-testid="task-parameter-address-input" type="text" value="${esc(draft.address || '')}"
        placeholder="http://service/path 或 package.module.method"
        oninput="setTaskParameterAddress(this.value)">
      <span>可填写 HTTP 地址、包路径、类方法或服务标识；不强制填写。</span>
    </div>
    <div class="task-param-grid">
      <section class="task-param-panel">
        <div class="task-param-panel-head">
          <h4>输入参数</h4>
          <button class="btn btn-outline btn-sm" type="button" data-testid="task-parameter-add-input" onclick="addTaskParameter('inputs')">＋ 入参</button>
        </div>
        <div class="task-param-header"><span>中文名称</span><span>类型</span><span>必填</span><span>英文名称</span><span>说明/示例</span><span></span></div>
        ${renderTaskParameterRows('inputs', draft.parameters.inputs)}
      </section>
      <section class="task-param-panel">
        <div class="task-param-panel-head">
          <h4>输出参数</h4>
          <button class="btn btn-outline btn-sm" type="button" data-testid="task-parameter-add-output" onclick="addTaskParameter('outputs')">＋ 出参</button>
        </div>
        <div class="task-param-header"><span>中文名称</span><span>类型</span><span>必填</span><span>英文名称</span><span>说明/示例</span><span></span></div>
        ${renderTaskParameterRows('outputs', draft.parameters.outputs)}
      </section>
    </div>`;
  overlay.querySelector('.task-parameter-modal-title').textContent = `任务参数：${task?.name || task?.id || '未命名任务'}`;
}

function addEntityToConstruct(constructId, entityId) {
  const construct = findBusinessConstructRef(constructId);
  const entity = (S.doc?.entities || []).find((item) => item.id === entityId);
  if (!construct || !entity) return;
  ensureDocumentArray('businessConstructs').forEach((item) => {
    if (Array.isArray(item.entityUids)) item.entityUids = item.entityUids.filter((id) => id !== entity.id);
  });
  entity.businessConstructUid = construct.uid;
  entity.businessConstructUids = [construct.uid];
  construct.entityUids = [...new Set([...(construct.entityUids || []), entity.id])];
  markModified();
  renderSidebar();
  rerenderDomainTabPreserveScroll();
  if (S.ui.tab === 'data' && (S.ui.dataView || 'relation') === 'relation') renderEntityDiagramNow();
}

function removeEntityFromConstruct(constructId, entityId) {
  const construct = findBusinessConstructRef(constructId);
  const entity = (S.doc?.entities || []).find((item) => item.id === entityId);
  if (!construct || !entity) return;
  construct.entityUids = (construct.entityUids || []).filter((id) => id !== entity.id);
  if (entity.businessConstructUid === construct.uid) entity.businessConstructUid = '';
  if (Array.isArray(entity.businessConstructUids)) {
    entity.businessConstructUids = entity.businessConstructUids.filter((id) => id !== construct.uid);
  }
  markModified();
  renderSidebar();
  rerenderDomainTabPreserveScroll();
  if (S.ui.tab === 'data' && (S.ui.dataView || 'relation') === 'relation') renderEntityDiagramNow();
}

function addTaskDefinitionToConstruct(constructId, taskDefinitionId) {
  const construct = findBusinessConstructRef(constructId);
  const task = findTaskDefinitionRef(taskDefinitionId);
  if (!construct || !task) return;
  ensureDocumentArray('businessConstructs').forEach((item) => {
    if (Array.isArray(item.taskDefinitionUids)) item.taskDefinitionUids = item.taskDefinitionUids.filter((id) => id !== task.id);
  });
  construct.taskDefinitionUids = [...new Set([...(construct.taskDefinitionUids || []), task.id])];
  syncTaskDefinitionConstruct(task, construct);
  syncProcessTaskDefinitionConstruct(task);
  markModified();
  renderSidebar();
  rerenderDomainTabPreserveScroll();
}

function removeTaskDefinitionFromConstruct(constructId, taskDefinitionId) {
  const construct = findBusinessConstructRef(constructId);
  const task = findTaskDefinitionRef(taskDefinitionId);
  if (!construct || !task) return;
  construct.taskDefinitionUids = (construct.taskDefinitionUids || []).filter((id) => id !== task.id);
  if (task.constructUid === construct.uid) {
    task.constructUid = '';
    task.constructName = '';
  }
  syncProcessTaskDefinitionConstruct(task);
  markModified();
  renderSidebar();
  rerenderDomainTabPreserveScroll();
}

function openBusinessModelDialog(mode, capabilityId = '', constructId = '') {
  S.ui.businessModelDialog = {
    mode,
    capabilityId: String(capabilityId || '').trim(),
    constructId: String(constructId || '').trim(),
    taskDefinitionId: '',
    returnMode: '',
    procId: '',
    taskId: '',
    afterIdx: null,
  };
  rerenderBusinessModelDialogContext();
}

function openTaskDefinitionEditor(taskDefinitionId, capabilityId = '', constructId = '', returnMode = '', procId = '', taskId = '', afterIdx = null) {
  S.ui.tab = 'domain';
  S.ui.businessModelDialog = {
    mode: 'task',
    capabilityId: String(capabilityId || '').trim(),
    constructId: String(constructId || '').trim(),
    taskDefinitionId: String(taskDefinitionId || '').trim(),
    returnMode: String(returnMode || '').trim(),
    procId: String(procId || '').trim(),
    taskId: String(taskId || '').trim(),
    afterIdx: Number.isInteger(afterIdx) ? afterIdx : null,
  };
  if (typeof render === 'function') render();
}

function openTaskDefinitionManager() {
  S.ui.businessModelDialog = {
    mode: 'tasks',
    capabilityId: '',
    constructId: '',
    taskDefinitionId: '',
    returnMode: '',
    procId: '',
    taskId: '',
    afterIdx: null,
  };
  rerenderBusinessModelDialogContext();
}

function openEntityDefinitionEditor(entityId) {
  const id = String(entityId || '').trim();
  if (!id) return;
  if (typeof queueUiNavigationHistoryFor === 'function') {
    queueUiNavigationHistoryFor((next) => {
      next.tab = 'data';
      next.dataView = 'relation';
      next.entityId = id;
      next.entityRelationEditorCollapsed = false;
      next.businessModelDialog = { mode: '', capabilityId: '', constructId: '', taskDefinitionId: '', returnMode: '', procId: '', taskId: '', afterIdx: null };
      return next;
    });
  }
  S.ui.businessModelDialog = { mode: '', capabilityId: '', constructId: '', taskDefinitionId: '', returnMode: '', procId: '', taskId: '', afterIdx: null };
  S.ui.tab = 'data';
  S.ui.dataView = 'relation';
  S.ui.entityId = id;
  S.ui.entityRelationEditorCollapsed = false;
  render();
}

function addEntityDefinitionAndOpen(constructId = '') {
  if (typeof addEntity !== 'function') return;
  S.ui.dataView = 'relation';
  S.ui.entityRelationEditorCollapsed = false;
  addEntity(String(constructId || '').trim());
}

function closeBusinessModelDialog() {
  S.ui.businessModelDialog = { mode: '', capabilityId: '', constructId: '', taskDefinitionId: '', returnMode: '', procId: '', taskId: '', afterIdx: null };
  rerenderBusinessModelDialogContext();
}

function renderFeedbackTab() {
  const doc = S.ui.feedbackDoc;
  const items = Array.isArray(doc?.items) ? doc.items : [];
  const PAGE_SIZE = 20;
  const CATEGORIES = ['需求功能', '体验改进', '轻微缺陷', '严重问题'];
  const STATUSES = ['待处理', '处理中', '已解决', '已关闭'];
  const counts = { '需求功能': 0, '体验改进': 0, '轻微缺陷': 0, '严重问题': 0 };
  items.forEach((item) => { if (counts.hasOwnProperty(item.category)) counts[item.category]++; });
  const statusCounts = { '待处理': 0, '处理中': 0, '已解决': 0, '已关闭': 0 };
  items.forEach((item) => {
    const status = item.status || '待处理';
    if (statusCounts.hasOwnProperty(status)) statusCounts[status]++;
  });
  const filterCategory = S.ui.feedbackFilterCategory || '';
  const filterStatus = S.ui.feedbackFilterStatus || '';
  const currentUserName = String(S.user?.name || S.collab?.userName || '').trim();
  const ownerFilter = S.ui.feedbackOwnerFilter || (currentUserName === '梁晶' ? 'all' : 'mine');
  S.ui.feedbackOwnerFilter = ownerFilter;
  const feedbackSortKey = (item) => {
    const messages = Array.isArray(item.messages) ? item.messages : [];
    const lastMessage = messages.length ? messages[messages.length - 1] : null;
    return String(lastMessage?.updatedAt || lastMessage?.createdAt || item.updatedAt || item.createdAt || '');
  };
  const filtered = items.filter((item) =>
    (!filterCategory || item.category === filterCategory) &&
    (!filterStatus || item.status === filterStatus) &&
    (ownerFilter !== 'mine' || !currentUserName || item.author === currentUserName)
  ).slice().sort((left, right) => feedbackSortKey(right).localeCompare(feedbackSortKey(left)));
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, Number(S.ui.feedbackPage || 1)), totalPages);
  S.ui.feedbackPage = currentPage;
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const selectedUid = S.ui.feedbackSelectedUid || '';
  const selectedItem = items.find((item) => item.uid === selectedUid) || null;

  const container = document.getElementById('tab-content');
  if (!container) return;

  const renderCard = (item) => {
    const category = item.category || '体验改进';
    const status = item.status || '待处理';
    const uid = item.uid || '';
    const createdAt = String(item.createdAt || '').replace('T', ' ');
    const messages = Array.isArray(item.messages) ? item.messages : [];
    const lastMessage = messages.length ? messages[messages.length - 1] : null;
    const summary = lastMessage?.content || item.description || '暂无对话内容。';
    return `<button type="button" class="fb-tile ${selectedUid === uid ? 'fb-tile--active' : ''}" onclick="selectFeedbackItem(decodeURIComponent('${encodeURIComponent(uid)}'))">
        <div class="fb-card-head">
          <span class="fb-badge fb-badge--${esc(category)}">${esc(category)}</span>
          <span class="fb-badge fb-badge--status fb-badge--${esc(status)}">${esc(status)}</span>
        </div>
        <h4 class="fb-card-title">${esc(item.title || '(无标题)')}</h4>
        <p class="fb-card-desc">${esc(String(summary).slice(0, 90))}${String(summary).length > 90 ? '…' : ''}</p>
        <div class="fb-tile-foot">
          <span>${esc(item.author || '匿名')}</span>
          <span>${esc(createdAt || '刚刚')}</span>
          <span>${messages.length || 0} 楼</span>
        </div>
      </button>`;
  };

  const formatFeedbackAttachmentSize = (size) => {
    const value = Number(size || 0);
    if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
    if (value >= 1024) return `${Math.ceil(value / 1024)} KB`;
    return `${value || 0} B`;
  };
  const renderPendingAttachments = (key, options = {}) => {
    const pendingMap = S.ui.feedbackPendingAttachments || {};
    const entries = Array.isArray(pendingMap[key]) ? pendingMap[key] : [];
    if (!entries.length) return '';
    return `<div class="fb-pending-attachments">
      <div class="fb-pending-head">
        <span>已添加附件 ${entries.length}</span>
      </div>
      <div class="fb-pending-list">
        ${entries.map((entry) => `<div class="fb-pending-item" title="${esc(entry.filename || 'attachment')}">
          <span class="fb-pending-thumb">${String(entry.contentType || '').startsWith('image/') ? '图' : '文'}</span>
          <span class="fb-pending-name">${esc(entry.filename || 'attachment')}</span>
          <span class="fb-pending-size">${esc(formatFeedbackAttachmentSize(entry.size))}</span>
          <button type="button" class="fb-pending-remove" title="移除" onclick="App.removePendingFeedbackAttachment(decodeURIComponent('${encodeURIComponent(key)}'),decodeURIComponent('${encodeURIComponent(entry.uid || '')}'))">×</button>
        </div>`).join('')}
      </div>
    </div>`;
  };

  const renderDetail = () => {
    if (S.ui.feedbackCreating) {
      return `<aside class="feedback-detail" onpaste="App.pasteFeedbackAttachments(event,'__new__')">
        <div class="fb-detail-head">
          <div>
            <p class="feedback-kicker">新建反馈</p>
            <h3>提交一条反馈建议</h3>
          </div>
          <button class="icon-btn" onclick="S.ui.feedbackCreating=false;render()" title="取消">×</button>
        </div>
        <section class="fb-create-panel">
          <label>类型
            <select id="fb-add-cat">${CATEGORIES.map((c) => `<option value="${c}" ${c === '体验改进' ? 'selected' : ''}>${c}</option>`).join('')}</select>
          </label>
          <label>标题
            <input id="fb-add-title" placeholder="用一句话说明反馈内容">
          </label>
          <label>详细描述
            <textarea id="fb-add-desc" rows="7" placeholder="补充现象、期望、影响范围或复现步骤"></textarea>
          </label>
          <div class="fb-attachment-picker">
            <label class="fb-message-add-attachment" title="添加附件">
              +
              <input id="fb-add-attachments" type="file" multiple accept="image/*,.png,.jpg,.jpeg,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.txt" onchange="App.queueFeedbackAttachments('__new__',this)">
            </label>
            <span>支持上传图片和附件，也可以直接 Ctrl+V 粘贴截图。</span>
          </div>
          ${renderPendingAttachments('__new__')}
          <button class="btn btn-primary" onclick="App.createFeedbackFromForm()">提交反馈</button>
        </section>
      </aside>`;
    }
    if (!selectedItem) {
      return `<aside class="feedback-detail">
        <div class="fb-detail-empty">
          <strong>选择一条反馈</strong>
          <p>点击中间的反馈卡片后，这里会显示类型、状态和对话记录。</p>
        </div>
      </aside>`;
    }
    const uid = selectedItem.uid || '';
    const messages = Array.isArray(selectedItem.messages) ? selectedItem.messages : [];
    const renderAttachment = (messageUid, attachment) => {
      const attachmentUid = attachment.uid || '';
      const filename = attachment.filename || 'attachment';
      const contentType = String(attachment.contentType || '').toLowerCase();
      const size = Number(attachment.size || 0);
      const sizeText = size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : size >= 1024 ? `${Math.ceil(size / 1024)} KB` : `${size || 0} B`;
      const url = api.feedbackAttachmentUrl(uid, attachmentUid);
      const isImage = contentType.startsWith('image/')
        || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(filename);
      const deleteButton = `<button class="fb-attachment-delete" type="button" title="\u5220\u9664\u9644\u4ef6" onclick="event.stopPropagation();App.deleteFeedbackAttachment(decodeURIComponent('${encodeURIComponent(uid)}'),decodeURIComponent('${encodeURIComponent(messageUid || '')}'),decodeURIComponent('${encodeURIComponent(attachmentUid)}'))">\u00d7</button>`;
      if (isImage) {
        return `<div class="fb-attachment-wrap">
          <button class="fb-attachment-item fb-attachment-image" type="button" title="${esc(filename)}" onclick="openFeedbackImagePreview(decodeURIComponent('${encodeURIComponent(url)}'),decodeURIComponent('${encodeURIComponent(filename)}'))">
            <span class="fb-attachment-thumb"><img src="${url}" alt=""></span>
            <span class="fb-attachment-name">${esc(filename)}</span>
            <span class="fb-attachment-meta">${esc(sizeText)}</span>
          </button>
          ${deleteButton}
        </div>`;
      }
      return `<div class="fb-attachment-wrap">
        <a class="fb-attachment-item" href="${url}" download="${esc(filename)}" title="${esc(filename)}">
          <span class="fb-attachment-icon">\u9644\u4ef6</span>
          <span class="fb-attachment-name">${esc(filename)}</span>
          <span class="fb-attachment-meta">${esc(sizeText)}</span>
        </a>
        ${deleteButton}
      </div>`;
    };
    const renderMessageAttachments = (message) => {
      const messageUid = message.uid || '';
      const attachments = Array.isArray(message.attachments) ? message.attachments : [];
      const uploading = !!(S.ui.feedbackUploadingAttachments || {})[messageUid];
      return `<div class="fb-message-attachments">
        <div class="fb-message-attachment-actions">
          <label class="fb-message-add-attachment" title="\u6dfb\u52a0\u9644\u4ef6">
            +
            <input type="file" multiple accept="image/*,.png,.jpg,.jpeg,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.txt" onchange="App.queueFeedbackAttachments(decodeURIComponent('${encodeURIComponent(uid)}'),this,decodeURIComponent('${encodeURIComponent(messageUid)}'))">
          </label>
          ${uploading ? '<span class="fb-attachment-uploading">\u4e0a\u4f20\u4e2d...</span>' : ''}
        </div>
        ${attachments.length ? `<div class="fb-attachments-list fb-attachments-list--thread">${attachments.map((attachment) => renderAttachment(messageUid, attachment)).join('')}</div>` : ''}
      </div>`;
    };
    const draftKey = `__message__${uid}`;
    return `<aside class="feedback-detail">
      <div class="fb-detail-head">
        <div>
          <p class="feedback-kicker">\u53cd\u9988\u8be6\u60c5</p>
          <h3>${esc(selectedItem.title || '(\u65e0\u6807\u9898)')}</h3>
        </div>
      </div>
      <section class="fb-detail-section">
        <label>\u7c7b\u578b
          <select id="fb-detail-category" onchange="App.saveFeedbackItem('update',decodeURIComponent('${encodeURIComponent(uid)}'),{category:this.value,status:document.getElementById('fb-detail-status').value})">
            ${CATEGORIES.map((c) => `<option value="${c}" ${(selectedItem.category || CATEGORIES[1])===c?'selected':''}>${c}</option>`).join('')}
          </select>
        </label>
        <label>\u72b6\u6001
          <select id="fb-detail-status" onchange="App.saveFeedbackItem('update',decodeURIComponent('${encodeURIComponent(uid)}'),{category:document.getElementById('fb-detail-category').value,status:this.value})">
            ${STATUSES.map((s) => `<option value="${s}" ${(selectedItem.status || STATUSES[0])===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </label>
      </section>
      <section class="fb-thread">
        <h4>\u5bf9\u8bdd\u8bb0\u5f55</h4>
        <p class="fb-thread-help">每条对话都可以附带图片或附件；点击下方“+”选择文件，或在对话区域直接 Ctrl+V 粘贴截图。</p>
        <div class="fb-thread-list">
          ${messages.length ? messages.map((message, index) => `<article class="fb-thread-item" onpaste="App.pasteFeedbackAttachments(event,decodeURIComponent('${encodeURIComponent(uid)}'),decodeURIComponent('${encodeURIComponent(message.uid || '')}'))">
            <div class="fb-thread-meta">
              <strong>#${message.floor || index + 1}</strong>
              <span>${esc(message.author || '\u533f\u540d')}</span>
              <span>${esc(String(message.createdAt || '').replace('T', ' ') || '-')}</span>
              ${message.updatedAt ? `<span>\u5df2\u4fee\u6539 ${esc(String(message.updatedAt).replace('T', ' '))}</span>` : ''}
            </div>
            ${S.ui.feedbackEditingMessageUid === message.uid ? `
              <textarea id="fb-message-${index}" rows="4">${esc(message.content || '')}</textarea>
            ` : `<div class="fb-thread-content" ondblclick="S.ui.feedbackEditingMessageUid=decodeURIComponent('${encodeURIComponent(message.uid || '')}');render()" title="\u53cc\u51fb\u4fee\u6539\u5bf9\u8bdd\u5185\u5bb9">${esc(message.content || '')}</div>`}
            <div class="fb-thread-actions">
              ${S.ui.feedbackEditingMessageUid === message.uid ? `
                <button class="btn btn-outline btn-sm" onclick="S.ui.feedbackEditingMessageUid='';render()">\u53d6\u6d88</button>
                <button class="btn btn-primary btn-sm" onclick="App.saveFeedbackItem('editMessage',decodeURIComponent('${encodeURIComponent(uid)}'),{messageUid:decodeURIComponent('${encodeURIComponent(message.uid || '')}'),content:document.getElementById('fb-message-${index}').value}).then(function(ok){if(ok){S.ui.feedbackEditingMessageUid='';render();}})">\u4fdd\u5b58\u4fee\u6539</button>
              ` : ''}
            </div>
            ${renderMessageAttachments(message)}
          </article>`).join('') : `<div class="fb-empty fb-empty--compact">\u6682\u65e0\u5bf9\u8bdd\u8bb0\u5f55\u3002</div>`}
        </div>
        <div class="fb-message-composer" onpaste="App.pasteFeedbackAttachments(event,decodeURIComponent('${encodeURIComponent(draftKey)}'))">
          <textarea id="fb-new-message" rows="4" placeholder="\u8ffd\u52a0\u4e00\u6761\u5bf9\u8bdd\u8bb0\u5f55\uff0c\u8bf4\u660e\u8865\u5145\u4fe1\u606f\u3001\u5904\u7406\u610f\u89c1\u6216\u9a8c\u8bc1\u7ed3\u679c"></textarea>
          ${renderPendingAttachments(draftKey)}
          <div class="fb-attachment-hint">回复时也支持点击“+”添加附件，或 Ctrl+V 粘贴截图。</div>
          <div class="fb-composer-actions">
            <label class="fb-message-add-attachment" title="\u6dfb\u52a0\u9644\u4ef6">
              +
              <input type="file" multiple accept="image/*,.png,.jpg,.jpeg,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.txt" onchange="App.queueFeedbackAttachments(decodeURIComponent('${encodeURIComponent(draftKey)}'),this)">
            </label>
            <button class="btn btn-primary" onclick="App.sendFeedbackMessageWithAttachments(decodeURIComponent('${encodeURIComponent(uid)}'))">\u53d1\u9001</button>
          </div>
        </div>
      </section>
    </aside>`;
  };
  container.innerHTML = `<div class="feedback-layout">
    <section class="feedback-hero feedback-hero--wide">
      <div>
        <p class="feedback-kicker">产品共建</p>
        <h2>反馈建议</h2>
        <p>记录使用中的问题、缺陷和优化想法。中间卡片用于快速浏览，右侧详情用于论坛式盖楼跟进。</p>
      </div>
      <div class="feedback-hero-actions">
        <div class="feedback-global-stat">
          <strong>${filtered.length}</strong><span>当前结果</span>
          <strong>${totalPages}</strong><span>页数</span>
        </div>
        <button type="button" class="btn btn-outline manual-back-button" data-testid="feedback-back-button" onclick="returnFromFeedback()">← 返回编辑</button>
      </div>
    </section>
    <div class="feedback-workbench feedback-workbench--three">
      <aside class="feedback-left">
        <div class="feedback-filter-card">
          <div class="fb-owner-toggle" role="group" aria-label="筛选反馈归属">
            <button class="${ownerFilter==='mine'?'active':''}" onclick="S.ui.feedbackOwnerFilter='mine';S.ui.feedbackPage=1;render()">我的反馈</button>
            <button class="${ownerFilter==='all'?'active':''}" onclick="S.ui.feedbackOwnerFilter='all';S.ui.feedbackPage=1;render()">所有人</button>
          </div>
          <div class="feedback-filters feedback-filters--inline">
            <select class="fb-filter" onchange="S.ui.feedbackFilterCategory=this.value;S.ui.feedbackPage=1;render()" aria-label="筛选反馈类别">
              <option value="">全部类型</option>
              ${CATEGORIES.map((c) => `<option value="${c}" ${filterCategory===c?'selected':''}>${c}</option>`).join('')}
            </select>
            <select class="fb-filter" onchange="S.ui.feedbackFilterStatus=this.value;S.ui.feedbackPage=1;render()" aria-label="筛选处理状态">
              <option value="">全部状态</option>
              ${STATUSES.map((s) => `<option value="${s}" ${filterStatus===s?'selected':''}>${s}</option>`).join('')}
            </select>
          </div>
          <button class="btn btn-primary feedback-quick-add" onclick="openFeedbackAddForm()">＋ 新建反馈</button>
        </div>
        <section class="feedback-summary">
          <div class="feedback-stat-card feedback-stat-card--total"><strong>${items.length}</strong><span>全部反馈</span></div>
          <div class="feedback-stat-group">
            <h3>类型统计</h3>
            <div class="feedback-stat-grid">${CATEGORIES.map((c) => `<div><strong>${counts[c] || 0}</strong><span>${c}</span></div>`).join('')}</div>
          </div>
          <div class="feedback-stat-group">
            <h3>状态统计</h3>
            <div class="feedback-stat-grid">${STATUSES.map((s) => `<div><strong>${statusCounts[s] || 0}</strong><span>${s}</span></div>`).join('')}</div>
          </div>
        </section>
      </aside>
      <main class="feedback-main">
        <div class="feedback-card-toolbar">
          <div>
            <strong>反馈卡片</strong>
            <span>${pageItems.length} / ${filtered.length}</span>
          </div>
          <button class="btn btn-primary btn-sm" onclick="openFeedbackAddForm()">＋ 新建反馈</button>
        </div>
        <div class="feedback-tile-grid">
          ${pageItems.length ? pageItems.map(renderCard).join('') : `<div class="fb-empty">
            <strong>暂无反馈记录</strong>
            <p>可以先提交一条需求功能、体验改进、轻微缺陷或严重问题，后续处理记录会沉淀在这里。</p>
            <button class="btn btn-outline btn-sm" onclick="openFeedbackAddForm()">＋ 提交第一条反馈</button>
          </div>`}
        </div>
        <div class="feedback-pagination">
          <button class="btn btn-outline btn-sm" ${currentPage <= 1 ? 'disabled' : ''} onclick="setFeedbackPage(${currentPage - 1})">上一页</button>
          <span>第 ${currentPage} / ${totalPages} 页，每页 20 条</span>
          <button class="btn btn-outline btn-sm" ${currentPage >= totalPages ? 'disabled' : ''} onclick="setFeedbackPage(${currentPage + 1})">下一页</button>
        </div>
      </main>
      ${renderDetail()}
    </div>
  </div>`;
}

function returnFromFeedback() {
  if (typeof goBackNavigation === 'function' && goBackNavigation()) return;
  navigate('domain', {}, { recordHistory: false });
}

function openFeedbackAddForm() {
  S.ui.feedbackCreating = true;
  S.ui.feedbackSelectedUid = '';
  S.ui.feedbackEditingDescriptionUid = '';
  render();
  setTimeout(() => document.getElementById('fb-add-title')?.focus(), 30);
}

function toggleFeedbackReply(index) {
  S.ui.feedbackExpandedIndex = S.ui.feedbackExpandedIndex === index ? -1 : index;
  render();
}

function selectFeedbackItem(uid) {
  S.ui.feedbackSelectedUid = uid;
  S.ui.feedbackCreating = false;
  S.ui.feedbackEditingDescriptionUid = '';
  render();
}

function setFeedbackPage(page) {
  S.ui.feedbackPage = Math.max(1, Number(page || 1));
  render();
}

function toggleFeedbackDescription(uid) {
  const id = String(uid || '');
  S.ui.feedbackDescriptionCollapsedUid = S.ui.feedbackDescriptionCollapsedUid === id ? '' : id;
  if (S.ui.feedbackDescriptionCollapsedUid === id) S.ui.feedbackEditingDescriptionUid = '';
  render();
}

function editFeedbackDescription(uid) {
  const id = String(uid || '');
  S.ui.feedbackDescriptionCollapsedUid = '';
  S.ui.feedbackEditingDescriptionUid = id;
  render();
  setTimeout(() => document.getElementById('fb-detail-description')?.focus(), 30);
}

function cancelFeedbackDescriptionEdit() {
  S.ui.feedbackEditingDescriptionUid = '';
  render();
}

async function removeTaskDefinition(taskDefinitionId) {
  const task = findTaskDefinitionRef(taskDefinitionId);
  if (!task) return false;
  if (!await showAppConfirm(`确认删除任务定义“${task.name || task.id}”？`, {
    title: '删除任务定义',
    confirmLabel: '删除',
  })) return false;
  S.doc.taskDefinitions = ensureDocumentArray('taskDefinitions').filter((item) => item !== task);
  ensureDocumentArray('businessComponents').forEach((capability) => {
    if (!Array.isArray(capability.taskDefinitionUids)) return;
    capability.taskDefinitionUids = capability.taskDefinitionUids.filter((id) => id !== task.id);
  });
  ensureDocumentArray('businessConstructs').forEach((construct) => {
    if (Array.isArray(construct.taskDefinitionUids)) {
      construct.taskDefinitionUids = construct.taskDefinitionUids.filter((id) => id !== task.id);
    }
  });
  ensureDocumentArray('processes').forEach((proc) => {
    getProcNodes(proc).forEach((node) => {
      getNodeOrchestrationTasks(node).forEach((item) => {
        if (item.taskDefinitionUid !== task.id) return;
        item.taskDefinitionUid = '';
        item.constructUid = '';
        item.businessConstructUid = '';
        item.constructName = '';
        item.businessComponentUid = '';
        item.businessComponent = '';
      });
    });
  });
  markModified();
  renderSidebar();
  rerenderDomainTabPreserveScroll();
  return true;
}

function getTaskDefinitionUsageCount(task) {
  if (!task) return 0;
  if (typeof getTaskDefinitionSources === 'function') {
    return getTaskDefinitionSources(task, S.doc).length;
  }
  let count = 0;
  ensureDocumentArray('processes').forEach((proc) => {
    getProcNodes(proc).forEach((node) => {
      getNodeOrchestrationTasks(node).forEach((item) => {
        if (item.taskDefinitionUid === task.id) count += 1;
      });
    });
  });
  return count;
}

function isBlankTaskDefinition(task) {
  return !String(task?.target || '').trim()
    && !String(task?.note || '').trim()
    && !String(task?.constructUid || task?.businessConstructUid || '').trim()
    && !String(task?.businessComponentUid || task?.businessComponent || '').trim();
}

async function cleanupUnreferencedTaskDefinitions(blankOnly = false) {
  const candidates = getTaskDefinitionItems(S.doc).filter((task) => (
    getTaskDefinitionUsageCount(task) === 0
    && (!blankOnly || isBlankTaskDefinition(task))
  ));
  if (!candidates.length) {
    alert(blankOnly ? '没有可清理的空白未引用任务定义。' : '没有未引用任务定义。');
    return 0;
  }
  const label = blankOnly ? '空白未引用任务定义' : '未引用任务定义';
  if (!await showAppConfirm(`确认删除 ${candidates.length} 个${label}？`, {
    title: `清理${label}`,
    confirmLabel: '删除',
  })) return 0;
  const ids = new Set(candidates.map((task) => task.id));
  S.doc.taskDefinitions = ensureDocumentArray('taskDefinitions').filter((task) => !ids.has(task.id || task.name));
  ensureDocumentArray('businessComponents').forEach((capability) => {
    if (Array.isArray(capability.taskDefinitionUids)) {
      capability.taskDefinitionUids = capability.taskDefinitionUids.filter((id) => !ids.has(id));
    }
  });
  ensureDocumentArray('businessConstructs').forEach((construct) => {
    if (Array.isArray(construct.taskDefinitionUids)) {
      construct.taskDefinitionUids = construct.taskDefinitionUids.filter((id) => !ids.has(id));
    }
  });
  markModified();
  renderSidebar();
  rerenderDomainTabPreserveScroll();
  return candidates.length;
}

function getSelectedDomainInfoContext() {
  const selectedDomainId = typeof getBusinessDomainFilter === 'function'
    ? getBusinessDomainFilter()
    : String(S.ui.businessDomainFilter || 'all');
  const domains = typeof getBusinessDomainItems === 'function' ? getBusinessDomainItems(S.doc) : [];
  const domain = selectedDomainId === 'all'
    ? null
    : domains.find((item) => item.id === selectedDomainId || (typeof _domainAliases === 'function' && _domainAliases(item).includes(selectedDomainId))) || null;
  return {
    id: selectedDomainId || 'all',
    domain,
    label: domain?.name || (selectedDomainId === 'all' ? '全部业务域' : selectedDomainId),
  };
}

function getProcessesForDomainInfo(selectedDomainId) {
  const processes = S.doc?.processes || [];
  if (!selectedDomainId || selectedDomainId === 'all' || typeof itemMatchesBusinessDomain !== 'function') return processes;
  return processes.filter((proc) => itemMatchesBusinessDomain(proc, selectedDomainId, S.doc));
}

function getCapabilitiesForDomainInfo(selectedDomainId) {
  const capabilities = typeof getCapabilityItems === 'function' ? getCapabilityItems(S.doc) : [];
  if (!selectedDomainId || selectedDomainId === 'all' || typeof capabilityMatchesBusinessDomain !== 'function') return capabilities;
  return capabilities.filter((capability) => capabilityMatchesBusinessDomain(capability, selectedDomainId, S.doc));
}

function getRoleUsageForDomainInfo(roleId, selectedDomainId) {
  const usage = getRoleUsage(roleId);
  if (!selectedDomainId || selectedDomainId === 'all' || typeof itemMatchesBusinessDomain !== 'function') return usage;
  return usage.filter((item) => itemMatchesBusinessDomain(item.proc, selectedDomainId, S.doc));
}

function getRoleUsageSummaryForDomainInfo(roleId, selectedDomainId) {
  const usage = getRoleUsageForDomainInfo(roleId, selectedDomainId);
  const processIds = new Set(usage.map((item) => item.proc.id));
  const subDomains = new Set(usage.map((item) => normalizeRoleName(item.proc.subDomain)).filter(Boolean));
  return {
    taskCount: usage.length,
    processCount: processIds.size,
    subDomainCount: subDomains.size,
  };
}

function roleMatchesDomainInfo(role, selectedDomainId) {
  if (!selectedDomainId || selectedDomainId === 'all') return true;
  const explicitDomainValues = typeof _itemBusinessDomainValues === 'function'
    ? _itemBusinessDomainValues(role)
    : [role?.businessDomainId, role?.businessDomain, role?.panoramaLaneId, role?.laneId].filter(Boolean).map(String);
  if (explicitDomainValues.length && typeof itemMatchesBusinessDomain === 'function') {
    return itemMatchesBusinessDomain(role, selectedDomainId, S.doc);
  }

  if (getRoleUsageForDomainInfo(role.id, selectedDomainId).length) return true;

  const roleSubDomains = Array.isArray(role?.subDomains) ? role.subDomains.map(normalizeRoleName).filter(Boolean) : [];
  if (roleSubDomains.length) {
    const capabilityNames = new Set(getCapabilitiesForDomainInfo(selectedDomainId).flatMap((capability) => [
      capability.id,
      capability.name,
    ].filter(Boolean).map(String)));
    return roleSubDomains.some((name) => capabilityNames.has(name));
  }

  return true;
}

function getRolesForDomainInfo(selectedDomainId) {
  return getRoles().filter((role) => roleMatchesDomainInfo(role, selectedDomainId));
}

function getGroupedRolesForDomainInfo(roles) {
  const buckets = new Map();
  for (const groupName of getAvailableRoleGroups()) buckets.set(groupName, []);
  for (const role of roles) {
    const groupName = getRoleGroupName(role);
    if (!buckets.has(groupName)) buckets.set(groupName, []);
    buckets.get(groupName).push(role);
  }
  return Array.from(buckets.entries())
    .filter(([, groupRoles]) => groupRoles.length)
    .map(([name, groupRoles]) => ({ name, roles: groupRoles }));
}

function getRoleSummaryCountsForDomainInfo(roles, selectedDomainId) {
  let usedCount = 0;
  let unusedCount = 0;
  roles.forEach((role) => {
    const usage = getRoleUsageSummaryForDomainInfo(role.id, selectedDomainId);
    if (usage.taskCount === 0) unusedCount += 1;
    else usedCount += 1;
  });
  return { roleCount: roles.length, usedCount, unusedCount };
}

function languageItemMatchesDomainInfo(item, selectedDomainId) {
  if (!selectedDomainId || selectedDomainId === 'all') return true;
  if (typeof _itemBusinessDomainValues === 'function' && _itemBusinessDomainValues(item).length && typeof itemMatchesBusinessDomain === 'function') {
    return itemMatchesBusinessDomain(item, selectedDomainId, S.doc);
  }

  const processIds = Array.isArray(item?.processIds) ? item.processIds : [];
  if (processIds.length) {
    return processIds.some((processId) => {
      const proc = (S.doc?.processes || []).find((candidate) => candidate.id === processId);
      return proc && typeof itemMatchesBusinessDomain === 'function' && itemMatchesBusinessDomain(proc, selectedDomainId, S.doc);
    });
  }

  const capabilityRefs = [
    ...(Array.isArray(item?.businessComponentUids) ? item.businessComponentUids : []),
    ...(Array.isArray(item?.subDomains) ? item.subDomains : []),
  ].map(String).filter(Boolean);
  if (capabilityRefs.length) {
    const capabilityNames = new Set(getCapabilitiesForDomainInfo(selectedDomainId).flatMap((capability) => [
      capability.id,
      capability.name,
    ].filter(Boolean).map(String)));
    return capabilityRefs.some((name) => capabilityNames.has(name));
  }

  return true;
}

function getLanguageEntriesForDomainInfo(selectedDomainId) {
  return (S.doc?.language || [])
    .map((term, index) => ({ term, index }))
    .filter(({ term }) => languageItemMatchesDomainInfo(term, selectedDomainId));
}

function collectDomainSubDomainItems(selectedDomainId = 'all') {
  return getCapabilitiesForDomainInfo(selectedDomainId)
    .map((capability) => ({
      id: capability.id || capability.name,
      name: capability.name || capability.id || '未命名业务组件',
      processCount: getCapabilityProcesses(capability, S.doc).length,
      constructCount: getCapabilityConstructs(capability, S.doc).length,
      taskDefinitionCount: getCapabilityTaskAssets(capability, S.doc).length,
      kind: capability.kind === 'core' ? 'core' : 'generic',
    }))
    .sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === 'core' ? -1 : 1;
      return left.name.localeCompare(right.name, 'zh-CN');
    });
}

function jsString(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '')
    .replace(/\n/g, '\\n');
}

function renderSubDomainMapCard(selectedDomainId = 'all', selectedDomainLabel = '全部业务域') {
  const items = collectDomainSubDomainItems(selectedDomainId);
  const coreItems = items.filter((item) => item.kind === 'core');
  const genericItems = items.filter((item) => item.kind !== 'core');
  const renderNode = (item) => {
    return `<button class="domain-context-node ${item.kind}" type="button" data-testid="subdomain-map-node" onclick="openBusinessModelDialog('capability','${esc(jsString(item.id || item.name))}')" title="点击维护业务组件和构件">
    <div class="domain-context-node-main" data-testid="business-model-capability-chip">
      <strong>${esc(item.name)}</strong>
      <span class="domain-context-node-meta">${item.constructCount} 构件 · ${item.taskDefinitionCount} 任务定义 · ${item.processCount} 关联流程</span>
    </div>
    <span class="domain-subdomain-separator" aria-hidden="true"></span>
  </button>`;
  };
  const totalConstructs = getBusinessConstructItems(S.doc).length;
  const totalTasks = getTaskDefinitionItems(S.doc).length;

  return `<div class="domain-info-map-block" data-testid="domain-subdomain-map-card">
    <div class="domain-info-map-head">
      <div class="domain-info-scope-title">
        <h3>业务能力组件</h3>
        <span data-testid="domain-info-scope-label">当前业务域：${esc(selectedDomainLabel)}</span>
        <span data-testid="business-model-summary">组件 ${items.length} · 构件 ${totalConstructs} · 任务定义 ${totalTasks}</span>
      </div>
      <div class="domain-subdomain-actions">
        <div class="domain-subdomain-legend">
          <span class="subdomain-legend core">核心 ${coreItems.length}</span>
          <span class="subdomain-legend generic">通用 ${genericItems.length}</span>
        </div>
        <button class="btn btn-outline btn-sm" type="button" data-testid="capability-add-button" onclick="openBusinessComponentDraft()">＋ 组件</button>
      </div>
    </div>
    <div class="domain-model-integrated" data-testid="business-model-card">
      ${items.length ? `
      <div class="domain-map-shell" data-testid="domain-subdomain-figure">
        <span class="domain-map-region-label domain-map-region-label-core">核心</span>
        <span class="domain-map-region-label domain-map-region-label-generic">通用</span>
        <div class="domain-region domain-region-core" data-testid="subdomain-core-oval">
          ${coreItems.length ? coreItems.map(renderNode).join('') : '<span class="subdomain-map-empty">暂无核心</span>'}
        </div>
        <div class="domain-region domain-region-generic" data-testid="subdomain-generic-oval">
          ${genericItems.length ? genericItems.map(renderNode).join('') : '<span class="subdomain-map-empty">暂无通用</span>'}
        </div>
      </div>` : '<p class="no-refs domain-panel-empty">暂无业务组件，点击右上角“组件”先创建一个。</p>'}
    </div>
  </div>`;
}

function setPanoramaCapabilitySelection(capabilityId) {
  if (window.PanoramaWorkbench) return window.PanoramaWorkbench.setCapabilitySelection(capabilityId);
}

function getPanoramaCapabilityStageIds(capability, selectedDomainId = 'all') {
  if (window.PanoramaModel) return window.PanoramaModel.getCapabilityStageIds(capability, selectedDomainId);
  return new Set();
}

function renderPanoramaValueMatrix(selectedDomainId = 'all') {
  if (window.PanoramaWorkbench) return window.PanoramaWorkbench.renderMap(selectedDomainId);
  return '';
}

function getLightRoleSummary(role, selectedDomainId = 'all') {
  const usage = getRoleUsageSummaryForDomainInfo(role.id, selectedDomainId);
  return usage.taskCount ? `${usage.taskCount}N` : '未使用';
}

function renderDomainPanelHeader(title, subtitle, actions = '', options = {}) {
  const tag = options.button ? 'button' : 'div';
  const attrs = [];
  if (options.button) attrs.push('type="button"');
  if (options.onclick) attrs.push(`onclick="${options.onclick}"`);
  if (options.dataTestId) attrs.push(`data-testid="${options.dataTestId}"`);
  if (options.dataPanel) attrs.push(`data-panel="${esc(options.dataPanel)}"`);
  if (options.ariaExpanded !== undefined) attrs.push(`aria-expanded="${options.ariaExpanded ? 'true' : 'false'}"`);
  return `<${tag} class="domain-panel-head${options.button ? ' domain-panel-head-button' : ''}" ${attrs.join(' ')}>
    <div class="domain-panel-copy">
      <div class="domain-panel-title-row">
        <h3>${esc(title)}</h3>
        ${options.badge ? `<span class="domain-panel-badge">${esc(options.badge)}</span>` : ''}
      </div>
      ${subtitle ? `<p class="domain-panel-subtitle">${esc(subtitle)}</p>` : ''}
    </div>
    ${actions ? `<div class="domain-panel-actions">${actions}</div>` : ''}
  </${tag}>`;
}

function renderMoveList(items, options) {
  if (!items.length) return `<p class="no-refs">${esc(options.emptyText || '暂无')}</p>`;
  return `<div class="business-model-move-list">
    ${items.map((item) => `<div class="business-model-move-row">
      <span>${esc(options.label(item))}</span>
      <span class="business-model-move-actions">
        <button class="stage-quick-btn stage-quick-btn-text" type="button" data-testid="${esc(options.testId || 'business-model-move')}"
          onclick="${options.onclick(item)}">${esc(options.actionLabel || '加入')}</button>
        ${options.secondaryOnclick ? `<button class="stage-quick-btn stage-quick-btn-text danger" type="button" data-testid="${esc(options.secondaryTestId || 'business-model-secondary-move')}"
          onclick="${options.secondaryOnclick(item)}">${esc(options.secondaryActionLabel || '移出')}</button>` : ''}
      </span>
    </div>`).join('')}
  </div>`;
}

function renderCapabilityDialog(capability) {
  const capId = String(capability.id || capability.name || '');
  const allConstructs = getBusinessConstructItems(S.doc);
  const groupedConstructs = allConstructs.filter((construct) => isBusinessConstructAssignedToCapability(construct, capability));
  const ungroupedConstructs = allConstructs.filter((construct) => !isBusinessConstructAssignedToAnyCapability(construct, S.doc));
  return `<div class="business-model-dialog-panel" data-testid="business-model-dialog">
    <div class="business-model-dialog-head">
      <h3>📦 业务组件</h3>
      <div class="business-model-dialog-actions">
        ${groupedConstructs.length ? `<span class="dialog-progress" title="${groupedConstructs.length} 个构件 · ${allConstructs.filter(c => isBusinessConstructAssignedToCapability(c, capability)).length} 个任务定义">构件 ${groupedConstructs.length}</span>` : ''}
        <button class="btn btn-danger btn-sm" type="button" data-testid="capability-delete-button"
          onclick="removeBusinessComponent('${esc(jsString(capId))}').then((deleted)=>{if(deleted)closeBusinessModelDialog()})">删除</button>
        <button class="drawer-close" type="button" data-testid="business-model-dialog-close" onclick="closeBusinessModelDialog()">✕</button>
      </div>
    </div>
    ${renderProgressBar([
      {label:'构件', value:groupedConstructs.length, max:Math.max(groupedConstructs.length,1), color:'#3b82f6'},
    ])}
    <div class="business-model-dialog-body">
      <div class="form-grid">
        <div class="field-group">
          <label>组件名称</label>
          <input data-testid="capability-name-input" type="text" value="${esc(capability.name || '')}"
            oninput="setBusinessComponent('${esc(jsString(capId))}','name',this.value)">
        </div>
        <div class="field-group">
          <label>组件类型</label>
          <select data-testid="capability-kind-select" onchange="setBusinessComponent('${esc(jsString(capId))}','kind',this.value);rerenderDomainTabPreserveScroll()">
            <option value="core" ${capability.kind === 'core' ? 'selected' : ''}>核心组件</option>
            <option value="generic" ${capability.kind !== 'core' ? 'selected' : ''}>通用组件</option>
          </select>
        </div>
        <div class="field-group field-group-wide">
          <label>说明</label>
          <input data-testid="capability-note-input" type="text" value="${esc(capability.note || '')}"
            oninput="setBusinessComponent('${esc(jsString(capId))}','note',this.value)">
        </div>
      </div>
      <div class="business-model-dialog-section">
        <div class="business-model-section-head">
          <h4>组件内构件</h4>
          <button class="btn btn-outline btn-sm" type="button" data-testid="construct-add-button" onclick="openBusinessConstructDraft('${esc(jsString(capId))}')">＋ 构件</button>
        </div>
        ${renderMoveList(groupedConstructs, {
          emptyText: '暂无构件',
          testId: 'construct-open-button',
          actionLabel: '查看/编辑',
          secondaryTestId: 'construct-detach-button',
          secondaryActionLabel: '移出',
          label: (construct) => construct.name || construct.uid,
          onclick: (construct) => `openBusinessModelDialog('construct','${esc(jsString(capId))}','${esc(jsString(construct.uid || construct.id))}')`,
          secondaryOnclick: (construct) => `setBusinessConstruct('${esc(jsString(construct.uid || construct.id))}','businessComponentId','');rerenderDomainTabPreserveScroll()`,
        })}
      </div>
      <div class="business-model-dialog-section">
        <div class="business-model-section-head"><h4>未分组构件</h4><span>可加入当前组件</span></div>
        ${renderMoveList(ungroupedConstructs, {
          emptyText: '暂无未分组构件',
          testId: 'construct-attach-button',
          actionLabel: '加入',
          label: (construct) => construct.name || construct.uid,
          onclick: (construct) => `setBusinessConstruct('${esc(jsString(construct.uid || construct.id))}','businessComponentId','${esc(jsString(capId))}');rerenderDomainTabPreserveScroll()`,
        })}
      </div>
    </div>
  </div>`;
}

function renderCapabilityDraftDialog(draft = {}) {
  const name = String(draft.name || '');
  return `<div class="business-model-dialog-panel" data-testid="business-model-dialog">
    <div class="business-model-dialog-head">
      <h3>新建业务组件</h3>
      <div class="business-model-dialog-actions">
        <button class="btn btn-outline btn-sm" type="button" data-testid="business-model-dialog-cancel" onclick="closeBusinessModelDialog()">取消</button>
        <button class="btn btn-primary btn-sm" type="button" data-testid="business-model-draft-save" onclick="saveBusinessComponentDraft()">保存</button>
        <button class="drawer-close" type="button" data-testid="business-model-dialog-close" onclick="closeBusinessModelDialog()">×</button>
      </div>
    </div>
    <div class="business-model-dialog-body">
      <div class="form-grid">
        <div class="field-group">
          <label>组件名称</label>
          <input data-testid="capability-name-input" type="text" value="${esc(name)}" placeholder="请输入业务组件名称"
            oninput="setBusinessModelDraft('name',this.value)">
        </div>
        <div class="field-group">
          <label>组件类型</label>
          <select data-testid="capability-kind-select" onchange="setBusinessModelDraft('kind',this.value)">
            <option value="core" ${draft.kind !== 'generic' ? 'selected' : ''}>核心组件</option>
            <option value="generic" ${draft.kind === 'generic' ? 'selected' : ''}>通用组件</option>
          </select>
        </div>
        <div class="field-group field-group-wide">
          <label>说明</label>
          <input data-testid="capability-note-input" type="text" value="${esc(draft.note || '')}"
            oninput="setBusinessModelDraft('note',this.value)">
        </div>
      </div>
    </div>
  </div>`;
}

function renderConstructDialog(construct) {
  const constructId = String(construct.uid || construct.id || '');
  const dialog = S.ui.businessModelDialog || {};
  const capabilities = getCapabilityItems(S.doc);
  const parentCapabilityId = String(construct.businessComponentUid || dialog.capabilityId || '').trim();
  const backButton = parentCapabilityId
    ? `<button class="btn btn-outline btn-sm business-model-back-btn" type="button" data-testid="business-model-dialog-back" onclick="openBusinessModelDialog('capability','${esc(jsString(parentCapabilityId))}')">返回</button>`
    : '';
  const afterDelete = parentCapabilityId
    ? `openBusinessModelDialog('capability','${esc(jsString(parentCapabilityId))}')`
    : 'closeBusinessModelDialog()';
  const assignedEntities = (S.doc.entities || []).filter((entity) => isEntityAssignedToConstruct(entity, construct));
  const unassignedEntities = (S.doc.entities || []).filter((entity) => !isEntityAssignedToAnyConstruct(entity, S.doc));
  const taskItems = getTaskDefinitionItems(S.doc);
  const assignedTasks = taskItems.filter((task) => isTaskDefinitionAssignedToConstruct(task, construct));
  const unassignedTasks = taskItems.filter((task) => !isTaskDefinitionAssignedToAnyConstruct(task, S.doc));
  const capabilityOptions = capabilities.map((capability) => {
    const id = String(capability.id || capability.name || '');
    return `<option value="${esc(id)}" ${id === construct.businessComponentUid ? 'selected' : ''}>${esc(capability.name || id)}</option>`;
  }).join('');
  return `<div class="business-model-dialog-panel" data-testid="business-model-dialog">
    <div class="business-model-dialog-head">
      <h3>🧩 业务构件</h3>
      <div class="business-model-dialog-actions">
        <span class="dialog-progress" title="已关联 ${assignedEntities.length} 个实体 · ${assignedTasks.length} 个任务">实体 ${assignedEntities.length} · 任务 ${assignedTasks.length}</span>
        ${backButton}
        <button class="btn btn-danger btn-sm" type="button" data-testid="construct-delete-button"
          onclick="removeBusinessConstruct('${esc(jsString(constructId))}').then((deleted)=>{if(deleted)${afterDelete}})">删除</button>
        <button class="drawer-close" type="button" data-testid="business-model-dialog-close" onclick="closeBusinessModelDialog()">✕</button>
      </div>
    </div>
    ${renderProgressBar([
      {label:'实体', value:assignedEntities.length, max:Math.max((S.doc.entities||[]).length,1), color:'#10b981'},
      {label:'任务', value:assignedTasks.length, max:Math.max((getTaskDefinitionItems(S.doc)||[]).length,1), color:'#f59e0b'},
    ])}
    <div class="business-model-dialog-body">
      <div class="form-grid">
        <div class="field-group">
          <label>构件名称</label>
          <input data-testid="construct-name-input" type="text" value="${esc(construct.name || '')}"
            oninput="setBusinessConstruct('${esc(jsString(constructId))}','name',this.value)">
        </div>
        <div class="field-group">
          <label>所属组件</label>
          <select data-testid="construct-capability-select" onchange="setBusinessConstruct('${esc(jsString(constructId))}','businessComponentId',this.value);rerenderDomainTabPreserveScroll()">
            <option value="">未分组</option>${capabilityOptions}
          </select>
        </div>
        <div class="field-group field-group-wide">
          <label>说明</label>
          <input data-testid="construct-note-input" type="text" value="${esc(construct.note || '')}"
            oninput="setBusinessConstruct('${esc(jsString(constructId))}','note',this.value)">
        </div>
      </div>
      <div class="business-model-dialog-grid">
        <div class="business-model-dialog-section">
          <div class="business-model-section-head">
            <h4>实体</h4>
            <button class="btn btn-outline btn-sm" type="button" data-testid="entity-definition-add-button" onclick="addEntityDefinitionAndOpen('${esc(jsString(constructId))}')">＋ 实体</button>
          </div>
          <p class="business-model-section-hint">移出后进入未分组</p>
          ${renderMoveList(assignedEntities, {
            emptyText: '暂无实体',
            testId: 'construct-entity-edit',
            actionLabel: '查看/编辑',
            secondaryTestId: 'construct-entity-remove',
            secondaryActionLabel: '移出',
            label: (entity) => entity.name || entity.id,
            onclick: (entity) => `openEntityDefinitionEditor('${esc(jsString(entity.id))}')`,
            secondaryOnclick: (entity) => `removeEntityFromConstruct('${esc(jsString(constructId))}','${esc(jsString(entity.id))}')`,
          })}
          ${renderMoveList(unassignedEntities, {
            emptyText: '暂无未分组实体',
            testId: 'construct-entity-edit',
            actionLabel: '查看/编辑',
            secondaryTestId: 'construct-entity-add',
            secondaryActionLabel: '移入组件',
            label: (entity) => entity.name || entity.id,
            onclick: (entity) => `openEntityDefinitionEditor('${esc(jsString(entity.id))}')`,
            secondaryOnclick: (entity) => `addEntityToConstruct('${esc(jsString(constructId))}','${esc(jsString(entity.id))}')`,
          })}
        </div>
        <div class="business-model-dialog-section">
          <div class="business-model-section-head">
            <h4>任务</h4>
            <button class="btn btn-outline btn-sm" type="button" data-testid="task-definition-add-button" onclick="addTaskDefinitionAndOpen('${esc(jsString(construct.businessComponentUid || ''))}','${esc(jsString(constructId))}')">＋ 任务</button>
          </div>
          ${renderMoveList(assignedTasks, {
            emptyText: '暂无任务定义',
            testId: 'construct-task-edit',
            actionLabel: '查看/编辑',
            secondaryTestId: 'construct-task-remove',
            secondaryActionLabel: '移出',
            label: (task) => task.name || task.id,
            onclick: (task) => `openTaskDefinitionEditor('${esc(jsString(task.id))}','${esc(jsString(construct.businessComponentUid || ''))}','${esc(jsString(constructId))}')`,
            secondaryOnclick: (task) => `removeTaskDefinitionFromConstruct('${esc(jsString(constructId))}','${esc(jsString(task.id))}')`,
          })}
          ${renderMoveList(unassignedTasks, {
            emptyText: '暂无未分组任务',
            testId: 'construct-task-edit',
            actionLabel: '查看/编辑',
            secondaryTestId: 'construct-task-add',
            secondaryActionLabel: '移入组件',
            label: (task) => task.name || task.id,
            onclick: (task) => `openTaskDefinitionEditor('${esc(jsString(task.id))}','${esc(jsString(construct.businessComponentUid || ''))}','${esc(jsString(constructId))}')`,
            secondaryOnclick: (task) => `addTaskDefinitionToConstruct('${esc(jsString(constructId))}','${esc(jsString(task.id))}')`,
          })}
        </div>
      </div>
    </div>
  </div>`;
}

function renderConstructDraftDialog(draft = {}) {
  const capabilities = getCapabilityItems(S.doc);
  const activeCapabilityId = String(draft.businessComponentId || '').trim();
  const capabilityOptions = capabilities.map((capability) => {
    const id = String(capability.id || capability.name || '');
    return `<option value="${esc(id)}" ${id === activeCapabilityId ? 'selected' : ''}>${esc(capability.name || id)}</option>`;
  }).join('');
  return `<div class="business-model-dialog-panel" data-testid="business-model-dialog">
    <div class="business-model-dialog-head">
      <h3>新建业务构件</h3>
      <div class="business-model-dialog-actions">
        <button class="btn btn-outline btn-sm" type="button" data-testid="business-model-dialog-cancel" onclick="closeBusinessModelDialog()">取消</button>
        <button class="btn btn-primary btn-sm" type="button" data-testid="business-model-draft-save" onclick="saveBusinessConstructDraft()">保存</button>
        <button class="drawer-close" type="button" data-testid="business-model-dialog-close" onclick="closeBusinessModelDialog()">×</button>
      </div>
    </div>
    <div class="business-model-dialog-body">
      <div class="form-grid">
        <div class="field-group">
          <label>构件名称</label>
          <input data-testid="construct-name-input" type="text" value="${esc(draft.name || '')}" placeholder="请输入业务构件名称"
            oninput="setBusinessModelDraft('name',this.value)">
        </div>
        <div class="field-group">
          <label>所属组件</label>
          <select data-testid="construct-capability-select" onchange="setBusinessModelDraft('businessComponentId',this.value)">
            <option value="">未分组</option>${capabilityOptions}
          </select>
        </div>
        <div class="field-group field-group-wide">
          <label>说明</label>
          <input data-testid="construct-note-input" type="text" value="${esc(draft.note || '')}"
            oninput="setBusinessModelDraft('note',this.value)">
        </div>
      </div>
    </div>
  </div>`;
}

function renderTaskDefinitionDialog(task) {
  const taskId = String(task.id || task.name || '');
  const isNew = Boolean(task._isNew);
  const dialog = S.ui.businessModelDialog || {};
  const constructs = getBusinessConstructItems(S.doc);
  const returnToManager = dialog.returnMode === 'tasks';
  const parentConstructId = returnToManager ? '' : String(task.constructUid || dialog.constructId || '').trim();
  const parentConstruct = parentConstructId ? findBusinessConstructRef(parentConstructId) : null;
  const parentCapabilityId = String(
    parentConstruct?.businessComponentUid || task.businessComponentUid || dialog.capabilityId || ''
  ).trim();
  const backButton = returnToManager
    ? `<button class="btn btn-outline btn-sm business-model-back-btn" type="button" data-testid="business-model-dialog-back" onclick="openTaskDefinitionManager()">返回</button>`
    : parentConstructId
    ? `<button class="btn btn-outline btn-sm business-model-back-btn" type="button" data-testid="business-model-dialog-back" onclick="openBusinessModelDialog('construct','${esc(jsString(parentCapabilityId))}','${esc(jsString(parentConstructId))}')">返回</button>`
    : (parentCapabilityId
      ? `<button class="btn btn-outline btn-sm business-model-back-btn" type="button" data-testid="business-model-dialog-back" onclick="openBusinessModelDialog('capability','${esc(jsString(parentCapabilityId))}')">返回</button>`
      : '');
  const afterDelete = isNew ? 'closeBusinessModelDialog()'
    : returnToManager ? 'openTaskDefinitionManager()'
    : parentConstructId
    ? `openBusinessModelDialog('construct','${esc(jsString(parentCapabilityId))}','${esc(jsString(parentConstructId))}')`
    : (parentCapabilityId
      ? `openBusinessModelDialog('capability','${esc(jsString(parentCapabilityId))}')`
      : 'closeBusinessModelDialog()');
  const typeValue = task.type || 'Service';
  const parameterSummary = getTaskDefinitionParameterSummary(task);
  const capabilities = getCapabilityItems(S.doc);
  const activeCapabilityId = String(parentCapabilityId || task.businessComponentUid || '').trim();
  const activeCapability = capabilities.find((capability) => String(capability.id || capability.name || '') === activeCapabilityId);
  const activeCapabilityName = String(activeCapability?.name || '').trim();
  const capabilityOptions = `<option value="">请选择业务组件</option>${capabilities.map((capability) => {
    const id = String(capability.id || capability.name || '');
    return `<option value="${esc(id)}" ${id === activeCapabilityId ? 'selected' : ''}>${esc(capability.name || id)}</option>`;
  }).join('')}`;
  const constructOptions = `<option value="">请选择业务构件</option>${constructs.filter((construct) => {
    const constructCapabilityId = String(construct.businessComponentUid || construct.capabilityUnitId || '').trim();
    const constructCapabilityName = String(construct.businessComponent || construct.capabilityUnit || '').trim();
    return !activeCapabilityId
      || constructCapabilityId === activeCapabilityId
      || (activeCapabilityName && constructCapabilityName === activeCapabilityName)
      || constructCapabilityName === activeCapabilityId;
  }).map((construct) => {
    const id = String(construct.uid || construct.name || '');
    const constructCapabilityId = String(construct.businessComponentUid || construct.capabilityUnitId || '').trim();
    const constructCapabilityName = String(construct.businessComponent || construct.capabilityUnit || '').trim();
    const capability = capabilities.find((item) => item.id === constructCapabilityId || item.name === constructCapabilityName);
    const prefix = capability ? `${capability.name} / ` : '';
    return `<option value="${esc(id)}" ${id === task.constructUid ? 'selected' : ''}>${esc(prefix + (construct.name || id))}</option>`;
  }).join('')}`;
  const processNodeActions = dialog.returnMode === 'processNode'
    ? `<div class="task-definition-node-actions">
        <button class="btn btn-primary btn-sm" type="button" data-testid="task-definition-save-join-node"
          onclick="saveTaskDefinitionFromNode('${esc(jsString(taskId))}',true)">保存并加入当前节点</button>
        <button class="btn btn-outline btn-sm" type="button" data-testid="task-definition-save-only"
          onclick="saveTaskDefinitionFromNode('${esc(jsString(taskId))}',false)">仅保存任务定义</button>
      </div>`
    : '';
  return `<div class="business-model-dialog-panel task-definition-dialog" data-testid="business-model-dialog">
    <div class="business-model-dialog-head">
      <h3>${isNew ? '＋ 新建任务定义' : '⚙️ 任务定义'}</h3>
      <div class="business-model-dialog-actions">
        ${isNew
          ? `<button class="btn btn-outline btn-sm" type="button" data-testid="business-model-dialog-cancel" onclick="cancelNewTaskDefinition('${esc(jsString(taskId))}')">取消</button>
             <button class="btn btn-primary btn-sm" type="button" data-testid="business-model-draft-save" onclick="confirmNewTaskDefinition('${esc(jsString(taskId))}')">创建</button>`
          : `<span class="dialog-progress" title="入参${parameterSummary.inputCount} / 出参${parameterSummary.outputCount}">参数 ${parameterSummary.inputCount}+${parameterSummary.outputCount}</span>
             ${backButton}
             <button class="btn btn-danger btn-sm" type="button" data-testid="task-definition-delete-button"
               onclick="removeTaskDefinition('${esc(jsString(taskId))}').then((deleted)=>{if(deleted)${afterDelete}})">删除</button>
             <button class="drawer-close" type="button" data-testid="business-model-dialog-close" onclick="closeBusinessModelDialog()">✕</button>`
        }
      </div>
    </div>
    ${renderProgressBar([
      {label:'入参', value:parameterSummary.inputCount, max:Math.max(parameterSummary.inputCount+parameterSummary.outputCount,1), color:'#8b5cf6'},
      {label:'出参', value:parameterSummary.outputCount, max:Math.max(parameterSummary.inputCount+parameterSummary.outputCount,1), color:'#ec4899'},
    ])}
    <div class="business-model-dialog-body">
      <div class="form-grid">
        <div class="field-group">
          <label>任务名称</label>
          <input data-testid="task-definition-name-input" type="text" value="${esc(task.name || '')}"
            oninput="setTaskDefinition('${esc(jsString(taskId))}','name',this.value)">
        </div>
        <div class="field-group">
          <label>任务类型</label>
          <select data-testid="task-definition-type-select"
            onchange="setTaskDefinition('${esc(jsString(taskId))}','type',this.value);rerenderBusinessModelDialogContext()">
            ${ORCHESTRATION_TYPES.map((option) => `<option value="${option.value}" ${typeValue === option.value ? 'selected' : ''}>${option.label}</option>`).join('')}
          </select>
        </div>
        <div class="field-group">
          <label>&#25152;&#23646;&#19994;&#21153;&#32452;&#20214;</label>
          <select data-testid="task-definition-capability-select"
            onchange="setTaskDefinition('${esc(jsString(taskId))}','businessComponentId',this.value);rerenderBusinessModelDialogContext()">
            ${capabilityOptions}
          </select>
        </div>
        <div class="field-group">
          <label>&#25152;&#23646;&#19994;&#21153;&#26500;&#20214;</label>
          <select data-testid="task-definition-construct-select"
            onchange="setTaskDefinition('${esc(jsString(taskId))}','constructId',this.value);rerenderBusinessModelDialogContext()">
            ${constructOptions}
          </select>
        </div>
        ${typeValue === 'Query' ? `<div class="field-group">
          <label>查询来源</label>
          <select data-testid="task-definition-query-source-select"
            onchange="setTaskDefinition('${esc(jsString(taskId))}','querySourceKind',this.value)">
            ${QUERY_SOURCE_KINDS.map((option) => `<option value="${option.value}" ${task.querySourceKind === option.value ? 'selected' : ''}>${option.label}</option>`).join('')}
          </select>
        </div>` : ''}
        <div class="field-group field-group-wide task-definition-param-summary">
          <label>任务调用契约</label>
          <div class="task-definition-param-bar">
            <span>${parameterSummary.address ? `地址：${esc(parameterSummary.address)}` : '未填写任务地址'} · 入参 ${parameterSummary.inputCount} · 出参 ${parameterSummary.outputCount}</span>
            <button class="btn btn-outline btn-sm" type="button" data-testid="task-parameter-open-button"
              onclick="openTaskParameterDialog('${esc(jsString(taskId))}')">查看/编辑参数</button>
          </div>
        </div>
        <div class="field-group field-group-wide task-definition-tech-group">
          <label>技术承接</label>
          <input data-testid="task-definition-target-input" type="text" value="${esc(task.target || '')}" placeholder="目标服务 / 字典 / 枚举"
            oninput="setTaskDefinition('${esc(jsString(taskId))}','target',this.value)">
        </div>
        <div class="field-group field-group-wide task-detail-field">
          <span class="task-detail-label-row"><label>详细设计</label>${renderRichTextToolbar('task-definition-note')}<span class="task-detail-shortcuts">Ctrl+B 加粗 · Ctrl+0 无序 · Ctrl+1 有序 · Ctrl+2 有序2级 · Tab 右移 · Shift+Tab 左移</span></span>
          ${(() => {
            const safeHtml = renderRichTextValue(task.note || '');
            const sync = `syncRichTextEditor(this);setTaskDefinition('${esc(jsString(taskId))}','note',this.nextElementSibling.value)`;
            return `<div class="rich-text-field task-detail-editor-box">
              <div class="task-definition-note-editor rich-text-editor" data-testid="task-definition-note-editor" contenteditable="true" role="textbox" aria-multiline="true"
                data-placeholder="参考业务规则" onfocus="moveCursorToEndOfContent(this)" oninput="${sync}" onpaste="handleRichTextPaste(event,this)" onkeydown="handleRichTextKeydown(event,this)">${safeHtml}</div>
              <textarea class="rich-text-storage" data-testid="task-definition-note-storage" aria-hidden="true" tabindex="-1">${esc(sanitizeRichTextHtml(safeHtml))}</textarea>
            </div>`;
          })()}
        </div>
      ${processNodeActions}
      </div>
    </div>
  </div>`;
}

function renderTaskDefinitionManagerDialog() {
  const tasks = getTaskDefinitionItems(S.doc);
  const constructs = getBusinessConstructItems(S.doc);
  const capabilities = getCapabilityItems(S.doc);
  const refValue = (item, ...keys) => {
    for (const key of keys) {
      const value = String(item?.[key] || '').trim();
      if (value) return value;
    }
    return '';
  };
  const constructById = new Map();
  constructs.forEach((construct) => {
    [construct.id, construct.uid].forEach((value) => {
      const key = String(value || '').trim();
      if (key) constructById.set(key, construct);
    });
  });
  const capabilityById = new Map();
  capabilities.forEach((capability) => {
    [capability.id, capability.uid].forEach((value) => {
      const key = String(value || '').trim();
      if (key) capabilityById.set(key, capability);
    });
  });
  const capabilityByName = new Map(capabilities.map((capability) => [String(capability.name || ''), capability]));
  const findTaskConstruct = (task) => constructById.get(refValue(task, 'constructUid', 'constructId', 'businessConstructUid', 'businessConstructId'))
    || (() => {
      const name = String(task.constructName || task.businessConstruct || '').trim();
      if (!name) return null;
      const capability = findTaskCapability(task, null);
      const capabilityId = capability?.id || '';
      return constructs.find((construct) =>
        String(construct.name || '') === name
        && (!capabilityId || String(construct.businessComponentUid || '') === capabilityId || String(construct.businessComponent || '') === String(capability?.name || ''))
      ) || null;
    })()
    || null;
  const findTaskCapability = (task, construct = null) => {
    const id = refValue(construct, 'businessComponentUid', 'businessComponentId')
      || refValue(task, 'businessComponentUid', 'businessComponentId', 'capabilityUnitId', 'capabilityId');
    const name = String(construct?.businessComponent || task.businessComponent || task.capabilityUnit || task.capabilityName || '').trim();
    return capabilityById.get(id) || (name ? capabilityByName.get(name) : null) || null;
  };
  const groups = new Map();
  const unreferencedCount = tasks.filter((task) => getTaskDefinitionUsageCount(task) === 0).length;
  const blankUnreferencedCount = tasks.filter((task) => getTaskDefinitionUsageCount(task) === 0 && isBlankTaskDefinition(task)).length;
  const getGroup = (key, title, subtitle) => {
    if (!groups.has(key)) groups.set(key, { key, title, subtitle, tasks: [] });
    return groups.get(key);
  };
  tasks.forEach((task) => {
    const construct = findTaskConstruct(task);
    const capability = findTaskCapability(task, construct);
    const key = construct ? `construct:${construct.uid}` : (capability ? `capability:${capability.id}` : '__ungrouped__');
    const title = construct ? construct.name : (capability ? capability.name : '未归属任务定义');
    const subtitle = construct
      ? `${capability?.name || '未归属组件'} / ${construct.name}`
      : (capability ? `${capability.name} / 未归属构件` : '尚未归属业务构件');
    getGroup(key, title || '未命名分组', subtitle).tasks.push(task);
  });
  const sortedGroups = Array.from(groups.values()).sort((left, right) => {
    if (left.key === '__ungrouped__') return 1;
    if (right.key === '__ungrouped__') return -1;
    return left.title.localeCompare(right.title, 'zh-CN');
  });
  const renderTaskRow = (task) => {
    const usageCount = getTaskDefinitionUsageCount(task);
    const taskId = String(task.id || task.name || '');
    const construct = findTaskConstruct(task);
    const capability = findTaskCapability(task, construct);
    return `<div class="business-model-move-row task-definition-manager-row" data-testid="task-definition-manager-row">
      <span class="task-definition-manager-main">
        <strong>${esc(task.name || task.id || '未命名任务定义')}</strong>
        <small>${usageCount ? `引用 ${usageCount}` : '未引用'}</small>
      </span>
      <span class="business-model-move-actions">
        <button class="stage-quick-btn stage-quick-btn-text" type="button" data-testid="task-definition-manager-edit"
          onclick="openTaskDefinitionEditor('${esc(jsString(taskId))}','${esc(jsString(capability?.id || capability?.uid || task.businessComponentUid || task.businessComponentUid || task.capabilityUnitId || ''))}','${esc(jsString(construct?.id || construct?.uid || task.constructUid || task.constructUid || task.businessConstructUid || task.businessConstructUid || ''))}','tasks')">查看/编辑</button>
        <button class="stage-quick-btn stage-quick-btn-text danger" type="button" data-testid="task-definition-manager-delete"
          onclick="removeTaskDefinition('${esc(jsString(taskId))}').then((deleted)=>{if(deleted)openTaskDefinitionManager()})">删除</button>
      </span>
    </div>`;
  };
  return `<div class="business-model-dialog-panel task-definition-manager-dialog" data-testid="business-model-dialog">
    <div class="business-model-dialog-head">
      <h3>任务定义管理</h3>
      <div class="business-model-dialog-actions">
        <button class="btn btn-outline btn-sm" type="button" data-testid="task-definition-clean-blank"
          onclick="cleanupUnreferencedTaskDefinitions(true)">删除未被使用的任务 ${blankUnreferencedCount}</button>
        <button class="drawer-close" type="button" data-testid="business-model-dialog-close" onclick="closeBusinessModelDialog()">×</button>
      </div>
    </div>
    <div class="business-model-dialog-body">
      <p class="business-model-manager-hint">此页面仅维护"任务"，而"组件"、"构件"、"实体"等信息，请在"业务域"统一维护。</p>
      ${sortedGroups.length ? sortedGroups.map((group) => `
        <div class="business-model-dialog-section task-definition-manager-group" data-testid="task-definition-manager-group">
          <div class="business-model-section-head">
            <h4>${esc(group.title)}</h4>
            <span>${esc(group.subtitle)} · ${group.tasks.length} 项</span>
          </div>
          <div class="business-model-move-list">
            ${group.tasks
              .sort((left, right) => String(left.name || left.id || '').localeCompare(String(right.name || right.id || ''), 'zh-CN'))
              .map(renderTaskRow).join('')}
          </div>
        </div>`).join('') : '<p class="no-refs">暂无任务定义。</p>'}
    </div>
  </div>`;
}

function renderBusinessModelDialog() {
  const dialog = S.ui.businessModelDialog || {};
  if (!dialog.mode) return '';
  const capability = findExplicitBusinessComponent(dialog.capabilityId);
  const construct = findBusinessConstructRef(dialog.constructId);
  const task = findTaskDefinitionRef(dialog.taskDefinitionId);
  const panel = dialog.mode === 'capabilityDraft'
    ? renderCapabilityDraftDialog(dialog.draft || {})
    : dialog.mode === 'constructDraft'
    ? renderConstructDraftDialog(dialog.draft || {})
    : dialog.mode === 'tasks'
    ? renderTaskDefinitionManagerDialog()
    : (dialog.mode === 'task' && task
    ? renderTaskDefinitionDialog(task)
    : (dialog.mode === 'construct' && construct
      ? renderConstructDialog(construct)
      : (capability ? renderCapabilityDialog(capability) : '')));
  if (!panel) return '';
  return `<div class="business-model-dialog-backdrop" data-testid="business-model-dialog-backdrop">
    ${panel}
  </div>`;
}

function renderRoleSummaryCard(roles = getRoles(), selectedDomainId = 'all') {
  const roleGroups = getGroupedRolesForDomainInfo(roles);
  const summary = getRoleSummaryCountsForDomainInfo(roles, selectedDomainId);
  const selectedRole = getRoleById(S.ui.roleId);
  const preferredRoleGroup = selectedRole ? getRoleGroupName(selectedRole) : getDefaultRoleGroup();
  const availableRoleGroups = getAvailableRoleGroups();
  const summaryText = [
    `角色 ${summary.roleCount}`,
    `使用中 ${summary.usedCount}`,
    `未使用 ${summary.unusedCount}`,
  ];

  const groupOptions = availableRoleGroups
    .map((groupName) => `<option value="${esc(groupName)}" ${groupName === preferredRoleGroup ? 'selected' : ''}>${esc(groupName)}</option>`)
    .join('');

  const actions = `
    <div class="role-create-inline">
      <input id="role-create-input" class="role-light-input" type="text" placeholder="角色名称" onkeydown="if(event.key==='Enter')addRole()">
      <select id="role-create-group-select" class="role-light-group-select" onchange="onRoleGroupSelectChange(this.value)">
        ${groupOptions}
        <option value="__custom__">新建分组...</option>
      </select>
      <span id="role-create-group-custom-wrap" class="role-light-group-custom hidden">
        <input id="role-create-group-custom" class="role-light-group-input" type="text" placeholder="输入新分组" onkeydown="if(event.key==='Enter')addRole()">
      </span>
      <button class="btn btn-outline btn-sm" data-testid="role-add-button" onclick="addRole()">添加角色</button>
      <button class="btn btn-outline btn-sm" data-testid="role-view-entry" onclick="openRoleView('${esc(ensureSelectedRole() || '')}')">角色视图</button>
    </div>
  `;

  let h = `<div class="ctx-card domain-panel role-light-card" data-testid="role-summary-card">
    ${renderDomainPanelHeader('角色管理', '', actions, { badge: summaryText.join(' · ') })}`;

  if (roleGroups.length) {
    h += '<div class="role-light-groups">';
    roleGroups.forEach(({ name, roles }) => {
      const collapseKey = `rolegrp-${name}`;
      const collapsed = S.ui.sbCollapse[collapseKey] === true;
      h += `<div class="role-light-group" data-role-group="${esc(name)}">
        <button type="button" class="role-light-group-head" onclick="toggleDomainSection('${esc(collapseKey)}')">
          <span class="role-light-group-title">
            <span class="role-light-group-caret">${collapsed ? '▸' : '▾'}</span>
            <span>${esc(name)}</span>
          </span>
          <span class="role-light-group-meta">${roles.length} 角色</span>
        </button>`;
      if (!collapsed) {
        h += '<div class="role-light-list">';
        roles.forEach((role) => {
          const usage = getRoleUsageSummaryForDomainInfo(role.id, selectedDomainId);
          const removable = getRoleUsageSummary(role.id).taskCount === 0;
          h += `<div class="role-light-chip-wrap">
            <button class="role-light-chip" data-role-id="${esc(role.id)}" data-testid="role-summary-chip" title="${esc(`${role.name}\n分组：${getRoleGroupName(role)}`)}" onclick="openRoleView('${esc(role.id)}')">
              <span class="role-light-name">${esc(role.name)}</span>
              <span class="role-light-count">${getLightRoleSummary(role, selectedDomainId)}</span>
            </button>
            ${removable ? `<button class="role-light-remove" title="删除未使用角色" onclick="removeRole('${esc(role.id)}')">×</button>` : ''}
          </div>`;
        });
        h += '</div>';
      }
      h += '</div>';
    });
    h += '</div>';
  } else {
    h += '<p class="no-refs domain-panel-empty">暂无角色，先在流程任务里明确执行角色，再回到这里统一整理。</p>';
  }

  h += '</div>';
  return h;
}

function switchDomainTab(tabId) {
  if (window.PanoramaWorkbench) return window.PanoramaWorkbench.switchTab(tabId);
  S.ui.domainTab = tabId;
  renderBusinessArchitectureTab();
}

function renderBusinessArchitectureTab(options = {}) {
  if (window.PanoramaWorkbench) return window.PanoramaWorkbench.render(options);
  ensureProcPos(S.doc);
  const domainInfoContext = getSelectedDomainInfoContext();
  const selectedDomainId = domainInfoContext.id;
  const activeDomainTab = S.ui.domainTab || 'panorama';

  // ── 子 tab 导航 ──
  const subTabs = [
    { id: 'panorama', label: '全景视图' },
    { id: 'roles', label: '角色管理' },
    { id: 'language', label: '统一语言' },
    { id: 'rules', label: '规则条目' },
  ];
  const subTabBar = `<div class="view-toggle-group" style="margin-bottom:16px" data-testid="domain-subtab-bar">
    ${subTabs.map((t) => `<button class="vtb ${activeDomainTab === t.id ? 'active' : ''}"
      data-testid="domain-subtab-${t.id}" onclick="switchDomainTab('${t.id}')">${t.label}</button>`).join('')}
  </div>`;

  // ── 全景视图 ──
  const panoramaContent = `
    <div class="ctx-card domain-panel domain-info-card">
      <div class="domain-panel-body domain-info-card-body">
        ${renderPanoramaValueMatrix(selectedDomainId)}
      </div>
    </div>
  `;

  // ── 角色管理 ──
  const rolesContent = renderRoleSummaryCard(getRolesForDomainInfo(selectedDomainId), selectedDomainId);

  // ── 统一语言（术语 + 字典占位） ──
  const languageEntries = getLanguageEntriesForDomainInfo(selectedDomainId);
  const langCollapsed = S.ui.sbCollapse.lang === true;
  const languageBody = (() => {
    if (langCollapsed) return '';
    let body = `<div class="domain-language-toolbar"><span class="domain-language-hint">建议只保留高频且容易混用的术语，不用追求把所有名词都填满。</span><button class="btn btn-outline btn-sm" onclick="addTerm()">添加术语</button></div>`;
    if (languageEntries.length) {
      body += `<table class="term-table"><thead><tr><th>术语</th><th>定义</th><th></th></tr></thead><tbody>`;
      languageEntries.forEach(({ term, index }) => {
        body += `<tr data-testid="term-row"><td><input type="text" data-testid="term-input" value="${esc(term.term || '')}" oninput="setTerm(${index},'term',this.value)" placeholder="术语"></td><td><input type="text" data-testid="term-definition-input" value="${esc(term.definition || '')}" oninput="setTerm(${index},'definition',this.value)" placeholder="定义"></td><td><div class="term-quick-actions"><button class="stage-quick-btn" type="button" title="在下方新增术语" onclick="addTermAfter(${index})">+</button><button class="stage-quick-btn" type="button" title="上移" onclick="moveTerm(${index},-1)" ${index === 0 ? 'disabled' : ''}>↑</button><button class="stage-quick-btn" type="button" title="下移" onclick="moveTerm(${index},1)" ${index === (S.doc.language || []).length - 1 ? 'disabled' : ''}>↓</button><button class="stage-quick-btn danger" type="button" title="删除术语" onclick="removeTerm(${index})">✕</button></div></td></tr>`;
      });
      body += '</tbody></table>';
    } else { body += '<p class="no-refs domain-panel-empty">暂无术语定义。</p>'; }
    return body;
  })();
  const languageContent = `
    <div class="ctx-card domain-panel domain-language-card" data-testid="language-card">
      ${renderDomainPanelHeader('术语表', languageEntries.length ? `${languageEntries.length} 条术语` : '统一命名和口径', `<span class="domain-panel-toggle">${langCollapsed ? '展开' : '折叠'}</span>`, {button:true, onclick:"toggleDomainSection('lang')", dataTestId:'language-toggle', dataPanel:'language', ariaExpanded:!langCollapsed})}
      ${languageBody ? `<div class="domain-panel-body domain-language-body">${languageBody}</div>` : ''}
    </div>
    <div class="ctx-card domain-panel">
      ${renderDomainPanelHeader('字典管理', '字典管理功能正在开发中...')}
      <div class="domain-panel-body"><p class="no-refs domain-panel-empty">字典管理功能即将上线。</p></div>
    </div>
  `;

  // ── 规则条目（全量汇总） ──
  const allRules = [];
  (S.doc.processes || []).forEach((proc) => {
    (proc.nodes || []).forEach((node) => {
      (node.businessRules || []).forEach((rule) => {
        allRules.push({ procName: proc.name || '?', nodeName: node.name || '?', rule });
      });
    });
  });
  const rulesContent = `
    <div class="ctx-card domain-panel">
      ${renderDomainPanelHeader('规则条目', allRules.length ? `全量汇总 ${allRules.length} 条业务规则` : '暂无业务规则')}
      <div class="domain-panel-body">
        ${allRules.length ? `<table class="term-table"><thead><tr><th>流程</th><th>节点</th><th>规则名称</th><th>规则内容</th></tr></thead><tbody>
          ${allRules.map(({procName, nodeName, rule}) => `<tr><td>${esc(procName)}</td><td>${esc(nodeName)}</td><td>${esc(rule.name || '')}</td><td>${esc(String(rule.content || '').substring(0, 100))}</td></tr>`).join('')}
        </tbody></table>` : '<p class="no-refs domain-panel-empty">暂无业务规则。</p>'}
      </div>
    </div>
  `;

  let h = `<div class="domain-scroll" data-testid="domain-scroll">${subTabBar}`;

  if (activeDomainTab === 'panorama') { h += panoramaContent; }
  else if (activeDomainTab === 'roles') { h += rolesContent; }
  else if (activeDomainTab === 'language') { h += languageContent; }
  else if (activeDomainTab === 'rules') { h += rulesContent; }

  h += '</div>';
  h += renderBusinessModelDialog();

  document.getElementById('tab-content').innerHTML = h;
  initAutoResize();
  if (Number.isFinite(options.scrollTop)) {
    requestAnimationFrame(() => {
      const scroller = document.querySelector('.domain-scroll');
      if (!scroller) return;
      const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      scroller.scrollTop = Math.min(options.scrollTop, maxScrollTop);
    });
  }
}

function switchAppArchTab(tabId) {
  if (window.OrchestrationWorkbench) return window.OrchestrationWorkbench.switchTab(tabId);
  S.ui.appArchTab = tabId;
  renderAppArchitectureTab();
}

function renderAppArchitectureTab() {
  if (window.OrchestrationWorkbench) return window.OrchestrationWorkbench.render();
  var subTabs = [
    { id: 'pageReference', label: '页面与原型引用' },
    { id: 'frontendApi', label: '前端接口需求' },
    { id: 'backendTasks', label: '接口后的后端任务链路' },
  ];
  var subTabBar = '<div class="view-toggle-group" style="margin-bottom:16px">' +
    subTabs.map(function(t) {
      return '<button class="vtb" type="button">' + t.label + '</button>';
    }).join('') + '</div>';

  var h = '<div class="domain-scroll" data-testid="domain-scroll">' + subTabBar;
  h += '<div class="ctx-card domain-panel"><h3>应用编排台</h3>' +
    '<p class="field-hint">应用编排台从页面、原型和用户步骤出发，整理前端接口需求，再说明接口后的后端任务链路。实体设计和任务定义仍由构件工作台维护。</p></div>';

  var orchItems = [];
  (S.doc.processes || []).forEach(function(proc) {
    (proc.nodes || []).forEach(function(node) {
      (node.orchestrationTasks || []).forEach(function(task, idx) {
        orchItems.push({ procName: proc.name || '', nodeName: node.name || '', taskName: task.name || '', taskType: task.type || '', index: idx + 1 });
      });
    });
  });

  h += '<div class="ctx-card domain-panel"><h3>页面与原型引用</h3><div class="domain-panel-body"><p class="field-hint">页面层先通过流程原型/附件、页面说明和用户步骤表达，不在第一版新增完整页面模型。</p></div></div>';
  h += '<div class="ctx-card domain-panel"><h3>前端接口需求</h3><div class="domain-panel-body"><p class="field-hint">接口需求应说明页面、用户步骤、按钮或操作、输入数据和期望返回。第一版先作为应用编排台的整理入口。</p></div></div>';
  h += '<div class="ctx-card domain-panel"><h3>接口后的后端任务链路</h3><p class="field-hint">当前先全量汇总所有流程节点中的编排任务，共 ' + orchItems.length + ' 条。后续再把接口需求与构件任务建立更清晰的引用。</p>';
  if (orchItems.length) {
    h += '<div class="domain-panel-body"><table class="term-table"><thead><tr><th>流程</th><th>节点</th><th>后端任务</th><th>类型</th><th>序号</th></tr></thead><tbody>';
    orchItems.forEach(function(item) {
      h += '<tr><td>' + esc(item.procName) + '</td><td>' + esc(item.nodeName) + '</td><td>' + esc(item.taskName) + '</td><td>' + esc(item.taskType) + '</td><td>' + item.index + '</td></tr>';
    });
    h += '</tbody></table></div>';
  } else {
    h += '<p class="no-refs domain-panel-empty">暂无后端任务链路。</p>';
  }
  h += '</div>';

  h += '</div>';
  document.getElementById('tab-content').innerHTML = h;
}
