import { useMemo, useEffect, useState, useRef } from "react";
import { shallow } from "zustand/shallow";
import YAML from "yaml";
import { useWindows } from "../store/windows";
import { nip19, getPublicKey } from "nostr-tools";
import { compileMarkdownDoc, type UiNode } from "../compiler";

type Node = UiNode;

function getPath(obj: any, path: string): any {
  return path.split('.').reduce((acc, k) => (acc && typeof acc === 'object' ? acc[k] : undefined), obj);
}

// Note: we intentionally do not try to re-parse markdown images here anymore.

function resolveImgDollarSrc(html: string, windowId: string, queryScalars: Record<string, Record<string, any>>): string {
  return html.replace(/<img\b([^>]*?)src=["']([^"']+)["']([^>]*)>/g, (m, pre, src, post) => {
    if (typeof src === 'string' && src.startsWith('$')) {
      const [qid, ...rest] = src.split('.');
      const base = (queryScalars[windowId] || {})[qid];
      let val: any = base;
      if (rest.length) val = getPath(base, rest.join('.'));
      if (val != null) {
        const u = String(val).replace(/"/g, '&quot;');
        return `<img${pre}src="${u}"${post}>`;
      }
    }
    return m;
  });
}

function interpolate(text: string, globals: any, windowId: string, queryScalars: Record<string, Record<string, any>>) {
  if (!text) return "";
  return text.replace(/{{\s*([$]?[a-zA-Z0-9_\.-]+)\s*}}/g, (_m, key: string) => {
    if (key === "time.now") return String(globals?.time?.now ?? Math.floor(Date.now() / 1000));
    if (key.startsWith('$')) {
      const [qid, ...rest] = key.split('.');
      const id = qid; // full id like $profile
      const path = rest.join('.') || '';
      const appScalars = queryScalars[windowId] || {};
      const base = appScalars[id];
      if (base == null) {
        // console.debug("interpolate: missing scalar", { windowId, id, path, keys: Object.keys(appScalars) });
        return "";
      }
      if (!path) return String(base ?? "");
      const v = getPath(base, path);
      return v == null ? "" : String(v);
    }
    const val = getPath(globals, key);
    return val == null ? "" : String(val);
  });
}

// parsing/compilation is handled by compiler.ts

function ButtonNode({ text, globals, action, windowId, queryScalars }: { text?: string; globals: any; action?: string; windowId: string; queryScalars: Record<string, Record<string, any>> }) {
  const { runAction } = useWindows();
  const label = (interpolate(String(text ?? ""), globals, windowId, queryScalars).trim() || "Button");
  return (
    <button
      className="bg-gray-200 hover:bg-gray-300 text-gray-900 border border-gray-500 rounded px-3 py-1 text-sm"
      onClick={() => {
        if (action) {
          console.log("ButtonNode: running action", action, "user.pubkey=", globals?.user?.pubkey);
          runAction(action).catch((e) => console.warn("action error", e));
        } else {
          console.log("ButtonNode: no action defined");
        }
      }}
    >
      {label}
    </button>
  );
}

function InputNode({ text, globals, windowId, queryScalars }: { text: string; globals: any; windowId: string; queryScalars: Record<string, Record<string, any>> }) {
  const { setUserPubkey } = useWindows();
  const [val, setVal] = useState("");
  const ph = interpolate(text || "", globals, windowId, queryScalars);
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setVal(v);
    console.log("InputNode:onChange", v);
    const trimmed = v.trim();
    // Hex pubkey (64 hex chars)
    if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
      const hex = trimmed.toLowerCase();
      setUserPubkey(hex);
      console.log("set user.pubkey from hex", hex);
      return;
    }
    if (/nsec1/i.test(v)) {
      try {
        const d = nip19.decode(trimmed);
        if (d.type === "nsec") {
          const sk = d.data as Uint8Array | string;
          const skHex = typeof sk === "string" ? sk : Array.from(sk).map(b => b.toString(16).padStart(2, "0")).join("");
          const pk = getPublicKey(skHex);
          setUserPubkey(pk);
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
          setUserPubkey(hex);
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

function RenderNodes({ nodes, globals, windowId, queryScalars }: { nodes: Node[]; globals: any; windowId: string; queryScalars: Record<string, Record<string, any>> }) {
  const renderNode = (n: Node, key: number): JSX.Element | null => {
    if (n.type === "html")
      return (
        <div
          key={key}
          className="app-markdown"
          dangerouslySetInnerHTML={{ __html: resolveImgDollarSrc(interpolate(n.html || "", globals, windowId, queryScalars), windowId, queryScalars) }}
        />
      );
    if (n.type === "button") return <ButtonNode key={key} text={n.data?.text || ""} action={n.data?.action} globals={globals} windowId={windowId} queryScalars={queryScalars} />;
    if (n.type === "input") return <InputNode key={key} text={n.data?.text || ""} globals={globals} windowId={windowId} queryScalars={queryScalars} />;
    if (n.type === "hstack" || n.type === "vstack")
      return (
        <div key={key} className={n.type === "hstack" ? "flex flex-row gap-2" : "flex flex-col gap-2"}>
          {(n.children || []).map((c, j) => renderNode(c, j) as any)}
        </div>
      );
    return null;
  };

  return <div className="flex flex-col gap-2">{nodes.map((n, i) => renderNode(n, i))}</div>;
}

export function AppView({ id }: { id: string }) {
  // Select only the doc text for this window to avoid global re-renders
  const doc = useWindows(s => s.docs[id as keyof typeof s.docs] || "");
  const compiled = useMemo(() => compileMarkdownDoc(doc), [doc]);
  const nodes = useMemo(() => compiled.ast as Node[], [compiled]);

  // Detect if this document references time.now; if not, don't subscribe to time updates
  const usesTime = useMemo(() => /{{\s*time\.now\s*}}/.test(doc), [doc]);

  // Select only the slices we need for this window
  const globalsUser = useWindows(s => s.globals.user, Object.is);
  const timeNow = useWindows(s => (usesTime ? s.globals.time.now : 0));
  const startQueriesFor = useWindows(s => s.startQueriesFor);
  const stopQueriesFor = useWindows(s => s.stopQueriesFor);
  const windowScalars = useWindows(s => s.queryScalars[id as keyof typeof s.queryScalars], Object.is);
  const globals = useMemo(() => ({ user: globalsUser, time: { now: timeNow } }), [globalsUser, timeNow]);

  // Per-render logging to trace causes
  const renderCount = useRef(0);
  useEffect(() => {
    const n = ++renderCount.current;
    try {
      // summarize keys to avoid huge logs
      const k = Object.keys(windowScalars || {});
      console.log(`[Render] AppView ${id} #${n}`, { docLen: doc.length, usesTime, timeNow, userPubkey: globalsUser?.pubkey, scalars: k });
    } catch {}
  });

  useEffect(() => {
    console.log(`[Cause] ${id}: doc changed`, { len: doc.length });
  }, [doc]);
  useEffect(() => {
    if (usesTime) console.log(`[Cause] ${id}: time.now`, timeNow);
  }, [timeNow, usesTime]);
  useEffect(() => {
    console.log(`[Cause] ${id}: user.pubkey`, globalsUser?.pubkey);
  }, [globalsUser?.pubkey]);
  useEffect(() => {
    console.log(`[Cause] ${id}: queryScalars`, Object.keys(windowScalars || {}));
  }, [windowScalars]);

  // No artificial tick; re-render comes from globals/time.now store updates

  // Start/stop queries for this app when meta or pubkey changes
  useEffect(() => {
    startQueriesFor(id as any, compiled.meta).catch(() => {});
    return () => stopQueriesFor(id as any);
  }, [id, compiled.meta, globals.user.pubkey]);

  const EMPTY: Record<string, any> = useMemo(() => ({}), []);
  return <RenderNodes nodes={nodes} globals={globals} windowId={id} queryScalars={{ [id]: windowScalars ?? EMPTY }} />;
}

export function parseFrontmatterName(doc: string): string | undefined {
  try {
    const { meta } = compileMarkdownDoc(doc);
    if (meta && typeof meta.name === "string") return meta.name;
  } catch {}
  return undefined;
}
