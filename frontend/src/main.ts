import './styles.css';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { PetRuntime } from './pet/runtime';
import { TauriHost } from './hosts/tauri';
import { BrowserHost } from './hosts/browser';
import { bootAndroidLauncher } from './launcher';
import type { HostEvent } from './pet/types';
const root = document.getElementById('app')!;
async function bootstrap() {
    const native = isTauri();
    if (native && await invoke<string>('runtime_platform') === 'android') {
        await bootAndroidLauncher(root);
        return;
    }
    const runtime = new PetRuntime(root, native ? new TauriHost() : new BrowserHost(root));
    await runtime.start();
    if (native) await invoke('pet_frontend_ready', { state: runtime.snapshot().state, svgCount: root.querySelectorAll('svg').length });
    if (!native) {
        document.body.classList.add('browser-preview');
        const controls = document.createElement('nav');
        controls.className = 'dev-controls';
        controls.setAttribute('aria-label', '本地桌宠检查');
        controls.innerHTML = '<button data-action="idle">待机</button><button data-action="walk">散步</button><button data-action="dance">跳舞</button><button data-action="sleep">睡觉</button><button data-action="wake">唤醒</button><button data-action="toggle-pause">暂停/继续</button><button data-action="reduce">减少动态</button><select aria-label="显示尺寸"><option>80</option><option selected>120</option><option>160</option><option>240</option></select>';
        controls.addEventListener('click', event => {
            const action = (event.target as HTMLElement).dataset.action;
            if (action)
                runtime.receive({ type: 'action', action } as HostEvent);
        });
        controls.querySelector('select')!.addEventListener('change', event => runtime.receive({ type: 'size', size: Number((event.target as HTMLSelectElement).value) }));
        document.body.append(controls);
        Object.defineProperty(window, 'pigDiagnostics', { value: { snapshot: () => runtime.snapshot() } });
    }
    window.addEventListener('pagehide', event => { if (event.persisted)
        runtime.suspend(true);
    else
        runtime.dispose(); });
    window.addEventListener('pageshow', event => { if (event.persisted)
        runtime.suspend(false); });
}
void bootstrap().catch(error => { console.error(error); root.textContent = `小猪启动失败：${String(error)}`; root.className = 'startup-error'; });
