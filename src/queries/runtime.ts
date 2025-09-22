// Lightweight runtime wrapper around Hypersauce that manages per-window
// query subscriptions and emits only small derived scalars back to the store.

import { getDefaultStore } from 'jotai'
import { nip19 } from 'nostr-tools'
import { hypersauceClientAtom } from '../state/hypersauce'
import { windowScalarsAtom, windowQueryStreamsAtom } from '../state/queriesAtoms'
import type { HypernoteMeta } from '../compiler'
import { parseReference, resolveReference } from '../interp/reference'

type Unsub = () => void;

type StartArgs = {
  windowId: string;
  meta: HypernoteMeta | Record<string, any>;
  relays: string[];
  context: any; // { user: { pubkey } }
  onScalars: (scalars: Record<string, any>) => void;
};

class QueryRuntime {
  private client: any | null = null;
  private relays: string[] = [];
  private warnedMissing = false;

  async ensureClient(relays: string[]): Promise<boolean> {
    const store = getDefaultStore()
    const hs = store.get(hypersauceClientAtom) as any | null
    if (!hs) { if (!this.warnedMissing) { console.warn('[Hypersauce] client not initialized'); this.warnedMissing = true } ; return false }
    this.client = hs
    if (JSON.stringify(relays) !== JSON.stringify(this.relays)) {
      try { this.client.setRelays(relays); } catch {}
      this.relays = relays.slice();
    }
    return true;
  }

  async setRelays(relays: string[]) {
    if (!this.client) return;
    if (JSON.stringify(relays) !== JSON.stringify(this.relays)) {
      this.client.setRelays(relays);
      this.relays = relays.slice();
    }
  }

  stop(windowId: string) {
    const store = getDefaultStore()
    try {
      store.set(windowQueryStreamsAtom(windowId), {})
      store.set(windowScalarsAtom(windowId), {})
    } catch {}
  }

  async start({ windowId, meta, relays, context, onScalars }: StartArgs) {
    try {
      this.stop(windowId);
      const queriesMeta = (meta && typeof meta.queries === 'object') ? (meta.queries as Record<string, any>) : {};
      const queryEntries = Object.entries(queriesMeta);
      if (!queryEntries.length) return; // nothing to start
      const queryNames = queryEntries.map(([name]) => String(name));
      const ok = await this.ensureClient(relays);
      if (!ok) return; // quietly no-op if hypersauce not available
      // Gate on pubkey: if missing, do not start
      if (!context?.user?.pubkey) return;

      const doc: any = { type: 'hypernote', name: String(windowId) }
      if (meta?.hypernote && typeof meta.hypernote === 'object') doc.hypernote = meta.hypernote
      const resolvedQueries: Record<string, any> = {}
      for (const [name, def] of queryEntries) {
        resolvedQueries[name] = deepResolve(def, context)
      }
      if (Object.keys(resolvedQueries).length) doc.queries = resolvedQueries

      const store = getDefaultStore()
      const streamsAtom = windowQueryStreamsAtom(windowId)
      store.set(streamsAtom, {})
      const streamMap = this.client.composeDocQueries(doc, context)
      const entries = Array.from(streamMap.entries()).map(([name, stream]) => {
        const normalizedName = name.startsWith('$') ? name.slice(1) : name
        return [normalizedName, wrapStream(stream)] as const
      })
      const normalized = Object.fromEntries(entries)
      store.set(streamsAtom, normalized)
      // Reset scalar snapshot cache so UI falls back to loading state until streams emit
      store.set(windowScalarsAtom(windowId), {})
      onScalars(Object.fromEntries(entries.map(([name]) => [name, []])))
    } catch (e) {
      console.warn('[Hypersauce] start error', e);
    }
  }
}

export const queryRuntime = new QueryRuntime();

function deepResolve(value: any, context: any): any {
  if (Array.isArray(value)) return value.map(item => deepResolve(item, context))
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(value)) out[k] = deepResolve(v, context)
    return out
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    const ref = parseReference(trimmed)
    if (ref) {
      if (ref.root === 'queries') return trimmed
      const resolved = resolveReference(trimmed, { globals: context })
      if (resolved !== undefined) return resolved
    }
  }
  return value
}

function toRenderable(value: any): any {
  if (value instanceof Map) return toRenderable(Object.fromEntries(value.entries()));
  if (Array.isArray(value)) return value.map(item => toRenderable(item));
  if (!value || typeof value !== 'object') return value;

  const out: Record<string, any> = {};
  for (const [key, val] of Object.entries(value)) out[key] = toRenderable(val);

  if (typeof out.kind === 'number' && typeof out.pubkey === 'string' && Array.isArray(out.tags)) {
    const identifier = findDTag(out.tags);
    if (identifier && !out.naddr) {
      try { out.naddr = nip19.naddrEncode({ kind: out.kind, pubkey: out.pubkey, identifier: String(identifier) }); } catch {}
    }
    if (!out.parsed && typeof out.content === 'string') {
      try { out.parsed = JSON.parse(out.content); } catch {}
    }
  }

  return out;
}

function findDTag(tags: any[]): string | null {
  for (const tag of tags) {
    if (Array.isArray(tag) && tag[0] === 'd' && typeof tag[1] === 'string') return tag[1];
  }
  return null;
}

function wrapStream(stream: any) {
  return {
    subscribe(observer: any) {
      const handlers = typeof observer === 'function' ? { next: observer } : observer || {}
      const sub = stream?.subscribe?.({
        next: (value: any) => {
          try { handlers.next?.(toRenderable(value)) } catch (err) { handlers.error?.(err) }
        },
        error: (err: any) => handlers.error?.(err),
        complete: () => handlers.complete?.(),
      })
      return {
        unsubscribe() {
          try { sub?.unsubscribe?.() } catch {}
        },
      }
    },
  }
}
