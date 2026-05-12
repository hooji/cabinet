"use client";

import { useState } from "react";
import { Settings as SettingsIcon } from "lucide-react";
import { BridgeProvider } from "./bridge-provider";
import { ConnectionPill } from "./connection-pill";
import { FleetSidebar } from "./fleet-sidebar";
import { ConversationPane } from "./conversation-pane";
import { SettingsDialog } from "./settings-dialog";

export function AppShell() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <BridgeProvider>
      <div className="flex flex-col h-screen w-screen overflow-hidden">
        <header className="border-b border-border px-5 py-2.5 flex items-center justify-between">
          <h1 className="text-sm font-semibold tracking-tight">Agent Bridge</h1>
          <div className="flex items-center gap-3">
            <ConnectionPill />
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="inline-flex items-center justify-center rounded-md border border-border bg-muted/30 size-7 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Settings"
            >
              <SettingsIcon className="size-3.5" />
            </button>
          </div>
        </header>
        <main className="flex flex-1 overflow-hidden">
          <FleetSidebar />
          <ConversationPane />
        </main>
      </div>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </BridgeProvider>
  );
}
