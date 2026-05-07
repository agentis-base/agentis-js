import { RateLimiter } from "../src/rate-limiter";

describe("RateLimiter", () => {
    let rl: RateLimiter;

    beforeEach(() => {
        rl = new RateLimiter();
    });

    test("allows calls within limit", () => {
        expect(rl.check("agent", "action", 3, 60)).toBe(true);
        expect(rl.check("agent", "action", 3, 60)).toBe(true);
        expect(rl.check("agent", "action", 3, 60)).toBe(true);
    });

    test("blocks when limit is exceeded", () => {
        rl.check("agent", "action", 2, 60);
        rl.check("agent", "action", 2, 60);
        expect(rl.check("agent", "action", 2, 60)).toBe(false);
    });

    test("different agents/actions are independent", () => {
        rl.check("agent-a", "action", 1, 60);
        expect(rl.check("agent-b", "action", 1, 60)).toBe(true);
        expect(rl.check("agent-a", "other-action", 1, 60)).toBe(true);
    });

    test("reset all clears state", () => {
        rl.check("agent", "action", 1, 60);
        rl.reset();
        expect(rl.check("agent", "action", 1, 60)).toBe(true);
    });

    test("reset by agentId clears matching keys", () => {
        rl.check("agent-a", "action", 1, 60);
        rl.check("agent-b", "action", 1, 60);
        rl.reset("agent-a");
        expect(rl.check("agent-a", "action", 1, 60)).toBe(true);
        expect(rl.check("agent-b", "action", 1, 60)).toBe(false);
    });

    test("reset by agentId + action clears specific key", () => {
        rl.check("agent", "read", 1, 60);
        rl.check("agent", "write", 1, 60);
        rl.reset("agent", "read");
        expect(rl.check("agent", "read", 1, 60)).toBe(true);
        expect(rl.check("agent", "write", 1, 60)).toBe(false);
    });

    test("evicts timestamps older than window", async () => {
        // Use a very short window (1ms) to simulate expiry
        rl.check("agent", "action", 1, 0.001);
        await new Promise((r) => setTimeout(r, 10));
        expect(rl.check("agent", "action", 1, 0.001)).toBe(true);
    });
});
