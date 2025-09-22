import { useSetAtom, useAtomValue } from 'jotai'
import { bringWindowToFrontAtom, debugAtom, openWindowAtom, openWindowsAtom, relaysAtom, userAtom, editorSelectionAtom } from '../state/appAtoms'
import { docsAtom } from '../state/appAtoms'
import { installByNaddr } from '../services/apps'
import { clearUserDocs, getDefaultDocs, loadUserDocs, saveUserDocs } from '../state/docs'

export function SystemMenuPanel() {
  const setDocs = useSetAtom(docsAtom)
  const openWin = useSetAtom(openWindowAtom)
  const setOpenWindows = useSetAtom(openWindowsAtom)
  const bringToFront = useSetAtom(bringWindowToFrontAtom)
  const relays = useAtomValue(relaysAtom)
  const setUser = useSetAtom(userAtom)
  const debug = useAtomValue(debugAtom)
  const setDebug = useSetAtom(debugAtom)
  const setEditorSelection = useSetAtom(editorSelectionAtom)

  async function addApp() {
    const naddr = prompt('Paste app naddr:')?.trim()
    if (!naddr) return
    try {
      const { id, markdown } = await installByNaddr(naddr, relays)
      setDocs(d => ({ ...d, [id]: markdown }))
      openWin(id); bringToFront(id)
    } catch (e) {
      alert('Failed to install: ' + (e as any)?.message)
    }
  }

  function createNewApp() {
    const id = prompt('New app id (letters, numbers, dashes):', 'my-app')?.trim()
    if (!id) return
    if (!/^[a-z0-9\-]+$/i.test(id)) { alert('Invalid id'); return }
    setDocs(prev => {
      if (prev[id]) {
        alert('An app with that id already exists')
        return prev
      }
      const template = `---\nname: ${id}\nicon: folder.png\n---\nHello from ${id}.\n`
      const next = { ...prev, [id]: template }
      const userDocs = loadUserDocs()
      saveUserDocs({ ...userDocs, [id]: template })
      setEditorSelection(id)
      openWin('editor'); bringToFront('editor')
      try { openWin(id); bringToFront(id) } catch {}
      return next
    })
  }

  function toggleDebug() { setDebug(v => !v) }

  function resetWorkspace() {
    if (!confirm('Reset workspace to defaults? This will remove your local apps.')) return
    clearUserDocs()
    const base = getDefaultDocs()
    setDocs(base)
    setOpenWindows(['apps'])
    setEditorSelection(Object.keys(base).find(id => !['apps','editor','system'].includes(id)) || '')
    setUser(u => ({ ...u, pubkey: null, profile: undefined }))
    bringToFront('apps')
  }

  function logout() {
    window.location.reload()
  }

  return (
    <div className="flex flex-col gap-2 w-56">
      <button className="px-2 py-1 bg-[var(--win-bg)] border border-[var(--bevel-dark)] shadow-[inset_-1px_-1px_0_0_var(--bevel-dark),inset_1px_1px_0_0_var(--bevel-light)] hover:brightness-105" onClick={createNewApp}>Create New App</button>
      <button className="px-2 py-1 bg-[var(--win-bg)] border border-[var(--bevel-dark)] shadow-[inset_-1px_-1px_0_0_var(--bevel-dark),inset_1px_1px_0_0_var(--bevel-light)] hover:brightness-105" onClick={addApp}>Add App (naddr)</button>
      <button className="px-2 py-1 bg-[var(--win-bg)] border border-[var(--bevel-dark)] shadow-[inset_-1px_-1px_0_0_var(--bevel-dark),inset_1px_1px_0_0_var(--bevel-light)] hover:brightness-105" onClick={toggleDebug}>{debug ? 'Disable' : 'Enable'} Debug Logs</button>
      <button className="px-2 py-1 bg-[var(--win-bg)] border border-[var(--bevel-dark)] shadow-[inset_-1px_-1px_0_0_var(--bevel-dark),inset_1px_1px_0_0_var(--bevel-light)] hover:brightness-105" onClick={resetWorkspace}>Reset Workspace</button>
      <button className="px-2 py-1 bg-[var(--win-bg)] border border-[var(--bevel-dark)] shadow-[inset_-1px_-1px_0_0_var(--bevel-dark),inset_1px_1px_0_0_var(--bevel-light)] hover:brightness-105" onClick={logout}>Logout</button>
    </div>
  )
}
