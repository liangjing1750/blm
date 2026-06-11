'use strict';

window.RoleWorkbench = {
  getRoleUsageForDomainInfo(roleId, selectedDomainId) {
    const usage = getRoleUsage(roleId);
    if (!selectedDomainId || selectedDomainId === 'all' || typeof itemMatchesBusinessDomain !== 'function') return usage;
    return usage.filter((item) => itemMatchesBusinessDomain(item.proc, selectedDomainId, S.doc));
  },

  getRoleUsageSummaryForDomainInfo(roleId, selectedDomainId) {
    const usage = this.getRoleUsageForDomainInfo(roleId, selectedDomainId);
    const processIds = new Set(usage.map((item) => item.proc.id));
    const subDomains = new Set(usage.map((item) => normalizeRoleName(item.proc.subDomain)).filter(Boolean));
    return {
      taskCount: usage.length,
      processCount: processIds.size,
      subDomainCount: subDomains.size,
    };
  },

  roleMatchesDomainInfo(role, selectedDomainId) {
    if (!selectedDomainId || selectedDomainId === 'all') return true;
    const explicitDomainValues = typeof _itemBusinessDomainValues === 'function'
      ? _itemBusinessDomainValues(role)
      : [role?.businessDomainId, role?.businessDomain, role?.panoramaLaneId, role?.laneId].filter(Boolean).map(String);
    if (explicitDomainValues.length && typeof itemMatchesBusinessDomain === 'function') {
      return itemMatchesBusinessDomain(role, selectedDomainId, S.doc);
    }

    if (this.getRoleUsageForDomainInfo(role.id, selectedDomainId).length) return true;

    const roleSubDomains = Array.isArray(role?.subDomains) ? role.subDomains.map(normalizeRoleName).filter(Boolean) : [];
    if (roleSubDomains.length) {
      const capabilityNames = new Set(getCapabilitiesForDomainInfo(selectedDomainId).flatMap((capability) => [
        capability.id,
        capability.name,
      ].filter(Boolean).map(String)));
      return roleSubDomains.some((name) => capabilityNames.has(name));
    }

    return true;
  },

  getRolesForDomainInfo(selectedDomainId) {
    return getRoles().filter((role) => this.roleMatchesDomainInfo(role, selectedDomainId));
  },

  getGroupedRolesForDomainInfo(roles) {
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
  },

  getRoleSummaryCountsForDomainInfo(roles, selectedDomainId) {
    let usedCount = 0;
    let unusedCount = 0;
    roles.forEach((role) => {
      const usage = this.getRoleUsageSummaryForDomainInfo(role.id, selectedDomainId);
      if (usage.taskCount === 0) unusedCount += 1;
      else usedCount += 1;
    });
    return { roleCount: roles.length, usedCount, unusedCount };
  },

  getLightRoleSummary(role, selectedDomainId = 'all') {
    const usage = this.getRoleUsageSummaryForDomainInfo(role.id, selectedDomainId);
    return usage.taskCount ? `${usage.taskCount}N` : '未使用';
  },

  getSelectedRoleGroupInputValue() {
    const select = document.getElementById('role-create-group-select');
    const customInput = document.getElementById('role-create-group-custom');
    if (!select) return '';
    if (select.value === '__custom__') return normalizeRoleName(customInput?.value || '');
    return normalizeRoleName(select.value);
  },

  onRoleGroupSelectChange(value) {
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
  },

  addRole() {
    if (!S.doc) return;
    const nameInput = document.getElementById('role-create-input');
    const roleName = getUniqueRoleName(nameInput?.value || '新角色');
    const roleGroup = this.getSelectedRoleGroupInputValue();

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
  },

  async removeRole(roleId) {
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
  },

  openRoleView(roleId) {
    ensureSelectedRole(roleId);
    S.ui.mainTab = 'processWorkbench';
    S.ui.tab = 'process';
    S.ui.procView = 'role';
    render();
  },

  getProcessPanoramaContexts(proc, doc = S.doc) {
    const processId = String(proc?.id || '').trim();
    if (!processId) return [];
    const stageRefs = getProcessStageRefs(processId, doc);
    const stages = getStages(doc);
    const stageById = new Map(stages.map((stage, index) => [String(stage.id || '').trim(), { stage, index }]));
    const panorama = getPanoramaModel(doc);
    const columns = Array.isArray(panorama?.columns) ? panorama.columns : [];
    const lanes = Array.isArray(panorama?.lanes) ? panorama.lanes : [];
    const columnById = new Map(columns.map((column, index) => [String(column.id || '').trim(), { column, index }]));
    const laneById = new Map(lanes.map((lane, index) => [String(lane.id || '').trim(), { lane, index }]));
    const contexts = [];

    for (const ref of stageRefs) {
      const stageEntry = stageById.get(String(ref.stageUid || '').trim());
      if (!stageEntry?.stage || stageEntry.stage.id === UNASSIGNED_STAGE_ID) continue;
      const stage = stageEntry.stage;
      const columnEntry = columnById.get(String(stage.panoramaColumnUid || '').trim());
      const laneEntry = laneById.get(String(stage.panoramaLaneUid || '').trim());
      const hasPanoramaPosition = Boolean(columnEntry?.column && laneEntry?.lane);
      const laneName = String(laneEntry?.lane?.name || '').trim();
      const columnName = String(columnEntry?.column?.name || '').trim();
      contexts.push({
        key: hasPanoramaPosition
          ? `panorama:${laneEntry.lane.id}:${columnEntry.column.id}:stage:${stage.id}`
          : `stage-unclassified:${stage.id}`,
        title: hasPanoramaPosition ? `${laneName || '未命名业务域'} / ${columnName || '未命名价值流'}` : '未归类阶段',
        subtitle: `阶段：${String(stage.name || '未命名阶段').trim() || '未命名阶段'}`,
        sortKey: [
          hasPanoramaPosition ? 0 : 1,
          laneEntry?.index ?? 9999,
          columnEntry?.index ?? 9999,
          stageEntry.index,
          ref.order ?? 9999,
        ],
      });
    }

    if (!contexts.length) {
      contexts.push({
        key: 'process-unassigned-stage',
        title: '未放入阶段',
        subtitle: '流程尚未归入任何阶段',
        sortKey: [2, 9999, 9999, 9999, 9999],
      });
    }

    return contexts;
  },

  buildProcessContextGroups(processes, doc = S.doc) {
    const groupMap = new Map();
    for (const proc of processes) {
      const contexts = this.getProcessPanoramaContexts(proc, doc);
      for (const context of contexts) {
        if (!groupMap.has(context.key)) {
          groupMap.set(context.key, {
            key: context.key,
            name: context.title,
            subtitle: context.subtitle,
            sortKey: context.sortKey,
            items: [],
            processIds: new Set(),
          });
        }
        const group = groupMap.get(context.key);
        const procId = String(proc.id || '').trim();
        if (!group.processIds.has(procId)) {
          group.processIds.add(procId);
          group.items.push(proc);
        }
      }
    }
    return Array.from(groupMap.values())
      .sort((left, right) => {
        for (let index = 0; index < Math.max(left.sortKey.length, right.sortKey.length); index += 1) {
          const diff = (left.sortKey[index] ?? 0) - (right.sortKey[index] ?? 0);
          if (diff) return diff;
        }
        return left.name.localeCompare(right.name, 'zh-Hans-CN');
      })
      .map((group) => {
        group.items.sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'zh-Hans-CN'));
        delete group.processIds;
        return group;
      });
  },

  getProcessRoleContextLabel(proc) {
    const context = this.getProcessPanoramaContexts(proc)[0];
    if (!context) return '';
    if (context.title === '未放入阶段') return context.title;
    return `${context.title} · ${context.subtitle.replace(/^阶段：/, '')}`;
  },

  getFirstRoleIdForProcess(proc) {
    if (!proc) return '';
    for (const node of getProcNodes(proc)) {
      const roleId = getTaskRoleIds(node)[0];
      if (roleId && getRoleById(roleId)) return roleId;
    }
    return '';
  },

  openRoleProjection() {
    const roleId = this.getFirstRoleIdForProcess(currentProc());
    if (roleId) S.ui.roleId = roleId;
    setProcView('role');
  },
  renderManagement(selectedDomainId = 'all') {
    return this.renderSummaryCard(this.getRolesForDomainInfo(selectedDomainId), selectedDomainId);
  },

  openRoleView(roleId) {
    ensureSelectedRole(roleId);
    S.ui.mainTab = 'processWorkbench';
    S.ui.tab = 'process';
    S.ui.procView = 'role';
    render();
  },

  renderSummaryCard(roles = getRoles(), selectedDomainId = 'all') {
    const roleGroups = this.getGroupedRolesForDomainInfo(roles);
    const summary = this.getRoleSummaryCountsForDomainInfo(roles, selectedDomainId);
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
        <input id="role-create-input" class="role-light-input" type="text" placeholder="角色名称" onkeydown="if(event.key==='Enter')window.RoleWorkbench.addRole()">
        <select id="role-create-group-select" class="role-light-group-select" onchange="window.RoleWorkbench.onRoleGroupSelectChange(this.value)">
          ${groupOptions}
          <option value="__custom__">新建分组...</option>
        </select>
        <span id="role-create-group-custom-wrap" class="role-light-group-custom hidden">
          <input id="role-create-group-custom" class="role-light-group-input" type="text" placeholder="输入新分组" onkeydown="if(event.key==='Enter')window.RoleWorkbench.addRole()">
        </span>
        <button class="btn btn-outline btn-sm" data-testid="role-add-button" onclick="window.RoleWorkbench.addRole()">添加角色</button>
        <button class="btn btn-outline btn-sm" data-testid="role-view-entry" onclick="window.RoleWorkbench.openRoleView('${esc(ensureSelectedRole() || '')}')">角色视图</button>
      </div>
    `;

    let html = `<div class="ctx-card domain-panel role-light-card" data-testid="role-summary-card">
      ${renderDomainPanelHeader('角色管理', '', actions, { badge: summaryText.join(' · ') })}`;

    if (roleGroups.length) {
      html += '<div class="role-light-groups">';
      roleGroups.forEach(({ name, roles: groupRoles }) => {
        const collapseKey = `rolegrp-${name}`;
        const collapsed = S.ui.sbCollapse[collapseKey] === true;
        html += `<div class="role-light-group" data-role-group="${esc(name)}">
          <button type="button" class="role-light-group-head" onclick="toggleDomainSection('${esc(collapseKey)}')">
            <span class="role-light-group-title">
              <span class="role-light-group-caret">${collapsed ? '▸' : '▾'}</span>
              <span>${esc(name)}</span>
            </span>
            <span class="role-light-group-meta">${groupRoles.length} 角色</span>
          </button>`;
        if (!collapsed) {
          html += '<div class="role-light-list">';
          groupRoles.forEach((role) => {
            const removable = getRoleUsageSummary(role.id).taskCount === 0;
            html += `<div class="role-light-chip-wrap">
              <button class="role-light-chip" data-role-id="${esc(role.id)}" data-testid="role-summary-chip" title="${esc(`${role.name}\n分组：${getRoleGroupName(role)}`)}" onclick="window.RoleWorkbench.openRoleView('${esc(role.id)}')">
                <span class="role-light-name">${esc(role.name)}</span>
                <span class="role-light-count">${this.getLightRoleSummary(role, selectedDomainId)}</span>
              </button>
              ${removable ? `<button class="role-light-remove" title="删除未使用角色" onclick="window.RoleWorkbench.removeRole('${esc(role.id)}')">×</button>` : ''}
            </div>`;
          });
          html += '</div>';
        }
        html += '</div>';
      });
      html += '</div>';
    } else {
      html += '<p class="no-refs domain-panel-empty">暂无角色，先在流程任务里明确执行角色，再回到这里统一整理。</p>';
    }

    html += '</div>';
    return html;
  },

  buildUsecaseMap(selectedRole, options = {}) {
    const readonly = Boolean(options.readonly);
    const usageByProcess = selectedRole ? getRoleUsageByProcess(selectedRole.id) : new Map();
    const participatingOnly = Boolean(options.participatingOnly && selectedRole);
    const roleGroups = participatingOnly
      ? [{ name: getRoleGroupName(selectedRole), roles: [selectedRole] }]
      : getGroupedRoles();
    const processes = participatingOnly
      ? Array.from(usageByProcess.values()).map(({ proc }) => proc)
      : (S.doc?.processes || []);
    const processGroups = this.buildProcessContextGroups(processes);

    const roleFrames = [];
    const roleNodes = [];
    let roleY = 24;
    for(const group of roleGroups) {
      const frameHeight = 48 + group.roles.length * 46;
      roleFrames.push({ name: group.name, x: 24, y: roleY, width: 250, height: frameHeight });
      group.roles.forEach((role, index) => {
        roleNodes.push({
          role,
          x: 42,
          y: roleY + 34 + index * 42,
          width: 214,
          height: 32,
        });
      });
      roleY += frameHeight + 18;
    }

    const processFrames = [];
    const processNodes = [];
    const columnX = [340, 650];
    const columnHeights = [24, 24];
    for(const group of processGroups) {
      const frameHeight = 72 + group.items.length * 40;
      const columnIndex = columnHeights[0] <= columnHeights[1] ? 0 : 1;
      const frameX = columnX[columnIndex];
      const frameY = columnHeights[columnIndex];
      processFrames.push({ name: group.name, subtitle: group.subtitle, x: frameX, y: frameY, width: 270, height: frameHeight });
      group.items.forEach((proc, index) => {
        processNodes.push({
          proc,
          groupKey: group.key,
          x: frameX + 18,
          y: frameY + 54 + index * 36,
          width: 234,
          height: 28,
        });
      });
      columnHeights[columnIndex] += frameHeight + 18;
    }

    const canvasHeight = Math.max(roleY, ...columnHeights) + 24;
    const selectedNode = selectedRole ? roleNodes.find((node) => node.role.id === selectedRole.id) : null;

    const lines = selectedNode ? processNodes
      .filter((node) => usageByProcess.has(node.proc.id))
      .map((node) => {
        const taskCount = usageByProcess.get(node.proc.id).tasks.length;
        const startX = selectedNode.x + selectedNode.width;
        const startY = selectedNode.y + selectedNode.height / 2;
        const endX = node.x;
        const endY = node.y + node.height / 2;
        const midX = startX + (endX - startX) / 2;
        return {
          path: `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`,
          taskCount,
          labelX: midX + 4,
          labelY: endY - 6,
        };
      })
      : [];

    return `<div class="role-usecase-map-wrap${participatingOnly ? ' focused' : ''}" data-testid="role-usecase-map">
      <div class="role-usecase-map-canvas" style="min-width:980px;height:${canvasHeight}px">
        <svg class="role-usecase-map-svg" width="980" height="${canvasHeight}" viewBox="0 0 980 ${canvasHeight}" preserveAspectRatio="none">
          ${lines.map((line) => `
            <path d="${line.path}" class="role-usecase-line"></path>
            <text x="${line.labelX}" y="${line.labelY}" class="role-usecase-line-label">${line.taskCount}N</text>
          `).join('')}
        </svg>
        ${roleFrames.map((frame) => `
          <div class="role-usecase-group role-side-group" style="left:${frame.x}px;top:${frame.y}px;width:${frame.width}px;height:${frame.height}px">
            <div class="role-usecase-group-title">${esc(frame.name)}</div>
          </div>
        `).join('')}
        ${processFrames.map((frame) => `
          <div class="role-usecase-group role-proc-group" style="left:${frame.x}px;top:${frame.y}px;width:${frame.width}px;height:${frame.height}px">
            <div class="role-usecase-group-title">
              <span>${esc(frame.name)}</span>
              ${frame.subtitle ? `<small>${esc(frame.subtitle)}</small>` : ''}
            </div>
          </div>
        `).join('')}
        ${roleNodes.map((node) => {
          const active = selectedRole?.id === node.role.id ? ' active' : '';
          const usage = getRoleUsageSummary(node.role.id);
          const tagName = readonly ? 'div' : 'button';
          const actionAttr = readonly ? '' : ` type="button" onclick="S.ui.roleId='${esc(node.role.id)}';renderProcessTab()"`;
          return `<${tagName} class="role-usecase-role${active}${readonly ? ' readonly' : ''}" data-role-id="${esc(node.role.id)}"
            style="left:${node.x}px;top:${node.y}px;width:${node.width}px;height:${node.height}px"${actionAttr}>
            <span class="role-usecase-role-name">${esc(node.role.name)}</span>
            <span class="role-usecase-role-meta">${usage.processCount}P · ${usage.taskCount}N</span>
          </${tagName}>`;
        }).join('')}
        ${processNodes.map((node) => {
          const linked = usageByProcess.has(node.proc.id) ? ' linked' : '';
          const taskCount = usageByProcess.has(node.proc.id) ? usageByProcess.get(node.proc.id).tasks.length : 0;
          const tagName = readonly ? 'div' : 'button';
          const actionAttr = readonly ? '' : ` type="button" onclick="navigate('process',{procId:'${esc(node.proc.id)}',taskId:null})"`;
          return `<${tagName} class="role-usecase-process${linked}${readonly ? ' readonly' : ''}" data-process-id="${esc(node.proc.id)}"
            style="left:${node.x}px;top:${node.y}px;width:${node.width}px;height:${node.height}px"${actionAttr}>
            <span class="role-usecase-process-name">${esc(node.proc.name || '未命名流程')}</span>
            ${taskCount ? `<span class="role-usecase-process-count">${taskCount}N</span>` : ''}
          </${tagName}>`;
        }).join('')}
      </div>
    </div>`;
  },

  renderProcessRoleView() {
    const roles = getRoles();
    ensureSelectedRole();
    const selectedRole = getRoleById(S.ui.roleId);
    if(!roles.length) {
      return `<div class="proc-role-empty" data-testid="process-role-view">
        <p>暂无角色词典，请先到业务域页新增角色。</p>
        <button class="btn btn-outline btn-sm" onclick="navigate('domain')">前往角色管理</button>
      </div>`;
    }

    const usageByProcess = selectedRole ? getRoleUsageByProcess(selectedRole.id) : new Map();
    const selectedSummary = selectedRole ? getRoleUsageSummary(selectedRole.id) : { processCount: 0, taskCount: 0 };
    const participatingOnly = Boolean(S.ui.roleParticipatingOnly);

    const detail = selectedRole ? `
      <div class="proc-role-detail-head">
        <div>
          <div class="proc-role-detail-title">${esc(selectedRole.name)}</div>
          <div class="proc-role-detail-subtitle">${selectedRole.desc ? esc(selectedRole.desc) : '当前角色参与的流程与节点'} · 分组：${esc(getRoleGroupName(selectedRole))}</div>
        </div>
        <div class="proc-role-detail-badges">
          <span class="proc-role-badge">流程 ${selectedSummary.processCount}</span>
          <span class="proc-role-badge">节点 ${selectedSummary.taskCount}</span>
        </div>
      </div>
      ${usageByProcess.size ? Array.from(usageByProcess.values()).map(({ proc, tasks }) => `
        <div class="proc-role-usage-card">
          <div class="proc-role-usage-head">
            <div>
              <span class="proc-role-usage-proc">${esc(proc.name || '未命名流程')}</span>
              ${this.getProcessRoleContextLabel(proc) ? `<span class="proc-role-usage-subdomain">${esc(this.getProcessRoleContextLabel(proc))}</span>` : ''}
            </div>
            <button class="btn btn-ghost-sm" onclick="navigate('process',{procId:'${esc(proc.id)}',taskId:null})">查看流程</button>
          </div>
          <div class="proc-role-task-list">
            ${tasks.map((task, index) => {
              const nodeTaskCount = getNodeOrchestrationTasks(task).length;
              const nodeName = String(task.name || '').trim() || `未命名节点 ${index + 1}`;
              return `<button class="role-task-chip" data-testid="role-view-task-chip"
              onclick="navigate('process',{procId:'${esc(proc.id)}',taskId:'${esc(task.id)}'})">
              ${esc(nodeName)}${nodeTaskCount ? ` · ${nodeTaskCount} 任务` : ''}
            </button>`;
            }).join('')}
          </div>
        </div>
      `).join('') : '<p class="no-refs">当前角色尚未被任何节点引用</p>'}
    ` : '<p class="no-refs">请选择一个角色查看参与的流程</p>';

    return `<div class="proc-role-view" data-testid="process-role-view">
      <div class="proc-role-map-panel">
        <div class="proc-role-map-head">
          <div class="proc-role-map-title">
            角色用例图
            <span class="inline-help" tabindex="0" data-tip="全局展示角色参与的流程模板。点击左侧角色可高亮它参与的流程，点击流程可进入编辑。">?</span>
          </div>
          <div class="proc-role-map-tools">
            ${selectedRole ? `<label class="role-focus-toggle">
              <input type="checkbox" data-testid="role-participating-only-toggle"
                ${participatingOnly ? 'checked' : ''}
                onchange="S.ui.roleParticipatingOnly=this.checked;renderProcessTab()">
              <span>只看参与流程</span>
            </label>` : ''}
            ${selectedRole ? `<div class="proc-role-map-focus" data-testid="role-projection-summary">当前角色：${esc(selectedRole.name)} · 涉及流程 ${selectedSummary.processCount} · 涉及节点 ${selectedSummary.taskCount}${participatingOnly ? ' · 只显示参与流程' : ' · 全局视图'}</div>` : ''}
          </div>
        </div>
        ${this.buildUsecaseMap(selectedRole, { participatingOnly })}
      </div>
      <div class="proc-role-detail">${detail}</div>
    </div>`;
  },
};
