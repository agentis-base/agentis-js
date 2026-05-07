export class PermissionDenied extends Error {
    constructor(
        public readonly agentRole: string,
        public readonly action: string,
        public readonly reason: string,
    ) {
        super(`Permission denied for role '${agentRole}' on action '${action}': ${reason}`);
        this.name = "PermissionDenied";
        Object.setPrototypeOf(this, PermissionDenied.prototype);
    }

    toDict(): Record<string, string> {
        return {
            status: "denied",
            action: this.action,
            reason: this.reason,
            suggestion: "Contact your administrator to update permissions",
        };
    }
}

export class AgentisConfigError extends Error {
    constructor(
        message: string,
        public readonly field?: string,
    ) {
        super(field ? `[${field}] ${message}` : message);
        this.name = "AgentisConfigError";
        Object.setPrototypeOf(this, AgentisConfigError.prototype);
    }
}
