// Lightweight runtime wrapper around Hypersauce that manages per-window
// query subscriptions and emits only small derived scalars back to the store.

import { getDefaultStore } from 'jotai'
import { nip19 } from 'nostr-tools'
import { hypersauceClientAtom } from '../state/hypersauce'
import { mergeScalars, windowScalarsAtom } from '../state/queriesAtoms'

type Unsub = () => void;

type StartArgs = {
  windowId: string;
  meta: Record<string, any>;
  relays: string[];
  context: any; // { user: { pubkey } }
  onScalars: (scalars: Record<string, any>) => void;
};

const PENDING_MARKER = Symbol('pending');

class QueryRuntime {
  private client: any | null = null;
  private relays: string[] = [];
  private subs = new Map<string, { unsubscribe(): void }>();
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
    const sub = this.subs.get(windowId);
    if (sub) {
      try { sub.unsubscribe(); } catch {}
      this.subs.delete(windowId);
    }
  }

  async start({ windowId, meta, relays, context, onScalars }: StartArgs) {
    try {
      this.stop(windowId);
      // Extract $queries from meta
      const doc: any = { type: 'hypernote', name: String(windowId), ...meta };
      const hasQueries = Object.keys(meta || {}).some(k => k.startsWith('$'));
      if (!hasQueries) return; // nothing to start
      const ok = await this.ensureClient(relays);
      if (!ok) return; // quietly no-op if hypersauce not available
      // Gate on pubkey: if missing, do not start
      if (!context?.user?.pubkey) return;

      const resolvedDoc = resolveQueryDoc(doc, context)

      // Seed pending markers for each declared query so UI can render loading fallbacks
      try {
        const queryKeys = Object.keys(meta || {}).filter((key) => key.startsWith('$'))
        if (queryKeys.length) {
          const store = getDefaultStore()
          const atom = windowScalarsAtom(windowId)
          const prev = store.get(atom) || {}
          let changed = false
          const next: Record<string, any> = { ...prev }
          for (const key of queryKeys) {
            if (!(key in next)) {
              next[key] = PENDING_MARKER
              changed = true
            }
          }
          if (changed) store.set(atom, next)
        }
      } catch {}

      const sub = this.client
        .runQueryDocumentLive(resolvedDoc, context)
        .subscribe({
          next: (resultMap: Map<string, any>) => {
            const scalars: Record<string, any> = {};
            for (const [qid, value] of resultMap) scalars[qid] = toRenderable(value);
            // Push into per-window Jotai atom to avoid global re-renders
            try {
              const store = getDefaultStore();
              const atom = windowScalarsAtom(windowId);
              const prev = store.get(atom);
              const merged = mergeScalars(prev, scalars);
              if (merged !== prev) store.set(atom, merged);
            } catch {}
            onScalars(scalars);
          },
          error: (_e: any) => {
            // Intentionally swallow; store may add error channel later
          },
        });
      this.subs.set(windowId, sub);
    } catch (e) {
      console.warn('[Hypersauce] start error', e);
    }
  }
}

export const queryRuntime = new QueryRuntime();

function resolveQueryDoc(doc: any, context: any): any {
  return deepResolve(doc, context)
}

function deepResolve(value: any, context: any): any {
  if (Array.isArray(value)) return value.map(item => deepResolve(item, context))
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(value)) out[k] = deepResolve(v, context)
    return out
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (/^\$[A-Za-z0-9_.-]+$/.test(trimmed)) {
      const resolved = resolveContextPath(trimmed, context)
      if (resolved !== undefined) return resolved
    }
  }
  return value
}

function resolveContextPath(token: string, context: any): any {
  const path = token.startsWith('$') ? token.slice(1) : token
  if (!path) return undefined
  const parts = path.split('.').filter(Boolean)
  let current: any = context
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined
    current = current[part]
  }
  return current
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
