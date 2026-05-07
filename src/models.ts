export type DecisionStatus = "ALLOWED" | "BLOCKED" | "ESCALATED";

export interface Decision {
    status: DecisionStatus;
    reason: string;
    approved_by: string | null;
    latency_ms: number;
}

export interface CheckResult {
    allowed: boolean;
    status: string;
    reason: string;
}

export interface LogEntry {
    id: string;
    timestamp: string;
    agent_id: string;
    agent_role: string;
    action: string;
    decision: string;
    reason: string;
    parameters: Record<string, unknown>;
    session_id: string | null;
    trace_id: string | null;
    action_category: string | null;
    approved_by: string | null;
    environment: string;
    latency_ms: number;
    metadata: Record<string, unknown>;
}

export interface AgentConfig {
    description?: string;
    can: string[];
    cannot?: string[];
    needs_human_approval?: string[];
    rate_limits?: Record<string, string>;
    escalation_contacts?: string[];
}

export interface GateSettings {
    default_policy?: "block" | "allow";
    log_level?: string;
    log_backend?: string;
    hot_reload?: boolean;
    api_key?: string;
}

export interface GateConfig {
    version?: string;
    settings?: GateSettings;
    agents: Record<string, AgentConfig>;
}

export type AgentisLocalOptions = {
    config: string;
    apiUrl?: never;
    apiKey?: never;
};

export type AgentisRemoteOptions = {
    apiUrl: string;
    apiKey: string;
    config?: never;
};

export type AgentisOptions = AgentisLocalOptions | AgentisRemoteOptions;
