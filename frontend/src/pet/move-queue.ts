import type { Vec2 } from './types';
/** At most one native move in flight. New frames replace the queued position. */
export class LatestMoveQueue {
    private pending: Vec2 | null = null;
    private running: Promise<void> | null = null;
    private disposed = false;
    constructor(private move: (point: Vec2) => Promise<void>, private onError: (error: unknown) => void) { }
    enqueue(point: Vec2) {
        if (this.disposed)
            return;
        this.pending = { ...point };
        if (!this.running) {
            this.running = this.flush().finally(() => { this.running = null; if (this.pending)
                this.enqueue(this.pending); });
        }
    }
    private async flush() {
        while (this.pending && !this.disposed) {
            const next = this.pending;
            this.pending = null;
            try {
                await this.move(next);
            }
            catch (error) {
                this.pending = null;
                this.onError(error);
            }
        }
    }
    cancel() { this.pending = null; }
    async drain() { this.cancel(); await this.running; }
    dispose() { this.disposed = true; this.cancel(); }
}
