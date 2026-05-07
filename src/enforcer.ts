import { parseRateLimit } from "./config.js";
import { AgentConfig, Decision, GateSettings } from "./models.js";
import { RateLimiter } from "./rate-limiter.js";

function matchesGlob(str: string, pattern: string): boolean {
    // Converts fnmatch-style pattern (* → .*, ? → .) to RegExp
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    const regexStr = "^" + escaped.replace(/\*/g, ".*").replace(/\?/g, ".") + "$";
    return new RegExp(regexStr).test(str);
}

function matchesAny(action: string, patterns: string[]): boolean {
    return patterns.some((p) => matchesGlob(action, p));
}

function findRateLimit(
    action: string,
    rateLimits: Record<string, string>,
): [number, number] | null {
    for (const [pattern, limitStr] of Object.entries(rateLimits)) {
        if (matchesGlob(action, pattern)) {
            return parseRateLimit(limitStr);
        }
    }
    return null;
}

function makeDecision(status: string, reason: string, startMs: number): Decision {
    return {
        status: status as Decision["status"],
        reason,
        approved_by: null,
        latency_ms: parseFloat((performance.now() - startMs).toFixed(3)),
    };
}

export class Enforcer {
    constructor(
        private cache: Record<string, AgentConfig>,
        private settings: GateSettings,
        private rateLimiter: RateLimiter,
    ) {}

    enforce(agentRole: string, action: string, parameters?: Record<string, unknown>): Decision {
        const start = performance.now();
        void parameters; // available for future use (logging, parameter-based rules)

        const agentCfg = this.cache[agentRole];
        if (!agentCfg) {
            return makeDecision("BLOCKED", "Unknown agent role", start);
        }

        const canList = agentCfg.can ?? [];
        const cannotList = agentCfg.cannot ?? [];
        const approvalList = agentCfg.needs_human_approval ?? [];
        const rateLimits = agentCfg.rate_limits ?? {};
        const defaultPolicy = this.settings.default_policy ?? "block";

        // 1. Allow list check (with rate limiting)
        if (matchesAny(action, canList)) {
            const rl = findRateLimit(action, rateLimits);
            if (rl) {
                const [limit, windowSeconds] = rl;
                if (!this.rateLimiter.check(agentRole, action, limit, windowSeconds)) {
                    return makeDecision("BLOCKED", "Rate limit exceeded", start);
                }
            }
            return makeDecision("ALLOWED", "action in can list", start);
        }

        // 2. Deny list check
        if (matchesAny(action, cannotList)) {
            return makeDecision("BLOCKED", "action in cannot list", start);
        }

        // 3. Escalation list (Phase 1: auto-deny)
        if (matchesAny(action, approvalList)) {
            return makeDecision("BLOCKED", "escalation_required", start);
        }

        // 4. Default policy
        if (defaultPolicy === "allow") {
            return makeDecision("ALLOWED", "default policy: allow", start);
        }
        return makeDecision("BLOCKED", "default policy: block", start);
    }

    check(agentRole: string, action: string): { allowed: boolean; status: string; reason: string } {
        const d = this.enforce(agentRole, action);
        return { allowed: d.status === "ALLOWED", status: d.status, reason: d.reason };
    }
}
