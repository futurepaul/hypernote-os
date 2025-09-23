import { useMemo, useEffect, useState, useRef, useCallback, Fragment, type ReactNode, type CSSProperties } from "react";
import OverType from "overtype";
import { useAtom, useAtomValue } from "jotai";
import type { UiNode } from "../compiler";
import { formsAtom } from "../state/formsAtoms";
import { interpolate as interp } from "../interp/interpolate";
import { useAction } from "../state/actions";
import { renderMarkdownAst, type MarkdownScope } from "./MarkdownRenderer";
import { sanitizeStackConfig } from "../lib/layout";
import { resolveReference, referenceQueryId } from "../interp/reference";

export type Node = UiNode;

type RenderNodesProps = {
  nodes: Node[];
  globals: any;
  windowId: string;
  queries: Record<string, any>;
  statuses?: Record<string, QueryStatus>;
  inline?: boolean;
  debug?: boolean;
};

function interpolateText(text: string, globals: any, queries: Record<string, any>) {
  return interp(text, { globals, queries });
}

function isLikelyId(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value) || value.startsWith('naddr1') || value.startsWith('note1')
}

function extractStableId(value: any, seen: WeakSet<object>): string | null {
  if (value == null) return null
  if (typeof value === 'string') return isLikelyId(value) ? value : null
  if (typeof value !== 'object') return null
  if (seen.has(value)) return null
  seen.add(value)

  const candidate = (value as any).id ?? (value as any).naddr ?? (value as any).event?.id
  if (typeof candidate === 'string' && candidate.length > 0) return candidate

  if (Array.isArray(value)) {
    for (const entry of value) {
      const nested = extractStableId(entry, seen)
      if (nested) return nested
    }
  } else {
    for (const entry of Object.values(value)) {
      if (typeof entry === 'string') {
        if (isLikelyId(entry)) return entry
      } else if (entry && typeof entry === 'object') {
        const nested = extractStableId(entry, seen)
        if (nested) return nested
      }
    }
  }
  return null
}

function hashObject(value: any): string {
  try {
    const json = JSON.stringify(value)
    let hash = 0
    for (let i = 0; i < json.length; i++) {
      hash = (hash * 31 + json.charCodeAt(i)) | 0
    }
    return Math.abs(hash).toString(36)
  } catch {
    return ''
  }
}

function deriveLoopKey(nodeId: string | undefined, item: any, index: number): string {
  const base = nodeId ? String(nodeId) : 'each'
  const stableId = extractStableId(item, new WeakSet())
  if (stableId) return `${base}-${stableId}`
  // fall back to hashing the payload so React doesn't thrash DOM nodes when
  // new posts arrive mid-list (e.g. live feeds)
  const hashed = hashObject(item)
  if (hashed) return `${base}-${hashed}`
  return `${base}-idx-${index}`
}

function MarkdownNode({ n, globals, queries }: { n: Node; globals: any; queries: Record<string, any> }) {
  const deps = useMemo(() => {
    const refs = Array.isArray(n.refs) ? n.refs : [];
    return refs.map(ref => JSON.stringify(resolveReference(ref, { globals, queries }) ?? ''));
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
  return (
    <button
      className="bg-gray-200 hover:bg-gray-300 text-gray-900 border border-gray-500 rounded px-3 py-1 text-sm"
      onClick={() => {
        if (!action) {
          console.log("ButtonNode: no action defined");
          return;
        }
        if (process.env.NODE_ENV !== 'production') {
          console.log('[ButtonNode] payload', payload);
        }
        run(payload, { windowId, globals, queries }).catch(e => console.warn('action error', e));
      }}
    >
      {label}
    </button>
  );
}

function InputNode({ text, globals, windowId, name, queries }: { text: string; globals: any; windowId: string; name?: string; queries: Record<string, any> }) {
  const [, setForm] = useAtom(formsAtom(windowId));
  const [val, setVal] = useState("");
  const setPubkey = useAction('@set_pubkey', windowId);
  const ph = interpolateText(text || "", globals, queries);
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setVal(v);
    if (name) setForm((prev: any) => ({ ...(prev || {}), [name]: v }));
    setPubkey(v, { windowId, globals, queries }).catch(err => console.warn('set_pubkey error', err));
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

type QueryStatus = 'loading' | 'ready' | 'error';

function EachNode({ node, globals, windowId, queries, statuses, debug = false }: { node: Node; globals: any; windowId: string; queries: Record<string, any>; statuses?: Record<string, QueryStatus>; debug?: boolean }) {
  const data = node.data || {};
  const sourceExpr = typeof data.source === 'string' ? data.source.trim() : 'queries.items';
  const asNameRaw = typeof data.as === 'string' && data.as.length > 0 ? data.as : 'item';
  const asName = asNameRaw.trim() || 'item';
  const listRaw = resolveReference(sourceExpr, { globals, queries });
  const sourceQueryId = referenceQueryId(sourceExpr);
  const status = sourceQueryId ? statuses?.[sourceQueryId] : undefined;
  console.log(`[Each] source=${sourceExpr}`, { status, listRaw });
  if (status === 'loading' || status === null || (status === undefined && listRaw === undefined)) {
    return <div className="italic text-sm text-gray-600">Loading…</div>;
  }
  if (status === 'error') {
    return <div className="italic text-sm text-red-600">Failed to load.</div>;
  }
  const list = Array.isArray(listRaw) ? listRaw : [];
  if (debug) console.log(`[Each] source=${sourceExpr}`, { length: list.length });
  if (!Array.isArray(listRaw)) return null;
  if (!list.length && status === 'ready') return null;

  return (
    <div className="flex flex-col gap-3">
      {list.map((item, index) => {
        const loopGlobals = {
          ...globals,
          [asName]: item,
          [`${asName}Index`]: index,
        };
        const stableKey = deriveLoopKey(node.id, item, index);
        return (
          <Fragment key={stableKey}>
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

export function RenderNodes({ nodes, globals, windowId, queries, statuses, inline = false, debug = false }: RenderNodesProps) {
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
              statuses={statuses}
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
          statuses={statuses}
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
