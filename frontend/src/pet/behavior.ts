import type { Activity, HostContext, Intent, Vec2 } from './types';
export const INTENTS: readonly Intent[] = ['idle', 'walk', 'dance', 'sleep', 'wake'];
const states: Record<Intent, Activity> = { idle: 'Idle', walk: 'Walking', dance: 'Dancing', sleep: 'FallingAsleep', wake: 'WakingUp' };
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
const copyContext = (context: HostContext): HostContext => ({ ...context, position: { ...context.position }, windowSize: { ...context.windowSize }, monitor: context.monitor && { ...context.monitor } });
/** Pure state/locomotion policy shared by the desktop and overlay. No native bridge or DOM. */
export class PetBehavior {
    state: Activity = 'Idle';
    intent: Intent = 'idle';
    elapsed = 0;
    facing: 1 | -1 = 1;
    position: Vec2 = { x: 0, y: 0 };
    target: Vec2 | null = null;
    musicPlaying = false;
    automatic = true;
    private context: HostContext;
    private idleDuration: number;
    private sleepDuration = 6;
    private dragResume: Intent = 'idle';
    private pendingIntent: Intent | null = null;
    constructor(context: HostContext, private random: () => number = Math.random) {
        this.context = copyContext(context);
        this.position = { ...context.position };
        this.idleDuration = this.between(1.5, 3.5);
    }
    snapshot() { return { state: this.state, intent: this.intent, elapsed: this.elapsed, facing: this.facing, position: { ...this.position }, target: this.target && { ...this.target }, musicPlaying: this.musicPlaying }; }
    private between(a: number, b: number) { return a + this.random() * (b - a); }
    private transition(state: Activity) {
        if (this.state === state)
            return;
        this.state = state;
        this.elapsed = 0;
        if (state !== 'Walking')
            this.target = null;
        if (state === 'Idle')
            this.idleDuration = this.between(1.5, 3.5);
        if (state === 'Sleeping')
            this.sleepDuration = this.between(4, 8);
    }
    setContext(context: HostContext) {
        this.context = copyContext(context);
        const previous = this.position;
        this.position = { ...context.position };
        if (this.state === 'Dragged' && Math.abs(this.position.x - previous.x) > 1)
            this.facing = this.position.x > previous.x ? 1 : -1;
        if (this.state !== 'Dragged')
            this.position = this.bound(this.position);
        if (this.target)
            this.target = this.bound(this.target);
    }
    request(intent: Intent) {
        if (!INTENTS.includes(intent))
            throw new TypeError('Unknown pet intent');
        if (this.state === 'Dragged') {
            this.pendingIntent = intent;
            return;
        }
        this.intent = intent;
        if (intent === 'sleep' && (this.state === 'Sleeping' || this.state === 'FallingAsleep'))
            return;
        if (intent === 'walk') {
            const target = this.chooseTarget();
            if (!target) {
                this.transition('Idle');
                return;
            }
            this.target = target;
            this.facing = target.x >= this.position.x ? 1 : -1;
        }
        this.transition(states[intent]);
    }
    setMusicPlaying(playing: boolean) {
        if (this.musicPlaying === playing)
            return;
        this.musicPlaying = playing;
        if (this.state === 'Dragged')
            return;
        if (playing)
            this.request('dance');
        else if (this.state === 'Dancing')
            this.request('idle');
    }
    dragStart() {
        if (this.state === 'Dragged')
            return;
        this.dragResume = !this.musicPlaying && this.intent === 'dance' ? 'dance' : 'idle';
        this.pendingIntent = null;
        this.transition('Dragged');
    }
    dragEnd(context: HostContext, sleepAnchor?: Vec2 | null) {
        if (this.state !== 'Dragged')
            return;
        this.setContext(context);
        this.position = this.bound(sleepAnchor ?? this.position);
        const next = this.pendingIntent ?? (this.musicPlaying ? 'dance' : sleepAnchor ? 'sleep' : this.dragResume);
        this.pendingIntent = null;
        this.transition('Idle');
        this.request(next);
        // Give the released pig a quiet moment, instead of immediately choosing another action.
        if (next === 'idle')
            this.idleDuration = 2.5;
    }
    private bound(point: Vec2): Vec2 {
        const monitor = this.context.monitor;
        if (!monitor)
            return { ...point };
        const inset = 8 * this.context.scaleFactor;
        const minX = monitor.x + inset, minY = monitor.y + inset;
        return { x: clamp(point.x, minX, Math.max(minX, monitor.x + monitor.width - this.context.windowSize.width - inset)), y: clamp(point.y, minY, Math.max(minY, monitor.y + monitor.height - this.context.windowSize.height - inset)) };
    }
    private chooseTarget(): Vec2 | null {
        if (!this.context.monitor)
            return null;
        const radius = 220 * this.context.scaleFactor;
        const candidate = this.bound({ x: this.position.x + this.between(-radius, radius), y: this.position.y + this.between(-radius, radius) });
        if (Math.hypot(candidate.x - this.position.x, candidate.y - this.position.y) < 4)
            return null;
        return candidate;
    }
    step(dt: number, reduced = false) {
        if (!Number.isFinite(dt) || dt <= 0 || this.state === 'Dragged')
            return;
        this.elapsed += dt;
        if (this.state === 'FallingAsleep' && this.elapsed >= 1.4)
            this.transition('Sleeping');
        else if (this.state === 'WakingUp' && this.elapsed >= 1.25)
            this.request(this.musicPlaying ? 'dance' : 'idle');
        else if (this.state === 'Sleeping' && this.automatic && this.elapsed >= this.sleepDuration)
            this.request('wake');
        else if (this.state === 'Idle' && this.automatic && this.elapsed >= this.idleDuration)
            this.request(this.musicPlaying ? 'dance' : this.random() < 0.3 || reduced ? 'sleep' : 'walk');
        else if (this.state === 'Walking' && this.target && !reduced) {
            const dx = this.target.x - this.position.x, dy = this.target.y - this.position.y;
            const distance = Math.hypot(dx, dy);
            const speed = this.context.windowSize.width;
            const step = Math.min(distance, speed * dt);
            if (distance <= step || distance <= 1) {
                this.position = { ...this.target };
                this.request('idle');
            }
            else {
                this.position = this.bound({ x: this.position.x + dx / distance * step, y: this.position.y + dy / distance * step });
                if (Math.abs(dx) > 1)
                    this.facing = dx > 0 ? 1 : -1;
            }
        }
    }
}
