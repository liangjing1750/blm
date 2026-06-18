import { AngularRuntimeState } from '../../runtime/angular-runtime';

export class ShellLayoutQuery {
  // 模块意图：集中回答 shell 布局的只读状态问题，避免页面组件散落判断导航显隐。
  constructor(private readonly runtime: AngularRuntimeState) {}

  showWorkbenchTabs(): boolean {
    return this.hasDocument();
  }

  showSidebar(): boolean {
    return this.hasDocument();
  }

  showBackAction(): boolean {
    return this.hasDocument();
  }

  hasDocument(): boolean {
    return !!this.runtime.currentFile;
  }
}
