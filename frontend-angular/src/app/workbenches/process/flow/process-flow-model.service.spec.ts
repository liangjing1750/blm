import { describe, expect, it } from 'vitest';
import { getAngularRuntimeState } from '../../../core/runtime/angular-runtime';
import { ProcessFlowModelService } from './process-flow-model.service';

describe('ProcessFlowModelService', () => {
  it('keeps canonical role uid fields when updating process node roles', () => {
    getAngularRuntimeState().doc.roles = [
      { uid: 'role-a', id: 'role-a', name: '经办人' },
      { uid: 'role-b', id: 'role-b', name: '复核人' },
    ];
    const service = new ProcessFlowModelService();
    const task = {
      uid: 'node-1',
      roleIds: ['role-a', 'role-b'],
      role_ids: ['role-a', 'role-b'],
      role_uids: ['role-a', 'role-b'],
      roles: ['经办人', '复核人'],
      role_id: 'role-a',
      role: 'role-a',
    };

    service.setTaskRoleIds(task, ['role-b']);

    expect(task.roleIds).toEqual(['role-b']);
    expect(task.role_ids).toEqual(['role-b']);
    expect(task.role_uids).toEqual(['role-b']);
    expect(task.roles).toEqual(['复核人']);
    expect(task.role_id).toBe('role-b');
    expect(task.role).toBe('复核人');

    service.setTaskRoleIds(task, []);

    expect(task.roleIds).toEqual([]);
    expect(task.role_ids).toEqual([]);
    expect(task.role_uids).toEqual([]);
    expect(task.roles).toEqual([]);
    expect(task.role_id).toBe('');
    expect(task.role).toBe('');
  });
});
