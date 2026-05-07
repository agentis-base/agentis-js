import * as fs from "fs";

import * as yaml from "js-yaml";

import { AgentisConfigError } from "./exceptions.js";
import { GateConfig } from "./models.js";

const PERIOD_SECONDS: Record<string, number> = {
    second: 1,
    minute: 60,
    hour: 3600,
    day: 86400,
};

const RATE_LIMIT_RE = /^(\d+)\/(second|minute|hour|day)$/;

export function parseRateLimit(value: string): [number, number] {
    const m = RATE_LIMIT_RE.exec(value);
    if (!m) {
        throw new AgentisConfigError(
            `Invalid rate limit format '${value}'. Expected e.g. '50/hour'.`,
        );
    }
    return [parseInt(m[1], 10), PERIOD_SECONDS[m[2]]];
}

export function loadConfig(configPath: string): GateConfig {
    if (!fs.existsSync(configPath)) {
        throw new AgentisConfigError(`Config file not found: ${configPath}`);
    }
    const raw = fs.readFileSync(configPath, "utf-8");
    const data = yaml.load(raw) as GateConfig;
    validateConfig(data);
    return data;
}

export function validateConfig(config: GateConfig): void {
    if (!config || typeof config !== "object") {
        throw new AgentisConfigError("Config must be a YAML mapping");
    }
    if (!config.agents || typeof config.agents !== "object") {
        throw new AgentisConfigError("Config must have an 'agents' section", "agents");
    }
    if (Object.keys(config.agents).length === 0) {
        throw new AgentisConfigError("At least one agent must be defined", "agents");
    }

    const settings = config.settings ?? {};
    const defaultPolicy = settings.default_policy ?? "block";
    if (!["block", "allow"].includes(defaultPolicy)) {
        throw new AgentisConfigError(
            `default_policy must be 'block' or 'allow', got '${defaultPolicy}'`,
            "settings.default_policy",
        );
    }

    for (const [name, agent] of Object.entries(config.agents)) {
        if (!agent.can || agent.can.length === 0) {
            throw new AgentisConfigError(
                `Agent '${name}' must have a non-empty 'can' list`,
                `agents.${name}.can`,
            );
        }

        const canSet = new Set(agent.can);
        const cannotList = agent.cannot ?? [];
        const approvalList = agent.needs_human_approval ?? [];

        for (const action of cannotList) {
            if (canSet.has(action)) {
                throw new AgentisConfigError(
                    `Action '${action}' appears in both 'can' and 'cannot'`,
                    `agents.${name}`,
                );
            }
        }

        const cannotSet = new Set(cannotList);
        for (const action of approvalList) {
            if (cannotSet.has(action)) {
                throw new AgentisConfigError(
                    `Action '${action}' appears in both 'cannot' and 'needs_human_approval'`,
                    `agents.${name}`,
                );
            }
        }

        for (const [action, limit] of Object.entries(agent.rate_limits ?? {})) {
            if (!RATE_LIMIT_RE.test(limit)) {
                throw new AgentisConfigError(
                    `Invalid rate limit '${limit}' for action '${action}'`,
                    `agents.${name}.rate_limits.${action}`,
                );
            }
        }
    }
}
