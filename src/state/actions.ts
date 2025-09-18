import { useAtomValue, useSetAtom } from 'jotai'
import { relaysAtom, userAtom, docsAtom, openWindowAtom, bringWindowToFrontAtom, editorSelectionAtom } from './appAtoms'
import { SimplePool, type Event } from 'nostr-tools'
import { isDefaultDocId, loadUserDocs, saveUserDocs } from './docs'

export function normalizeActionName(name?: string) {
  if (!name) return undefined as unknown as string
  let n = String(name).trim()
  if (n.startsWith('@')) n = n.slice(1)
  // camelCase → snake_case
  n = n.replace(/([A-Z])/g, '_$1').toLowerCase()
  // dashes/spaces → underscore; collapse repeats
  n = n.replace(/[\-\s]+/g, '_').replace(/__+/g, '_')
  // alias map
  const aliases: Record<string, string> = {
    setpubkey: 'set_pubkey',
    set_pubkey: 'set_pubkey',
    loadprofile: 'load_profile',
    load_profile: 'load_profile',
    install: 'install_app',
    installapp: 'install_app',
    install_app: 'install_app',
  }
  return aliases[n] || n
}

export function useAction(name?: string) {
  const setUser = useSetAtom(userAtom)
  const relays = useAtomValue(relaysAtom)
  const user = useAtomValue(userAtom)
  const setDocs = useSetAtom(docsAtom)
  const openWindow = useSetAtom(openWindowAtom)
  const bringToFront = useSetAtom(bringWindowToFrontAtom)
  const setEditorSelection = useSetAtom(editorSelectionAtom)

  async function run(payload?: any) {
    if (!name) return
    const n = normalizeActionName(name)
    if (n === 'set_pubkey') {
      const hex = String(payload ?? '')
      setUser(u => ({ ...u, pubkey: hex }))
      return
    }
    if (n === 'load_profile') {
      const pk = user.pubkey
      if (!pk) {
        console.warn('@load_profile: user.pubkey is not set')
        return
      }
      const pool = new SimplePool()
      try {
        console.log('@load_profile: querying kind 0 for', pk)
        const events: Event[] = await pool.querySync(relays || [], { kinds: [0], authors: [pk], limit: 1 })
        if (events.length) {
          try {
            const content = JSON.parse(events[0]!.content)
            setUser(u => ({ ...u, profile: content }))
            console.log('@load_profile: loaded profile', content?.name || content?.display_name || Object.keys(content || {}).length + ' fields')
          } catch (e) {
            console.warn('@load_profile: invalid profile content', e)
          }
        } else {
          console.warn('@load_profile: no profile found on relays')
        }
      } finally {
        pool.close(relays || [])
      }
      return
    }
    if (n === 'install_app') {
      const naddr = typeof payload === 'string' ? payload : payload?.naddr
      if (!naddr) {
        console.warn('@install_app: missing naddr payload')
        return
      }
      try {
        const { installByNaddr } = await import('../services/apps')
        const result = await installByNaddr(naddr, relays || [])
        setDocs(prev => ({ ...prev, [result.id]: result.markdown }))
        if (!isDefaultDocId(result.id)) {
          const userDocs = loadUserDocs()
          saveUserDocs({ ...userDocs, [result.id]: result.markdown })
        }
        setEditorSelection(result.id)
        openWindow(result.id)
        bringToFront(result.id)
      } catch (e) {
        console.warn('@install_app failed', e)
      }
      return
    }
    console.warn('Unknown action', name)
  }

  return run
}
