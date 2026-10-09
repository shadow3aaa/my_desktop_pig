import type { HostContext, HostEvent, PetHost, Vec2 } from '../pet/types';
/** Local development adapter; it exercises the same runtime as both native hosts. */
export class BrowserHost implements PetHost {
    private emit!: (event: HostEvent) => void;
    private position = { x: 100, y: 100 };
    private size = 120;
    private lifecycle = new AbortController();
    constructor(private root: HTMLElement) { root.style.position = 'absolute'; }
    context(): HostContext { return { position: { ...this.position }, windowSize: { width: this.size, height: this.size }, monitor: { x: 0, y: 0, width: innerWidth, height: innerHeight }, scaleFactor: 1 }; }
    async init(emit: (event: HostEvent) => void) {
        this.emit = emit;
        await this.moveTo(this.position);
        await this.resize(this.size);
        window.addEventListener('resize', () => emit({ type: 'context', context: this.context() }), { signal: this.lifecycle.signal });
        return this.context();
    }
    async moveTo(point: Vec2) { this.position = { ...point }; this.root.style.left = `${point.x}px`; this.root.style.top = `${point.y}px`; }
    cancelMoves() { }
    async startDrag(event: PointerEvent) {
        event.preventDefault();
        this.root.setPointerCapture(event.pointerId);
        const origin = { ...this.position }, x = event.clientX, y = event.clientY;
        this.emit({ type: 'drag-start' });
        const move = (next: PointerEvent) => {
            if (next.pointerId !== event.pointerId)
                return;
            void this.moveTo({ x: origin.x + next.clientX - x, y: origin.y + next.clientY - y });
            this.emit({ type: 'context', context: this.context() });
        };
        const end = (next: PointerEvent) => {
            if (next.pointerId !== event.pointerId)
                return;
            this.root.removeEventListener('pointermove', move);
            this.root.removeEventListener('pointerup', end);
            this.root.removeEventListener('pointercancel', end);
            this.root.removeEventListener('lostpointercapture', end);
            this.emit({ type: 'drag-end', context: this.context() });
        };
        this.root.addEventListener('pointermove', move, { signal: this.lifecycle.signal });
        for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
            this.root.addEventListener(type, end as EventListener, { signal: this.lifecycle.signal });
    }
    async resize(size: number) { this.size = size; this.root.style.width = `${size}px`; this.root.style.height = `${size}px`; return this.context(); }
    dispose() { this.lifecycle.abort(); }
}
