import { useMemo, useEffect, useState, useRef, useCallback, Fragment, type ReactNode, type CSSProperties } from "react";
import OverType from "overtype";
import { useAtom, useAtomValue } from "jotai";
import type { UiNode } from "../compiler";
import { formsAtom } from "../state/formsAtoms";
import { interpolate as interp } from "../interp/interpolate";
import { useAction } from "../state/actions";
import { renderMarkdownAst, type MarkdownScope } from "./MarkdownRenderer";
import { resolveReference, referenceQueryId, isReferenceExpression } from "../interp/reference";
import { deriveLoopKey } from "../lib/render";

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

function LiteralCodeBlock({ code, lang }: { code: string; lang?: string }) {
  return (
    <pre className="bg-[#f3f0eb] text-sm text-gray-800 rounded border border-gray-300 overflow-x-auto p-3">
      <code className="font-mono">
        {lang ? `${lang}\n` : ''}
        {code}
      </code>
    </pre>
  );
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
  const [formValues, setFormValues] = useAtom(formsAtom(windowId));
  const [localValue, setLocalValue] = useState("");
  const ph = interpolateText(text || "", globals, queries);
  const fieldName = typeof name === 'string' && name.length ? name : undefined;
  const value = fieldName ? String((formValues || {})[fieldName] ?? '') : localValue;

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (fieldName) {
      setFormValues((prev: Record<string, any> | undefined) => ({ ...(prev || {}), [fieldName]: v }));
    } else {
      setLocalValue(v);
    }
  };
  return (
    <input
      value={value}
      onChange={onChange}
      placeholder={ph}
      className="border border-gray-400 rounded px-2 py-1 text-gray-900 bg-white"
    />
  );
}

function MarkdownEditorNode({ data, windowId, globals, queries }: { data?: any; windowId: string; globals: any; queries: Record<string, any> }) {
  const readOnly = Boolean(data?.readOnly || data?.readonly);
  const defaultValueRaw = typeof data?.value === 'string' ? data.value : '';
  const defaultValue = interpolateText(defaultValueRaw, globals, queries);

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

  const liveValue = typeof formValues?.[fieldName] === 'string' ? formValues[fieldName] : '';
  const editorValue = readOnly ? defaultValue : (liveValue || defaultValue);

  useEffect(() => {
    if (readOnly) return;
    if (!liveValue && defaultValue) {
      setFormValues(prev => ({ ...(prev || {}), [fieldName]: defaultValue }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = useCallback((val: string) => {
    if (readOnly) return;
    setFormValues(prev => ({ ...(prev || {}), [fieldName]: val }));
  }, [fieldName, readOnly, setFormValues]);

  useEffect(() => {
    if (!containerRef.current) return;
    const [instance] = OverType.init(containerRef.current, {
      value: editorValue,
      toolbar: false,
      readOnly,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      fontSize: '14px',
      lineHeight: 1.5,
      onChange: readOnly ? undefined : handleChange,
    } as any);
    editorRef.current = instance;

    if (readOnly && containerRef.current) {
      const editable = containerRef.current.querySelector('[contenteditable="true"]') as HTMLElement | null;
      if (editable) {
        editable.setAttribute('contenteditable', 'false');
        editable.classList.add('pointer-events-none', 'select-text');
      }
    }

    return () => {
      try { editorRef.current?.destroy?.(); } catch {}
      editorRef.current = null;
    };
  }, [editorValue, handleChange, readOnly]);

  useEffect(() => {
    if (!editorRef.current || typeof editorRef.current.getValue !== 'function') return;
    const current = editorRef.current.getValue();
    if (current !== editorValue) {
      editorRef.current.setValue(editorValue);
    }
  }, [editorValue]);

  const showPlaceholder = !readOnly && placeholder && !liveValue;
  const wrapperClass = readOnly
    ? "relative border border-gray-300 rounded bg-white/10"
    : "relative border border-gray-400 rounded bg-white";

  return (
    <div className={wrapperClass}>
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
  if (debug) console.log(`[Each] source=${sourceExpr}`, { status, listRaw });
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

  const scope = { globals, queries };

  const transform = (value: any): any => {
    if (typeof value === 'string') {
      if (value.includes('{{')) return interpolateText(value, globals, queries);
      const trimmed = value.trim();
      if (trimmed && isReferenceExpression(trimmed)) {
        const resolved = resolveReference(trimmed, scope);
        return resolved !== undefined ? resolved : value;
      }
      return value;
    }
    if (Array.isArray(value)) return value.map(transform);
    if (value && typeof value === 'object') {
      const inner: Record<string, any> = {};
      for (const [k, v] of Object.entries(value)) inner[k] = transform(v);
      return inner;
    }
    return value;
  };

  return transform(spec);
}

function stackStyleFromData(data: any): CSSProperties | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const style: CSSProperties = {};
  if (typeof data.width === 'string' && data.width.length) style.width = data.width;
  if (typeof data.height === 'string' && data.height.length) style.height = data.height;
  return Object.keys(style).length ? style : undefined;
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
          globals={globals}
          queries={queries}
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
    if (n.type === "literal_code") {
      return (
        <LiteralCodeBlock
          key={n.id || key}
          code={typeof n.text === 'string' ? n.text : ''}
          lang={typeof n.data?.lang === 'string' ? n.data.lang : undefined}
        />
      );
    }
    return null;
  };

  const content = nodes.map((n, i) => renderNode(n, i));
  if (inline) return <>{content}</>;
  return <div className="flex flex-col gap-2">{content}</div>;
}
