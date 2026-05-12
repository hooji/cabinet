"use client";

import { useAgentBridge } from "@/stores/agent-bridge-store";
import { AgentStatusDot } from "./agent-status-dot";
import { cn } from "@/lib/utils";
import type { AgentInfo } from "@/types/api";

export function FleetSidebar() {
  const agents = useAgentBridge((s) => s.agents);
  const groups = useAgentBridge((s) => s.groups);
  const selectedId = useAgentBridge((s) => s.selectedAgentId);
  const select = useAgentBridge((s) => s.selectAgent);

  const ungrouped = agents.filter((a) => !a.groupId);

  return (
    <aside className="w-64 border-r border-border bg-card/30 flex flex-col h-full overflow-y-auto scrollbar-thin">
      <header className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold tracking-tight">Fleet</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {agents.length} agent{agents.length === 1 ? "" : "s"}
        </p>
      </header>

      <div className="flex-1 p-2 space-y-3">
        {groups.map((g) => {
          const inGroup = agents.filter((a) => a.groupId === g.id);
          return (
            <section key={g.id}>
              <h3 className="px-2 py-1 text-[0.7rem] uppercase tracking-wider text-muted-foreground">
                {g.name}
              </h3>
              <ul className="space-y-0.5">
                {inGroup.map((a) => (
                  <AgentRow
                    key={a.id}
                    agent={a}
                    selected={a.id === selectedId}
                    onSelect={() => select(a.id)}
                  />
                ))}
              </ul>
            </section>
          );
        })}

        {ungrouped.length > 0 && (
          <section>
            <h3 className="px-2 py-1 text-[0.7rem] uppercase tracking-wider text-muted-foreground">
              Ungrouped
            </h3>
            <ul className="space-y-0.5">
              {ungrouped.map((a) => (
                <AgentRow
                  key={a.id}
                  agent={a}
                  selected={a.id === selectedId}
                  onSelect={() => select(a.id)}
                />
              ))}
            </ul>
          </section>
        )}

        {agents.length === 0 && (
          <p className="px-2 py-6 text-xs text-muted-foreground">
            No agents reported yet.
          </p>
        )}
      </div>
    </aside>
  );
}

function AgentRow({
  agent,
  selected,
  onSelect,
}: {
  agent: AgentInfo;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "w-full flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
          selected
            ? "bg-accent text-accent-foreground"
            : "hover:bg-muted/60 text-foreground/90",
        )}
      >
        <span className="truncate">{agent.name}</span>
        <AgentStatusDot state={agent.state} />
      </button>
    </li>
  );
}
