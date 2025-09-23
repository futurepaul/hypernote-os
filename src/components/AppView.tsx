import { useMemo, useEffect, useRef, useState } from "react";
import { compileMarkdownDoc, type UiNode } from "../compiler";
import { useAtomValue, useSetAtom } from 'jotai'
import { windowQueryStreamsAtom } from '../state/queriesAtoms'
import { docAtom, userAtom, relaysAtom, windowTimeAtom, debugAtom, compiledDocAtom } from '../state/appAtoms'
import { formsAtom } from '../state/formsAtoms'
import { docStateAtom } from '../state/docStateAtoms'
import { queryRuntime } from '../queries/runtime'
import { docActionsAtom, buildDocActionMap } from '../state/actions'
import { RenderNodes } from './nodes'
import { parseReference, resolveReference, type ReferenceScope } from '../interp/reference'

export function AppView({ id }: { id: string }) {
  // Select only the doc text for this window to avoid global re-renders
  const doc = useAtomValue(docAtom(id)) || "";
  const { doc: compiled, error: compileError } = useAtomValue(compiledDocAtom(id));
  const docActionsAtomRef = useMemo(() => docActionsAtom(id), [id])
  const setDocActions = useSetAtom(docActionsAtomRef)
  const nodes = useMemo(() => (compiled?.ast ?? []) as UiNode[], [compiled]);

  useEffect(() => {
    if (!compiled || compileError) {
      setDocActions({})
      return
    }
    const actions = buildDocActionMap(compiled.meta?.actions)
    setDocActions(actions)
    return () => {
      setDocActions({})
    }
  }, [compiled, compileError, setDocActions])

  // Detect if this document references $time.now; if not, don't subscribe to time updates
  const usesTime = useMemo(() => astUsesGlobal(nodes, 'time'), [nodes]);

  // Select only the slices we need for this window
  const globalsUser = useAtomValue(userAtom);
  const timeNow = useAtomValue(windowTimeAtom(id));
  const queryStreams = useAtomValue(windowQueryStreamsAtom(id));
  const formsAtomRef = useMemo(() => formsAtom(id), [id])
  const forms = useAtomValue(formsAtomRef)
  const setForms = useSetAtom(formsAtomRef)
  const stateAtomRef = useMemo(() => docStateAtom(id), [id])
  const docState = useAtomValue(stateAtomRef)
  const setDocState = useSetAtom(stateAtomRef)
  const globals = useMemo(() => {
    const timeObj = { now: timeNow };
    return {
      user: globalsUser,
      time: timeObj,
      form: forms,
      state: docState,
    };
  }, [globalsUser, timeNow, forms, docState]);
  // Fallback: if Hypersauce queries are unavailable, derive $profile from user.profile
  // Per-render logging to trace causes
  const renderCount = useRef(0);
  const debug = useAtomValue(debugAtom)
  useEffect(() => {
    const n = ++renderCount.current;
    try {
      // summarize keys to avoid huge logs
      const k = Object.keys(rawScalars || {});
      // Useful for debugging where re-renders are happening but noisy because of the clock
      // console.log(`[Render] AppView ${id} #${n}`, { docLen: doc.length, usesTime, timeNow, userPubkey: globalsUser?.pubkey, scalars: k });
    } catch {}
  });

  useEffect(() => {
    console.log(`[Cause] ${id}: doc changed`, { len: doc.length });
  }, [doc]);
  useEffect(() => {
      if (usesTime && debug) console.log(`[Cause] ${id}: $time.now`, timeNow);
  }, [timeNow, usesTime, debug]);
  useEffect(() => {
    if (debug) console.log(`[Cause] ${id}: user.pubkey`, globalsUser?.pubkey);
  }, [globalsUser?.pubkey, debug]);
  useEffect(() => {
    if (debug) console.log(`[Cause] ${id}: state keys`, Object.keys(docState || {}));
  }, [docState, debug, id]);
  useEffect(() => {
    if (debug) console.log(`[Cause] ${id}: query streams`, Object.keys(queryStreams || {}));
  }, [queryStreams, debug]);
  useEffect(() => {
    if (!compiled || compileError) return;
    const defaults = compiled.meta?.forms;
    if (!defaults || typeof defaults !== 'object') return;
    const scope: ReferenceScope = {
      globals: { user: globalsUser, time: { now: timeNow } },
      queries: {},
    };
    setForms(prev => {
      const prevObj = prev || {};
      let changed = false;
      const next = { ...prevObj };
      for (const [key, raw] of Object.entries(defaults)) {
        if (next[key] !== undefined && next[key] !== '') continue;
        const resolved = resolveMetaValue(raw, scope);
        if (resolved !== undefined && resolved !== next[key]) {
          next[key] = resolved;
          changed = true;
        }
      }
      return changed ? next : prevObj;
    });
  }, [compiled, compileError, setForms, globalsUser, timeNow]);

  useEffect(() => {
    if (!compiled || compileError) return;
    const defaults = compiled.meta?.state;
    if (!defaults || typeof defaults !== 'object') return;
    const scope: ReferenceScope = {
      globals: { user: globalsUser, time: { now: timeNow } },
      queries: {},
    };
    setDocState(prev => {
      const prevObj = prev || {};
      let changed = false;
      const next = { ...prevObj };
      for (const [key, raw] of Object.entries(defaults)) {
        if (next[key] !== undefined) continue;
        const resolved = resolveMetaValue(raw, scope);
        if (resolved !== undefined && resolved !== next[key]) {
          next[key] = resolved;
          changed = true;
        }
      }
      return changed ? next : prevObj;
    });
  }, [compiled, compileError, setDocState, globalsUser, timeNow]);

  // No artificial tick; re-render comes from globals/$time.now store updates

  // Start/stop queries for this app when meta or pubkey changes
  const relays = useAtomValue(relaysAtom)
  useEffect(() => {
    if (!compiled || compileError) return;
    const userContext = globals.user?.pubkey ? { pubkey: globals.user.pubkey } : undefined
    const ctx: Record<string, any> = {}
    if (userContext) ctx.user = userContext
    if (docState && Object.keys(docState || {}).length > 0) ctx.state = docState
    queryRuntime.start({
      windowId: id,
      meta: compiled.meta,
      relays,
      context: ctx,
      onScalars: () => {},
    }).catch(e => console.warn('[Hypersauce] start failed', e))
    return () => queryRuntime.stop(id)
  }, [id, compiled, compileError, globals.user?.pubkey, relays, docState])

  const { data: queriesForWindow, statuses: queryStatusMap } = useQuerySnapshotState(queryStreams);

  if (compileError) {
    return (
      <div className="p-4 text-sm text-red-800 bg-red-50 border border-red-200 rounded">
        <p className="font-semibold">Failed to render “{id}”.</p>
        <p className="mt-2">{compileError.message}</p>
        <p className="mt-2 text-xs text-red-600">Remove raw HTML from the document before publishing.</p>
      </div>
    );
  }

  if (!compiled) {
    return <div className="p-4 text-sm text-red-800 bg-red-50 border border-red-200 rounded">Document unavailable.</div>;
  }

  return <RenderNodes nodes={nodes} globals={globals} windowId={id} queries={queriesForWindow} statuses={queryStatusMap} debug={debug} />;
}

type QueryStatus = 'loading' | 'ready' | 'error';

function useQuerySnapshotState(streams: Record<string, any> | undefined): { data: Record<string, any>; statuses: Record<string, QueryStatus> } {
  const [state, setState] = useState<{ data: Record<string, any>; statuses: Record<string, QueryStatus> }>({ data: {}, statuses: {} })

  useEffect(() => {
    const entries = Object.entries(streams || {})
    setState(prev => {
      const nextData: Record<string, any> = {}
      const nextStatuses: Record<string, QueryStatus> = {}
      for (const [name] of entries) {
        nextData[name] = Object.prototype.hasOwnProperty.call(prev.data, name) ? prev.data[name] : []
        nextStatuses[name] = prev.statuses[name] ?? 'loading'
      }
      return { data: nextData, statuses: nextStatuses }
    })

    if (entries.length === 0) return () => {}

    const subs = entries
      .map(([name, stream]) => {
        if (!stream || typeof stream.subscribe !== 'function') return null
        return stream.subscribe({
          next: (value: any) => {
            setState(prev => ({
              data: { ...prev.data, [name]: value },
              statuses: { ...prev.statuses, [name]: 'ready' },
            }))
          },
          error: (err: any) => {
            const message = err instanceof Error ? err.message : String(err)
            setState(prev => ({
              data: prev.data,
              statuses: { ...prev.statuses, [name]: 'error' },
            }))
            console.warn('[Hypersauce] query stream error', name, message)
          },
        })
      })
      .filter(Boolean) as Array<{ unsubscribe(): void }>

    return () => {
      for (const sub of subs) {
        try { sub.unsubscribe() } catch {}
      }
    }
  }, [streams])

  return state
}

function astUsesGlobal(nodes: UiNode[], target: string): boolean {
  if (!nodes || !nodes.length) return false;
  const queue = [...nodes];
  while (queue.length) {
    const node = queue.pop();
    if (!node) continue;
    if (node.deps?.globals?.includes(target)) return true;
    if (Array.isArray((node as any).children)) {
      queue.push(...((node.children as UiNode[]) || []));
    }
  }
  return false;
}

function resolveMetaValue(value: any, scope: ReferenceScope): any {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) {
      const ref = parseReference(trimmed);
      if (ref) {
        const resolved = resolveReference(trimmed, scope);
        return resolved !== undefined ? resolved : undefined;
      }
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(item => resolveMetaValue(item, scope));
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [key, val] of Object.entries(value)) out[key] = resolveMetaValue(val, scope);
    return out;
  }
  return value;
}

export function parseFrontmatterName(doc: string): string | undefined {
  try {
    const { meta } = compileMarkdownDoc(doc);
    if (meta?.hypernote?.name) return meta.hypernote.name;
    if (meta && typeof meta.name === "string") return meta.name;
  } catch {}
  return undefined;
}
