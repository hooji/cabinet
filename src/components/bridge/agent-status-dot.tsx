import type { AgentState } from "@/types/api";
import { cn } from "@/lib/utils";

type Tone = { color: string; label: string; anim: "none" | "pulse" | "flash" };

const TONE: Record<AgentState, Tone> = {
  WORKING:     { color: "bg-emerald-500", label: "working",       anim: "pulse" },
  LISTENING:   { color: "bg-blue-500",    label: "listening",     anim: "none"  },
  ANSWERING:   { color: "bg-orange-500",  label: "answering",     anim: "flash" },
  PAUSED:      { color: "bg-amber-500",   label: "paused",        anim: "none"  },
  WAITING:     { color: "bg-violet-500",  label: "waiting",       anim: "none"  },
  BLOCKED:     { color: "bg-rose-500",    label: "blocked on you",anim: "pulse" },
  IDLE:        { color: "bg-zinc-500",    label: "idle",          anim: "none"  },
  ERROR_STATE: { color: "bg-red-600",     label: "error",         anim: "flash" },
};

export function AgentStatusDot({
  state,
  showLabel = false,
}: {
  state: AgentState;
  showLabel?: boolean;
}) {
  const tone = TONE[state];
  const animClass =
    tone.anim === "pulse" ? "animate-pulse"
    : tone.anim === "flash" ? "animate-flash"
    : "";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        className={cn("size-2 rounded-full", tone.color, animClass)}
        aria-label={tone.label}
      />
      {showLabel && <span>{tone.label}</span>}
    </span>
  );
}
