import { useEffect, useRef, type PropsWithChildren } from "react";
import { useAtom, useSetAtom, useAtomValue } from 'jotai'
import { windowPosAtom, windowZAtom, bringWindowToFrontAtom } from '../state/appAtoms'

export function DraggableWindow({ id, title, children, contentClassName, onClose }: PropsWithChildren<{ id: string; title?: string; contentClassName?: string; onClose?: () => void }>) {
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

  const titlebarClass = "bg-[#E6A86A] text-gray-900";

  return (
    <div
      className={`absolute select-none`}
      style={{ left: pos.x, top: pos.y, zIndex: z }}
      ref={dragRef}
      onMouseDown={() => bringToFront(id)}
    >
      <div className="border border-gray-700 shadow-[inset_-2px_-2px_0_0_#4b5563,inset_2px_2px_0_0_#ffffff] bg-[#c9c3bb]">
        <div
          className={`relative cursor-grab ${titlebarClass} pl-6 pr-3 py-1 text-sm font-semibold shadow-[inset_0_1px_0_0_#ffffff]`}
          onPointerDown={onPointerDownTitle}
        >
          {onClose && (
            <button
              aria-label="Close"
              onPointerDown={(e) => { e.stopPropagation(); }}
              onClick={(e) => { e.stopPropagation(); onClose?.(); }}
              className="absolute left-1 top-1 w-4 h-4 border border-gray-700 bg-[#d8d2c9] shadow-[inset_-1px_-1px_0_0_#6b7280,inset_1px_1px_0_0_#ffffff] hover:bg-[#e4deD5]"
            />
          )}
          {title ?? id}
        </div>
        <div className={contentClassName ?? "bg-[#d8d2c9] p-3 text-sm text-gray-900"}>{children}</div>
      </div>
    </div>
  );
}
