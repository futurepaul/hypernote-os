import { useState, useMemo, useCallback } from "react";
import { buildPayload } from "./utils";

type Props = {
  data?: any;
  globals: any;
  queries: Record<string, any>;
};

export function JsonViewerNode({ data, globals, queries }: Props) {
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
