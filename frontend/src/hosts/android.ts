import type { HostContext, HostEvent, PetHost, Vec2 } from '../pet/types';
interface OverlayBridge {
    context(): string;
    musicPlaying(): boolean;
    moveTo(x: number, y: number): void;
    cancelMoves(): void;
    resize(size: number): void;
}
declare global {
    interface Window {
        PigOverlayBridge?: OverlayBridge;
        petHost?: {
            receive(event: HostEvent): void;
        };
    }
}
/** The native overlay owns touch/window resources; the common runtime owns every state. */
export class AndroidHost implements PetHost {
    private bridge: OverlayBridge;
    private disposed = false;
    constructor() { if (!window.PigOverlayBridge)
        throw new Error('Android overlay bridge unavailable'); this.bridge = window.PigOverlayBridge; }
    async init(emit: (event: HostEvent) => void): Promise<HostContext> {
        window.petHost = { receive: event => { if (!this.disposed)
                emit(event); } };
        emit({ type: 'music', playing: this.bridge.musicPlaying() });
        return JSON.parse(this.bridge.context()) as HostContext;
    }
    async moveTo(point: Vec2) { if (!this.disposed)
        this.bridge.moveTo(point.x, point.y); }
    cancelMoves() { if (!this.disposed) this.bridge.cancelMoves(); }
    async resize(size: number) { this.bridge.resize(size); return JSON.parse(this.bridge.context()) as HostContext; }
    dispose() { this.disposed = true; delete window.petHost; }
}
