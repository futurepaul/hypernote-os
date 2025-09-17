// Lightweight runtime wrapper around Hypersauce that manages per-window
// query subscriptions and emits only small derived scalars back to the store.

import { getDefaultStore } from 'jotai'
import { mergeScalars, windowScalarsAtom } from '../state/queriesAtoms'

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

  async ensureClient(relays: string[]) {
    // Lazy load to avoid hard dependency unless used
    if (!this.client) {
      const mod: any = await import(/* @vite-ignore */ 'hypersauce').catch(() => null);
      if (!mod || !mod.HypersauceClient) throw new Error('Hypersauce not available');
      this.client = new mod.HypersauceClient({ relays });
      this.relays = relays.slice();
    } else if (JSON.stringify(relays) !== JSON.stringify(this.relays)) {
      this.client.setRelays(relays);
      this.relays = relays.slice();
    }
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
    this.stop(windowId);
    // Extract $queries from meta
    const doc: any = { type: 'hypernote', name: String(windowId), ...meta };
    const hasQueries = Object.keys(meta || {}).some(k => k.startsWith('$'));
    if (!hasQueries) return; // nothing to start
    await this.ensureClient(relays);
    // Gate on pubkey: if missing, do not start
    if (!context?.user?.pubkey) return;

    const sub = this.client
      .runQueryDocumentLive(doc, context)
      .subscribe({
        next: (resultMap: Map<string, any>) => {
          const scalars: Record<string, any> = {};
          for (const [qid, value] of resultMap) {
            if (
              value == null ||
              typeof value === 'string' ||
              typeof value === 'number' ||
              typeof value === 'boolean'
            ) {
              scalars[qid] = value ?? '';
            } else if (Array.isArray(value)) {
              const summary: any = { length: value.length };
              if (value.length > 0) summary.first = value[0];
              scalars[qid] = summary;
              scalars[qid + '.length'] = value.length; // legacy convenience
            } else if (typeof value === 'object') {
              scalars[qid] = value; // allow path access like {{$profile.name}}
            } else {
              scalars[qid] = '';
            }
          }
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
  }
}

export const queryRuntime = new QueryRuntime();
