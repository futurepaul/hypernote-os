// Lightweight runtime wrapper around Hypersauce that manages per-window
// query subscriptions and emits only small derived scalars back to the store.

import { getDefaultStore } from 'jotai'
import { hypersauceClientAtom } from '../state/hypersauce'
import { mergeScalars, windowScalarsAtom } from '../state/queriesAtoms'
import { nip19 } from 'nostr-tools'

type Unsub = () => void;

type StartArgs = {
  windowId: string;
  meta: Record<string, any>;
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
      // Extract $queries from meta
      const doc: any = { type: 'hypernote', name: String(windowId), ...meta };
      const hasQueries = Object.keys(meta || {}).some(k => k.startsWith('$'));
      if (!hasQueries) return; // nothing to start
      const ok = await this.ensureClient(relays);
      if (!ok) return; // quietly no-op if hypersauce not available
      // Gate on pubkey: if missing, do not start
      if (!context?.user?.pubkey) return;

      const sub = this.client
        .runQueryDocumentLive(doc, context)
        .subscribe({
          next: (resultMap: Map<string, any>) => {
            const scalars: Record<string, any> = {};
            for (const [qid, value] of resultMap) scalars[qid] = decorateValue(value);
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
// @ts-nocheck

function decorateValue(value: any): any {
  if (Array.isArray(value)) return value.map(decorateValue);
  if (!value || typeof value !== 'object') return value;
  if (typeof value.kind === 'number' && typeof value.pubkey === 'string') {
    const out: any = { ...value };
    if (typeof out.pubkey === 'string' && !out.npub) {
      try { out.npub = nip19.npubEncode(out.pubkey); } catch {}
    }
    if (typeof out.pubkey === 'string' && Array.isArray(out.tags)) {
      const identifier = out.tags.find((tag: any) => Array.isArray(tag) && tag[0] === 'd')?.[1];
      if (identifier && !out.naddr) {
        try { out.naddr = nip19.naddrEncode({ kind: out.kind, pubkey: out.pubkey, identifier: String(identifier) }); } catch {}
      }
    }
    return out;
  }
  return value;
}
