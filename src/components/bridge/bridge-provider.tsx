"use client";

import { useEffect } from "react";
import { useAgentBridge } from "@/stores/agent-bridge-store";

/**
 * Mounts at the root and initializes the bridge client once. Renders
 * children unchanged; the store does its own state propagation.
 */
export function BridgeProvider({ children }: { children: React.ReactNode }) {
  const init = useAgentBridge((s) => s.init);
  useEffect(() => {
    init();
  }, [init]);
  return <>{children}</>;
}
