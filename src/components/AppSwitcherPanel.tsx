import { useAtomValue, useSetAtom } from 'jotai'
import { docsAtom, bringWindowToFrontAtom } from '../state/appAtoms'

export function AppSwitcherPanel() {
  const docs = useAtomValue(docsAtom)
  const bringToFront = useSetAtom(bringWindowToFrontAtom)
  const ids = Object.keys(docs)
  return (
    <div className="flex gap-2 flex-wrap">
      {ids.filter(id => id !== 'apps').map(id => (
        <button
          key={id}
          onClick={() => bringToFront(id)}
          className="px-2 py-1 border border-gray-500 rounded text-sm bg-gray-200 hover:bg-gray-300"
        >
          {id}
        </button>
      ))}
    </div>
  )
}

