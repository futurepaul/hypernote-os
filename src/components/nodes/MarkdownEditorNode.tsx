import { useMemo, useEffect, useRef, useCallback, type CSSProperties } from "react";
import { useAtom } from "jotai";
import { initOvertype } from "../../lib/overtypeTheme";
import { formsAtom } from "../../state/formsAtoms";

type Props = {
  data?: any;
  windowId: string;
};

export function MarkdownEditorNode({ data, windowId }: Props) {
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
