import { useMemo, useEffect, useState, useRef, Fragment, type ReactNode } from "react";
import { nip19, getPublicKey } from "nostr-tools";
import { compileMarkdownDoc, type UiNode } from "../compiler";
import { useAtomValue, useAtom } from 'jotai'
import { windowScalarsAtom } from '../state/queriesAtoms'
import { docAtom, userAtom, relaysAtom, windowTimeAtom, debugAtom } from '../state/appAtoms'
import { formsAtom } from '../state/formsAtoms'
import { queryRuntime } from '../queries/runtime'
import { interpolate as interp, resolveImgDollarSrc } from '../interp/interpolate'
import { useAction, normalizeActionName } from '../state/actions'
import { toHast } from 'very-small-parser/lib/markdown/block/toHast'
import { toText as htmlToText } from 'very-small-parser/lib/html/toText'
import { slugify } from '../services/apps'

type Node = UiNode;


function interpolateText(text: string, globals: any, queries: Record<string, any>) {
  return interp(text, { globals, queries })
}

// parsing/compilation is handled by compiler.ts

function MarkdownNode({ n, globals, queries }: { n: Node; globals: any; queries: Record<string, any> }) {
  const deps = useMemo(() => {
    const refs = n.refs || []
    const q: Record<string, any> = (queries && typeof queries === 'object') ? queries : {}
    const getPath = (obj: any, path: string) => path.split('.').reduce((acc, k) => (acc && typeof acc === 'object') ? acc[k] : undefined, obj)
    return refs.map(ref => {
      if (ref === 'time.now') return String(globals?.time?.now ?? '')
      if (ref.startsWith('$')) {
        const [id, ...rest] = ref.split('.')
        const idKey = String(id)
        const base = (q as any)[idKey]
        const v = rest.length ? getPath(base, rest.join('.')) : base
        return JSON.stringify(v ?? '')
      }
      return String(getPath(globals, ref) ?? '')
    })
  }, [n.refs, queries, globals])

  const html = useMemo(() => {
    const tokens = (n.markdown as any) ?? []
    const cloned = JSON.parse(JSON.stringify(tokens))
    const hast = toHast(cloned)
    const raw = htmlToText(hast) as string
    const interpolated = interpolateText(raw, globals, queries)
    return resolveImgDollarSrc(interpolated, queries || {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n.id, ...deps])

  return <div className="app-markdown" dangerouslySetInnerHTML={{ __html: html }} />
}

function ButtonNode({ text, globals, action, windowId, queries, payloadSpec }: { text?: string; globals: any; action?: string; windowId: string; queries: Record<string, any>; payloadSpec?: any }) {
  const label = (interpolateText(String(text ?? ""), globals, queries).trim() || "Button");
  const payload = useMemo(() => buildPayload(payloadSpec, globals, queries), [payloadSpec, globals, queries])
  const run = useAction(action)
  const setPub = useAction('@set_pubkey')
  return (
    <button
      className="bg-gray-200 hover:bg-gray-300 text-gray-900 border border-gray-500 rounded px-3 py-1 text-sm"
      onClick={() => {
        if (action) {
          console.log("ButtonNode: running action", action, "user.pubkey=", globals?.user?.pubkey);
          const ensurePubFromForm = async () => {
            const act = normalizeActionName(action)
            if (act === 'load_profile' && !globals?.user?.pubkey) {
              const v: string | undefined = globals?.form?.pubkey
              const trimmed = (v || '').trim()
              if (!trimmed) return
              if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
                await setPub(trimmed.toLowerCase())
                return
              }
              if (/nsec1/i.test(trimmed)) {
                try {
                  const d = nip19.decode(trimmed);
                  if (d.type === 'nsec') {
                    const sk = d.data as Uint8Array | string;
                    const skHex = typeof sk === 'string' ? sk : Array.from(sk).map(b => b.toString(16).padStart(2, '0')).join('');
                    const pk = getPublicKey(skHex as any);
                    await setPub(pk)
                    return
                  }
                } catch {}
              }
              if (/npub1/i.test(trimmed)) {
                try {
                  const d = nip19.decode(trimmed);
                  if (d.type === 'npub') {
                    const data = d.data as Uint8Array | string;
                    const hex = typeof data === 'string' ? data : Array.from(data).map(b => b.toString(16).padStart(2, '0')).join('');
                    await setPub(hex)
                    return
                  }
                } catch {}
              }
            }
          }
          ensurePubFromForm().finally(() => {
            if (process.env.NODE_ENV !== 'production') {
              console.log('[ButtonNode] payload', payload)
            }
            run(payload).catch(e => console.warn('action error', e))
          })
        } else {
          console.log("ButtonNode: no action defined");
        }
      }}
    >
      {label}
    </button>
  );
}

function InputNode({ text, globals, windowId, name, queries }: { text: string; globals: any; windowId: string; name?: string; queries: Record<string, any> }) {
  const [, setForm] = useAtom(formsAtom(windowId))
  const [val, setVal] = useState("")
  const setPub = useAction('@set_pubkey')
  const ph = interpolateText(text || "", globals, queries);
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setVal(v)
    if (name) setForm((prev: any) => ({ ...(prev || {}), [name]: v }))
    console.log("InputNode:onChange", v);
    const trimmed = v.trim();
    // Hex pubkey (64 hex chars)
    if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
      const hex = trimmed.toLowerCase();
      setPub(hex)
      console.log("set user.pubkey from hex", hex);
      return;
    }
    if (/nsec1/i.test(v)) {
      try {
        const d = nip19.decode(trimmed);
        if (d.type === "nsec") {
          const sk = d.data as Uint8Array | string;
          const skHex = typeof sk === "string" ? sk : Array.from(sk).map(b => b.toString(16).padStart(2, "0")).join("");
          const pk = getPublicKey(skHex as any);
          setPub(pk)
          console.log("set user.pubkey from nsec", pk);
        }
      } catch {}
    }
    if (/npub1/i.test(v)) {
      try {
        const d = nip19.decode(trimmed);
        if (d.type === "npub") {
          const data = d.data as Uint8Array | string;
          const hex = typeof data === "string" ? data : Array.from(data).map(b => b.toString(16).padStart(2, "0")).join("");
          setPub(hex)
          console.log("set user.pubkey from npub", hex);
        }
      } catch {}
    }
  };
  return (
    <input
      value={val}
      onChange={onChange}
      placeholder={ph}
      className="border border-gray-400 rounded px-2 py-1 text-gray-900 bg-white"
    />
  );
}

type RenderNodesProps = {
  nodes: Node[];
  globals: any;
  windowId: string;
  queries: Record<string, any>;
  inline?: boolean;
  debug?: boolean;
};

function RenderNodes({ nodes, globals, windowId, queries, inline = false, debug = false }: RenderNodesProps) {
  const renderNode = (n: Node, key: number): ReactNode => {
    if (n.type === "markdown") {
      return <MarkdownNode key={n.id || key} n={n} globals={globals} queries={queries} />;
    }
    if (n.type === "button") {
      return (
        <ButtonNode
          key={key}
          text={n.data?.text || ""}
          action={n.data?.action}
          globals={globals}
          windowId={windowId}
          queries={queries}
          payloadSpec={n.data?.payload}
        />
      );
    }
    if (n.type === "input") {
      return (
        <InputNode
          key={key}
          text={n.data?.text || ""}
          name={n.data?.name}
          globals={globals}
          windowId={windowId}
          queries={queries}
        />
      );
    }
    if (n.type === "hstack" || n.type === "vstack") {
      return (
        <div key={key} className={n.type === "hstack" ? "flex flex-row gap-2" : "flex flex-col gap-2"}>
          {(n.children || []).map((c, j) => (
            <RenderNodes
              key={`${c.id || j}`}
              nodes={[c]}
              globals={globals}
              windowId={windowId}
              queries={queries}
              inline
              debug={debug}
            />
          ))}
        </div>
      );
    }
    if (n.type === "each") {
      return (
        <EachNode
          key={n.id || key}
          node={n}
          globals={globals}
          windowId={windowId}
          queries={queries}
          debug={debug}
        />
      );
    }
    return null;
  };

  const content = nodes.map((n, i) => renderNode(n, i));
  if (inline) return <>{content}</>;
  return <div className="flex flex-col gap-2">{content}</div>;
}

type EachNodeProps = {
  node: Node;
  globals: any;
  windowId: string;
  queries: Record<string, any>;
  debug?: boolean;
};

function EachNode({ node, globals, windowId, queries, debug = false }: EachNodeProps) {
  const data = node.data || {};
  const sourceRaw = typeof data.source === 'string' ? data.source : '$items';
  const source = sourceRaw.trim() || '$items';
  const asName = typeof data.as === 'string' && data.as.length > 0 ? data.as : 'item';
  const listRaw = queries ? queries[source] : undefined;
  const list = normalizeEachList(listRaw);
  if (debug) console.log(`[Each] source=${source}`, { raw: listRaw, derivedLength: list.length });
  if (!list.length) return null;

  return (
    <div className="flex flex-col gap-3">
      {list.map((item, index) => {
        const enhanced = enhanceLoopItem(item);
        const loopGlobals = { ...globals, [asName]: enhanced, [`${asName}Index`]: index };
        return (
          <Fragment key={`${node.id || 'each'}-${index}`}>
            <RenderNodes
              nodes={node.children || []}
              globals={loopGlobals}
              windowId={windowId}
              queries={queries}
              inline
              debug={debug}
            />
          </Fragment>
        );
      })}
    </div>
  );
}

function normalizeEachList(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (value instanceof Map) return Array.from(value.values());
  if (typeof value === 'object') {
    if (Array.isArray((value as any).items)) return (value as any).items;
    if (Array.isArray((value as any).events)) return (value as any).events;
    if (Array.isArray((value as any).results)) return (value as any).results;
  }
  return [];
}

function buildPayload(spec: any, globals: any, queries: Record<string, any>) {
  if (!spec || typeof spec !== 'object') return undefined
  const out: Record<string, any> = {}
  for (const [key, value] of Object.entries(spec)) {
    if (typeof value === 'string') out[key] = interpolateText(value, globals, queries)
    else out[key] = value
  }
  return out
}

function enhanceLoopItem(raw: any): any {
  if (!raw || typeof raw !== 'object') return raw;
  const out: any = Array.isArray(raw) ? raw.slice() : { ...raw };
  out.event = raw;

  if (typeof raw.content === 'string') {
    try {
      const parsed = JSON.parse(raw.content);
      out.content_json = parsed;
      if (parsed && typeof parsed === 'object') {
        if (parsed.meta && typeof parsed.meta === 'object') {
          out.meta = parsed.meta;
          if (parsed.meta.name && !out.name) out.name = parsed.meta.name;
          if (parsed.meta.description && !out.description) out.description = parsed.meta.description;
        }
        if (parsed.version && !out.version) out.version = parsed.version;
        if (parsed.ast && !out.ast) out.ast = parsed.ast;
      }
    } catch {}
  }

  const tagsArray: any[] = Array.isArray(raw.tags) ? raw.tags : [];
  if (tagsArray.length) {
    const tagMap: Record<string, string[]> = {};
    for (const tag of tagsArray) {
      if (Array.isArray(tag) && tag.length >= 2) {
        const [name, value] = tag;
        if (!tagMap[name]) tagMap[name] = [];
        if (value != null) tagMap[name].push(String(value));
      }
    }
    if (Object.keys(tagMap).length) out.tagMap = tagMap;
    const dTag = tagMap['d']?.[0];
    if (dTag && !out.identifier) out.identifier = dTag;
    if (!out.version && tagMap['hypernote']?.[0]) out.version = tagMap['hypernote'][0];
    if (!out.kindLabel && tagMap['hypernote-type']?.[0]) out.kindLabel = tagMap['hypernote-type'][0];
  }

  const metaName = out.meta && typeof out.meta === 'object' ? out.meta.name : undefined;
  if (!out.name && typeof metaName === 'string') out.name = metaName;
  if (!out.identifier && typeof metaName === 'string') out.identifier = slugify(String(metaName));

  if (typeof raw.pubkey === 'string') {
    try { out.npub = nip19.npubEncode(raw.pubkey); } catch {}
    if (typeof out.identifier === 'string') {
      try {
        out.naddr = nip19.naddrEncode({ kind: typeof raw.kind === 'number' ? raw.kind : 32616, pubkey: raw.pubkey, identifier: out.identifier });
      } catch {}
    }
  }

  if (typeof raw.created_at === 'number') out.created_at = raw.created_at;
  return out;
}

export function AppView({ id }: { id: string }) {
  // Select only the doc text for this window to avoid global re-renders
  const doc = useAtomValue(docAtom(id)) || "";
  const { compiled, error: compileError } = useMemo(() => {
    try {
      return { compiled: compileMarkdownDoc(doc), error: null as Error | null };
    } catch (err) {
      console.warn(`[Compile] ${id} failed`, err);
      return { compiled: null, error: err instanceof Error ? err : new Error(String(err)) };
    }
  }, [doc]);
  const nodes = useMemo(() => (compiled?.ast as Node[]) || [], [compiled]);

  // Detect if this document references time.now; if not, don't subscribe to time updates
  const usesTime = useMemo(() => /{{\s*time\.now\s*}}/.test(doc), [doc]);

  // Select only the slices we need for this window
  const globalsUser = useAtomValue(userAtom);
  const timeNow = useAtomValue(windowTimeAtom(id));
  const rawScalars = useAtomValue(windowScalarsAtom(id));
  const forms = useAtomValue(formsAtom(id))
  const globals = useMemo(() => ({ user: globalsUser, time: { now: timeNow }, form: forms }), [globalsUser, timeNow, forms]);
  // Fallback: if Hypersauce queries are unavailable, derive $profile from user.profile
  const mergedScalars = useMemo(() => {
    const fb: Record<string, any> = {}
    if (globals.user?.profile) fb['$profile'] = globals.user.profile
    return { ...fb, ...(rawScalars || {}) }
  }, [globals.user?.profile, rawScalars])

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
      if (usesTime && debug) console.log(`[Cause] ${id}: time.now`, timeNow);
  }, [timeNow, usesTime, debug]);
  useEffect(() => {
    if (debug) console.log(`[Cause] ${id}: user.pubkey`, globalsUser?.pubkey);
  }, [globalsUser?.pubkey, debug]);
  useEffect(() => {
    if (debug) console.log(`[Cause] ${id}: queries`, Object.keys(rawScalars || {}));
  }, [rawScalars, debug]);

  // No artificial tick; re-render comes from globals/time.now store updates

  // Start/stop queries for this app when meta or pubkey changes
  const relays = useAtomValue(relaysAtom)
  useEffect(() => {
    if (!compiled || compileError) return;
    queryRuntime.start({
      windowId: id,
      meta: compiled.meta,
      relays,
      context: { user: { pubkey: globals.user.pubkey } },
      onScalars: () => {},
    }).catch(e => console.warn('[Hypersauce] start failed', e))
    return () => queryRuntime.stop(id)
  }, [id, compiled, compileError, globals.user.pubkey, relays])

  const EMPTY: Record<string, any> = useMemo(() => ({}), []);
  const queriesForWindow = mergedScalars ?? EMPTY;

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

  return <RenderNodes nodes={nodes} globals={globals} windowId={id} queries={queriesForWindow} debug={debug} />;
}

export function parseFrontmatterName(doc: string): string | undefined {
  try {
    const { meta } = compileMarkdownDoc(doc);
    if (meta && typeof meta.name === "string") return meta.name;
  } catch {}
  return undefined;
}
