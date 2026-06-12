import { DOCUMENT } from '@angular/common';
import { ApplicationRef, ComponentRef, EnvironmentInjector, Inject, Injectable, createComponent } from '@angular/core';
import { ValueDomainWorkbenchComponent } from '../../workbenches/panorama/value-domain-workbench.component';

declare global {
  interface Window {
    BlmAngularMounts?: {
      mountValueDomain: (hostId: string) => void;
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
      mountValueDomain: (hostId: string) => this.mountValueDomain(hostId),
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

  unmount(hostId: string): void {
    const current = this.mounts.get(hostId);
    if (!current) return;
    this.appRef.detachView(current.hostView);
    current.destroy();
    this.mounts.delete(hostId);
  }
}
