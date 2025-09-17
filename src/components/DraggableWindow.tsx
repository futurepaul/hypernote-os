import { useEffect, useRef, type PropsWithChildren } from "react";
import { useAtom, useSetAtom, useAtomValue } from 'jotai'
import { windowPosAtom, windowZAtom, bringWindowToFrontAtom } from '../state/appAtoms'

export function DraggableWindow({ id, title, children }: PropsWithChildren<{ id: string; title?: string }>) {
  const dragRef = useRef<HTMLDivElement | null>(null);
  const isDragging = useRef(false);
  const offset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [pos, setPos] = useAtom(windowPosAtom(id))
  const z = useAtomValue(windowZAtom(id))
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
  }, [id, setPos, setActive]);

  function onPointerDownTitle(e: React.PointerEvent) {
    isDragging.current = true;
    offset.current.x = e.clientX - pos.x;
    offset.current.y = e.clientY - pos.y;
    bringToFront(id)
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
  }

  const titlebarClass = "bg-yellow-300 text-gray-900";

  return (
    <div
      className={`absolute select-none`}
      style={{ left: pos.x, top: pos.y, zIndex: z }}
      ref={dragRef}
      onMouseDown={() => bringToFront(id)}
    >
      <div className="border border-gray-600 shadow-[inset_-1px_-1px_0_0_#4b5563,inset_1px_1px_0_0_#ffffff] bg-gray-200">
        <div
          className={`cursor-grab ${titlebarClass} px-3 py-1 text-sm font-semibold shadow-[inset_0_1px_0_0_#ffffff]`}
          onPointerDown={onPointerDownTitle}
        >
          {title ?? w.title}
        </div>
        <div className="bg-gray-100 p-3 text-sm text-gray-900">{children}</div>
      </div>
    </div>
  );
}
