import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow, currentMonitor, LogicalSize, PhysicalPosition } from '@tauri-apps/api/window';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { LatestMoveQueue } from '../pet/move-queue';
import type { HostContext, HostEvent, PetHost, Vec2 } from '../pet/types';
/** Desktop-only window/input/media adapter. All animation and policy lives in pet/. */
export class TauriHost implements PetHost {
    private window = getCurrentWindow();
    private emit!: (event: HostEvent) => void;
    private listeners: UnlistenFn[] = [];
    private disposed = false;
    private dragging = false;
    private metrics: HostContext | null = null;
    private dragGeneration = 0;
    private moves = new LatestMoveQueue(point => this.window.setPosition(new PhysicalPosition(point.x, point.y)), error => { console.error('Window move failed', error); this.emit({ type: 'action', action: 'pause' }); });
    async context(): Promise<HostContext> {
        const [position, size, monitor, scaleFactor] = await Promise.all([this.window.outerPosition(), this.window.outerSize(), currentMonitor(), this.window.scaleFactor()]);
        const area = monitor?.workArea;
        const context = { position: { x: position.x, y: position.y }, windowSize: { width: size.width, height: size.height }, scaleFactor,
            monitor: area ? { x: area.position.x, y: area.position.y, width: area.size.width, height: area.size.height } : null };
        this.metrics = context;
        return context;
    }
    async init(emit: (event: HostEvent) => void) {
        this.emit = emit;
        // Acquire cleanup handles sequentially so a partially failed initialization can dispose them.
        try {
            this.listeners.push(await this.window.onMoved(({ payload }) => {
                if (this.dragging && this.metrics && !this.disposed) emit({ type: 'context', context: { ...this.metrics, position: { x: payload.x, y: payload.y } } });
            }));
            this.listeners.push(await this.window.onScaleChanged(() => { this.cancelMoves(); void this.context().then(context => { if (!this.disposed)
                emit({ type: 'context', context }); }); }));
            this.listeners.push(await this.window.listen<{
                playing: boolean;
            }>('pet://music-state', event => emit({ type: 'music', playing: event.payload.playing })));
            this.listeners.push(await this.window.listen<HostEvent>('pet://host', event => emit(event.payload)));
            emit({ type: 'music', playing: await invoke<boolean>('pet_music_playing') });
            return await this.context();
        }
        catch (error) {
            this.dispose();
            throw error;
        }
    }
    async moveTo(position: Vec2) { if (!this.dragging && !this.disposed)
        this.moves.enqueue(position); }
    cancelMoves() { this.moves.cancel(); }
    async startDrag(event: PointerEvent) {
        if (this.dragging || this.disposed)
            return;
        event.preventDefault();
        this.dragging = true;
        const generation = ++this.dragGeneration;
        this.emit({ type: 'drag-start' });
        await this.moves.drain();
        try {
            await this.window.startDragging();
            // Native move loops consume WebView pointerup. Poll actual button state, never infer release
            // from a stationary cursor (which used to end a held drag after 120 ms).
            while (!this.disposed && generation === this.dragGeneration && await invoke<boolean>('pet_pointer_pressed'))
                await new Promise(resolve => setTimeout(resolve, 50));
        }
        finally {
            if (!this.disposed && generation === this.dragGeneration) {
                this.dragging = false;
                const context = await this.context();
                const sleepAnchor = await invoke<Vec2 | null>('pet_find_drag_sleep_anchor', { context }).catch(() => null);
                if (!this.disposed && generation === this.dragGeneration) this.emit({ type: 'drag-end', context, sleepAnchor });
            }
        }
    }
    async resize(size: number) { await this.window.setSize(new LogicalSize(size, size)); return this.context(); }
    dispose() { this.disposed = true; this.dragGeneration++; this.moves.dispose(); for (const unlisten of this.listeners)
        unlisten(); this.listeners = []; }
}
