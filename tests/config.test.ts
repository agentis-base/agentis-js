import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { loadConfig, parseRateLimit, validateConfig } from "../src/config";
import { AgentisConfigError } from "../src/exceptions";

function writeTempConfig(content: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentis-test-"));
    const p = path.join(dir, "agentis.yaml");
    fs.writeFileSync(p, content, "utf-8");
    return p;
}

const VALID_YAML = `
version: "1.0"
settings:
  default_policy: block
agents:
  test-agent:
    can:
      - read_data
      - "read_*"
    cannot:
      - delete_data
`;

describe("parseRateLimit", () => {
    test.each([
        ["50/hour", [50, 3600]],
        ["100/minute", [100, 60]],
        ["1000/day", [1000, 86400]],
        ["10/second", [10, 1]],
    ])("parses %s correctly", (input, expected) => {
        expect(parseRateLimit(input)).toEqual(expected);
    });

    test("throws on invalid format", () => {
        expect(() => parseRateLimit("50/week")).toThrow(AgentisConfigError);
        expect(() => parseRateLimit("abc")).toThrow(AgentisConfigError);
        expect(() => parseRateLimit("50")).toThrow(AgentisConfigError);
    });
});

describe("loadConfig", () => {
    test("loads valid config from file", () => {
        const p = writeTempConfig(VALID_YAML);
        const cfg = loadConfig(p);
        expect(cfg.agents["test-agent"]).toBeDefined();
        expect(cfg.agents["test-agent"].can).toContain("read_data");
    });

    test("throws on missing file", () => {
        expect(() => loadConfig("/nonexistent/path/agentis.yaml")).toThrow(AgentisConfigError);
    });
});

describe("validateConfig", () => {
    test("accepts valid config", () => {
        expect(() => validateConfig({ agents: { "test-agent": { can: ["read"] } } })).not.toThrow();
    });

    test("throws when no agents defined", () => {
        expect(() => validateConfig({ agents: {} })).toThrow(AgentisConfigError);
    });

    test("throws when can list is empty", () => {
        expect(() =>
            validateConfig({ agents: { "test-agent": { can: [] } } }),
        ).toThrow(AgentisConfigError);
    });

    test("throws when can and cannot overlap", () => {
        expect(() =>
            validateConfig({
                agents: { "test-agent": { can: ["read"], cannot: ["read"] } },
            }),
        ).toThrow(AgentisConfigError);
    });

    test("throws when cannot and needs_human_approval overlap", () => {
        expect(() =>
            validateConfig({
                agents: {
                    "test-agent": {
                        can: ["read"],
                        cannot: ["approve"],
                        needs_human_approval: ["approve"],
                    },
                },
            }),
        ).toThrow(AgentisConfigError);
    });

    test("throws on invalid default_policy", () => {
        expect(() =>
            validateConfig({
                settings: { default_policy: "maybe" as "block" },
                agents: { "test-agent": { can: ["read"] } },
            }),
        ).toThrow(AgentisConfigError);
    });

    test("throws on invalid rate limit format", () => {
        expect(() =>
            validateConfig({
                agents: {
                    "test-agent": { can: ["read"], rate_limits: { read: "50/week" } },
                },
            }),
        ).toThrow(AgentisConfigError);
    });
});
