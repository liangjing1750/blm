import { LEGACY_RUNTIME_SCRIPTS } from './legacy-runtime.manifest';

declare global {
  interface Window {
    __BLM_LEGACY_RUNTIME_READY__?: Promise<void>;
    __BLM_LEGACY_RUNTIME_LOADED__?: boolean;
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load legacy script: ${src}`));
    document.body.appendChild(script);
  });
}

export async function loadLegacyRuntime(): Promise<void> {
  if (window.__BLM_LEGACY_RUNTIME_LOADED__) {
    return;
  }

  window.__BLM_LEGACY_RUNTIME_READY__ ??= (async () => {
    for (const script of LEGACY_RUNTIME_SCRIPTS) {
      await loadScript(script);
    }
    window.__BLM_LEGACY_RUNTIME_LOADED__ = true;
  })();

  await window.__BLM_LEGACY_RUNTIME_READY__;
}

export function resetLegacyRuntimeForTests(): void {
  window.__BLM_LEGACY_RUNTIME_READY__ = undefined;
  window.__BLM_LEGACY_RUNTIME_LOADED__ = false;
}
