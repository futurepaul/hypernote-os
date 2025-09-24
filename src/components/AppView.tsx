import { useMemo, useEffect, useRef, useState } from "react";
import { compileMarkdownDoc, type UiNode } from "../compiler";
import { useAtomValue, useSetAtom } from 'jotai'
import { windowQueryStreamsAtom, queryEpochAtom } from '../state/queriesAtoms'
import { docAtom, userAtom, relaysAtom, windowTimeAtom, debugAtom, compiledDocAtom } from '../state/appAtoms'
import { formsAtom } from '../state/formsAtoms'
import { docStateAtom } from '../state/docStateAtoms'
import { queryRuntime } from '../queries/runtime'
import { docActionsAtom, buildDocActionMap } from '../state/actions'
import { RenderNodes } from './nodes'
import { installedAppsAtom, windowIntentAtom } from '../state/systemAtoms'
import { hypersauceClientAtom } from '../state/hypersauce'

export function AppView({ id }: { id: string }) {
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

  const usesTime = useMemo(() => {
    const deps = compiled?.meta?.dependencies?.globals || [];
    if (deps.length) return deps.includes('time');
    return nodes.some(node => node.deps?.globals?.includes('time'));
  }, [compiled?.meta?.dependencies?.globals, nodes]);

  const globalsUser = useAtomValue(userAtom);
  const timeNow = useAtomValue(windowTimeAtom(id));
  const queryStreams = useAtomValue(windowQueryStreamsAtom(id));
  const queryEpoch = useAtomValue(queryEpochAtom)
  const appsList = useAtomValue(installedAppsAtom)
  const intentAtomRef = useMemo(() => windowIntentAtom(id), [id])
  const launchIntent = useAtomValue(intentAtomRef)
  const hypersauceClient = useAtomValue(hypersauceClientAtom)
  const formsAtomRef = useMemo(() => formsAtom(id), [id])
  const forms = useAtomValue(formsAtomRef)
  const setForms = useSetAtom(formsAtomRef)
  const stateAtomRef = useMemo(() => docStateAtom(id), [id])
  const docState = useAtomValue(stateAtomRef)
  const setDocState = useSetAtom(stateAtomRef)
  const systemGlobals = useMemo(() => ({
    apps: appsList,
    intent: launchIntent,
    window: { id },
  }), [appsList, launchIntent, id]);

  const globals = useMemo(() => {
    const timeObj = { now: timeNow };
    return {
      user: globalsUser,
      time: timeObj,
      form: forms,
      state: docState,
      system: systemGlobals,
    };
  }, [globalsUser, timeNow, forms, docState, systemGlobals]);
  const formsReady = true
  const stateReady = true

  const renderCount = useRef(0);
  const debug = useAtomValue(debugAtom)
  useEffect(() => {
    renderCount.current += 1;
  });

  useEffect(() => {
    if (debug) console.log(`[Cause] ${id}: doc changed`, { len: doc.length });
  }, [doc, debug, id]);
  useEffect(() => {
    if (usesTime && debug) console.log(`[Cause] ${id}: $time.now`, timeNow);
  }, [timeNow, usesTime, debug, id]);
  useEffect(() => {
    if (debug) console.log(`[Cause] ${id}: user.pubkey`, globalsUser?.pubkey);
  }, [globalsUser?.pubkey, debug, id]);
  useEffect(() => {
    if (debug) console.log(`[Cause] ${id}: state keys`, Object.keys(docState || {}));
  }, [docState, debug, id]);
  useEffect(() => {
    if (debug) console.log(`[Cause] ${id}: query streams`, Object.keys(queryStreams || {}));
  }, [queryStreams, debug, id]);

  useEffect(() => {
    if (!compiled || compileError) return;
    const defaults = compiled.meta?.forms;
    if (!defaults || typeof defaults !== 'object') return;
    setForms(prev => {
      const prevObj = prev || {};
      const missing = Object.keys(defaults).some(key => prevObj[key] === undefined || prevObj[key] === '');
      if (!missing) return prev ?? prevObj;
      return { ...defaults, ...prevObj };
    });
  }, [compiled, compileError, setForms]);

  useEffect(() => {
    if (!compiled || compileError) return;
    const defaults = compiled.meta?.state;
    if (!defaults || typeof defaults !== 'object') return;
    setDocState(prev => {
      const prevObj = prev || {};
      const missing = Object.keys(defaults).some(key => prevObj[key] === undefined);
      if (!missing) return prev ?? prevObj;
      return { ...defaults, ...prevObj };
    });
  }, [compiled, compileError, setDocState]);

  const relays = useAtomValue(relaysAtom)
  useEffect(() => {
    if (!compiled || compileError) return;
    if (!formsReady || !stateReady) return;
    const userContext = globals.user?.pubkey ? { pubkey: globals.user.pubkey } : undefined
    const ctx: Record<string, any> = {}
    if (userContext) ctx.user = userContext
    if (docState && Object.keys(docState || {}).length > 0) ctx.state = docState
    if (forms && Object.keys(forms || {}).length > 0) ctx.form = forms
    if (launchIntent !== undefined && launchIntent !== null) ctx.system = { intent: launchIntent }
    queryRuntime.start({
      windowId: id,
      meta: compiled.meta,
      relays,
      context: ctx,
    }).catch(e => console.warn('[Hypersauce] start failed', e))
    return () => queryRuntime.stop(id)
  }, [id, compiled, compileError, globals.user?.pubkey, relays, docState, forms, launchIntent, hypersauceClient, queryEpoch, formsReady, stateReady])

  const { data: queriesForWindow, errors: queryErrors } = useQueryStreamData(queryStreams, id, !!debug)

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

  return <RenderNodes nodes={nodes} globals={globals} windowId={id} queries={queriesForWindow} errors={queryErrors} debug={debug} />;
}
function useQueryStreamData(
  streams: Record<string, any> | undefined,
  windowId: string,
  debug: boolean,
): { data: Record<string, any>; errors: Record<string, string> } {
  const [data, setData] = useState<Record<string, any>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    const entries = Object.entries(streams || {})
    if (!entries.length) {
      setData({})
      setErrors({})
      return
    }

    setData(prev => {
      const next: Record<string, any> = {}
      for (const [name] of entries) {
        next[name] = Object.prototype.hasOwnProperty.call(prev, name) ? prev[name] : []
      }
      return next
    })
    setErrors(prev => {
      const next: Record<string, string> = {}
      for (const [name] of entries) {
        if (prev[name]) next[name] = prev[name]
      }
      return next
    })

    const subs = entries
      .map(([name, stream]) => {
        if (!stream || typeof stream.subscribe !== 'function') return null
        return stream.subscribe({
          next: (value: any) => {
            if (debug) {
              const preview = Array.isArray(value) ? { length: value.length } : value
              console.debug(`[AppView:${windowId}] next ${name}`, preview)
            }
            setData(prev => ({ ...prev, [name]: value }))
            setErrors(prev => {
              if (!prev[name]) return prev
              const { [name]: _, ...rest } = prev
              return rest
            })
          },
          error: (err: any) => {
            const message = err instanceof Error ? err.message : String(err)
            if (debug) console.warn(`[AppView:${windowId}] error ${name}`, err)
            setErrors(prev => ({ ...prev, [name]: message }))
          },
        })
      })
      .filter(Boolean) as Array<{ unsubscribe(): void }>

    return () => {
      for (const sub of subs) {
        try { sub.unsubscribe() } catch {}
      }
    }
  }, [streams, windowId, debug])

  return { data, errors }
}

export function parseFrontmatterName(doc: string): string | undefined {
  try {
    const { meta } = compileMarkdownDoc(doc);
    if (meta?.hypernote?.name) return meta.hypernote.name;
    if (meta && typeof meta.name === "string") return meta.name;
  } catch {}
  return undefined;
}
