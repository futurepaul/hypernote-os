import { useMemo, useEffect, useState, useRef, useCallback, Fragment, type ReactNode, type CSSProperties } from "react";
import OverType from "overtype";
import { nip19, getPublicKey } from "nostr-tools";
import { useAtom, useAtomValue } from "jotai";
import type { UiNode } from "../compiler";
import { formsAtom } from "../state/formsAtoms";
import { interpolate as interp } from "../interp/interpolate";
import { useAction, normalizeActionName } from "../state/actions";
import { renderMarkdownAst, type MarkdownScope } from "./MarkdownRenderer";
import { sanitizeStackConfig } from "../lib/layout";

export type Node = UiNode;

type RenderNodesProps = {
  nodes: Node[];
  globals: any;
  windowId: string;
  queries: Record<string, any>;
  inline?: boolean;
  debug?: boolean;
};

function interpolateText(text: string, globals: any, queries: Record<string, any>) {
  return interp(text, { globals, queries });
}

function MarkdownNode({ n, globals, queries }: { n: Node; globals: any; queries: Record<string, any> }) {
  const deps = useMemo(() => {
    const refs = n.refs || [];
    const q: Record<string, any> = (queries && typeof queries === "object") ? queries : {};
    const getPath = (obj: any, path: string) => path.split('.').reduce((acc, k) => (acc && typeof acc === 'object') ? acc[k] : undefined, obj);
    return refs.map(ref => {
      if (ref.startsWith('$')) {
        const [id, ...rest] = ref.split('.');
        const idKey = String(id);
        const base = (q as any)[idKey] !== undefined ? (q as any)[idKey] : getPath(globals, idKey);
        const v = rest.length ? getPath(base, rest.join('.')) : base;
        return JSON.stringify(v ?? '');
      }
      return String(getPath(globals, ref) ?? '');
    });
  }, [n.refs, queries, globals]);

  const scope = useMemo<MarkdownScope>(() => ({ globals, queries }), [globals, queries]);
  const content = useMemo(() => {
    const tokens = Array.isArray(n.markdown) ? n.markdown : [];
    return renderMarkdownAst(tokens, scope);
  }, [n.id, scope, ...deps]);

  return <div className="app-markdown">{content}</div>;
}

function ButtonNode({ text, globals, action, windowId, queries, payloadSpec }: { text?: string; globals: any; action?: string; windowId: string; queries: Record<string, any>; payloadSpec?: any }) {
  const label = (interpolateText(String(text ?? ""), globals, queries).trim() || "Button");
  const payload = useMemo(() => buildPayload(payloadSpec, globals, queries), [payloadSpec, globals, queries]);
  const run = useAction(action, windowId);
  const setPub = useAction('@set_pubkey', windowId);
  return (
    <button
      className="bg-gray-200 hover:bg-gray-300 text-gray-900 border border-gray-500 rounded px-3 py-1 text-sm"
      onClick={() => {
        if (action) {
          console.log("ButtonNode: running action", action, "user.pubkey=", globals?.user?.pubkey);
          const ensurePubFromForm = async () => {
            const act = normalizeActionName(action);
            if (act === 'load_profile' && !globals?.user?.pubkey) {
              const v: string | undefined = globals?.form?.pubkey;
              const trimmed = (v || '').trim();
              if (!trimmed) return;
              if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
                await setPub(trimmed.toLowerCase());
                return;
              }
              if (/nsec1/i.test(trimmed)) {
                try {
                  const d = nip19.decode(trimmed);
                  if (d.type === 'nsec') {
                    const sk = d.data as Uint8Array | string;
                    const skHex = typeof sk === 'string' ? sk : Array.from(sk).map(b => b.toString(16).padStart(2, '0')).join('');
                    const pk = getPublicKey(skHex as any);
                    await setPub(pk);
                    return;
                  }
                } catch {}
              }
              if (/npub1/i.test(trimmed)) {
                try {
                  const d = nip19.decode(trimmed);
                  if (d.type === 'npub') {
                    const data = d.data as Uint8Array | string;
                    const hex = typeof data === 'string' ? data : Array.from(data).map(b => b.toString(16).padStart(2, '0')).join('');
                    await setPub(hex);
                    return;
                  }
                } catch {}
              }
            }
          };
          ensurePubFromForm().finally(() => {
            if (process.env.NODE_ENV !== 'production') {
              console.log('[ButtonNode] payload', payload);
            }
            run(payload, { windowId, globals, queries }).catch(e => console.warn('action error', e));
          });
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
  const [, setForm] = useAtom(formsAtom(windowId));
  const [val, setVal] = useState("");
  const setPub = useAction('@set_pubkey', windowId);
  const ph = interpolateText(text || "", globals, queries);
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setVal(v);
    if (name) setForm((prev: any) => ({ ...(prev || {}), [name]: v }));
    console.log("InputNode:onChange", v);
    const trimmed = v.trim();
    if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
      const hex = trimmed.toLowerCase();
      setPub(hex);
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
          setPub(pk);
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
          setPub(hex);
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

function MarkdownEditorNode({ data, windowId }: { data?: any; windowId: string }) {
  const [formValues, setFormValues] = useAtom(formsAtom(windowId));
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<any>(null);
  const rawId = typeof data?.id === 'string' ? data.id : typeof data?.name === 'string' ? data.name : '';
  const fieldName = useMemo(() => {
    const trimmed = String(rawId || '').trim();
    const withoutDollar = trimmed.startsWith('$') ? trimmed.slice(1) : trimmed;
    const normalized = withoutDollar.replace(/[^A-Za-z0-9_-]/g, '_');
    return normalized || 'editor';
  }, [rawId]);
  const placeholder = typeof data?.placeholder === 'string' ? data.placeholder : '';
  const value = typeof formValues?.[fieldName] === 'string' ? formValues[fieldName] : '';

  const handleChange = useCallback((val: string) => {
    setFormValues(prev => ({ ...(prev || {}), [fieldName]: val }));
  }, [fieldName, setFormValues]);

  useEffect(() => {
    if (!containerRef.current) return;
    const [instance] = OverType.init(containerRef.current, {
      value,
      toolbar: false,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      fontSize: '14px',
      lineHeight: 1.5,
      onChange: handleChange,
    } as any);
    editorRef.current = instance;
    return () => {
      try { editorRef.current?.destroy?.(); } catch {}
      editorRef.current = null;
    };
  }, [handleChange]);

  useEffect(() => {
    if (editorRef.current && typeof editorRef.current.getValue === 'function') {
      const current = editorRef.current.getValue();
      if (current !== value) {
        editorRef.current.setValue(value);
      }
    }
  }, [value]);

  const showPlaceholder = placeholder && !value;

  return (
    <div className="relative border border-gray-400 rounded bg-white">
      {showPlaceholder && (
        <div className="pointer-events-none absolute inset-3 text-gray-500 text-sm select-none">
          {placeholder}
        </div>
      )}
      <div
        ref={containerRef}
        className="min-h-[140px] max-h-[360px] overflow-y-auto px-3 py-2 text-sm text-gray-900"
      />
    </div>
  );
}

function EachNode({ node, globals, windowId, queries, debug = false }: { node: Node; globals: any; windowId: string; queries: Record<string, any>; debug?: boolean }) {
  const data = node.data || {};
  const sourceRaw = typeof data.source === 'string' ? data.source : '$items';
  const source = sourceRaw.trim() || '$items';
  const asName = typeof data.as === 'string' && data.as.length > 0 ? data.as : 'item';
  const listRaw = queries ? queries[source] : undefined;
  const list = Array.isArray(listRaw) ? listRaw : [];
  if (debug) console.log(`[Each] source=${source}`, { length: list.length });
  if (!list.length) return null;

  return (
    <div className="flex flex-col gap-3">
      {list.map((item, index) => {
        const dollarAlias = asName.startsWith('$') ? asName : `$${asName}`;
        const loopGlobals = {
          ...globals,
          [asName]: item,
          [dollarAlias]: item,
          [`${asName}Index`]: index,
          [`${dollarAlias}Index`]: index,
        };
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

function buildPayload(spec: any, globals: any, queries: Record<string, any>) {
  if (!spec || typeof spec !== 'object') return undefined;
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(spec)) {
    if (typeof value === 'string') out[key] = interpolateText(value, globals, queries);
    else out[key] = value;
  }
  return out;
}

function stackStyleFromData(data: any): CSSProperties | undefined {
  const config = sanitizeStackConfig(data);
  if (!config) return undefined;
  const style: CSSProperties = {};
  if (config.width) style.width = config.width;
  if (config.height) style.height = config.height;
  return style;
}

export function RenderNodes({ nodes, globals, windowId, queries, inline = false, debug = false }: RenderNodesProps) {
  const renderNode = (n: Node, key: number): ReactNode => {
    if (n.type === "markdown") {
      return <MarkdownNode key={n.id || key} n={n} globals={globals} queries={queries} />;
    }
    if (n.type === "button") {
      return (
        <ButtonNode
          key={n.id || key}
          text={n.data?.text || ""}
          action={n.data?.action}
          globals={globals}
          windowId={windowId}
          queries={queries}
          payloadSpec={n.data?.payload}
        />
      );
    }
    if (n.type === "markdown_editor") {
      return (
        <MarkdownEditorNode
          key={n.id || key}
          data={n.data}
          windowId={windowId}
        />
      );
    }
    if (n.type === "input") {
      return (
        <InputNode
          key={n.id || key}
          text={n.data?.text || ""}
          name={n.data?.name}
          globals={globals}
          windowId={windowId}
          queries={queries}
        />
      );
    }
    if (n.type === "hstack" || n.type === "vstack") {
      const style = stackStyleFromData(n.data);
      return (
        <div
          key={key}
          className={n.type === "hstack" ? "flex flex-row gap-2" : "flex flex-col gap-2"}
          style={style}
        >
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
