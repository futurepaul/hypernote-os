import { useMemo, useEffect, useState, useRef, useCallback, Fragment, Component, type ReactNode, type CSSProperties, type MouseEvent, type ErrorInfo } from "react";
import { initOvertype } from "../lib/overtypeTheme";
import { useAtom, useAtomValue } from "jotai";
import type { UiNode } from "../compiler";
import { formsAtom } from "../state/formsAtoms";
import { interpolate as interp } from "../interp/interpolate";
import { useAction } from "../state/actions";
import { renderMarkdownAst, type MarkdownScope } from "./MarkdownRenderer";
import { resolveReference, referenceQueryId, isReferenceExpression } from "../interp/reference";
import { deriveLoopKey } from "../lib/render";
import { formatDateHelper } from "../lib/datetime";
import { nip19 } from "nostr-tools";

export type Node = UiNode;

type NodeBoundaryProps = {
  node: Node;
  windowId: string;
  children: ReactNode;
};

type NodeBoundaryState = {
  error: Error | null;
};

class NodeBoundary extends Component<NodeBoundaryProps, NodeBoundaryState> {
  override state: NodeBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): NodeBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    const { node, windowId } = this.props;
    console.warn('[RenderNodes] node error', { windowId, nodeType: node.type, nodeId: node.id, info: info?.componentStack }, error);
  }

  override componentDidUpdate(prevProps: Readonly<NodeBoundaryProps>): void {
    if (this.state.error && (prevProps.node !== this.props.node || prevProps.node.id !== this.props.node.id)) {
      this.setState({ error: null });
    }
  }

  override render(): ReactNode {
    if (this.state.error) {
      const { node } = this.props;
      return (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
          <strong>Failed to render `{node.type}`</strong>
          <div className="mt-1">Check the console for details.</div>
        </div>
      );
    }

    return <>{this.props.children}</>;
  }
}

type RenderNodesProps = {
  nodes: Node[];
  globals: any;
  windowId: string;
  queries: Record<string, any>;
  errors?: Record<string, string>;
  inline?: boolean;
  debug?: boolean;
};

function interpolateText(text: string, globals: any, queries: Record<string, any>) {
  return interp(text, { globals, queries });
}

function MarkdownNode({ n, globals, queries, windowId }: { n: Node; globals: any; queries: Record<string, any>; windowId: string }) {
  const deps = useMemo(() => {
    const rawRefs = Array.isArray(n.refs) ? (n.refs as unknown[]) : [];
    const refs = rawRefs.filter((ref): ref is string => typeof ref === 'string');
    return refs.map((ref) => JSON.stringify(resolveReference(ref, { globals, queries }) ?? ''));
  }, [n.refs, queries, globals]);

  const scope = useMemo<MarkdownScope>(() => ({ globals, queries }), [globals, queries]);
  const switchApp = useAction('system.switch_app', windowId);
  const handleNostrLink = useCallback((href: string) => {
    if (!switchApp) return false;
    const payload = buildSwitchPayloadFromNostrUri(href);
    if (!payload) return false;
    switchApp(payload, { windowId, globals, queries }).catch(err => console.warn('nostr link action failed', err));
    return true;
  }, [switchApp, windowId, globals, queries]);

  const content = useMemo(() => {
    const tokens = Array.isArray(n.markdown) ? n.markdown : [];
    return renderMarkdownAst(tokens, scope, { onNostrLink: handleNostrLink });
  }, [n.id, scope, handleNostrLink, ...deps]);

  return <div className="app-markdown">{content}</div>;
}

const URL_REGEX = /(https?:\/\/[^\s]+|nostr:[^\s]+)/g;
const TRAILING_PUNCT = new Set(['.', ',', '!', '?', ':', ';', ')', ']', '"', '\'']);
const IMAGE_EXTENSIONS = /(\.png|\.jpe?g|\.gif|\.webp)$/i;
const VIDEO_EXTENSIONS = /(\.mp4|\.mov|\.m4v|\.webm)$/i;

type TokenizedLine = Array<{ type: 'text' | 'link'; value: string; href?: string; trailing?: string }>;

function tokenizeNoteContent(content: string): { lines: TokenizedLine[]; media: string[] } {
  if (!content) return { lines: [], media: [] };
  const lines: TokenizedLine[] = [];
  const mediaUrls: string[] = [];
  const seenMedia = new Set<string>();
  const rawLines = content.split(/\n+/);

  rawLines.forEach((rawLine) => {
    if (!rawLine.length) {
      lines.push([{ type: 'text', value: '' }]);
      return;
    }
    const parts = rawLine.split(URL_REGEX);
    const lineTokens: TokenizedLine = [];
    parts.forEach((part, index) => {
      if (!part) return;
      if (index % 2 === 1) {
        if (/^https?:\/\//i.test(part)) {
          const { core, trailing } = splitTrailingPunctuation(part);
          const href = core || part;
          lineTokens.push({ type: 'link', value: core || part, href });
          if (trailing) lineTokens.push({ type: 'text', value: trailing });
          const normalized = core || part;
          if (isMediaUrl(normalized) && !seenMedia.has(normalized)) {
            seenMedia.add(normalized);
            mediaUrls.push(normalized);
          }
          return;
        }
        if (/^nostr:/i.test(part)) {
          const { core, trailing } = splitTrailingPunctuation(part);
          const href = core || part;
          lineTokens.push({ type: 'link', value: core || part, href });
          if (trailing) lineTokens.push({ type: 'text', value: trailing });
          return;
        }
      }
      lineTokens.push({ type: 'text', value: part });
    });
    lines.push(lineTokens);
  });

  return { lines, media: mediaUrls };
}

function splitTrailingPunctuation(value: string): { core: string; trailing: string } {
  let core = value;
  let trailing = '';
  while (core.length > 0 && TRAILING_PUNCT.has(core[core.length - 1]!)) {
    trailing = core[core.length - 1]! + trailing;
    core = core.slice(0, -1);
  }
  return { core, trailing };
}

function isMediaUrl(url: string): boolean {
  return isImageUrl(url) || isVideoUrl(url);
}

function isImageUrl(url: string): boolean {
  return IMAGE_EXTENSIONS.test(normalizeUrl(url));
}

function isVideoUrl(url: string): boolean {
  return VIDEO_EXTENSIONS.test(normalizeUrl(url));
}

function normalizeUrl(url: string): string {
  try {
    return decodeURIComponent(url);
  } catch {
    return url;
  }
}

function NoteNode({ data, globals, queries, windowId }: { data?: any; globals: any; queries: Record<string, any>; windowId: string }) {
  const eventSpec = data?.event ?? data?.source ?? data?.value ?? data?.note;
  const profileSpec = data?.profile;

  const event = useMemo(() => buildPayload(eventSpec, globals, queries), [eventSpec, globals, queries]);
  const profile = useMemo(() => buildPayload(profileSpec, globals, queries), [profileSpec, globals, queries]);

  const note = event && typeof event === 'object' ? event : null;
  const content = typeof note?.content === 'string' ? note.content : '';
  const pubkeyRaw = typeof note?.pubkey === 'string' ? note.pubkey : '';
  const pubkey = pubkeyRaw ? pubkeyRaw.toLowerCase() : '';
  const createdAt = note?.created_at;
  const activeFilter = typeof globals?.state?.filter_pubkey === 'string' && globals.state.filter_pubkey.trim()
    ? globals.state.filter_pubkey.trim().toLowerCase()
    : null;

  const name = useMemo(() => {
    if (profile && typeof profile === 'object') {
      const display = (profile as any)?.display_name || (profile as any)?.name;
      if (typeof display === 'string' && display.trim()) return display.trim();
    }
    if (typeof note?.author === 'string' && note.author.trim()) return note.author.trim();
    if (typeof pubkeyRaw === 'string' && pubkeyRaw.length > 8) {
      return `${pubkeyRaw.slice(0, 8)}…${pubkeyRaw.slice(-4)}`;
    }
    return pubkeyRaw || 'Unknown';
  }, [profile, note?.author, pubkeyRaw, note]);

  const avatarUrl = useMemo(() => {
    if (profile && typeof profile === 'object') {
      const raw = (profile as any)?.picture;
      if (typeof raw === 'string' && raw.trim()) return raw.trim();
    }
    return null;
  }, [profile]);

  const parsedContent = useMemo(() => tokenizeNoteContent(content), [content]);
  const switchApp = useAction('system.switch_app', windowId);

  const handleAuthorClick = useCallback(() => {
    if (!switchApp || !pubkeyRaw) return;
    switchApp({ kind: 0, pubkey: pubkeyRaw, value: pubkeyRaw }, { windowId, globals, queries }).catch(err => console.warn('switch_app failed', err));
  }, [switchApp, pubkeyRaw, windowId, globals, queries]);

  if (!note) return null;
  if (activeFilter && pubkey && activeFilter !== pubkey) return null;

  const showHeader = !!profile;
  const paragraphs = parsedContent.lines.map((line, idx) => {
    if (line.length === 1 && line[0]?.value === '') {
      return <div key={`gap-${idx}`} className="h-2" />;
    }
    return (
      <p key={`p-${idx}`} className="whitespace-pre-wrap break-words leading-relaxed text-[15px]">
        {line.map((token, tokenIdx) => {
          if (token.type === 'link' && token.href) {
            const { href } = token;
            if (!href) return <span key={`text-${idx}-${tokenIdx}`}>{token.value}</span>;
            const isNostr = href.startsWith('nostr:');
            const onClick = isNostr && switchApp ? (event: MouseEvent<HTMLAnchorElement>) => {
              event.preventDefault();
              const payload = buildSwitchPayloadFromNostrUri(href);
              if (payload) switchApp(payload, { windowId, globals, queries }).catch(err => console.warn('nostr link action failed', err));
            } : undefined;
            return (
              <a
                key={`link-${idx}-${tokenIdx}`}
                href={href}
                target={isNostr ? undefined : '_blank'}
                rel={isNostr ? undefined : 'noreferrer'}
                onClick={onClick}
                className="text-blue-600 hover:underline break-words"
              >
                {token.value}
              </a>
            );
          }
          return <span key={`text-${idx}-${tokenIdx}`}>{token.value}</span>;
        })}
      </p>
    );
  });

  const mediaNodes = parsedContent.media.map((url, idx) => {
    if (isVideoUrl(url)) {
      return (
        <video key={`vid-${idx}`} controls className="max-w-full rounded border border-[var(--bevel-dark)]">
          <source src={url} />
        </video>
      );
    }
    return (
      <img
        key={`img-${idx}`}
        src={url}
        alt="note media"
        className="max-w-full rounded border border-[var(--bevel-dark)]"
      />
    );
  });

  const timestamp = createdAt != null ? formatDateHelper(createdAt, 'datetime') : null;
  const secondary = profile && typeof profile === 'object' && (profile as any)?.name && (profile as any)?.display_name && (profile as any)?.name !== (profile as any)?.display_name
    ? (profile as any)?.name
    : undefined;

  if (!showHeader) {
    return (
      <div className="flex flex-col gap-2">
        {paragraphs.length ? paragraphs : null}
        {mediaNodes.length ? <div className="flex flex-col gap-2">{mediaNodes}</div> : null}
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="w-12 h-12 rounded border border-[var(--bevel-dark)] bg-[var(--chrome-bg)] overflow-hidden flex items-center justify-center text-sm font-semibold text-gray-700">
        {avatarUrl ? (
          <img src={`${avatarUrl}?w=96`} alt="avatar" className="w-full h-full object-cover" />
        ) : (
          <span>{name.slice(0, 2).toUpperCase()}</span>
        )}
      </div>
      <div className="flex-1 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleAuthorClick}
            className="text-sm font-semibold text-blue-700 hover:underline"
          >
            {name}
          </button>
          {secondary && <span className="text-xs text-gray-500">{secondary}</span>}
          {timestamp && <span className="text-xs text-gray-500 ml-auto">{timestamp}</span>}
        </div>
        {paragraphs.length ? <div className="flex flex-col gap-2">{paragraphs}</div> : null}
        {mediaNodes.length ? <div className="flex flex-col gap-2">{mediaNodes}</div> : null}
      </div>
    </div>
  );
}

function JsonViewerNode({ data, globals, queries }: { data?: any; globals: any; queries: Record<string, any> }) {
  const sourceSpec = data?.source ?? data?.value ?? data?.from;
  const maxDepth = typeof data?.maxDepth === 'number' && data.maxDepth >= 0 ? data.maxDepth : undefined;
  const collapsedDefault = data?.collapsed === true;
  const label = typeof data?.label === 'string' ? data.label : undefined;
  const [collapsed, setCollapsed] = useState(collapsedDefault);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  const rawValue = useMemo(() => {
    return buildPayload(sourceSpec, globals, queries);
  }, [sourceSpec, globals, queries]);

  const { value, parseError } = useMemo(() => {
    if (typeof rawValue === 'string') {
      try {
        const trimmed = rawValue.trim();
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
          return { value: JSON.parse(rawValue), parseError: null };
        }
      } catch (err) {
        return { value: rawValue, parseError: err instanceof Error ? err.message : String(err) };
      }
    }
    return { value: rawValue, parseError: null };
  }, [rawValue]);

  const formatted = useMemo(() => {
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean' || value === null) return JSON.stringify(value, null, 2);

    const seen = new WeakSet<object>();
    const prunePlaceholder = '[Max depth]';

    const transform = (input: any, depth: number): any => {
      if (maxDepth !== undefined && depth > maxDepth) return prunePlaceholder;
      if (input && typeof input === 'object') {
        if (seen.has(input)) return '[Circular]';
        seen.add(input);
        if (Array.isArray(input)) return input.map(item => transform(item, depth + 1));
        const out: Record<string, any> = {};
        for (const [k, v] of Object.entries(input)) out[k] = transform(v, depth + 1);
        return out;
      }
      return input;
    };

    try {
      const processed = transform(value, 0);
      return JSON.stringify(processed, null, 2);
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }, [value, maxDepth]);

  const handleCopy = useCallback(() => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(typeof rawValue === 'string' ? rawValue : formatted).then(() => setCopyState('copied')).catch(() => setCopyState('error'));
      } else {
        setCopyState('error');
      }
    } catch {
      setCopyState('error');
    }
    setTimeout(() => setCopyState('idle'), 1500);
  }, [rawValue, formatted]);

  const headerLabel = label ?? (typeof sourceSpec === 'string' ? sourceSpec : 'JSON Viewer');

  return (
    <div className="border border-[var(--bevel-dark)] rounded bg-white/70 text-xs text-gray-900">
      <div className="flex items-center justify-between border-b border-[var(--bevel-light)] px-2 py-1 bg-[var(--win-bg)]/70">
        <span className="font-medium truncate" title={headerLabel}>{headerLabel}</span>
        <div className="flex items-center gap-1">
          {parseError && <span className="text-red-600" title={parseError}>parse error</span>}
          <button
            type="button"
            className="px-1 py-0.5 rounded border border-transparent hover:border-[var(--accent)]"
            onClick={() => setCollapsed(v => !v)}
          >
            {collapsed ? 'Expand' : 'Collapse'}
          </button>
          <button
            type="button"
            className="px-1 py-0.5 rounded border border-transparent hover:border-[var(--accent)]"
            onClick={handleCopy}
          >
            {copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Error' : 'Copy'}
          </button>
        </div>
      </div>
      {!collapsed && (
        <pre className="overflow-auto max-h-64 whitespace-pre-wrap break-all px-2 py-2 text-[11px] leading-snug bg-white">
          {formatted}
        </pre>
      )}
    </div>
  );
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

function ButtonNode({ text, globals, action, windowId, queries, payloadSpec, data }: { text?: string; globals: any; action?: string; windowId: string; queries: Record<string, any>; payloadSpec?: any; data?: any }) {
  const labelRaw = interpolateText(String(text ?? ""), globals, queries);
  const label = (labelRaw.trim() || "Button");
  const appearance = typeof data?.appearance === 'string' ? data.appearance : undefined;
  const iconSrc = appearance === 'app_tile' && typeof data?.icon === 'string'
    ? (() => {
        const resolved = interpolateText(data.icon, globals, queries).trim();
        return resolved ? resolved : undefined;
      })()
    : undefined;
  const payload = useMemo(() => buildPayload(payloadSpec, globals, queries), [payloadSpec, globals, queries]);
  const run = useAction(action, windowId);

  const handleClick = useCallback(() => {
    if (!action) {
      console.log("ButtonNode: no action defined");
      return;
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log('[ButtonNode] payload', payload);
    }
    run(payload, { windowId, globals, queries }).catch(e => console.warn('action error', e));
  }, [action, payload, run, windowId, globals, queries]);

  if (appearance === 'app_tile') {
    const initials = label.slice(0, 2).toUpperCase();
    return (
      <button
        className="flex flex-col items-center gap-1 px-3 pt-3 pb-2 border border-gray-700 bg-[#c9c3bb] shadow-[inset_-2px_-2px_0_0_#6b7280,inset_2px_2px_0_0_#ffffff] hover:brightness-105 min-w-[92px]"
        onClick={handleClick}
      >
        {iconSrc ? (
          <img src={iconSrc} alt="" className="w-8 h-8 object-contain" />
        ) : (
          <div className="w-8 h-8 rounded border border-gray-700 bg-[#dcd6cd] flex items-center justify-center text-xs font-semibold text-gray-700">
            {initials}
          </div>
        )}
        <span className="text-xs text-gray-900 text-center leading-tight">{label}</span>
      </button>
    );
  }

  return (
    <button
      className="bg-gray-200 hover:bg-gray-300 text-gray-900 border border-gray-500 rounded px-3 py-1 text-sm"
      onClick={handleClick}
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

function MarkdownEditorNode({ data, windowId }: { data?: any; windowId: string }) {
  const readOnly = Boolean(data?.readOnly || data?.readonly);
  const initialValue = typeof data?.value === 'string' ? data.value : '';
  const height = typeof data?.height === 'number' && data.height > 0 ? data.height : 180;

  const [formValues, setFormValues] = useAtom(formsAtom(windowId));
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<any>(null);
  const changeHandlerRef = useRef<(val: string) => void>(() => {});
  const rawId = typeof data?.id === 'string' ? data.id : typeof data?.name === 'string' ? data.name : '';
  const fieldName = useMemo(() => {
    const trimmed = String(rawId || '').trim();
    const withoutDollar = trimmed.startsWith('$') ? trimmed.slice(1) : trimmed;
    const normalized = withoutDollar.replace(/[^A-Za-z0-9_-]/g, '_');
    return normalized || 'editor';
  }, [rawId]);
  const placeholder = typeof data?.placeholder === 'string' ? data.placeholder : '';

  const liveValue = typeof formValues?.[fieldName] === 'string' ? formValues[fieldName] : '';
  const editorValue = readOnly ? initialValue : liveValue;

  const handleChange = useCallback((val: string) => {
    if (readOnly) return;
    setFormValues(prev => ({ ...(prev || {}), [fieldName]: val }));
  }, [fieldName, readOnly, setFormValues]);

  useEffect(() => {
    changeHandlerRef.current = handleChange;
  }, [handleChange]);

  useEffect(() => {
    if (!containerRef.current) return;
    const [instance] = initOvertype(containerRef.current, {
      value: editorValue,
      onChange: (val: string) => changeHandlerRef.current(val),
      placeholder,
    } as any);
    editorRef.current = instance;

    const root = containerRef.current.querySelector('.overtype-root') as HTMLElement | null;
    if (root) {
      root.style.height = '100%';
    }

    if (readOnly) {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!editorRef.current || typeof editorRef.current.getValue !== 'function') return;
    const current = editorRef.current.getValue();
    if (current !== editorValue) {
      editorRef.current.setValue(editorValue);
    }
  }, [editorValue]);

  const showPlaceholder = !readOnly && placeholder && !liveValue;
  const wrapperClass = readOnly
    ? "relative border border-[var(--bevel-dark)] rounded shadow-inner overflow-hidden"
    : "relative border border-[var(--bevel-dark)] rounded shadow-[inset_-1px_-1px_0_0_var(--bevel-dark),inset_1px_1px_0_0_var(--bevel-light)] overflow-hidden";
  const wrapperStyle: CSSProperties = {
    height,
    backgroundColor: readOnly ? 'rgba(198, 178, 168, 0.65)' : 'var(--win-bg)',
  };

  return (
    <div className={wrapperClass} style={wrapperStyle}>
      {showPlaceholder && (
        <div
          className="pointer-events-none absolute text-[rgba(32,23,17,0.68)] text-sm select-none"
          style={{ left: 16, right: 16, top: 16 }}
        >
          {placeholder}
        </div>
      )}
      <div
        ref={containerRef}
        className="h-full overflow-y-auto text-sm text-[var(--title-fg)]"
      />
    </div>
  );
}

function MarkdownViewerNode({ data, globals, queries }: { data?: any; globals: any; queries: Record<string, any> }) {
  const raw = typeof data?.value === 'string' ? data.value : '';
  const height = typeof data?.height === 'number' && data.height > 0 ? data.height : 220;
  const value = useMemo(() => interpolateText(raw, globals, queries), [raw, globals, queries]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const [instance] = initOvertype(containerRef.current, {
      value,
      readOnly: true,
    } as any);
    editorRef.current = instance;

    const editable = containerRef.current.querySelector('[contenteditable="true"]') as HTMLElement | null;
    if (editable) {
      editable.setAttribute('contenteditable', 'false');
      editable.classList.add('pointer-events-none', 'select-text');
    }

    const root = containerRef.current.querySelector('.overtype-root') as HTMLElement | null;
    if (root) {
      root.style.height = '100%';
    }

    return () => {
      try { editorRef.current?.destroy?.(); } catch {}
      editorRef.current = null;
    };
  }, [value]);

  return (
    <div className="h-full" style={{ height }}>
      <div
        ref={containerRef}
        className="h-full border border-[var(--bevel-dark)] rounded shadow-inner overflow-hidden"
      />
    </div>
  );
}

function EachNode({ node, globals, windowId, queries, errors, debug = false }: { node: Node; globals: any; windowId: string; queries: Record<string, any>; errors?: Record<string, string>; debug?: boolean }) {
  const data = node.data || {};
  const sourceExpr = typeof data.source === 'string' ? data.source.trim() : 'queries.items';
  const asNameRaw = typeof data.as === 'string' && data.as.length > 0 ? data.as : 'item';
  const asName = asNameRaw.trim() || 'item';
  const listRaw = resolveReference(sourceExpr, { globals, queries });
  const sourceQueryId = referenceQueryId(sourceExpr);
  const errorMessage = sourceQueryId ? errors?.[sourceQueryId] : undefined;
  if (debug) console.log(`[Each] source=${sourceExpr}`, { errorMessage, listRaw });
  if (errorMessage) {
    return <div className="italic text-sm text-red-600">{errorMessage || 'Failed to load.'}</div>;
  }
  if (listRaw === undefined) {
    return <div className="italic text-sm text-gray-600">Loading…</div>;
  }
  const list = Array.isArray(listRaw) ? listRaw : [];
  if (debug) console.log(`[Each] source=${sourceExpr}`, { length: list.length });
  if (!Array.isArray(listRaw)) return null;
  if (!list.length) return null;

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
  if (spec === undefined) return undefined;

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
  if (typeof data.gap === 'string' && data.gap.length) style.gap = data.gap;
  if (typeof data.gap === 'number' && Number.isFinite(data.gap)) style.gap = `${data.gap}px`;
  if (data.wrap) style.flexWrap = 'wrap';
  if (typeof data.align === 'string' && data.align.length) style.alignItems = data.align;
  if (typeof data.justify === 'string' && data.justify.length) style.justifyContent = data.justify;
  return Object.keys(style).length ? style : undefined;
}

function buildSwitchPayloadFromNostrUri(href: string): Record<string, any> | null {
  if (typeof href !== 'string') return null;
  const trimmed = href.trim();
  if (!trimmed.toLowerCase().startsWith('nostr:')) return null;
  const value = trimmed.slice('nostr:'.length);
  if (!value) return null;
  try {
    const decoded = nip19.decode(value);
    switch (decoded.type) {
      case 'npub': {
        const pubkey = bytesOrStringToHex(decoded.data);
        if (!pubkey) return null;
        const payload = { kind: 0, pubkey, value: trimmed, uri: trimmed };
        console.log('[buildSwitchPayloadFromNostrUri] npub', payload);
        return payload;
      }
      case 'nprofile': {
        const data = decoded.data as { pubkey?: string; relays?: string[] };
        const pubkey = typeof data.pubkey === 'string' ? data.pubkey : null;
        if (!pubkey) return null;
        const payload = { kind: 0, pubkey, value: trimmed, uri: trimmed, relays: Array.isArray(data.relays) ? data.relays : undefined };
        console.log('[buildSwitchPayloadFromNostrUri] nprofile', payload);
        return payload;
      }
      case 'note': {
        const id = bytesOrStringToHex(decoded.data);
        if (!id) return null;
        const payload = { kind: 1, eventId: id, value: trimmed, uri: trimmed };
        console.log('[buildSwitchPayloadFromNostrUri] note', payload);
        return payload;
      }
      case 'nevent': {
        const data = decoded.data as { id: string; author?: string; kind?: number; relays?: string[] };

        if (!data?.id) return null;
        const payload = {
          kind: typeof data.kind === 'number' ? data.kind : 1,
          eventId: data.id,
          author: data.author,
          relays: Array.isArray(data.relays) ? data.relays : undefined,
          value: trimmed,
          uri: trimmed,
        };
        console.log('[buildSwitchPayloadFromNostrUri] nevent', payload);
        return payload;
      }
      case 'naddr': {
        const data = decoded.data as { identifier: string; kind: number; pubkey: string; relays?: string[] };
        if (!data || typeof data.kind !== 'number' || typeof data.pubkey !== 'string') return null;
        const payload = {
          kind: data.kind,
          identifier: data.identifier,
          pubkey: data.pubkey,
          naddr: value,
          value: trimmed,
          uri: trimmed,
          relays: Array.isArray(data.relays) ? data.relays : undefined,
        };
        console.log('[buildSwitchPayloadFromNostrUri] naddr', payload);
        return payload;
      }
      default:
        return null;
    }
  } catch (err) {
    console.warn('Failed to decode nostr link', err);
    return null;
  }
}

function bytesOrStringToHex(data: string | Uint8Array | undefined): string | null {
  if (!data) return null;
  if (typeof data === 'string') return data;
  return Array.from(data).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function RenderNodes({ nodes, globals, windowId, queries, errors, inline = false, debug = false }: RenderNodesProps) {
  const renderNodeContent = (n: Node, key: number): ReactNode => {
    if (n.type === "markdown") {
      return <MarkdownNode n={n} globals={globals} queries={queries} windowId={windowId} />;
    }
    if (n.type === "button") {
      const buttonData = (n.data ?? {}) as Record<string, unknown>;
      const buttonText = typeof buttonData.text === 'string' ? buttonData.text : '';
      const buttonAction = typeof buttonData.action === 'string' ? buttonData.action : undefined;
      const buttonPayload = buttonData.payload;
      return (
        <ButtonNode
          text={buttonText}
          action={buttonAction}
          globals={globals}
          windowId={windowId}
          queries={queries}
          payloadSpec={buttonPayload}
          data={buttonData}
        />
      );
    }
    if (n.type === "markdown_editor") {
      return (
        <MarkdownEditorNode
          data={n.data}
          windowId={windowId}
        />
      );
    }
    if (n.type === "markdown_viewer") {
      return (
        <MarkdownViewerNode
          data={n.data}
          globals={globals}
          queries={queries}
        />
      );
    }
    if (n.type === "input") {
      const inputData = (n.data ?? {}) as Record<string, unknown>;
      const inputText = typeof inputData.text === 'string' ? inputData.text : '';
      const inputName = typeof inputData.name === 'string' ? inputData.name : undefined;
      return (
        <InputNode
          text={inputText}
          name={inputName}
          globals={globals}
          windowId={windowId}
          queries={queries}
        />
      );
    }
    if (n.type === "hstack" || n.type === "vstack") {
      const style = stackStyleFromData(n.data);
      const childNodes: Node[] = Array.isArray(n.children) ? (n.children as Node[]) : [];
      return (
        <div
          className={n.type === "hstack" ? "flex flex-row gap-2" : "flex flex-col gap-2"}
          style={style}
        >
          {childNodes.map((child, childIndex) => (
            <RenderNodes
              key={`${child.id ?? childIndex}`}
              nodes={[child]}
              globals={globals}
              windowId={windowId}
              queries={queries}
              errors={errors}
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
          node={n}
          globals={globals}
          windowId={windowId}
          queries={queries}
          errors={errors}
          debug={debug}
        />
      );
    }
    if (n.type === "note") {
      return (
        <NoteNode
          data={n.data}
          globals={globals}
          queries={queries}
          windowId={windowId}
        />
      );
    }
    if (n.type === "json_viewer") {
      return (
        <JsonViewerNode
          data={n.data}
          globals={globals}
          queries={queries}
        />
      );
    }
    if (n.type === "literal_code") {
      return (
        <LiteralCodeBlock
          code={typeof n.text === 'string' ? n.text : ''}
          lang={typeof n.data?.lang === 'string' ? n.data.lang : undefined}
        />
      );
    }
    return null;
  };

  const wrapNode = (n: Node, idx: number): ReactNode => {
    const content = renderNodeContent(n, idx);
    if (content === null || content === undefined) return null;
    const boundaryKey = n.id || idx;
    return (
      <NodeBoundary key={boundaryKey} node={n} windowId={windowId}>
        {content}
      </NodeBoundary>
    );
  };

  const content = nodes.map((n, i) => wrapNode(n, i));
  if (inline) return <>{content}</>;
  return <div className="flex flex-col gap-2">{content}</div>;
}
