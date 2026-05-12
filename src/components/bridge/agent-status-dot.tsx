import type { AgentState } from "@/types/api";
import { cn } from "@/lib/utils";

const TONE: Record<AgentState, { color: string; label: string; pulse: boolean }> = {
  LIVE: { color: "bg-emerald-500", label: "live", pulse: true },
  PAUSED: { color: "bg-amber-500", label: "paused", pulse: false },
  WAITING: { color: "bg-sky-500", label: "waiting", pulse: false },
  BLOCKED: { color: "bg-rose-500", label: "blocked on you", pulse: true },
  IDLE: { color: "bg-zinc-500", label: "idle", pulse: false },
};

export function AgentStatusDot({
  state,
  showLabel = false,
}: {
  state: AgentState;
  showLabel?: boolean;
}) {
  const tone = TONE[state];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        className={cn(
          "size-2 rounded-full",
          tone.color,
          tone.pulse && "animate-pulse",
        )}
        aria-label={tone.label}
      />
      {showLabel && <span>{tone.label}</span>}
    </span>
  );
}
