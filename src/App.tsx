import "./index.css";
import { useEffect } from "react";
import { useAtom, useSetAtom, useAtomValue } from 'jotai'
import { docsAtom, timeNowAtom, userAtom } from './state/appAtoms'
import { hydrateDocsFromAssets, parseFrontmatterName } from './state/docs'
import { DraggableWindow } from './components/DraggableWindow'
import { AppView } from './components/AppView'

export function App() {
  const setTimeNow = useSetAtom(timeNowAtom)
  useEffect(() => {
    const t = setInterval(() => setTimeNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(t)
  }, [setTimeNow])
  // Hydrate docs in dev
  const [docs, setDocs] = useAtom(docsAtom)
  useEffect(() => {
    ;(async () => setDocs(await hydrateDocsFromAssets(docs)))()
  }, [])
  // Bridge custom event for pubkey updates from inputs (temporary)
  const setUser = useSetAtom(userAtom)
  useEffect(() => {
    const handler = (e: any) => setUser(u => ({ ...u, pubkey: e.detail }))
    window.addEventListener('hypernote:set-pubkey', handler as any)
    return () => window.removeEventListener('hypernote:set-pubkey', handler as any)
  }, [setUser])

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
          <AppView id={id} />
        </DraggableWindow>
      ))}
    </main>
  );
}

export default App;
