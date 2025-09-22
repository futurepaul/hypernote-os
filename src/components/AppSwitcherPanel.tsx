import { useMemo } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { docsAtom, bringWindowToFrontAtom, openWindowAtom, isWindowOpenAtom } from '../state/appAtoms'
import { getDocMeta } from '../state/docs'
import { iconRegistry } from '../state/icons'

export function AppSwitcherPanel() {
  const docs = useAtomValue(docsAtom)
  const bringToFront = useSetAtom(bringWindowToFrontAtom)
  const openWindow = useSetAtom(openWindowAtom)
  const items = useMemo(() => Object.entries(docs).filter(([id]) => id !== 'apps').map(([id, doc]) => ({ id, meta: getDocMeta(doc) })), [docs])
  return (
    <div className="flex gap-3 items-end min-w-[200px]">
      {items.map(({ id, meta }) => {
        const icon = meta?.icon && iconRegistry[meta.icon] || iconRegistry['folder.png']
        return (
          <button
            key={id}
            onClick={() => { openWindow(id); bringToFront(id) }}
            className="flex flex-col items-center gap-1 px-2 pt-2 pb-1 border border-gray-700 bg-[#c9c3bb] shadow-[inset_-2px_-2px_0_0_#6b7280,inset_2px_2px_0_0_#ffffff] hover:brightness-105"
            title={meta?.name || id}
          >
            <img src={icon} alt="" className="w-8 h-8" />
            <span className="text-xs text-gray-900">{meta?.name || id}</span>
          </button>
        )
      })}
    </div>
  )
}
