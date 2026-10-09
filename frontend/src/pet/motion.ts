import type { Activity } from './types';
export interface Pose {
    time: number;
    sleep: number;
    walk: number;
    dance: number;
    drag: number;
    blink: number;
    breath: number;
    gait: number;
    beat: number;
    sway: number;
    tail: number;
    ear: number;
    colorAngle: number;
    reduced: boolean;
    landingOffset: number;
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Adapted from prototype 03. Interruptions retain current pose and sleep velocity. */
export class MotionSystem {
    time = 0;
    walk = 0;
    dance = 0;
    sleep = 0;
    sleepVelocity = 0;
    drag = 0;
    greeting = 0;
    reduced = false;
    private landingTime = 1;
    greet() { this.greeting = 1; }
    land() { this.landingTime = 0; }
    step(dt: number, state: Activity): Pose {
        if (!Number.isFinite(dt) || dt < 0)
            return this.sample();
        this.time += dt;
        this.landingTime += dt;
        const quick = 1 - Math.exp(-dt * 8);
        this.walk = lerp(this.walk, state === 'Walking' ? 1 : 0, quick);
        this.dance = lerp(this.dance, state === 'Dancing' ? 1 : 0, quick);
        const target = state === 'FallingAsleep' || state === 'Sleeping' ? 1 : 0;
        const omega = 6.5, delta = this.sleep - target, decay = Math.exp(-omega * dt);
        const temp = (this.sleepVelocity + omega * delta) * dt;
        this.sleep = Math.max(0, Math.min(1, target + (delta + temp) * decay));
        this.sleepVelocity = (this.sleepVelocity - omega * temp) * decay;
        this.drag = lerp(this.drag, state === 'Dragged' ? 1 : 0, quick);
        this.greeting *= Math.exp(-dt * 3.2);
        return this.sample();
    }
    sample(): Pose {
        const t = this.time, active = this.reduced ? 0 : 1;
        const gait = Math.sin(t * 9), beat = Math.sin(t * 10), blinkTime = t % 4.7;
        let blink = blinkTime > 3.72 && blinkTime < 3.94 ? Math.sin((blinkTime - 3.72) / .22 * Math.PI) : 0;
        if (t % 11 > 8.2 && t % 11 < 8.4)
            blink = Math.sin((t % 11 - 8.2) / .2 * Math.PI);
        const s = this.sleep;
        return { time: t, sleep: s, walk: this.walk, dance: this.dance, drag: this.drag,
            blink: blink * active, breath: (Math.sin(t * (s > .5 ? 1.8 : 2.2)) * .5 + .5) * active,
            gait: gait * this.walk * (1 - s) * active, beat: beat * this.dance * (1 - s) * active,
            sway: (Math.sin(t * 6) * this.drag * 5 + Math.sin(t * 5) * this.dance * 4) * active,
            tail: (Math.sin(t * 3.7) * 2 + this.greeting * Math.sin(t * 17) * 13) * active,
            ear: (Math.sin(t * 2.3) * 1.5 + this.greeting * Math.sin(t * 16) * 10) * active,
            colorAngle: this.dance * ((t * 105) % 360) * active, reduced: this.reduced,
            landingOffset: Math.sin(this.landingTime * 20) * Math.exp(-this.landingTime * 10) * 3 * active,
        };
    }
}
