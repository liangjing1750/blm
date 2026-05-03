'use strict';

function setDomain(val) {
  if (!S.doc) return;
  S.doc.meta.domain = val;
  S.doc.meta.title = val;
  markModified();
  document.getElementById('file-name').textContent = val || '未命名';
}

function setMeta(key, val) {
  if (!S.doc) return;
  S.doc.meta[key] = val;
  markModified();
}

function rerenderDomainTabPreserveScroll() {
  const scroller = document.querySelector('.domain-scroll');
  renderDomainTab({ scrollTop: scroller ? scroller.scrollTop : 0 });
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

function findExplicitCapabilityUnit(capabilityId) {
  const targetId = String(capabilityId || '').trim();
  return getDocumentArray('capabilityUnits')
    .find((item) => String(item.id || item.name || '').trim() === targetId || String(item.name || '').trim() === targetId) || null;
}

function ensureCapabilityUnitRef(capabilityId) {
  const targetId = String(capabilityId || '').trim();
  let capability = findExplicitCapabilityUnit(targetId);
  if (capability) {
    if (!capability.id) capability.id = targetId || capability.name;
    return capability;
  }
  const inferred = (typeof getCapabilityItems === 'function' ? getCapabilityItems(S.doc) : [])
    .find((item) => String(item.id || item.name || '').trim() === targetId || String(item.name || '').trim() === targetId);
  capability = {
    id: targetId || nextId('CU', ensureDocumentArray('capabilityUnits')),
    name: getUniqueCapabilityUnitName(inferred?.name || targetId || '新业务组件'),
    kind: inferred?.kind === 'core' ? 'core' : 'generic',
    note: inferred?.note || '',
    entityIds: Array.isArray(inferred?.entityIds) ? inferred.entityIds.slice() : [],
    taskDefinitionIds: Array.isArray(inferred?.taskDefinitionIds) ? inferred.taskDefinitionIds.slice() : [],
    constructIds: Array.isArray(inferred?.constructIds) ? inferred.constructIds.slice() : [],
  };
  ensureDocumentArray('capabilityUnits').push(capability);
  return capability;
}

function findBusinessConstructRef(constructId) {
  const targetId = String(constructId || '').trim();
  return getDocumentArray('businessConstructs')
    .find((item) => String(item.id || item.name || '').trim() === targetId || String(item.name || '').trim() === targetId) || null;
}

function findTaskDefinitionRef(taskDefinitionId) {
  const targetId = String(taskDefinitionId || '').trim();
  return getDocumentArray('taskDefinitions')
    .find((item) => String(item.id || item.name || '').trim() === targetId || String(item.name || '').trim() === targetId) || null;
}

function syncTaskDefinitionCapability(task, capability) {
  if (!task || !capability) return;
  task.capabilityUnitId = capability.id || '';
  task.capabilityUnit = capability.name || capability.id || '';
}

function syncTaskDefinitionConstruct(task, construct) {
  if (!task || !construct) return;
  task.constructId = construct.id || '';
  task.constructName = construct.name || construct.id || '';
  if (construct.capabilityUnitId || construct.capabilityUnit) {
    task.capabilityUnitId = construct.capabilityUnitId || task.capabilityUnitId || '';
    task.capabilityUnit = construct.capabilityUnit || task.capabilityUnit || '';
  }
}

function normalizeModelAssetName(name, fallback = '') {
  return String(name || fallback || '').trim();
}

function getUniqueCapabilityUnitName(baseName = '新业务组件', ignoreCapabilityId = '') {
  const rawName = normalizeModelAssetName(baseName, '新业务组件') || '新业务组件';
  const names = new Set(ensureDocumentArray('capabilityUnits')
    .filter((capability) => String(capability.id || '') !== String(ignoreCapabilityId || ''))
    .map((capability) => normalizeModelAssetName(capability.name))
    .filter(Boolean));
  if (!names.has(rawName)) return rawName;
  let index = 2;
  while (names.has(`${rawName}${index}`)) index += 1;
  return `${rawName}${index}`;
}

function hasCapabilityUnitNameConflict(name, ignoreCapabilityId = '') {
  const nextName = normalizeModelAssetName(name);
  if (!nextName) return false;
  return ensureDocumentArray('capabilityUnits').some((capability) => (
    String(capability.id || '') !== String(ignoreCapabilityId || '')
    && normalizeModelAssetName(capability.name) === nextName
  ));
}

function getConstructScopeId(construct, fallbackCapabilityId = '') {
  const explicitId = normalizeModelAssetName(fallbackCapabilityId || construct?.capabilityUnitId);
  if (explicitId) return explicitId;
  const capabilityName = normalizeModelAssetName(construct?.capabilityUnit);
  if (!capabilityName) return '';
  const capability = findExplicitCapabilityUnit(capabilityName);
  return capability?.id || capabilityName;
}

function getUniqueBusinessConstructName(baseName = '新业务构件', capabilityId = '', ignoreConstructId = '') {
  const rawName = normalizeModelAssetName(baseName, '新业务构件') || '新业务构件';
  const rawScopeId = normalizeModelAssetName(capabilityId);
  const scopeCapability = rawScopeId ? findExplicitCapabilityUnit(rawScopeId) : null;
  const scopeId = scopeCapability?.id || rawScopeId;
  const names = new Set(ensureDocumentArray('businessConstructs')
    .filter((construct) => String(construct.id || '') !== String(ignoreConstructId || ''))
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
  const scopeCapability = rawScopeId ? findExplicitCapabilityUnit(rawScopeId) : null;
  const scopeId = scopeCapability?.id || rawScopeId;
  return ensureDocumentArray('businessConstructs').some((construct) => (
    String(construct.id || '') !== String(ignoreConstructId || '')
    && getConstructScopeId(construct) === scopeId
    && normalizeModelAssetName(construct.name) === nextName
  ));
}

function addCapabilityUnit(afterId = '') {
  const items = ensureDocumentArray('capabilityUnits');
  const capability = {
    id: nextId('CU', items),
    name: getUniqueCapabilityUnitName('新业务组件'),
    kind: 'core',
    note: '',
    entityIds: [],
    taskDefinitionIds: [],
    constructIds: [],
  };
  const afterIndex = items.findIndex((item) => item.id === afterId);
  items.splice(afterIndex >= 0 ? afterIndex + 1 : items.length, 0, capability);
  markModified();
  renderSidebar();
  rerenderDomainTabPreserveScroll();
}

function setCapabilityUnit(capabilityId, key, value) {
  const capability = ensureCapabilityUnitRef(capabilityId);
  if (!['name', 'kind', 'note', 'businessDomain', 'businessDomainId'].includes(key)) return;
  if (key === 'name') {
    const nextName = normalizeModelAssetName(value);
    if (hasCapabilityUnitNameConflict(nextName, capability.id)) {
      alert(`业务组件“${nextName}”已存在，请换一个名称。`);
      rerenderDomainTabPreserveScroll();
      return;
    }
    capability.name = nextName;
    ensureDocumentArray('businessConstructs').forEach((construct) => {
      if (construct.capabilityUnitId === capability.id) construct.capabilityUnit = nextName;
    });
    ensureDocumentArray('taskDefinitions').forEach((task) => {
      if (task.capabilityUnitId === capability.id) {
        task.capabilityUnit = nextName;
        syncProcessTaskDefinitionFields(task);
      }
    });
  } else {
    capability[key] = key === 'kind' && value !== 'core' ? 'generic' : value;
  }
  markModified();
  renderSidebar();
}

async function removeCapabilityUnit(capabilityId) {
  const capability = findExplicitCapabilityUnit(capabilityId);
  if (!capability) return false;
  const constructs = ensureDocumentArray('businessConstructs').filter((construct) => (
    construct.capabilityUnitId === capability.id || construct.capabilityUnit === capability.name
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
    if (task.capabilityUnitId === capability.id || task.capabilityUnit === capability.name) {
      task.capabilityUnitId = '';
      task.capabilityUnit = '';
      syncProcessTaskDefinitionFields(task);
    }
  });
  ensureDocumentArray('processes').forEach((proc) => {
    if (Array.isArray(proc.capabilityUnitIds)) {
      proc.capabilityUnitIds = proc.capabilityUnitIds.filter((id) => id !== capability.id);
    }
  });
  S.doc.capabilityUnits = ensureDocumentArray('capabilityUnits').filter((item) => item !== capability);
  markModified();
  renderSidebar();
  rerenderDomainTabPreserveScroll();
  return true;
}

function addBusinessConstruct(afterId = '', capabilityId = '') {
  const constructs = ensureDocumentArray('businessConstructs');
  const capability = capabilityId ? ensureCapabilityUnitRef(capabilityId) : (getCapabilityItems(S.doc)[0] || null);
  const capabilityScopeId = capability?.id || '';
  const construct = {
    id: nextId('BC', constructs),
    name: getUniqueBusinessConstructName('新业务构件', capabilityScopeId),
    note: '',
    capabilityUnitId: capabilityScopeId,
    capabilityUnit: capability?.name || '',
    entityIds: [],
    taskDefinitionIds: [],
    relatedProcessIds: [],
  };
  const afterIndex = constructs.findIndex((item) => item.id === afterId);
  constructs.splice(afterIndex >= 0 ? afterIndex + 1 : constructs.length, 0, construct);
  if (capability) {
    const capRef = ensureCapabilityUnitRef(capability.id || capability.name);
    capRef.constructIds = [...new Set([...(capRef.constructIds || []), construct.id])];
  }
  markModified();
  renderSidebar();
  rerenderDomainTabPreserveScroll();
}

function setBusinessConstruct(constructId, key, value) {
  const construct = findBusinessConstructRef(constructId);
  if (!construct || !['name', 'note', 'capabilityUnitId'].includes(key)) return;
  if (key === 'capabilityUnitId') {
    const previousCapabilityId = construct.capabilityUnitId;
    const nextCapabilityId = normalizeModelAssetName(value);
    if (hasBusinessConstructNameConflict(construct.name, nextCapabilityId, construct.id)) {
      const scopeLabel = nextCapabilityId ? '目标业务组件' : '未分组构件';
      alert(`${scopeLabel}中已存在业务构件“${construct.name || construct.id}”，请先调整名称。`);
      rerenderDomainTabPreserveScroll();
      return;
    }
    if (!nextCapabilityId) {
      construct.capabilityUnitId = '';
      construct.capabilityUnit = '';
      ensureDocumentArray('capabilityUnits').forEach((capability) => {
        if (capability.id === previousCapabilityId && Array.isArray(capability.constructIds)) {
          capability.constructIds = capability.constructIds.filter((id) => id !== construct.id);
        }
      });
      markModified();
      renderSidebar();
      return;
    }
    const capability = ensureCapabilityUnitRef(nextCapabilityId);
    ensureDocumentArray('capabilityUnits').forEach((item) => {
      if (item.id !== capability.id && Array.isArray(item.constructIds)) {
        item.constructIds = item.constructIds.filter((id) => id !== construct.id);
      }
    });
    construct.capabilityUnitId = capability.id || '';
    construct.capabilityUnit = capability.name || capability.id || '';
    capability.constructIds = [...new Set([...(capability.constructIds || []), construct.id])];
    ensureDocumentArray('taskDefinitions').forEach((task) => {
      if (task.constructId === construct.id) {
        syncTaskDefinitionCapability(task, capability);
        syncProcessTaskDefinitionFields(task);
      }
    });
  } else {
    if (key === 'name') {
      const nextName = normalizeModelAssetName(value);
      const scopeId = getConstructScopeId(construct);
      if (hasBusinessConstructNameConflict(nextName, scopeId, construct.id)) {
        alert(`当前范围已存在业务构件“${nextName}”，请换一个名称。`);
        rerenderDomainTabPreserveScroll();
        return;
      }
      construct.name = nextName;
      ensureDocumentArray('taskDefinitions').forEach((task) => {
        if (task.constructId === construct.id) {
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
  if (!await showAppConfirm(`确认删除业务构件“${construct.name || construct.id}”？`, {
    title: '删除业务构件',
    confirmLabel: '删除',
  })) return false;
  S.doc.businessConstructs = ensureDocumentArray('businessConstructs').filter((item) => item !== construct);
  ensureDocumentArray('capabilityUnits').forEach((capability) => {
    if (!Array.isArray(capability.constructIds)) return;
    capability.constructIds = capability.constructIds.filter((id) => id !== construct.id);
  });
  ensureDocumentArray('taskDefinitions').forEach((task) => {
    if (task.constructId === construct.id) {
      task.constructId = '';
      task.constructName = '';
      syncProcessTaskDefinitionConstruct(task);
    }
  });
  ensureDocumentArray('entities').forEach((entity) => {
    if (entity.businessConstructId === construct.id) entity.businessConstructId = '';
    if (Array.isArray(entity.businessConstructIds)) {
      entity.businessConstructIds = entity.businessConstructIds.filter((id) => id !== construct.id);
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
  item.note = taskDefinition.note || '';
  item.constructId = taskDefinition.constructId || '';
  item.businessConstructId = taskDefinition.constructId || '';
  item.constructName = taskDefinition.constructName || '';
  item.capabilityUnitId = taskDefinition.capabilityUnitId || '';
  item.capabilityUnit = taskDefinition.capabilityUnit || '';
}

function syncProcessTaskDefinitionFields(taskDefinition) {
  if (!taskDefinition?.id) return;
  (S.doc?.processes || []).forEach((proc) => {
    getProcNodes(proc).forEach((node) => {
      getNodeOrchestrationTasks(node).forEach((item) => {
        if (item.taskDefinitionId === taskDefinition.id) applyTaskDefinitionToProcessNodeTask(item, taskDefinition);
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

function addTaskDefinition(afterId = '', capabilityId = '', constructId = '') {
  const tasks = ensureDocumentArray('taskDefinitions');
  const construct = constructId ? findBusinessConstructRef(constructId) : null;
  const capability = capabilityId
    ? ensureCapabilityUnitRef(capabilityId)
    : (construct?.capabilityUnitId ? ensureCapabilityUnitRef(construct.capabilityUnitId) : null);
  const task = {
    id: nextId('TD', tasks),
    name: getUniqueTaskDefinitionName('新任务定义'),
    type: 'Service',
    target: '',
    note: '',
    entityIds: [],
    processIds: [],
    usedBy: [],
  };
  if (capability) syncTaskDefinitionCapability(task, capability);
  if (construct) syncTaskDefinitionConstruct(task, construct);
  const afterIndex = tasks.findIndex((item) => item.id === afterId);
  tasks.splice(afterIndex >= 0 ? afterIndex + 1 : tasks.length, 0, task);
  if (capability) {
    const capRef = ensureCapabilityUnitRef(capability.id);
    capRef.taskDefinitionIds = [...new Set([...(capRef.taskDefinitionIds || []), task.id])];
  }
  if (construct) {
    construct.taskDefinitionIds = [...new Set([...(construct.taskDefinitionIds || []), task.id])];
  }
  markModified();
  renderSidebar();
  rerenderDomainTabPreserveScroll();
  return task;
}

function addTaskDefinitionAndOpen(capabilityId = '', constructId = '') {
  const task = addTaskDefinition('', capabilityId, constructId);
  if (task) openTaskDefinitionEditor(task.id, capabilityId, constructId);
}

function setTaskDefinition(taskDefinitionId, key, value) {
  const task = findTaskDefinitionRef(taskDefinitionId);
  if (!task || !['name', 'type', 'querySourceKind', 'target', 'note', 'capabilityUnitId', 'constructId'].includes(key)) return;
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
      return;
    }
    task.name = nextName;
    syncProcessTaskDefinitionName(task);
  } else if (key === 'capabilityUnitId') {
    if (value) {
      const capability = ensureCapabilityUnitRef(value);
      syncTaskDefinitionCapability(task, capability);
      capability.taskDefinitionIds = [...new Set([...(capability.taskDefinitionIds || []), task.id])];
    } else {
      task.capabilityUnitId = '';
      task.capabilityUnit = '';
    }
  } else if (key === 'constructId') {
    ensureDocumentArray('businessConstructs').forEach((construct) => {
      if (Array.isArray(construct.taskDefinitionIds)) {
        construct.taskDefinitionIds = construct.taskDefinitionIds.filter((id) => id !== task.id);
      }
    });
    if (value) {
      const construct = findBusinessConstructRef(value);
      syncTaskDefinitionConstruct(task, construct);
      if (construct) {
        construct.taskDefinitionIds = [...new Set([...(construct.taskDefinitionIds || []), task.id])];
      }
    } else {
      task.constructId = '';
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
}

function addEntityToConstruct(constructId, entityId) {
  const construct = findBusinessConstructRef(constructId);
  const entity = (S.doc?.entities || []).find((item) => item.id === entityId);
  if (!construct || !entity) return;
  ensureDocumentArray('businessConstructs').forEach((item) => {
    if (Array.isArray(item.entityIds)) item.entityIds = item.entityIds.filter((id) => id !== entity.id);
  });
  entity.businessConstructId = construct.id;
  entity.businessConstructIds = [construct.id];
  construct.entityIds = [...new Set([...(construct.entityIds || []), entity.id])];
  markModified();
  renderSidebar();
  rerenderDomainTabPreserveScroll();
  if (S.ui.tab === 'data' && (S.ui.dataView || 'relation') === 'relation') renderEntityDiagramNow();
}

function removeEntityFromConstruct(constructId, entityId) {
  const construct = findBusinessConstructRef(constructId);
  const entity = (S.doc?.entities || []).find((item) => item.id === entityId);
  if (!construct || !entity) return;
  construct.entityIds = (construct.entityIds || []).filter((id) => id !== entity.id);
  if (entity.businessConstructId === construct.id) entity.businessConstructId = '';
  if (Array.isArray(entity.businessConstructIds)) {
    entity.businessConstructIds = entity.businessConstructIds.filter((id) => id !== construct.id);
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
    if (Array.isArray(item.taskDefinitionIds)) item.taskDefinitionIds = item.taskDefinitionIds.filter((id) => id !== task.id);
  });
  construct.taskDefinitionIds = [...new Set([...(construct.taskDefinitionIds || []), task.id])];
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
  construct.taskDefinitionIds = (construct.taskDefinitionIds || []).filter((id) => id !== task.id);
  if (task.constructId === construct.id) {
    task.constructId = '';
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
  };
  rerenderDomainTabPreserveScroll();
}

function openTaskDefinitionEditor(taskDefinitionId, capabilityId = '', constructId = '') {
  S.ui.businessModelDialog = {
    mode: 'task',
    capabilityId: String(capabilityId || '').trim(),
    constructId: String(constructId || '').trim(),
    taskDefinitionId: String(taskDefinitionId || '').trim(),
  };
  rerenderDomainTabPreserveScroll();
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
      next.businessModelDialog = { mode: '', capabilityId: '', constructId: '', taskDefinitionId: '' };
      return next;
    });
  }
  S.ui.businessModelDialog = { mode: '', capabilityId: '', constructId: '', taskDefinitionId: '' };
  S.ui.tab = 'data';
  S.ui.dataView = 'relation';
  S.ui.entityId = id;
  S.ui.entityRelationEditorCollapsed = false;
  render();
}

function closeBusinessModelDialog() {
  S.ui.businessModelDialog = { mode: '', capabilityId: '', constructId: '', taskDefinitionId: '' };
  rerenderDomainTabPreserveScroll();
}

async function removeTaskDefinition(taskDefinitionId) {
  const task = findTaskDefinitionRef(taskDefinitionId);
  if (!task) return false;
  if (!await showAppConfirm(`确认删除任务定义“${task.name || task.id}”？`, {
    title: '删除任务定义',
    confirmLabel: '删除',
  })) return false;
  S.doc.taskDefinitions = ensureDocumentArray('taskDefinitions').filter((item) => item !== task);
  ensureDocumentArray('capabilityUnits').forEach((capability) => {
    if (!Array.isArray(capability.taskDefinitionIds)) return;
    capability.taskDefinitionIds = capability.taskDefinitionIds.filter((id) => id !== task.id);
  });
  ensureDocumentArray('businessConstructs').forEach((construct) => {
    if (Array.isArray(construct.taskDefinitionIds)) {
      construct.taskDefinitionIds = construct.taskDefinitionIds.filter((id) => id !== task.id);
    }
  });
  ensureDocumentArray('processes').forEach((proc) => {
    getProcNodes(proc).forEach((node) => {
      getNodeOrchestrationTasks(node).forEach((item) => {
        if (item.taskDefinitionId !== task.id) return;
        item.taskDefinitionId = '';
        item.constructId = '';
        item.businessConstructId = '';
        item.constructName = '';
        item.capabilityUnitId = '';
        item.capabilityUnit = '';
      });
    });
  });
  markModified();
  renderSidebar();
  rerenderDomainTabPreserveScroll();
  return true;
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
    ...(Array.isArray(item?.capabilityUnitIds) ? item.capabilityUnitIds : []),
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
        <strong>业务域信息</strong>
        <span data-testid="domain-info-scope-label">当前业务域：${esc(selectedDomainLabel)}</span>
        <span data-testid="business-model-summary">组件 ${items.length} · 构件 ${totalConstructs} · 任务定义 ${totalTasks}</span>
      </div>
      <div class="domain-subdomain-actions">
        <div class="domain-subdomain-legend">
          <span class="subdomain-legend core">核心 ${coreItems.length}</span>
          <span class="subdomain-legend generic">通用 ${genericItems.length}</span>
        </div>
        <button class="btn btn-outline btn-sm" type="button" data-testid="capability-add-button" onclick="addCapabilityUnit();openBusinessModelDialog('capability',S.doc.capabilityUnits[S.doc.capabilityUnits.length-1].id)">＋ 组件</button>
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
  const groupedConstructs = getCapabilityConstructs(capability, S.doc);
  const groupedIds = new Set(groupedConstructs.map((construct) => construct.id));
  const ungroupedConstructs = getBusinessConstructItems(S.doc).filter((construct) => !construct.capabilityUnitId && !groupedIds.has(construct.id));
  return `<div class="business-model-dialog-panel" data-testid="business-model-dialog">
    <div class="business-model-dialog-head">
      <h3>业务组件</h3>
      <div class="business-model-dialog-actions">
        <button class="btn btn-danger btn-sm" type="button" data-testid="capability-delete-button"
          onclick="removeCapabilityUnit('${esc(jsString(capId))}').then((deleted)=>{if(deleted)closeBusinessModelDialog()})">删除</button>
        <button class="drawer-close" type="button" data-testid="business-model-dialog-close" onclick="closeBusinessModelDialog()">✕</button>
      </div>
    </div>
    <div class="business-model-dialog-body">
      <div class="form-grid">
        <div class="field-group">
          <label>组件名称</label>
          <input data-testid="capability-name-input" type="text" value="${esc(capability.name || '')}"
            oninput="setCapabilityUnit('${esc(jsString(capId))}','name',this.value)">
        </div>
        <div class="field-group">
          <label>组件类型</label>
          <select data-testid="capability-kind-select" onchange="setCapabilityUnit('${esc(jsString(capId))}','kind',this.value);rerenderDomainTabPreserveScroll()">
            <option value="core" ${capability.kind === 'core' ? 'selected' : ''}>核心组件</option>
            <option value="generic" ${capability.kind !== 'core' ? 'selected' : ''}>通用组件</option>
          </select>
        </div>
        <div class="field-group field-group-wide">
          <label>说明</label>
          <input data-testid="capability-note-input" type="text" value="${esc(capability.note || '')}"
            oninput="setCapabilityUnit('${esc(jsString(capId))}','note',this.value)">
        </div>
      </div>
      <div class="business-model-dialog-section">
        <div class="business-model-section-head">
          <h4>组件内构件</h4>
          <button class="btn btn-outline btn-sm" type="button" data-testid="construct-add-button" onclick="addBusinessConstruct('','${esc(jsString(capId))}');openBusinessModelDialog('construct','${esc(jsString(capId))}',S.doc.businessConstructs[S.doc.businessConstructs.length-1].id)">＋ 构件</button>
        </div>
        ${renderMoveList(groupedConstructs, {
          emptyText: '暂无构件',
          testId: 'construct-open-button',
          actionLabel: '编辑',
          secondaryTestId: 'construct-detach-button',
          secondaryActionLabel: '移出',
          label: (construct) => construct.name || construct.id,
          onclick: (construct) => `openBusinessModelDialog('construct','${esc(jsString(capId))}','${esc(jsString(construct.id))}')`,
          secondaryOnclick: (construct) => `setBusinessConstruct('${esc(jsString(construct.id))}','capabilityUnitId','');rerenderDomainTabPreserveScroll()`,
        })}
      </div>
      <div class="business-model-dialog-section">
        <div class="business-model-section-head"><h4>未分组构件</h4><span>可加入当前组件</span></div>
        ${renderMoveList(ungroupedConstructs, {
          emptyText: '暂无未分组构件',
          testId: 'construct-attach-button',
          actionLabel: '加入',
          label: (construct) => construct.name || construct.id,
          onclick: (construct) => `setBusinessConstruct('${esc(jsString(construct.id))}','capabilityUnitId','${esc(jsString(capId))}');rerenderDomainTabPreserveScroll()`,
        })}
      </div>
    </div>
  </div>`;
}

function renderConstructDialog(construct) {
  const constructId = String(construct.id || construct.name || '');
  const dialog = S.ui.businessModelDialog || {};
  const capabilities = getCapabilityItems(S.doc);
  const parentCapabilityId = String(construct.capabilityUnitId || dialog.capabilityId || '').trim();
  const backButton = parentCapabilityId
    ? `<button class="btn btn-outline btn-sm business-model-back-btn" type="button" data-testid="business-model-dialog-back" onclick="openBusinessModelDialog('capability','${esc(jsString(parentCapabilityId))}')">返回</button>`
    : '';
  const afterDelete = parentCapabilityId
    ? `openBusinessModelDialog('capability','${esc(jsString(parentCapabilityId))}')`
    : 'closeBusinessModelDialog()';
  const entityIds = new Set([...(construct.entityIds || []), ...(S.doc.entities || []).filter((entity) => entity.businessConstructId === construct.id).map((entity) => entity.id)]);
  const assignedEntities = (S.doc.entities || []).filter((entity) => entityIds.has(entity.id));
  const unassignedEntities = (S.doc.entities || []).filter((entity) => !entity.businessConstructId);
  const taskIds = new Set([...(construct.taskDefinitionIds || []), ...getTaskDefinitionItems(S.doc).filter((task) => task.constructId === construct.id).map((task) => task.id)]);
  const assignedTasks = getTaskDefinitionItems(S.doc).filter((task) => taskIds.has(task.id));
  const unassignedTasks = getTaskDefinitionItems(S.doc).filter((task) => !task.constructId);
  const capabilityOptions = capabilities.map((capability) => {
    const id = String(capability.id || capability.name || '');
    return `<option value="${esc(id)}" ${id === construct.capabilityUnitId ? 'selected' : ''}>${esc(capability.name || id)}</option>`;
  }).join('');
  return `<div class="business-model-dialog-panel" data-testid="business-model-dialog">
    <div class="business-model-dialog-head">
      <h3>业务构件</h3>
      <div class="business-model-dialog-actions">
        ${backButton}
        <button class="btn btn-danger btn-sm" type="button" data-testid="construct-delete-button"
          onclick="removeBusinessConstruct('${esc(jsString(constructId))}').then((deleted)=>{if(deleted)${afterDelete}})">删除</button>
        <button class="drawer-close" type="button" data-testid="business-model-dialog-close" onclick="closeBusinessModelDialog()">✕</button>
      </div>
    </div>
    <div class="business-model-dialog-body">
      <div class="form-grid">
        <div class="field-group">
          <label>构件名称</label>
          <input data-testid="construct-name-input" type="text" value="${esc(construct.name || '')}"
            oninput="setBusinessConstruct('${esc(jsString(constructId))}','name',this.value)">
        </div>
        <div class="field-group">
          <label>所属组件</label>
          <select data-testid="construct-capability-select" onchange="setBusinessConstruct('${esc(jsString(constructId))}','capabilityUnitId',this.value);rerenderDomainTabPreserveScroll()">
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
          <div class="business-model-section-head"><h4>构件实体</h4><span>移出后进入未分组</span></div>
          ${renderMoveList(assignedEntities, {
            emptyText: '暂无实体',
            testId: 'construct-entity-edit',
            actionLabel: '编辑',
            secondaryTestId: 'construct-entity-remove',
            secondaryActionLabel: '移出',
            label: (entity) => entity.name || entity.id,
            onclick: (entity) => `openEntityDefinitionEditor('${esc(jsString(entity.id))}')`,
            secondaryOnclick: (entity) => `removeEntityFromConstruct('${esc(jsString(constructId))}','${esc(jsString(entity.id))}')`,
          })}
          ${renderMoveList(unassignedEntities, {
            emptyText: '暂无未分组实体',
            testId: 'construct-entity-edit',
            actionLabel: '编辑',
            secondaryTestId: 'construct-entity-add',
            secondaryActionLabel: '移入组件',
            label: (entity) => entity.name || entity.id,
            onclick: (entity) => `openEntityDefinitionEditor('${esc(jsString(entity.id))}')`,
            secondaryOnclick: (entity) => `addEntityToConstruct('${esc(jsString(constructId))}','${esc(jsString(entity.id))}')`,
          })}
        </div>
        <div class="business-model-dialog-section">
          <div class="business-model-section-head">
            <h4>任务定义</h4>
            <button class="btn btn-outline btn-sm" type="button" data-testid="task-definition-add-button" onclick="addTaskDefinitionAndOpen('${esc(jsString(construct.capabilityUnitId || ''))}','${esc(jsString(constructId))}')">＋ 任务定义</button>
          </div>
          ${renderMoveList(assignedTasks, {
            emptyText: '暂无任务定义',
            testId: 'construct-task-edit',
            actionLabel: '编辑',
            secondaryTestId: 'construct-task-remove',
            secondaryActionLabel: '移出',
            label: (task) => task.name || task.id,
            onclick: (task) => `openTaskDefinitionEditor('${esc(jsString(task.id))}','${esc(jsString(construct.capabilityUnitId || ''))}','${esc(jsString(constructId))}')`,
            secondaryOnclick: (task) => `removeTaskDefinitionFromConstruct('${esc(jsString(constructId))}','${esc(jsString(task.id))}')`,
          })}
          ${renderMoveList(unassignedTasks, {
            emptyText: '暂无未分组任务',
            testId: 'construct-task-edit',
            actionLabel: '编辑',
            secondaryTestId: 'construct-task-add',
            secondaryActionLabel: '移入组件',
            label: (task) => task.name || task.id,
            onclick: (task) => `openTaskDefinitionEditor('${esc(jsString(task.id))}','${esc(jsString(construct.capabilityUnitId || ''))}','${esc(jsString(constructId))}')`,
            secondaryOnclick: (task) => `addTaskDefinitionToConstruct('${esc(jsString(constructId))}','${esc(jsString(task.id))}')`,
          })}
        </div>
      </div>
    </div>
  </div>`;
}

function renderTaskDefinitionDialog(task) {
  const taskId = String(task.id || task.name || '');
  const dialog = S.ui.businessModelDialog || {};
  const constructs = getBusinessConstructItems(S.doc);
  const parentConstructId = String(task.constructId || dialog.constructId || '').trim();
  const parentConstruct = parentConstructId ? findBusinessConstructRef(parentConstructId) : null;
  const parentCapabilityId = String(
    parentConstruct?.capabilityUnitId || task.capabilityUnitId || dialog.capabilityId || ''
  ).trim();
  const backButton = parentConstructId
    ? `<button class="btn btn-outline btn-sm business-model-back-btn" type="button" data-testid="business-model-dialog-back" onclick="openBusinessModelDialog('construct','${esc(jsString(parentCapabilityId))}','${esc(jsString(parentConstructId))}')">返回</button>`
    : (parentCapabilityId
      ? `<button class="btn btn-outline btn-sm business-model-back-btn" type="button" data-testid="business-model-dialog-back" onclick="openBusinessModelDialog('capability','${esc(jsString(parentCapabilityId))}')">返回</button>`
      : '');
  const afterDelete = parentConstructId
    ? `openBusinessModelDialog('construct','${esc(jsString(parentCapabilityId))}','${esc(jsString(parentConstructId))}')`
    : (parentCapabilityId
      ? `openBusinessModelDialog('capability','${esc(jsString(parentCapabilityId))}')`
      : 'closeBusinessModelDialog()');
  const typeValue = task.type || 'Service';
  const constructOptions = `<option value="">未归属构件</option>${constructs.map((construct) => {
    const id = String(construct.id || construct.name || '');
    const capability = getCapabilityItems(S.doc).find((item) => item.id === construct.capabilityUnitId || item.name === construct.capabilityUnit);
    const prefix = capability ? `${capability.name} / ` : '';
    return `<option value="${esc(id)}" ${id === task.constructId ? 'selected' : ''}>${esc(prefix + (construct.name || id))}</option>`;
  }).join('')}`;
  return `<div class="business-model-dialog-panel task-definition-dialog" data-testid="business-model-dialog">
    <div class="business-model-dialog-head">
      <h3>任务定义</h3>
      <div class="business-model-dialog-actions">
        ${backButton}
        <button class="btn btn-danger btn-sm" type="button" data-testid="task-definition-delete-button"
          onclick="removeTaskDefinition('${esc(jsString(taskId))}').then((deleted)=>{if(deleted)${afterDelete}})">删除</button>
        <button class="drawer-close" type="button" data-testid="business-model-dialog-close" onclick="closeBusinessModelDialog()">✕</button>
      </div>
    </div>
    <div class="business-model-dialog-body">
      <div class="form-grid">
        <div class="field-group">
          <label>任务名称</label>
          <input data-testid="task-definition-name-input" type="text" value="${esc(task.name || '')}"
            oninput="setTaskDefinition('${esc(jsString(taskId))}','name',this.value)">
        </div>
        <div class="field-group">
          <label>所属业务构件</label>
          <select data-testid="task-definition-construct-select"
            onchange="setTaskDefinition('${esc(jsString(taskId))}','constructId',this.value);rerenderDomainTabPreserveScroll()">
            ${constructOptions}
          </select>
        </div>
        <div class="field-group">
          <label>任务类型</label>
          <select data-testid="task-definition-type-select"
            onchange="setTaskDefinition('${esc(jsString(taskId))}','type',this.value);rerenderDomainTabPreserveScroll()">
            ${ORCHESTRATION_TYPES.map((option) => `<option value="${option.value}" ${typeValue === option.value ? 'selected' : ''}>${option.label}</option>`).join('')}
          </select>
        </div>
        ${typeValue === 'Query' ? `<div class="field-group">
          <label>查询来源</label>
          <select data-testid="task-definition-query-source-select"
            onchange="setTaskDefinition('${esc(jsString(taskId))}','querySourceKind',this.value)">
            ${QUERY_SOURCE_KINDS.map((option) => `<option value="${option.value}" ${task.querySourceKind === option.value ? 'selected' : ''}>${option.label}</option>`).join('')}
          </select>
        </div>` : ''}
        <div class="field-group field-group-wide task-definition-tech-group">
          <label>技术承接</label>
          <input data-testid="task-definition-target-input" type="text" value="${esc(task.target || '')}" placeholder="目标服务 / 字典 / 枚举"
            oninput="setTaskDefinition('${esc(jsString(taskId))}','target',this.value)">
        </div>
        <div class="field-group field-group-wide">
          <label>说明</label>
          <textarea class="auto-resize" data-testid="task-definition-note-input" rows="3" placeholder="任务说明、约束或技术备注"
            oninput="setTaskDefinition('${esc(jsString(taskId))}','note',this.value);autoResize(this)">${esc(task.note || '')}</textarea>
        </div>
      </div>
    </div>
  </div>`;
}

function renderBusinessModelDialog() {
  const dialog = S.ui.businessModelDialog || {};
  if (!dialog.mode) return '';
  const capability = findExplicitCapabilityUnit(dialog.capabilityId);
  const construct = findBusinessConstructRef(dialog.constructId);
  const task = findTaskDefinitionRef(dialog.taskDefinitionId);
  const panel = dialog.mode === 'task' && task
    ? renderTaskDefinitionDialog(task)
    : (dialog.mode === 'construct' && construct
      ? renderConstructDialog(construct)
      : (capability ? renderCapabilityDialog(capability) : ''));
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

function renderDomainTab(options = {}) {
  ensureProcPos(S.doc);
  const meta = S.doc.meta || {};
  const domainInfoContext = getSelectedDomainInfoContext();
  const selectedDomainId = domainInfoContext.id;
  const filteredRoles = getRolesForDomainInfo(selectedDomainId);
  const languageEntries = getLanguageEntriesForDomainInfo(selectedDomainId);
  const langCollapsed = S.ui.sbCollapse.lang !== false;

  const languageActions = `<span class="domain-panel-toggle">${langCollapsed ? '展开' : '折叠'}</span>`;
  const languageSubtitle = languageEntries.length
    ? `当前范围显示 ${languageEntries.length} 条术语，用于统一命名和口径。`
    : '用于固定高频核心名词，避免不同流程叫法不一致。';
  const domainInfoActions = `
    <div class="domain-info-inline" data-testid="domain-info-inline">
      <label class="domain-info-inline-field">
        <span>文档名称 <span class="inline-help inline-help-left" tabindex="0" data-tip="这里填写这份建模文档的名称。">?</span></span>
        <input type="text" value="${esc(meta.domain || meta.title || '')}" oninput="setDomain(this.value)">
      </label>
      <label class="domain-info-inline-field domain-info-author-field">
        <span>作者</span>
        <input type="text" data-testid="domain-author-input" value="${esc(meta.author || '')}" oninput="setMeta('author',this.value)">
      </label>
      <label class="domain-info-inline-field domain-info-date-field">
        <span>日期</span>
        <input type="text" data-testid="domain-date-input" value="${esc(meta.date || '')}" oninput="setMeta('date',this.value)">
      </label>
    </div>
  `;

  let h = '<div class="domain-scroll" data-testid="domain-scroll">';

  h += `<div class="ctx-card domain-panel domain-info-card">
    ${renderDomainPanelHeader('文档信息', '', domainInfoActions)}
    <div class="domain-panel-body domain-info-card-body">
      ${renderSubDomainMapCard(selectedDomainId, domainInfoContext.label)}
    </div>
  </div>`;

  h += renderRoleSummaryCard(filteredRoles, selectedDomainId);

  h += `<div class="ctx-card domain-panel domain-language-card" data-testid="language-card">
    ${renderDomainPanelHeader(
      '统一语言/术语表',
      languageSubtitle,
      languageActions,
      {
        button: true,
        onclick: "toggleDomainSection('lang')",
        dataTestId: 'language-toggle',
        dataPanel: 'language',
        ariaExpanded: !langCollapsed,
      }
    )}`;

  if (!langCollapsed) {
    h += `<div class="domain-panel-body domain-language-body">
      <div class="domain-language-toolbar">
        <span class="domain-language-hint">建议只保留高频且容易混用的术语，不用追求把所有名词都填满。</span>
        <button class="btn btn-outline btn-sm" onclick="addTerm()">添加术语</button>
      </div>`;
    if (languageEntries.length) {
      h += `<table class="term-table">
        <thead><tr><th>术语</th><th>定义</th><th></th></tr></thead><tbody>`;
      languageEntries.forEach(({ term, index }) => {
        h += `<tr data-testid="term-row">
          <td><input type="text" data-testid="term-input" value="${esc(term.term || '')}" oninput="setTerm(${index},'term',this.value)" placeholder="术语"></td>
          <td><input type="text" data-testid="term-definition-input" value="${esc(term.definition || '')}" oninput="setTerm(${index},'definition',this.value)" placeholder="定义"></td>
          <td>
            <div class="term-quick-actions">
              <button class="stage-quick-btn" type="button" data-testid="term-row-add" title="在下方新增术语" onclick="addTermAfter(${index})">+</button>
              <button class="stage-quick-btn" type="button" data-testid="term-row-move-up" title="上移" onclick="moveTerm(${index},-1)" ${index === 0 ? 'disabled' : ''}>↑</button>
              <button class="stage-quick-btn" type="button" data-testid="term-row-move-down" title="下移" onclick="moveTerm(${index},1)" ${index === (S.doc.language || []).length - 1 ? 'disabled' : ''}>↓</button>
              <button class="stage-quick-btn danger" type="button" data-testid="term-row-remove" title="删除术语" onclick="removeTerm(${index})">✕</button>
            </div>
          </td>
        </tr>`;
      });
      h += '</tbody></table>';
    } else {
      h += '<p class="no-refs domain-panel-empty">暂无术语定义。有容易混用的关键名词时再补充即可。</p>';
    }
    h += '</div>';
  }

  h += '</div>';
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
