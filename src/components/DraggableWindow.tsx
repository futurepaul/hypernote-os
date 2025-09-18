import { useEffect, useRef, type PropsWithChildren } from "react";
import { useAtom, useSetAtom, useAtomValue } from 'jotai'
import { windowPosAtom, windowZAtom, bringWindowToFrontAtom, activeWindowAtom } from '../state/appAtoms'

export function DraggableWindow({ id, title, children, contentClassName, onClose, onEdit }: PropsWithChildren<{ id: string; title?: string; contentClassName?: string; onClose?: () => void; onEdit?: () => void }>) {
  const dragRef = useRef<HTMLDivElement | null>(null);
  const isDragging = useRef(false);
  const offset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const posAtom = windowPosAtom(id)
  const pos = useAtomValue(posAtom) as { x: number; y: number }
  const setPos = useSetAtom(posAtom)
  const z = useAtomValue(windowZAtom(id)) as number
  const bringToFront = useSetAtom(bringWindowToFrontAtom)

  useEffect(() => {
    function onPointerMove(e: PointerEvent) {
      if (!isDragging.current) return;
      setPos({ x: e.clientX - offset.current.x, y: e.clientY - offset.current.y });
    }
    function onPointerUp() {
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    function onPointerDownGlobal(e: PointerEvent) {
      if (dragRef.current && dragRef.current.contains(e.target as Node)) {
        bringToFront(id)
      }
    }
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointerdown", onPointerDownGlobal, { capture: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointerdown", onPointerDownGlobal, { capture: true } as any);
    };
  }, [id, setPos, bringToFront]);

  function onPointerDownTitle(e: React.PointerEvent) {
    isDragging.current = true;
    offset.current.x = e.clientX - pos.x;
    offset.current.y = e.clientY - pos.y;
    bringToFront(id)
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
  }

  const activeId = useAtomValue(activeWindowAtom) as string | null
  const isActive = activeId === id
  const titlebarClass = `${isActive ? 'bg-[var(--title-bg)]' : 'bg-[var(--title-bg-inactive)]'} text-[var(--title-fg)]`

  return (
    <div
      className={`absolute select-none`}
      style={{ left: pos.x, top: pos.y, zIndex: z }}
      ref={dragRef}
      onMouseDown={() => bringToFront(id)}
    >
      <div className="border border-[var(--bevel-dark)] shadow-[inset_-2px_-2px_0_0_var(--bevel-dark),inset_2px_2px_0_0_var(--bevel-light)] bg-[var(--chrome-bg)]">
        <div
          className={`cursor-grab ${titlebarClass} px-2 py-1 text-sm font-semibold shadow-[inset_0_1px_0_0_var(--bevel-light)] relative flex items-center justify-center`}
          onPointerDown={onPointerDownTitle}
        >
          {onClose && (
            <button
              aria-label="Close"
              onPointerDown={(e) => { e.stopPropagation(); }}
              onClick={(e) => { e.stopPropagation(); onClose?.(); }}
              className="w-4 h-4 border border-[var(--bevel-dark)] bg-[var(--win-bg)] shadow-[inset_-1px_-1px_0_0_var(--bevel-dark),inset_1px_1px_0_0_var(--bevel-light)] hover:brightness-105 absolute left-2"
            />
          )}
          <div className="pointer-events-none">
            <span>{title ?? id}</span>
          </div>
          {onEdit && (
            <button
              aria-label="Edit"
              onPointerDown={(e) => { e.stopPropagation(); }}
              onClick={(e) => { e.stopPropagation(); onEdit?.(); }}
              className="px-2 py-0.5 text-xs border border-[var(--bevel-dark)] bg-[var(--win-bg)] text-gray-900 shadow-[inset_-1px_-1px_0_0_var(--bevel-dark),inset_1px_1px_0_0_var(--bevel-light)] hover:brightness-105 absolute right-2"
            >
              Edit
            </button>
          )}
        </div>
        <div className={contentClassName ?? "bg-[var(--win-bg)] p-3 text-sm text-gray-900"}>{children}</div>
      </div>
    </div>
  );
}
