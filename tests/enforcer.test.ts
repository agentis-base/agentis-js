import { Enforcer } from "../src/enforcer";
import { AgentConfig, GateSettings } from "../src/models";
import { RateLimiter } from "../src/rate-limiter";

function makeEnforcer(
    agents: Record<string, AgentConfig>,
    settings: GateSettings = { default_policy: "block" },
): Enforcer {
    return new Enforcer(agents, settings, new RateLimiter());
}

const BASE_AGENTS: Record<string, AgentConfig> = {
    "finance-agent": {
        can: ["read_invoices", "create_reports", "read_*", "trigger_payment_under_5000"],
        cannot: ["delete_records", "transfer_funds"],
        needs_human_approval: ["trigger_payment_above_5000"],
        rate_limits: { trigger_payment_under_5000: "3/minute" },
    },
};

describe("Enforcer — allow / deny / escalate / default", () => {
    test("allows action in can list", () => {
        const e = makeEnforcer(BASE_AGENTS);
        expect(e.enforce("finance-agent", "read_invoices").status).toBe("ALLOWED");
    });

    test("blocks action in cannot list", () => {
        const e = makeEnforcer(BASE_AGENTS);
        expect(e.enforce("finance-agent", "delete_records").status).toBe("BLOCKED");
    });

    test("blocks action in needs_human_approval (Phase 1 stub)", () => {
        const e = makeEnforcer(BASE_AGENTS);
        const d = e.enforce("finance-agent", "trigger_payment_above_5000");
        expect(d.status).toBe("BLOCKED");
        expect(d.reason).toBe("escalation_required");
    });

    test("blocks unknown role", () => {
        const e = makeEnforcer(BASE_AGENTS);
        const d = e.enforce("unknown-agent", "read_invoices");
        expect(d.status).toBe("BLOCKED");
        expect(d.reason).toMatch(/Unknown agent role/i);
    });

    test("blocks unlisted action under default block policy", () => {
        const e = makeEnforcer(BASE_AGENTS);
        expect(e.enforce("finance-agent", "random_action").status).toBe("BLOCKED");
    });

    test("allows unlisted action under default allow policy", () => {
        const e = makeEnforcer(BASE_AGENTS, { default_policy: "allow" });
        expect(e.enforce("finance-agent", "random_action").status).toBe("ALLOWED");
    });
});

describe("Enforcer — wildcard matching", () => {
    test("read_* matches read_invoices", () => {
        const e = makeEnforcer(BASE_AGENTS);
        expect(e.enforce("finance-agent", "read_invoices").status).toBe("ALLOWED");
    });

    test("read_* matches read_expenses", () => {
        const e = makeEnforcer(BASE_AGENTS);
        expect(e.enforce("finance-agent", "read_expenses").status).toBe("ALLOWED");
    });

    test("read_* does not match write_data", () => {
        const e = makeEnforcer(BASE_AGENTS);
        expect(e.enforce("finance-agent", "write_data").status).toBe("BLOCKED");
    });

    test("database.* pattern matches database.select", () => {
        const agents: Record<string, AgentConfig> = {
            "db-agent": { can: ["database.*"], cannot: [] },
        };
        const e = makeEnforcer(agents);
        expect(e.enforce("db-agent", "database.select").status).toBe("ALLOWED");
        expect(e.enforce("db-agent", "database.insert").status).toBe("ALLOWED");
        expect(e.enforce("db-agent", "other.action").status).toBe("BLOCKED");
    });
});

describe("Enforcer — rate limiting", () => {
    test("allows calls within rate limit", () => {
        const e = makeEnforcer(BASE_AGENTS);
        expect(e.enforce("finance-agent", "trigger_payment_under_5000").status).toBe("ALLOWED");
        expect(e.enforce("finance-agent", "trigger_payment_under_5000").status).toBe("ALLOWED");
        expect(e.enforce("finance-agent", "trigger_payment_under_5000").status).toBe("ALLOWED");
    });

    test("blocks when rate limit exceeded", () => {
        const e = makeEnforcer(BASE_AGENTS);
        e.enforce("finance-agent", "trigger_payment_under_5000");
        e.enforce("finance-agent", "trigger_payment_under_5000");
        e.enforce("finance-agent", "trigger_payment_under_5000");
        const d = e.enforce("finance-agent", "trigger_payment_under_5000");
        expect(d.status).toBe("BLOCKED");
        expect(d.reason).toMatch(/Rate limit exceeded/i);
    });
});

describe("Enforcer — check()", () => {
    test("check returns {allowed, status, reason}", () => {
        const e = makeEnforcer(BASE_AGENTS);
        const result = e.check("finance-agent", "read_invoices");
        expect(result.allowed).toBe(true);
        expect(result.status).toBe("ALLOWED");
        expect(result.reason).toBeTruthy();
    });

    test("check blocked action returns allowed=false", () => {
        const e = makeEnforcer(BASE_AGENTS);
        const result = e.check("finance-agent", "delete_records");
        expect(result.allowed).toBe(false);
        expect(result.status).toBe("BLOCKED");
    });
});

describe("Enforcer — latency_ms", () => {
    test("latency_ms is a non-negative number", () => {
        const e = makeEnforcer(BASE_AGENTS);
        const d = e.enforce("finance-agent", "read_invoices");
        expect(typeof d.latency_ms).toBe("number");
        expect(d.latency_ms).toBeGreaterThanOrEqual(0);
    });
});
