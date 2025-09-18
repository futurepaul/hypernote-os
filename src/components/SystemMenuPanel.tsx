import { useSetAtom, useAtomValue } from 'jotai'
import { bringWindowToFrontAtom, debugAtom, openWindowAtom, relaysAtom, userAtom } from '../state/appAtoms'
import { docsAtom } from '../state/appAtoms'
import { installByNaddr } from '../services/apps'

export function SystemMenuPanel() {
  const setDocs = useSetAtom(docsAtom)
  const openWin = useSetAtom(openWindowAtom)
  const bringToFront = useSetAtom(bringWindowToFrontAtom)
  const relays = useAtomValue(relaysAtom)
  const setUser = useSetAtom(userAtom)
  const debug = useAtomValue(debugAtom)
  const setDebug = useSetAtom(debugAtom)

  async function login() {
    try {
      const { HypersauceClient } = await import('hypersauce') as any
      const client = new HypersauceClient({ relays })
      const { pubkey } = await client.login()
      setUser(u => ({ ...u, pubkey }))
      alert('Logged in as ' + pubkey.slice(0,8) + '…')
    } catch (e) {
      alert('Login failed: ' + (e as any)?.message)
    }
  }

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

  function newDraft() {
    const id = prompt('New draft id:', 'my-draft')?.trim()
    if (!id) return
    const template = `---\nname: ${id}\nicon: folder.png\n---\nHello from ${id}.\n`
    setDocs(d => ({ ...d, [id]: template }))
    openWin('editor'); bringToFront('editor')
  }

  function openEditor() { openWin('editor'); bringToFront('editor') }
  function toggleDebug() { setDebug(v => !v) }

  return (
    <div className="flex flex-col gap-2 w-56">
      <button className="px-2 py-1 bg-[var(--win-bg)] border border-[var(--bevel-dark)] shadow-[inset_-1px_-1px_0_0_var(--bevel-dark),inset_1px_1px_0_0_var(--bevel-light)] hover:brightness-105" onClick={login}>Login (NIP‑07)</button>
      <button className="px-2 py-1 bg-[var(--win-bg)] border border-[var(--bevel-dark)] shadow-[inset_-1px_-1px_0_0_var(--bevel-dark),inset_1px_1px_0_0_var(--bevel-light)] hover:brightness-105" onClick={addApp}>Add App (naddr)</button>
      <button className="px-2 py-1 bg-[var(--win-bg)] border border-[var(--bevel-dark)] shadow-[inset_-1px_-1px_0_0_var(--bevel-dark),inset_1px_1px_0_0_var(--bevel-light)] hover:brightness-105" onClick={newDraft}>New Draft</button>
      <button className="px-2 py-1 bg-[var(--win-bg)] border border-[var(--bevel-dark)] shadow-[inset_-1px_-1px_0_0_var(--bevel-dark),inset_1px_1px_0_0_var(--bevel-light)] hover:brightness-105" onClick={openEditor}>Open Editor</button>
      <button className="px-2 py-1 bg-[var(--win-bg)] border border-[var(--bevel-dark)] shadow-[inset_-1px_-1px_0_0_var(--bevel-dark),inset_1px_1px_0_0_var(--bevel-light)] hover:brightness-105" onClick={toggleDebug}>{debug ? 'Disable' : 'Enable'} Debug Logs</button>
    </div>
  )
}

