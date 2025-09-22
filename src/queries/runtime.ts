// Lightweight runtime wrapper around Hypersauce that manages per-window
// query subscriptions and emits only small derived scalars back to the store.

import { getDefaultStore } from 'jotai'
import { nip19 } from 'nostr-tools'
import { hypersauceClientAtom } from '../state/hypersauce'
import { windowScalarsAtom, type QuerySnapshot } from '../state/queriesAtoms'
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
      for (const [name, def] of queryEntries) {
        doc[`$${name}`] = normalizeQueryDefinition(def)
      }

      const resolvedDoc = resolveQueryDoc(doc, context)

      // Seed pending markers for each declared query so UI can render loading fallbacks
      try {
        if (queryNames.length) {
          const store = getDefaultStore()
          const atom = windowScalarsAtom(windowId)
          const prev = store.get(atom) || {}
          let changed = false
          const nextQueries: Record<string, any> = { ...(prev.queries || {}) }
          for (const name of queryNames) {
            if (!(name in nextQueries)) {
              nextQueries[name] = PENDING_MARKER
              changed = true
            }
          }
          if (changed) {
            const next = { ...prev, queries: nextQueries }
            store.set(atom, next)
          }
        }
      } catch {}

      const store = getDefaultStore()
      const atom = windowScalarsAtom(windowId)
      const prevSnapshots = store.get(atom) || {}
      const initialSnapshots: Record<string, QuerySnapshot> = { ...prevSnapshots }
      for (const name of queryNames) {
        if (!initialSnapshots[name]) {
          initialSnapshots[name] = { status: 'loading', data: [] }
        }
      }
      store.set(atom, initialSnapshots)

      const sub = this.client
        .runQueryDocumentLive(resolvedDoc, context)
        .subscribe({
          next: (resultMap: Map<string, any>) => {
            const store = getDefaultStore();
            const atom = windowScalarsAtom(windowId);
            const prevSnapshots = store.get(atom) || {};
            const nextSnapshots: Record<string, QuerySnapshot> = { ...prevSnapshots };
            for (const name of queryNames) {
              if (!nextSnapshots[name]) {
                nextSnapshots[name] = { status: 'loading', data: [] };
              }
            }
            for (const [qid, value] of resultMap) {
              const name = qid.startsWith('$') ? qid.slice(1) : qid;
              if (!queryNames.includes(name)) continue;
              const rendered = toRenderable(value);
              nextSnapshots[name] = { status: 'ready', data: rendered };
            }
            store.set(atom, nextSnapshots);
            onScalars(Object.fromEntries(Object.entries(nextSnapshots).map(([k, v]) => [k, v.data])));
          },
          error: (err: any) => {
            const store = getDefaultStore();
            const atom = windowScalarsAtom(windowId);
            const prevSnapshots = store.get(atom) || {};
            const nextSnapshots: Record<string, QuerySnapshot> = { ...prevSnapshots };
            const message = err instanceof Error ? err.message : String(err);
            for (const name of queryNames) {
              const prevData = prevSnapshots[name]?.data ?? [];
              nextSnapshots[name] = { status: 'error', data: prevData, error: message };
            }
            store.set(atom, nextSnapshots);
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
      const resolved = getContextPath(trimmed.slice(1), context)
      if (resolved !== undefined) return resolved
    }
    const ref = parseReference(trimmed)
    if (ref) {
      if (ref.root === 'queries') return `$${trimmed.slice('queries.'.length)}`
      const resolved = resolveReference(trimmed, { globals: context })
      if (resolved !== undefined) return resolved
    }
  }
  return value
}

function getContextPath(path: string, context: any): any {
  const parts = path.split('.').filter(Boolean)
  let current: any = context
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined
    current = current[part]
  }
  return current
}

function normalizeQueryDefinition(value: any): any {
  if (Array.isArray(value)) return value.map(item => normalizeQueryDefinition(item))
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(value)) out[k] = normalizeQueryDefinition(v)
    return out
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.startsWith('queries.')) {
      return `$${trimmed.slice('queries.'.length)}`
    }
    return value
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
