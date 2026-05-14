"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { useAgentBridge } from "@/stores/agent-bridge-store";
import { AgentStatusDot } from "./agent-status-dot";
import { MarkdownRenderer } from "@/components/Markdown/MarkdownRenderer";
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
  const contentRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Scroll: two writers updating in opposite directions ────────────
  //
  // `following.current === true` means "stay anchored to the bottom".
  // The flag has two independent writers, but they update to *opposite*
  // values under disjoint conditions, so they can never race:
  //
  //   onScroll  → only sets following = TRUE  (when distance < 4)
  //   onWheel/onKeyDown → only sets following = FALSE (when user scrolls up)
  //
  // The reader (ResizeObserver) takes whatever the last writer set.
  //
  // Late-firing scroll events from our own programmatic scrolls always
  // observe distance ≈ 0 → set to true → no-op (already was true).
  // User-initiated scroll-up sets false immediately on the input event,
  // before the resulting scroll event fires, so the order doesn't matter.
  //
  // 4px is subpixel-rounding tolerance only, not a heuristic for "scrolled
  // far enough."
  const following = useRef(true);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) following.current = false;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "PageUp" || e.key === "Home" || e.key === "ArrowUp") {
        following.current = false;
      }
    };
    const onScroll = () => {
      const distance =
        scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop;
      if (distance < 4) following.current = true;
    };
    scroll.addEventListener("wheel", onWheel, { passive: true });
    scroll.addEventListener("keydown", onKeyDown);
    scroll.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroll.removeEventListener("wheel", onWheel);
      scroll.removeEventListener("keydown", onKeyDown);
      scroll.removeEventListener("scroll", onScroll);
    };
  }, [agent?.id]);

  useEffect(() => {
    const scroll = scrollRef.current;
    const content = contentRef.current;
    if (!scroll || !content) return;
    const observer = new ResizeObserver(() => {
      if (following.current) scroll.scrollTop = scroll.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [agent?.id]);

  // ── Focus: synchronous blur handler, no async observers ────────────
  //
  // The textarea is the focus owner unless something interactive
  // explicitly takes focus. Browser-internal focus drops (image decode,
  // layout shifts) blur the textarea with `relatedTarget === null`; we
  // detect that synchronously and restore on the next microtask, with
  // two opt-outs:
  //   1. Another element actually picked up focus (e.g. user clicked a
  //      button between blur and microtask) — `activeElement` won't be
  //      body anymore.
  //   2. The user is mid-drag-selecting text inside a message — taking
  //      focus would cancel the selection in some browsers.
  //
  // Focus on agent change is still useful as an explicit user signal.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta || !agent?.id) return;
    ta.focus();
  }, [agent?.id]);

  function handleComposerBlur(e: React.FocusEvent<HTMLTextAreaElement>) {
    if (e.relatedTarget !== null) return; // user moved focus deliberately
    queueMicrotask(() => {
      const active = document.activeElement;
      if (active !== document.body && active !== null) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().length > 0) return;
      textareaRef.current?.focus();
    });
  }

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
      <header className="border-b border-border px-5 py-3">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold tracking-tight">
              {agent.name}
            </h2>
            <AgentStatusDot state={agent.state} showLabel />
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
        </div>
        {agent.description && (
          <p className="text-xs text-muted-foreground mt-1">
            {agent.description}
          </p>
        )}
      </header>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4"
      >
        <div ref={contentRef} className="flex flex-col gap-3">
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center pt-8">
              No messages yet. Say hello.
            </p>
          ) : (
            messages.map((m) => (
              <Message key={m.id} message={m} fromMe={m.from === "user"} />
            ))
          )}
        </div>
      </div>

      <footer className="border-t border-border p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={handleComposerBlur}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder={
              connectionState === "connected"
                ? "Message…  (Enter to send, Shift-Enter for newline; markdown supported)"
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

function Message({
  message,
  fromMe,
}: {
  message: MessageRecord;
  fromMe: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-start max-w-[78%]",
        fromMe ? "self-end" : "self-start",
      )}
    >
      <div className="rounded-2xl bg-muted text-foreground px-3.5 py-2 text-sm shadow-sm w-full">
        <MarkdownRenderer>{message.text}</MarkdownRenderer>
      </div>
      <StatusLine ts={message.ts} text={message.text} />
    </div>
  );
}

function StatusLine({ ts, text }: { ts: number; text: string }) {
  const time = useMemo(() => formatTime(ts), [ts]);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.warn("copy failed:", err);
    }
  }

  return (
    <div className="mt-1 flex items-center gap-1.5 text-[0.65rem] text-muted-foreground opacity-70">
      <span>{time}</span>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied" : "Copy markdown"}
        title={copied ? "Copied" : "Copy markdown"}
        className="inline-flex items-center justify-center rounded p-0.5 hover:text-foreground hover:bg-muted transition-colors"
      >
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      </button>
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
