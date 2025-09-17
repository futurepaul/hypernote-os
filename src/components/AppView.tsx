import { useMemo, useState, useEffect } from "react";
import YAML from "yaml";
import { useWindows } from "../store/windows";
import { nip19, getPublicKey } from "nostr-tools";
import { compileMarkdownDoc, type UiNode } from "../compiler";

type Node = UiNode;

function getPath(obj: any, path: string): any {
  return path.split('.').reduce((acc, k) => (acc && typeof acc === 'object' ? acc[k] : undefined), obj);
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
          dangerouslySetInnerHTML={{ __html: interpolate(n.html || "", globals, windowId, queryScalars) }}
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
  const { docs, globals, startQueriesFor, stopQueriesFor, queryScalars } = useWindows();
  const [tick, setTick] = useState(0);
  const doc = docs[id as keyof typeof docs] || "";
  const compiled = useMemo(() => compileMarkdownDoc(doc), [doc]);
  const nodes = useMemo(() => compiled.ast as Node[], [compiled, tick]);

  // Re-render periodically to update time placeholders
  useEffect(() => {
    const t = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Start/stop queries for this app when meta or pubkey changes
  useEffect(() => {
    startQueriesFor(id as any, compiled.meta).catch(() => {});
    return () => stopQueriesFor(id as any);
  }, [id, compiled.meta, globals.user.pubkey]);

  return <RenderNodes nodes={nodes} globals={globals} windowId={id} queryScalars={queryScalars} />;
}

export function parseFrontmatterName(doc: string): string | undefined {
  try {
    const { meta } = parseDoc(doc);
    if (meta && typeof meta.name === "string") return meta.name;
  } catch {}
  return undefined;
}
