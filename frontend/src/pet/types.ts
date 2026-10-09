export type Activity = 'Idle' | 'Walking' | 'Dancing' | 'Dragged' | 'FallingAsleep' | 'Sleeping' | 'WakingUp';
export type Intent = 'idle' | 'walk' | 'dance' | 'sleep' | 'wake';
export interface Vec2 {
    x: number;
    y: number;
}
export interface Bounds extends Vec2 {
    width: number;
    height: number;
}
/** Native coordinates are physical pixels; SVG/window display size is logical. */
export interface HostContext {
    position: Vec2;
    windowSize: {
        width: number;
        height: number;
    };
    monitor: Bounds | null;
    scaleFactor: number;
}
export type HostEvent = {
    type: 'context';
    context: HostContext;
} | {
    type: 'drag-start';
} | {
    type: 'drag-end';
    context: HostContext;
    sleepAnchor?: Vec2 | null;
} | {
    type: 'music';
    playing: boolean;
} | {
    type: 'action';
    action: Intent | 'pause' | 'resume' | 'toggle-pause' | 'toggle-sleep' | 'reduce';
} | {
    type: 'size';
    size: number;
} | {
    type: 'suspend';
    suspended: boolean;
};
export interface PetHost {
    init(emit: (event: HostEvent) => void): Promise<HostContext>;
    moveTo(position: Vec2): Promise<void>;
    cancelMoves(): void;
    startDrag?(event: PointerEvent): Promise<void>;
    resize(size: number): Promise<HostContext>;
    dispose(): void;
}
