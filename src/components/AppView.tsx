import { useMemo, useEffect, useRef } from "react";
import { compileMarkdownDoc, type UiNode } from "../compiler";
import { useAtomValue, useSetAtom } from 'jotai'
import { windowScalarsAtom } from '../state/queriesAtoms'
import { docAtom, userAtom, relaysAtom, windowTimeAtom, debugAtom, compiledDocAtom } from '../state/appAtoms'
import { formsAtom } from '../state/formsAtoms'
import { queryRuntime } from '../queries/runtime'
import { docActionsAtom, buildDocActionMap } from '../state/actions'
import { RenderNodes } from './nodes'

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
  const rawScalars = useAtomValue(windowScalarsAtom(id));
  const forms = useAtomValue(formsAtom(id))
  const globals = useMemo(() => {
    const timeObj = { now: timeNow };
    return {
      user: globalsUser,
      time: timeObj,
      form: forms,
    };
  }, [globalsUser, timeNow, forms]);
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
    if (debug) console.log(`[Cause] ${id}: queries`, Object.keys(rawScalars || {}));
  }, [rawScalars, debug]);

  // No artificial tick; re-render comes from globals/$time.now store updates

  // Start/stop queries for this app when meta or pubkey changes
  const relays = useAtomValue(relaysAtom)
  useEffect(() => {
    if (!compiled || compileError) return;
    const userContext = globals.user?.pubkey ? { pubkey: globals.user.pubkey } : undefined
    const ctx: Record<string, any> = {}
    if (userContext) ctx.user = userContext
    if (forms && Object.keys(forms || {}).length > 0) ctx.form = forms
    queryRuntime.start({
      windowId: id,
      meta: compiled.meta,
      relays,
      context: ctx,
      onScalars: () => {},
    }).catch(e => console.warn('[Hypersauce] start failed', e))
    return () => queryRuntime.stop(id)
  }, [id, compiled, compileError, globals.user.pubkey, relays])

  const EMPTY_QUERIES: Record<string, any> = useMemo(() => ({}), []);
  const EMPTY_PENDING: Record<string, boolean> = useMemo(() => ({}), []);
  const queriesForWindow = (rawScalars?.queries as Record<string, any> | undefined) ?? EMPTY_QUERIES;
  const pendingMap = (rawScalars?.__pending as Record<string, boolean> | undefined) ?? EMPTY_PENDING;

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

  return <RenderNodes nodes={nodes} globals={globals} windowId={id} queries={queriesForWindow} pending={pendingMap} debug={debug} />;
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

export function parseFrontmatterName(doc: string): string | undefined {
  try {
    const { meta } = compileMarkdownDoc(doc);
    if (meta?.hypernote?.name) return meta.hypernote.name;
    if (meta && typeof meta.name === "string") return meta.name;
  } catch {}
  return undefined;
}
