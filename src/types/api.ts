// Mirrors the Java DTOs in java/src/main/java/ai/agentbridge/api/.
// Jackson serializes enums as their NAME by default, so use the uppercase
// string form here too.

export type AgentState = "LIVE" | "PAUSED" | "WAITING" | "BLOCKED" | "IDLE";

export type TargetKind = "AGENT" | "GROUP";

export interface AgentInfo {
  id: string;
  name: string;
  conversationId: string;
  groupId: string | null;
  state: AgentState;
  description: string | null;
}

export interface GroupInfo {
  id: string;
  name: string;
  agentIds: string[];
}

export interface GroupSummary {
  liveCount: number;
  blockedCount: number;
  totalCount: number;
  lastActivityAt: number;
}

export interface MessageRecord {
  id: string;
  conversationId: string;
  from: string;
  text: string;
  ts: number;
}

// Notification param payloads — keyed by method name. The Java
// WebSocketUI sends frames in exactly this shape.
export interface NotificationParams {
  onMessage: { conversationId: string; msg: MessageRecord };
  onStatusChange: { agentId: string; state: AgentState; reason: string | null };
  onInputNeeded: { conversationId: string; agentId: string; prompt: string };
  onAgentAdded: { agent: AgentInfo };
  onAgentRemoved: { agentId: string };
  onGroupUpdate: { groupId: string; summary: GroupSummary };
}

export type NotificationMethod = keyof NotificationParams;

// Request method signatures
export interface RequestParams {
  listAgents: void;
  listGroups: void;
  getHistory: { conversationId: string; limit?: number; beforeId?: string };
  sendMessage: { conversationId: string; text: string };
  sendDirective: {
    targetId: string;
    kind: TargetKind;
    cmd: string;
    args?: Record<string, unknown>;
  };
}

export interface RequestResults {
  listAgents: AgentInfo[];
  listGroups: GroupInfo[];
  getHistory: MessageRecord[];
  sendMessage: "ok";
  sendDirective: "ok";
}

export type RequestMethod = keyof RequestParams;
