import { DOCUMENT } from '@angular/common';
import { ApplicationRef, ComponentRef, EnvironmentInjector, Inject, Injectable, createComponent } from '@angular/core';
import { ValueDomainWorkbenchComponent } from '../../workbenches/process/value-domain/value-domain-workbench.component';
import { RoleWorkbenchComponent } from '../../workbenches/role/role-workbench';
import { KnowledgeWorkbenchComponent } from '../../workbenches/knowledge/knowledge-workbench';
import { ProcessFlowWorkbenchComponent } from '../../workbenches/process/flow/process-flow-workbench.component';
import { ProcessEditorWorkbenchComponent } from '../../workbenches/process/editor/process-editor-workbench.component';
import { ProcessStageWorkbenchComponent } from '../../workbenches/process/stage/process-stage-workbench.component';
import { ProcessWorkbenchShellComponent } from '../../workbenches/process/shell/process-workbench-shell.component';

declare global {
  interface Window {
    BlmAngularMounts?: {
      mountRoleWorkbench: (hostId: string) => void;
      mountValueDomain: (hostId: string) => void;
      mountKnowledgeWorkbench: (hostId: string, tabId: string) => void;
      mountProcessStageWorkbench: (hostId: string) => void;
      mountProcessFlowWorkbench: (hostId: string) => void;
      mountProcessEditorWorkbench: (hostId: string) => void;
      mountProcessWorkbenchShell: (hostId: string) => void;
      setValueDomainEditing: (hostId: string, editing: boolean) => void;
      unmount: (hostId: string) => void;
    };
  }
}

@Injectable({ providedIn: 'root' })
export class AngularLegacyMounts {
  private readonly mounts = new Map<string, ComponentRef<unknown>>();

  constructor(
    private readonly appRef: ApplicationRef,
    private readonly environmentInjector: EnvironmentInjector,
    @Inject(DOCUMENT) private readonly documentRef: Document,
  ) {}

  expose(): void {
    window.BlmAngularMounts = {
      mountRoleWorkbench: (hostId: string) => this.mountRoleWorkbench(hostId),
      mountValueDomain: (hostId: string) => this.mountValueDomain(hostId),
      mountKnowledgeWorkbench: (hostId: string, tabId: string) => this.mountKnowledgeWorkbench(hostId, tabId),
      mountProcessStageWorkbench: (hostId: string) => this.mountProcessStageWorkbench(hostId),
      mountProcessFlowWorkbench: (hostId: string) => this.mountProcessFlowWorkbench(hostId),
      mountProcessEditorWorkbench: (hostId: string) => this.mountProcessEditorWorkbench(hostId),
      mountProcessWorkbenchShell: (hostId: string) => this.mountProcessWorkbenchShell(hostId),
      setValueDomainEditing: (hostId: string, editing: boolean) => this.setValueDomainEditing(hostId, editing),
      unmount: (hostId: string) => this.unmount(hostId),
    };
  }

  mountValueDomain(hostId: string): void {
    const host = this.documentRef.querySelector<HTMLElement>(`#${hostId}`);
    if (!host) return;
    this.unmount(hostId);
    const componentRef = createComponent(ValueDomainWorkbenchComponent, {
      environmentInjector: this.environmentInjector,
      hostElement: host,
    });
    this.appRef.attachView(componentRef.hostView);
    this.mounts.set(hostId, componentRef);
  }

  mountRoleWorkbench(hostId: string): void {
    const host = this.documentRef.querySelector<HTMLElement>(`#${hostId}`);
    if (!host) return;
    this.unmount(hostId);
    const componentRef = createComponent(RoleWorkbenchComponent, {
      environmentInjector: this.environmentInjector,
      hostElement: host,
    });
    this.appRef.attachView(componentRef.hostView);
    this.mounts.set(hostId, componentRef);
  }

  mountKnowledgeWorkbench(hostId: string, tabId: string): void {
    const host = this.documentRef.querySelector<HTMLElement>(`#${hostId}`);
    if (!host) return;
    this.unmount(hostId);
    const componentRef = createComponent(KnowledgeWorkbenchComponent, {
      environmentInjector: this.environmentInjector,
      hostElement: host,
    });
    componentRef.instance.setTabFromShell(tabId);
    this.appRef.attachView(componentRef.hostView);
    this.mounts.set(hostId, componentRef);
  }

  mountProcessStageWorkbench(hostId: string): void {
    const host = this.documentRef.querySelector<HTMLElement>(`#${hostId}`);
    if (!host) return;
    this.unmount(hostId);
    const componentRef = createComponent(ProcessStageWorkbenchComponent, {
      environmentInjector: this.environmentInjector,
      hostElement: host,
    });
    this.appRef.attachView(componentRef.hostView);
    this.mounts.set(hostId, componentRef);
  }

  mountProcessFlowWorkbench(hostId: string): void {
    const host = this.documentRef.querySelector<HTMLElement>(`#${hostId}`);
    if (!host) return;
    this.unmount(hostId);
    const componentRef = createComponent(ProcessFlowWorkbenchComponent, {
      environmentInjector: this.environmentInjector,
      hostElement: host,
    });
    this.appRef.attachView(componentRef.hostView);
    this.mounts.set(hostId, componentRef);
  }

  mountProcessEditorWorkbench(hostId: string): void {
    const host = this.documentRef.querySelector<HTMLElement>(`#${hostId}`);
    if (!host) return;
    this.unmount(hostId);
    const componentRef = createComponent(ProcessEditorWorkbenchComponent, {
      environmentInjector: this.environmentInjector,
      hostElement: host,
    });
    this.appRef.attachView(componentRef.hostView);
    this.mounts.set(hostId, componentRef);
  }

  mountProcessWorkbenchShell(hostId: string): void {
    const host = this.documentRef.querySelector<HTMLElement>(`#${hostId}`);
    if (!host) return;
    this.unmount(hostId);
    const componentRef = createComponent(ProcessWorkbenchShellComponent, {
      environmentInjector: this.environmentInjector,
      hostElement: host,
    });
    this.appRef.attachView(componentRef.hostView);
    this.mounts.set(hostId, componentRef);
  }

  setValueDomainEditing(hostId: string, editing: boolean): void {
    const current = this.mounts.get(hostId);
    if (!(current?.instance instanceof ValueDomainWorkbenchComponent)) return;
    current.instance.setEditingFromShell(editing);
  }

  unmount(hostId: string): void {
    const current = this.mounts.get(hostId);
    if (!current) return;
    this.appRef.detachView(current.hostView);
    current.destroy();
    this.mounts.delete(hostId);
  }
}
