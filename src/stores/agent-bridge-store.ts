"use client";

import { create } from "zustand";
import { RpcClient, type ConnectionState } from "@/lib/rpc/client";
import type {
  AgentInfo,
  AgentState,
  GroupInfo,
  GroupSummary,
  MessageRecord,
  MessageReplacement,
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

/**
 * Apply a {@link MessageReplacement} to an existing message body. Returns
 * the new body, or null if either anchor was specified but not found in
 * its search range (the update should be discarded).
 *
 * Both anchors null → full replacement.
 * Only startReplaceAfter → keep prefix, replace everything after.
 * Only endReplaceBefore → replace start, keep suffix.
 * Both → keep prefix and suffix, splice text between them.
 */
export function applyAnchoredReplace(
  currentText: string,
  r: MessageReplacement,
): string | null {
  let prefix = "";
  let suffix = "";

  if (r.startReplaceAfter !== null && r.startReplaceAfter !== undefined) {
    const i = currentText.indexOf(r.startReplaceAfter);
    if (i === -1) return null;
    prefix = currentText.slice(0, i + r.startReplaceAfter.length);
  }
  if (r.endReplaceBefore !== null && r.endReplaceBefore !== undefined) {
    const j = currentText.indexOf(r.endReplaceBefore, prefix.length);
    if (j === -1) return null;
    suffix = currentText.slice(j);
  }
  return prefix + r.text + suffix;
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
      client.on("onMessageAppend", ({ msg }) => {
        const conversationId = msg.conversationId;
        set((s) => {
          const existing = s.messagesByConversation[conversationId] ?? [];
          const idx = existing.findIndex((m) => m.id === msg.id);
          if (idx === -1) {
            // Auto-create on first append for unknown id — agent skipped
            // the priming onMessage and is streaming from the first token.
            return {
              messagesByConversation: {
                ...s.messagesByConversation,
                [conversationId]: [...existing, msg],
              },
            };
          }
          const next = existing.slice();
          next[idx] = { ...next[idx], text: next[idx].text + msg.text };
          return {
            messagesByConversation: {
              ...s.messagesByConversation,
              [conversationId]: next,
            },
          };
        });
      });
      client.on("onMessageReplace", ({ replacement }) => {
        const conversationId = replacement.conversationId;
        set((s) => {
          const existing = s.messagesByConversation[conversationId] ?? [];
          const idx = existing.findIndex((m) => m.id === replacement.id);
          if (idx === -1) {
            // Unknown id — anchors can't apply. If neither anchor is set,
            // auto-create with the replacement text as the initial body.
            if (
              replacement.startReplaceAfter == null &&
              replacement.endReplaceBefore == null
            ) {
              const seed: MessageRecord = {
                id: replacement.id,
                conversationId,
                from: "",
                text: replacement.text,
                ts: Date.now(),
              };
              return {
                messagesByConversation: {
                  ...s.messagesByConversation,
                  [conversationId]: [...existing, seed],
                },
              };
            }
            return s;
          }
          const updatedText = applyAnchoredReplace(existing[idx].text, replacement);
          if (updatedText === null) return s; // anchor mismatch — discard
          const next = existing.slice();
          next[idx] = { ...next[idx], text: updatedText };
          return {
            messagesByConversation: {
              ...s.messagesByConversation,
              [conversationId]: next,
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
