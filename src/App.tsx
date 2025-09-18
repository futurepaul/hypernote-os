import "./index.css";
import { useEffect, useCallback } from "react";
import { useAtomValue, useSetAtom, useAtom } from 'jotai'
import { docsAtom, timeNowAtom, closeWindowAtom, openWindowsAtom, openWindowAtom, bringWindowToFrontAtom, relaysAtom, bootStageAtom, userAtom, editorSelectionAtom } from './state/appAtoms'
import { hypersauceClientAtom } from './state/hypersauce'
import { LoginWindow } from './components/LoginWindow'
import { parseFrontmatterName } from './state/docs'
import { DraggableWindow } from './components/DraggableWindow'
import { AppView } from './components/AppView'
import { EditorPanel } from './components/EditorPanel'
import { AppSwitcherPanel } from './components/AppSwitcherPanel'
import { SystemMenuPanel } from './components/SystemMenuPanel'

export function App() {
  const setTimeNow = useSetAtom(timeNowAtom)
  useEffect(() => {
    const t = setInterval(() => setTimeNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(t)
  }, [setTimeNow])
  const docs = useAtomValue(docsAtom)
  const openIds = useAtomValue(openWindowsAtom)
  const closeWindow = useSetAtom(closeWindowAtom)
  const openWindow = useSetAtom(openWindowAtom)
  const bringToFront = useSetAtom(bringWindowToFrontAtom)
  const setEditorSelection = useSetAtom(editorSelectionAtom)
  const setHS = useSetAtom(hypersauceClientAtom)
  const relays = useAtomValue(relaysAtom)
  const [bootStage, setBootStage] = useAtom(bootStageAtom)
  const user = useAtomValue(userAtom)

  // Initialize a single Hypersauce client at startup and when relays change
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const mod: any = await import('../../hypersauce/client.ts')
        const HS = mod?.HypersauceClient
        if (!HS) throw new Error('Hypersauce export missing')
        const client = new HS({ relays })
        if (!alive) return
        setHS(client)
        setBootStage(user.pubkey ? 'ready' : 'login')
      } catch (e) {
        console.warn('[Hypersauce] module not available', e)
        setHS(null)
        setBootStage('login')
      }
    })()
    return () => { alive = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // No bridge needed; inputs call Jotai actions directly now

  const handleEdit = useCallback((targetId: string) => {
    setEditorSelection(targetId)
    openWindow('editor')
    bringToFront('editor')
  }, [setEditorSelection, openWindow, bringToFront])

  return (
    <main className="min-h-screen text-gray-900">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-semibold">Hypernote</h1>
        <p className="mt-3 text-gray-600">
          Frontend is running with plain Tailwind on port 3420.
        </p>
      </div>
      {bootStage !== 'ready' ? (
        <LoginWindow />
      ) : openIds.map((id) => {
        const doc = docs[id]
        if (!doc) return null
        const canEdit = id !== 'editor'
        return (
          <DraggableWindow
            key={id}
            id={id}
            title={parseFrontmatterName(doc) || id}
            contentClassName={id === 'editor' ? "bg-[var(--win-bg)] text-sm text-gray-900 p-0" : undefined}
            onClose={() => closeWindow(id)}
            onEdit={canEdit ? () => handleEdit(id) : undefined}
          >
            {id === 'editor' ? <EditorPanel /> : id === 'apps' ? <AppSwitcherPanel /> : id === 'system' ? <SystemMenuPanel /> : <AppView id={id} />}
          </DraggableWindow>
        )
      })}
    </main>
  );
}

export default App;
