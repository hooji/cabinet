"use client";

import { useAgentBridge } from "@/stores/agent-bridge-store";
import { cn } from "@/lib/utils";

const TONE: Record<string, { dot: string; label: string }> = {
  idle: { dot: "bg-zinc-500", label: "starting…" },
  connecting: { dot: "bg-amber-500 animate-pulse", label: "connecting…" },
  connected: { dot: "bg-emerald-500", label: "connected" },
  disconnected: { dot: "bg-rose-500", label: "disconnected" },
};

export function ConnectionPill() {
  const state = useAgentBridge((s) => s.connectionState);
  const url = useAgentBridge((s) => s.serverUrl);
  const tone = TONE[state] ?? TONE.idle;
  return (
    <div
      className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/30 px-3 py-1 text-xs"
      title={url}
    >
      <span className={cn("size-2 rounded-full", tone.dot)} />
      <span>{tone.label}</span>
    </div>
  );
}
