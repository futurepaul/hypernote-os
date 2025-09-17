import "./index.css";
import { useEffect, useState } from "react";
import { useAtom, useSetAtom } from 'jotai'
import { docsAtom, timeNowAtom } from './state/appAtoms'
import { hydrateDocsFromAssets, parseFrontmatterName } from './state/docs'
import { DraggableWindow } from './components/DraggableWindow'
import { AppView } from './components/AppView'
import { EditorWindow } from './components/EditorWindow'
import { AppSwitcher } from './components/AppSwitcher'

export function App() {
  const setTimeNow = useSetAtom(timeNowAtom)
  useEffect(() => {
    const t = setInterval(() => setTimeNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(t)
  }, [setTimeNow])
  // Hydrate docs in dev & after reset
  const [docs, setDocs] = useAtom(docsAtom)
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const next = await hydrateDocsFromAssets(docs)
      if (!mounted) return
      setDocs(next)
      setHydrated(true)
    })()
    return () => { mounted = false }
  }, [])
  useEffect(() => {
    const needs = Object.values(docs).some(v => typeof v === 'string' && /\/(_bun|assets)\/asset\/.+\.md$/.test(v))
    if (needs) { ;(async () => setDocs(await hydrateDocsFromAssets(docs)))() }
  }, [docs, setDocs])
  // No bridge needed; inputs call Jotai actions directly now

  return (
    <main className="min-h-screen text-gray-900">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-semibold">Hypernote</h1>
        <p className="mt-3 text-gray-600">
          Frontend is running with plain Tailwind on port 3420.
        </p>
      </div>
      {Object.entries(docs).map(([id, doc]) => (
        <DraggableWindow key={id} id={id} title={parseFrontmatterName(doc) || id}>
          {id === 'editor' ? <EditorWindow /> : id === 'apps' ? <AppSwitcher /> : <AppView id={id} />}
        </DraggableWindow>
      ))}
    </main>
  );
}

export default App;
