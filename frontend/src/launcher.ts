import { invoke } from '@tauri-apps/api/core';
export async function bootAndroidLauncher(container: HTMLElement) {
    container.className = 'android-launcher';
    container.innerHTML = `<section class="android-panel"><h1>小猪桌宠</h1><p data-status class="android-status">正在检查权限…</p><div class="android-actions"><button data-command="request_overlay_permission">允许悬浮窗权限</button><button data-command="show_overlay">显示小猪</button><button data-command="hide_overlay">隐藏小猪</button><button data-action="toggle-sleep">睡觉 / 唤醒</button><button data-action="toggle-pause">暂停 / 继续</button><button data-action="dance">跳舞</button><button data-action="idle">待机</button></div></section>`;
    const status = container.querySelector<HTMLElement>('[data-status]')!;
    const refresh = async () => {
        const granted = await invoke<boolean>('overlay_permission_status');
        const visible = granted && await invoke<boolean>('overlay_visible');
        status.textContent = !granted ? '请先允许悬浮窗权限。' : visible ? '小猪已显示，可以拖动或双击切换睡眠。' : '权限已授予，点击显示小猪。';
    };
    container.addEventListener('click', async (event) => {
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
        if (!button)
            return;
        try {
            if (button.dataset.action)
                await invoke('overlay_action', { action: button.dataset.action });
            else if (button.dataset.command)
                await invoke(button.dataset.command);
            await refresh();
        }
        catch (error) {
            status.textContent = `操作失败：${String(error)}`;
        }
    });
    await refresh();
}
