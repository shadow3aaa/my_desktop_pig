import pigSvg from './pig.svg?raw';
import { PetBehavior, INTENTS } from './behavior';
import { MotionSystem } from './motion';
import { SvgRenderer } from './renderer';
import type { HostEvent, Intent, PetHost } from './types';
/** One clock and one renderer per pet. Both hosts instantiate this exact implementation. */
export class PetRuntime {
    readonly motion = new MotionSystem();
    behavior!: PetBehavior;
    private renderer: SvgRenderer;
    private raf = 0;
    private last = 0;
    private paused = false;
    private suspended = false;
    private disposed = false;
    private ready = false;
    private pendingEvents: HostEvent[] = [];
    private lastMove = '';
    private resizeRevision = 0;
    private lifecycle = new AbortController();
    private reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
    private onReduced = (event: MediaQueryListEvent) => { this.motion.reduced = event.matches; this.draw(); };
    constructor(private root: HTMLElement, private host: PetHost) {
        root.className = 'pet-shell';
        root.innerHTML = pigSvg;
        root.tabIndex = 0;
        root.setAttribute('role', 'button');
        root.setAttribute('aria-label', '小猪：拖动移动，空格逗逗它，S 睡眠，D 跳舞，P 暂停');
        this.renderer = new SvgRenderer(root.querySelector('svg')!);
        this.motion.reduced = this.reducedQuery.matches;
    }
    async start() {
        this.behavior = new PetBehavior(await this.host.init(event => this.receive(event)));
        if (this.disposed)
            return;
        this.ready = true;
        for (const event of this.pendingEvents)
            this.receive(event);
        this.pendingEvents = [];
        const { signal } = this.lifecycle;
        this.root.addEventListener('pointerdown', event => {
            if (event.button === 0 && this.host.startDrag)
                void this.host.startDrag(event).catch(error => this.fail(error));
        }, { signal });
        this.root.addEventListener('dblclick', () => this.request(this.sleeping ? 'wake' : 'sleep'), { signal });
        this.root.addEventListener('keydown', event => {
            const key = event.key.toLowerCase();
            if (key === ' ' || key === 'enter') {
                event.preventDefault();
                if (this.sleeping)
                    this.request('wake');
                else
                    this.motion.greet();
            }
            else if (key === 'p')
                this.setPaused(!this.paused);
            else if (key === 's')
                this.request(this.sleeping ? 'wake' : 'sleep');
            else if (key === 'd')
                this.request('dance');
            else if (key === 'escape')
                this.request('idle');
            else if (key === 'arrowleft' || key === 'arrowright') {
                event.preventDefault();
                this.request('walk');
            }
        }, { signal });
        document.addEventListener('visibilitychange', () => { this.last = 0; if (document.hidden)
            this.stopClock();
        else
            this.startClock(); }, { signal });
        this.reducedQuery.addEventListener('change', this.onReduced);
        this.draw();
        this.startClock();
    }
    get sleeping() { return this.behavior.state === 'Sleeping' || this.behavior.state === 'FallingAsleep'; }
    request(intent: Intent) {
        if (!INTENTS.includes(intent))
            throw new TypeError('Unknown action');
        this.setPaused(false);
        this.behavior.request(intent);
        if (this.behavior.state !== 'Walking')
            this.host.cancelMoves();
        this.draw();
    }
    setPaused(value: boolean) {
        this.paused = value;
        this.last = 0;
        if (value) {
            this.host.cancelMoves();
            this.stopClock();
        }
        else
            this.startClock();
        this.root.dataset.paused = String(value);
    }
    receive(event: HostEvent) {
        if (this.disposed)
            return;
        if (!this.ready) {
            this.pendingEvents.push(event);
            return;
        }
        switch (event.type) {
            case 'context':
                this.behavior.setContext(event.context);
                break;
            case 'drag-start':
                this.host.cancelMoves();
                this.setPaused(false);
                this.behavior.dragStart();
                break;
            case 'drag-end':
                this.behavior.dragEnd(event.context, event.sleepAnchor);
                this.motion.land();
                this.lastMove = '';
                break;
            case 'music':
                this.behavior.setMusicPlaying(event.playing);
                if (this.behavior.state !== 'Walking')
                    this.host.cancelMoves();
                break;
            case 'suspend':
                this.suspended = event.suspended;
                this.last = 0;
                if (event.suspended) {
                    this.host.cancelMoves();
                    this.stopClock();
                }
                else
                    this.startClock();
                break;
            case 'size': {
                const revision = ++this.resizeRevision;
                this.host.cancelMoves();
                void this.host.resize(Math.max(80, Math.min(320, event.size))).then(context => { if (!this.disposed && revision === this.resizeRevision) {
                    this.behavior.setContext(context);
                    this.lastMove = '';
                } }).catch(error => this.fail(error));
                break;
            }
            case 'action':
                if (event.action === 'pause')
                    this.setPaused(true);
                else if (event.action === 'resume')
                    this.setPaused(false);
                else if (event.action === 'toggle-pause')
                    this.setPaused(!this.paused);
                else if (event.action === 'reduce')
                    this.motion.reduced = !this.motion.reduced;
                else if (event.action === 'toggle-sleep')
                    this.request(this.sleeping ? 'wake' : 'sleep');
                else
                    this.request(event.action);
                break;
        }
        this.draw();
    }
    private frame = (now: number) => {
        this.raf = 0;
        if (this.disposed || this.paused || this.suspended || document.hidden)
            return;
        // Bound expensive path/filter writes to 30 fps. Native drag remains controlled by the OS.
        if (!this.last || now - this.last >= 32) {
            const dt = this.last ? Math.min((now - this.last) / 1000, .05) : 0;
            this.last = now;
            this.behavior.step(dt, this.motion.reduced);
            this.motion.step(dt, this.behavior.state);
            if (this.behavior.state !== 'Dragged') {
                const point = { x: Math.round(this.behavior.position.x), y: Math.round(this.behavior.position.y) };
                const key = `${point.x},${point.y}`;
                if (key !== this.lastMove) {
                    this.lastMove = key;
                    void this.host.moveTo(point).catch(error => this.fail(error));
                }
            }
            this.draw();
        }
        this.startClock();
    };
    private startClock() { if (this.ready && !this.disposed && !this.paused && !this.suspended && !document.hidden && !this.raf)
        this.raf = requestAnimationFrame(this.frame); }
    private stopClock() { cancelAnimationFrame(this.raf); this.raf = 0; }
    private draw() { if (this.ready && !this.disposed) {
        this.renderer.render(this.motion.sample(), this.behavior.facing);
        this.root.dataset.state = this.behavior.state;
    } }
    private fail(error: unknown) { console.error('Pet host failed', error); this.setPaused(true); this.root.dataset.error = String(error); }
    snapshot() { return { ...this.behavior.snapshot(), paused: this.paused, reduced: this.motion.reduced, pose: this.motion.sample() }; }
    suspend(value: boolean) { this.receive({ type: 'suspend', suspended: value }); }
    dispose() { this.disposed = true; this.stopClock(); this.lifecycle.abort(); this.reducedQuery.removeEventListener('change', this.onReduced); this.host.dispose(); this.pendingEvents = []; }
}
