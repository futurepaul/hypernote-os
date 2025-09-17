import { atom } from 'jotai'
import { atomFamily } from 'jotai/utils'
import { getDefaultDocs } from '../state/docs'

export const docsAtom = atom<Record<string, string>>(getDefaultDocs())

export const relaysAtom = atom<string[]>([
  'wss://nos.lol',
  'wss://relay.damus.io',
  'wss://relay.snort.social',
])

export const userAtom = atom<{ pubkey: string | null; profile?: any }>({ pubkey: null })
export const timeNowAtom = atom<number>(Math.floor(Date.now() / 1000))

// Window UI state
export const windowPosAtom = atomFamily<string, { x: number; y: number }>(
  id => atom({ x: 100, y: 100 }),
  (a, b) => a === b,
)

export const windowZAtom = atomFamily<string, number>(
  id => atom(1000),
  (a, b) => a === b,
)

export const zCounterAtom = atom(1001)
export const activeWindowAtom = atom<string | null>(null)

export const bringWindowToFrontAtom = atom(null, (get, set, id: string) => {
  const next = get(zCounterAtom) + 1
  set(zCounterAtom, next)
  set(windowZAtom(id), next)
  set(activeWindowAtom, id)
})

