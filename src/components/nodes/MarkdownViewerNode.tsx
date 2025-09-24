import { useMemo, useEffect, useRef } from "react";
import { initOvertype } from "../../lib/overtypeTheme";
import { interpolateText } from "./utils";

type Props = {
  data?: any;
  globals: any;
  queries: Record<string, any>;
};

export function MarkdownViewerNode({ data, globals, queries }: Props) {
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
