export class RateLimiter {
    private windows = new Map<string, number[]>();

    check(agentId: string, action: string, limit: number, windowSeconds: number): boolean {
        const key = `${agentId}::${action}`;
        const now = Date.now() / 1000;
        const cutoff = now - windowSeconds;
        const existing = this.windows.get(key) ?? [];
        const window = existing.filter((t) => t > cutoff);

        if (window.length >= limit) {
            this.windows.set(key, window);
            return false;
        }

        window.push(now);
        this.windows.set(key, window);
        return true;
    }

    reset(agentId?: string, action?: string): void {
        if (!agentId) {
            this.windows.clear();
            return;
        }
        if (!action) {
            for (const key of this.windows.keys()) {
                if (key.startsWith(`${agentId}::`)) {
                    this.windows.delete(key);
                }
            }
            return;
        }
        this.windows.delete(`${agentId}::${action}`);
    }
}
