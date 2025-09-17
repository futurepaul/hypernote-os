import "./index.css";
import { useEffect } from "react";
import { useAtomValue, useSetAtom } from 'jotai'
import { docsAtom, timeNowAtom, closeWindowAtom, openWindowsAtom, openWindowAtom, bringWindowToFrontAtom } from './state/appAtoms'
import { parseFrontmatterName } from './state/docs'
import { DraggableWindow } from './components/DraggableWindow'
import { AppView } from './components/AppView'
import { EditorPanel } from './components/EditorPanel'
import { AppSwitcherPanel } from './components/AppSwitcherPanel'

export function App() {
  const setTimeNow = useSetAtom(timeNowAtom)
  useEffect(() => {
    const t = setInterval(() => setTimeNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(t)
  }, [setTimeNow])
  const docs = useAtomValue(docsAtom)
  const openIds = useAtomValue(openWindowsAtom)
  const closeWindow = useSetAtom(closeWindowAtom)
  const bringToFront = useSetAtom(bringWindowToFrontAtom)
  // No bridge needed; inputs call Jotai actions directly now

  return (
    <main className="min-h-screen text-gray-900">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-semibold">Hypernote</h1>
        <p className="mt-3 text-gray-600">
          Frontend is running with plain Tailwind on port 3420.
        </p>
      </div>
      {openIds.map((id) => {
        const doc = docs[id]
        if (!doc) return null
        return (
          <DraggableWindow
            key={id}
            id={id}
            title={parseFrontmatterName(doc) || id}
            contentClassName={id === 'editor' ? "bg-[var(--win-bg)] text-sm text-gray-900 p-0" : undefined}
            onClose={() => closeWindow(id)}
          >
            {id === 'editor' ? <EditorPanel /> : id === 'apps' ? <AppSwitcherPanel /> : <AppView id={id} />}
          </DraggableWindow>
        )
      })}
    </main>
  );
}

export default App;
