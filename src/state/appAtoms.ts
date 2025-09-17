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
export const windowPosAtom = atomFamily((id: string) => atom<{ x: number; y: number }>({ x: 100, y: 100 }))
export const windowZAtom = atomFamily((id: string) => atom<number>(1000))

export const zCounterAtom = atom<number>(1001)
export const activeWindowAtom = atom<string | null>(null)

export const bringWindowToFrontAtom = atom(null, (get, set, id: string) => {
  const next = (get(zCounterAtom) as number) + 1
  set(zCounterAtom, next)
  set(windowZAtom(id), next)
  set(activeWindowAtom, id)
})
