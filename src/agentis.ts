import { loadConfig } from "./config.js";
import { Enforcer } from "./enforcer.js";
import { PermissionDenied } from "./exceptions.js";
import { AgentisOptions, CheckResult, Decision } from "./models.js";
import { RateLimiter } from "./rate-limiter.js";

export class Agentis {
    private mode: "local" | "remote";
    private enforcer?: Enforcer;
    private apiUrl?: string;
    private apiKey?: string;

    constructor(options: AgentisOptions) {
        if ("config" in options && options.config) {
            this.mode = "local";
            const cfg = loadConfig(options.config);
            const rl = new RateLimiter();
            this.enforcer = new Enforcer(cfg.agents, cfg.settings ?? {}, rl);
        } else {
            this.mode = "remote";
            this.apiUrl = (options as { apiUrl: string }).apiUrl;
            this.apiKey = (options as { apiKey: string }).apiKey;
        }
    }

    async enforce(
        role: string,
        action: string,
        parameters?: Record<string, unknown>,
    ): Promise<Decision> {
        if (this.mode === "local") {
            return Promise.resolve(this.enforcer!.enforce(role, action, parameters));
        }
        return this._remoteEnforce(role, action, parameters);
    }

    async check(role: string, action: string): Promise<CheckResult> {
        if (this.mode === "local") {
            return Promise.resolve(this.enforcer!.check(role, action));
        }
        const decision = await this._remoteEnforce(role, action);
        return { allowed: decision.status === "ALLOWED", status: decision.status, reason: decision.reason };
    }

    protect<T extends (...args: unknown[]) => Promise<unknown>>(
        role: string,
        action?: string,
    ): (fn: T) => T {
        const self = this;
        return (fn: T): T => {
            const resolvedAction = action ?? fn.name;
            return (async function (...args: Parameters<T>) {
                const decision = await self.enforce(role, resolvedAction);
                if (decision.status !== "ALLOWED") {
                    throw new PermissionDenied(role, resolvedAction, decision.reason);
                }
                return fn(...args);
            }) as unknown as T;
        };
    }

    private async _remoteEnforce(
        role: string,
        action: string,
        parameters?: Record<string, unknown>,
    ): Promise<Decision> {
        const resp = await fetch(`${this.apiUrl}/v1/check`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": this.apiKey!,
            },
            body: JSON.stringify({ role, action, parameters }),
        });
        if (!resp.ok) {
            throw new Error(`Agentis API error: ${resp.status} ${resp.statusText}`);
        }
        return resp.json() as Promise<Decision>;
    }
}
