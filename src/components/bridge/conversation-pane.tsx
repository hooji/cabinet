"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAgentBridge } from "@/stores/agent-bridge-store";
import { AgentStatusDot } from "./agent-status-dot";
import { cn } from "@/lib/utils";
import type { MessageRecord } from "@/types/api";

const EMPTY_MESSAGES: readonly MessageRecord[] = [];

export function ConversationPane() {
  const selectedId = useAgentBridge((s) => s.selectedAgentId);
  const agent = useAgentBridge(
    (s) => s.agents.find((a) => a.id === selectedId) ?? null,
  );
  const conversationId = agent?.conversationId;
  const messagesMap = useAgentBridge((s) => s.messagesByConversation);
  const messages: readonly MessageRecord[] = conversationId
    ? messagesMap[conversationId] ?? EMPTY_MESSAGES
    : EMPTY_MESSAGES;
  const sendMessage = useAgentBridge((s) => s.sendMessage);
  const sendDirective = useAgentBridge((s) => s.sendDirective);
  const connectionState = useAgentBridge((s) => s.connectionState);

  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const canSend =
    connectionState === "connected" &&
    !!agent &&
    draft.trim().length > 0 &&
    !busy;

  async function handleSend() {
    if (!agent || !canSend) return;
    const text = draft.trim();
    setDraft("");
    setBusy(true);
    try {
      await sendMessage(agent.conversationId, text);
    } catch (err) {
      console.warn("sendMessage failed:", err);
    } finally {
      setBusy(false);
    }
  }

  if (!agent) {
    return (
      <section className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Select an agent from the left.
      </section>
    );
  }

  return (
    <section className="flex-1 flex flex-col h-full overflow-hidden">
      <header className="border-b border-border px-5 py-3 flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold tracking-tight">
              {agent.name}
            </h2>
            <AgentStatusDot state={agent.state} showLabel />
          </div>
          {agent.description && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {agent.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <DirectiveButton
            label="Pause"
            onClick={() => sendDirective(agent.id, "AGENT", "pause")}
          />
          <DirectiveButton
            label="Resume"
            onClick={() => sendDirective(agent.id, "AGENT", "resume")}
          />
          <DirectiveButton
            label="Wake"
            onClick={() => sendDirective(agent.id, "AGENT", "wake")}
          />
        </div>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-2"
      >
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center pt-8">
            No messages yet. Say hello.
          </p>
        ) : (
          messages.map((m) => (
            <MessageBubble key={m.id} message={m} fromMe={m.from === "user"} />
          ))
        )}
      </div>

      <footer className="border-t border-border p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder={
              connectionState === "connected"
                ? "Message…  (Enter to send, Shift-Enter for newline)"
                : "Waiting for connection…"
            }
            disabled={connectionState !== "connected"}
            rows={2}
            className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            className={cn(
              "h-9 rounded-md px-4 text-sm font-medium transition-colors",
              canSend
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground cursor-not-allowed",
            )}
          >
            Send
          </button>
        </div>
      </footer>
    </section>
  );
}

function MessageBubble({
  message,
  fromMe,
}: {
  message: MessageRecord;
  fromMe: boolean;
}) {
  const ts = useMemo(() => formatTime(message.ts), [message.ts]);
  return (
    <div
      className={cn(
        "max-w-[78%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
        fromMe
          ? "ml-auto bg-primary text-primary-foreground"
          : "mr-auto bg-muted text-foreground",
      )}
    >
      <p className="whitespace-pre-wrap leading-snug">{message.text}</p>
      <p
        className={cn(
          "mt-1 text-[0.65rem] opacity-60",
          fromMe ? "text-right" : "text-left",
        )}
      >
        {ts}
      </p>
    </div>
  );
}

function DirectiveButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
    >
      {label}
    </button>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
