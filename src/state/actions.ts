import { useAtomValue, useSetAtom } from 'jotai'
import { relaysAtom, userAtom } from './appAtoms'
import { SimplePool, type Event } from 'nostr-tools'

export function useAction(name?: string) {
  const setUser = useSetAtom(userAtom)
  const relays = useAtomValue(relaysAtom)
  const user = useAtomValue(userAtom)

  async function run(payload?: any) {
    if (!name) return
    if (name === '@set_pubkey') {
      const hex = String(payload ?? '')
      setUser(u => ({ ...u, pubkey: hex }))
      return
    }
    if (name === '@load_profile') {
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
    console.warn('Unknown action', name)
  }

  return run
}
