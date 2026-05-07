import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { Agentis } from "../src/agentis";
import { PermissionDenied } from "../src/exceptions";

function writeConfig(content: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentis-test-"));
    const p = path.join(dir, "agentis.yaml");
    fs.writeFileSync(p, content, "utf-8");
    return p;
}

const YAML = `
version: "1.0"
settings:
  default_policy: block
agents:
  finance-agent:
    can:
      - read_invoices
      - "read_*"
      - create_reports
    cannot:
      - delete_records
    needs_human_approval:
      - trigger_payment_above_5000
  support-agent:
    can:
      - read_tickets
      - send_reply
    cannot:
      - delete_tickets
`;

describe("Agentis (local mode)", () => {
    let configPath: string;
    let gate: Agentis;

    beforeEach(() => {
        configPath = writeConfig(YAML);
        gate = new Agentis({ config: configPath });
    });

    test("enforce returns ALLOWED for permitted action", async () => {
        const d = await gate.enforce("finance-agent", "read_invoices");
        expect(d.status).toBe("ALLOWED");
    });

    test("enforce returns BLOCKED for denied action", async () => {
        const d = await gate.enforce("finance-agent", "delete_records");
        expect(d.status).toBe("BLOCKED");
    });

    test("enforce returns BLOCKED for escalated action (Phase 1)", async () => {
        const d = await gate.enforce("finance-agent", "trigger_payment_above_5000");
        expect(d.status).toBe("BLOCKED");
        expect(d.reason).toBe("escalation_required");
    });

    test("enforce returns BLOCKED for unknown role", async () => {
        const d = await gate.enforce("unknown-agent", "read_invoices");
        expect(d.status).toBe("BLOCKED");
    });

    test("enforce wildcard: read_expenses matches read_*", async () => {
        const d = await gate.enforce("finance-agent", "read_expenses");
        expect(d.status).toBe("ALLOWED");
    });

    test("check returns CheckResult", async () => {
        const result = await gate.check("finance-agent", "read_invoices");
        expect(result.allowed).toBe(true);
        expect(result.status).toBe("ALLOWED");
    });

    test("protect HOF wraps function and allows call", async () => {
        async function readInvoices() {
            return "invoice-data";
        }
        const safe = gate.protect("finance-agent", "read_invoices")(readInvoices);
        const result = await safe();
        expect(result).toBe("invoice-data");
    });

    test("protect HOF throws PermissionDenied on blocked action", async () => {
        async function deleteRecords() {
            return "deleted";
        }
        const safe = gate.protect("finance-agent")(deleteRecords);
        await expect(safe()).rejects.toThrow(PermissionDenied);
    });

    test("protect HOF PermissionDenied has correct fields", async () => {
        async function deleteRecords() {
            return "deleted";
        }
        const safe = gate.protect("finance-agent", "delete_records")(deleteRecords);
        try {
            await safe();
            fail("Expected PermissionDenied");
        } catch (e) {
            expect(e).toBeInstanceOf(PermissionDenied);
            const pd = e as PermissionDenied;
            expect(pd.agentRole).toBe("finance-agent");
            expect(pd.action).toBe("delete_records");
        }
    });

    test("protect HOF uses explicit action name when provided", async () => {
        async function someFunction() {
            return "ok";
        }
        const safe = gate.protect("finance-agent", "read_invoices")(someFunction);
        const result = await safe();
        expect(result).toBe("ok");
    });

    test("enforce with parameters passes without error", async () => {
        const d = await gate.enforce("finance-agent", "read_invoices", { page: 1 });
        expect(d.status).toBe("ALLOWED");
    });
});

describe("PermissionDenied", () => {
    test("toDict returns structured response", () => {
        const pd = new PermissionDenied("finance-agent", "delete_records", "action in cannot list");
        const dict = pd.toDict();
        expect(dict.status).toBe("denied");
        expect(dict.action).toBe("delete_records");
        expect(dict.reason).toBe("action in cannot list");
    });

    test("error message is descriptive", () => {
        const pd = new PermissionDenied("my-agent", "transfer_funds", "not allowed");
        expect(pd.message).toContain("my-agent");
        expect(pd.message).toContain("transfer_funds");
    });
});
