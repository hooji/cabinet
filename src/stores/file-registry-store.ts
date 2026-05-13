"use client";

import { create } from "zustand";
import type { FileRef } from "@/types/api";

/**
 * In-memory file registry. Files arrive via `onFileAvailable` from the
 * agent system; they're decoded to a Blob, given an object URL, and
 * cached here for the lifetime of the page. Messages reference them via
 * `bridge://file/<id>` URLs; the MarkdownRenderer's img/iframe/embed
 * overrides resolve those URLs through this store.
 *
 * No persistence, no explicit eviction. When the page closes, the
 * browser frees all Blobs and object URLs automatically.
 *
 * The version counter ticks on every change so React components that
 * select by id see updates even though the Map identity is mutated
 * in place.
 */

export interface BridgeFile {
  id: string;
  mimeType: string;
  name: string | null;
  blob: Blob;
  objectUrl: string;
}

interface State {
  files: Map<string, BridgeFile>;
  /** Bump on every change. Components subscribe to this for reactivity. */
  version: number;
}

interface Actions {
  put(ref: FileRef): void;
  get(id: string): BridgeFile | undefined;
}

function decodeBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export const useFileRegistry = create<State & Actions>((set, get) => ({
  files: new Map(),
  version: 0,

  put(ref) {
    const bytes = decodeBase64(ref.data);
    // Cast to satisfy TS's strict BlobPart typing.
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: ref.mimeType });
    const objectUrl = URL.createObjectURL(blob);

    set((s) => {
      const previous = s.files.get(ref.id);
      if (previous) URL.revokeObjectURL(previous.objectUrl);
      const next = new Map(s.files);
      next.set(ref.id, {
        id: ref.id,
        mimeType: ref.mimeType,
        name: ref.name,
        blob,
        objectUrl,
      });
      return { files: next, version: s.version + 1 };
    });
  },

  get(id) {
    return get().files.get(id);
  },
}));

const BRIDGE_FILE_PREFIX = "bridge://file/";

/** True if `url` is a `bridge://file/<id>` URL. */
export function isBridgeFileUrl(url: string | undefined | null): boolean {
  return typeof url === "string" && url.startsWith(BRIDGE_FILE_PREFIX);
}

/** Extracts the file id from a `bridge://file/<id>` URL, or null. */
export function bridgeFileId(url: string | undefined | null): string | null {
  if (!isBridgeFileUrl(url)) return null;
  return (url as string).slice(BRIDGE_FILE_PREFIX.length);
}
