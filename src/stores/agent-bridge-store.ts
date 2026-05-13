"use client";

import { create } from "zustand";
import { RpcClient, type ConnectionState } from "@/lib/rpc/client";
import type {
  AgentInfo,
  AgentState,
  GroupInfo,
  GroupSummary,
  MessageRecord,
  TargetKind,
} from "@/types/api";

const DEFAULT_URL = "ws://localhost:9876";
const STORAGE_KEY = "agent-bridge.serverUrl";

interface State {
  client: RpcClient | null;
  serverUrl: string;
  connectionState: ConnectionState;
  agents: AgentInfo[];
  groups: GroupInfo[];
  messagesByConversation: Record<string, MessageRecord[]>;
  groupSummaries: Record<string, GroupSummary>;
  selectedAgentId: string | null;
}

interface Actions {
  init(): void;
  setServerUrl(url: string): void;
  selectAgent(id: string | null): void;
  sendMessage(conversationId: string, text: string): Promise<void>;
  sendDirective(
    targetId: string,
    kind: TargetKind,
    cmd: string,
    args?: Record<string, unknown>,
  ): Promise<void>;
}

function readStoredUrl(): string {
  if (typeof window === "undefined") return DEFAULT_URL;
  try {
    return window.localStorage.getItem(STORAGE_KEY) || DEFAULT_URL;
  } catch {
    return DEFAULT_URL;
  }
}

function writeStoredUrl(url: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, url);
  } catch {
    // best-effort
  }
}

function upsertAgentState(
  agents: AgentInfo[],
  agentId: string,
  next: AgentState,
): AgentInfo[] {
  let changed = false;
  const out = agents.map((a) => {
    if (a.id === agentId && a.state !== next) {
      changed = true;
      return { ...a, state: next };
    }
    return a;
  });
  return changed ? out : agents;
}

export const useAgentBridge = create<State & Actions>((set, get) => {
  let initialized = false;

  return {
    client: null,
    serverUrl: DEFAULT_URL,
    connectionState: "idle",
    agents: [],
    groups: [],
    messagesByConversation: {},
    groupSummaries: {},
    selectedAgentId: null,

    init() {
      if (initialized) return;
      initialized = true;
      const url = readStoredUrl();
      const client = new RpcClient({
        url,
        onStateChange: (next) => {
          set({ connectionState: next });
          if (next === "connected") {
            void refreshSnapshot(get);
          }
        },
      });

      client.on("onMessage", ({ msg }) => {
        const conversationId = msg.conversationId;
        set((s) => {
          const existing = s.messagesByConversation[conversationId] ?? [];
          return {
            messagesByConversation: {
              ...s.messagesByConversation,
              [conversationId]: [...existing, msg],
            },
          };
        });
      });
      client.on("onStatusChange", ({ agentId, state: nextState }) => {
        set((s) => ({ agents: upsertAgentState(s.agents, agentId, nextState) }));
      });
      client.on("onAgentAdded", ({ agent }) => {
        set((s) =>
          s.agents.some((a) => a.id === agent.id)
            ? s
            : { agents: [...s.agents, agent] },
        );
      });
      client.on("onAgentRemoved", ({ agentId }) => {
        set((s) => ({ agents: s.agents.filter((a) => a.id !== agentId) }));
      });
      client.on("onGroupUpdate", ({ groupId, summary }) => {
        set((s) => ({
          groupSummaries: { ...s.groupSummaries, [groupId]: summary },
        }));
      });
      client.on("onInputNeeded", ({ agentId }) => {
        set((s) => ({ agents: upsertAgentState(s.agents, agentId, "BLOCKED") }));
      });

      set({ client, serverUrl: url });
      client.connect();
    },

    setServerUrl(url: string) {
      const trimmed = url.trim();
      if (!trimmed) return;
      writeStoredUrl(trimmed);
      set({ serverUrl: trimmed });
      const client = get().client;
      if (client) client.setUrl(trimmed);
    },

    selectAgent(id: string | null) {
      set({ selectedAgentId: id });
      if (!id) return;
      // Lazy-load history the first time an agent is selected.
      const state = get();
      const agent = state.agents.find((a) => a.id === id);
      if (!agent) return;
      const existing = state.messagesByConversation[agent.conversationId];
      if (existing && existing.length > 0) return;
      const client = state.client;
      if (!client || client.getState() !== "connected") return;
      void client
        .call("getHistory", { conversationId: agent.conversationId, limit: 50 })
        .then((msgs) => {
          set((s) => ({
            messagesByConversation: {
              ...s.messagesByConversation,
              [agent.conversationId]: msgs,
            },
          }));
        })
        .catch((err) => console.warn("getHistory failed:", err));
    },

    async sendMessage(conversationId: string, text: string) {
      const client = get().client;
      if (!client) throw new Error("client not initialized");
      await client.call("sendMessage", { conversationId, text });
    },

    async sendDirective(
      targetId: string,
      kind: TargetKind,
      cmd: string,
      args?: Record<string, unknown>,
    ) {
      const client = get().client;
      if (!client) throw new Error("client not initialized");
      await client.call("sendDirective", { targetId, kind, cmd, args });
    },
  };
});

async function refreshSnapshot(
  get: () => State & Actions,
): Promise<void> {
  const client = get().client;
  if (!client) return;
  try {
    const [agents, groups] = await Promise.all([
      client.call("listAgents"),
      client.call("listGroups"),
    ]);
    useAgentBridge.setState({ agents, groups });
  } catch (err) {
    console.warn("snapshot refresh failed:", err);
  }
}
