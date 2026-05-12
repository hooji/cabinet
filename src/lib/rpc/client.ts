// JSON-RPC 2.0 client over a single WebSocket with auto-reconnect.
//
// Inbound frames: either a response (has `id`) or a notification (no `id`).
// Outbound: requests carry an auto-assigned id and return a Promise; the
// caller resolves on the matching response.

import type {
  NotificationMethod,
  NotificationParams,
  RequestMethod,
  RequestParams,
  RequestResults,
} from "@/types/api";

export type ConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected";

export interface RpcClientOptions {
  url: string;
  /** Milliseconds between reconnect attempts (default 5000). */
  reconnectDelayMs?: number;
  onStateChange?: (state: ConnectionState) => void;
}

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
};

type NotificationHandler<M extends NotificationMethod> = (
  params: NotificationParams[M],
) => void;

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params: unknown;
}

export class RpcClient {
  private url: string;
  private readonly reconnectDelayMs: number;
  private readonly onStateChange?: (s: ConnectionState) => void;

  private ws: WebSocket | null = null;
  private state: ConnectionState = "idle";
  private closed = false;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly handlers = new Map<string, Set<(params: unknown) => void>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: RpcClientOptions) {
    this.url = opts.url;
    this.reconnectDelayMs = opts.reconnectDelayMs ?? 5000;
    this.onStateChange = opts.onStateChange;
  }

  getState(): ConnectionState {
    return this.state;
  }

  getUrl(): string {
    return this.url;
  }

  setUrl(url: string): void {
    if (url === this.url) return;
    this.url = url;
    // Force a reconnect against the new URL.
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
      this.ws.close();
    } else {
      this.scheduleReconnect(0);
    }
  }

  connect(): void {
    this.closed = false;
    this.openSocket();
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) this.ws.close();
    this.setState("disconnected");
  }

  on<M extends NotificationMethod>(
    method: M,
    handler: NotificationHandler<M>,
  ): () => void {
    let set = this.handlers.get(method);
    if (!set) {
      set = new Set();
      this.handlers.set(method, set);
    }
    set.add(handler as (params: unknown) => void);
    return () => set!.delete(handler as (params: unknown) => void);
  }

  call<M extends RequestMethod>(
    method: M,
    params?: RequestParams[M],
  ): Promise<RequestResults[M]> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("not connected"));
    }
    const id = this.nextId++;
    return new Promise<RequestResults[M]>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.ws!.send(
        JSON.stringify({ jsonrpc: "2.0", id, method, params: params ?? {} }),
      );
    });
  }

  // ── internals ──────────────────────────────────────────────────────────

  private openSocket(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.setState("connecting");
    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws.addEventListener("open", () => this.setState("connected"));
    this.ws.addEventListener("close", () => {
      this.failAllPending(new Error("connection closed"));
      this.setState("disconnected");
      if (!this.closed) this.scheduleReconnect();
    });
    this.ws.addEventListener("error", () => {
      // 'close' will follow; nothing to do here.
    });
    this.ws.addEventListener("message", (e) => this.onFrame(String(e.data)));
  }

  private scheduleReconnect(delay = this.reconnectDelayMs): void {
    if (this.closed) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.openSocket(), delay);
  }

  private onFrame(raw: string): void {
    let frame: JsonRpcResponse | JsonRpcNotification;
    try {
      frame = JSON.parse(raw);
    } catch {
      return;
    }
    if ("id" in frame && frame.id !== undefined && frame.id !== null) {
      const pending = this.pending.get(frame.id);
      if (!pending) return;
      this.pending.delete(frame.id);
      if (frame.error) {
        pending.reject(
          new Error(`rpc error ${frame.error.code}: ${frame.error.message}`),
        );
      } else {
        pending.resolve(frame.result);
      }
      return;
    }
    if ("method" in frame) {
      const set = this.handlers.get(frame.method);
      if (!set) return;
      for (const h of set) {
        try {
          h(frame.params);
        } catch (err) {
          console.warn(`handler for ${frame.method} threw`, err);
        }
      }
    }
  }

  private failAllPending(err: Error): void {
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }

  private setState(next: ConnectionState): void {
    if (this.state === next) return;
    this.state = next;
    this.onStateChange?.(next);
  }
}
