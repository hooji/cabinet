"use client";

import { useEffect, useState } from "react";
import { useAgentBridge } from "@/stores/agent-bridge-store";

export function SettingsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const serverUrl = useAgentBridge((s) => s.serverUrl);
  const setServerUrl = useAgentBridge((s) => s.setServerUrl);
  const [draft, setDraft] = useState(serverUrl);

  useEffect(() => {
    if (open) setDraft(serverUrl);
  }, [open, serverUrl]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold">Settings</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Where the Java agent bridge is listening.
        </p>

        <label className="mt-4 block">
          <span className="text-xs font-medium text-foreground">Server URL</span>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="ws://192.168.0.42:9876"
            className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <span className="mt-1 block text-[0.7rem] text-muted-foreground">
            Saved to localStorage; reconnect happens immediately.
          </span>
        </label>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              setServerUrl(draft);
              onClose();
            }}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
