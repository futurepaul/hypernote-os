import { atom } from 'jotai'
import { atomFamily } from 'jotai/utils'
import { getDefaultDocs } from '../state/docs'

type Layout = { x: number; y: number; z: number }

const LAYOUT_STORAGE_KEY = 'windowLayout.v1'

function loadLayout(): Record<string, Layout> | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed
  } catch {}
  return null
}

function computeDefaultLayout(ids: string[]): Record<string, Layout> {
  const out: Record<string, Layout> = {}
  const baseX = 100
  const baseY = 100
  const stepX = 32
  const stepY = 24
  let z = 1000
  ids.forEach((id, i) => {
    out[id] = { x: baseX + i * stepX, y: baseY + i * stepY, z: z + i }
  })
  return out
}

const defaultDocIds = Object.keys(getDefaultDocs())
const initialLayout: Record<string, Layout> = loadLayout() || computeDefaultLayout(defaultDocIds)
const initialZCounter = Math.max(0, ...Object.values(initialLayout).map(l => l.z)) + 1

const windowLayoutBaseAtom = atom<Record<string, Layout>>(initialLayout)
export const windowLayoutAtom = atom(
  get => get(windowLayoutBaseAtom),
  (get, set, updater: Record<string, Layout> | ((prev: Record<string, Layout>) => Record<string, Layout>)) => {
    const next = typeof updater === 'function' ? (updater as any)(get(windowLayoutBaseAtom)) : updater
    set(windowLayoutBaseAtom, next)
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(next)) } catch {}
  }
)

export const docsAtom = atom<Record<string, string>>(getDefaultDocs())

export const relaysAtom = atom<string[]>([
  'wss://nos.lol',
  'wss://relay.damus.io',
  'wss://relay.snort.social',
])

export const userAtom = atom<{ pubkey: string | null; profile?: any }>({ pubkey: null })
export const timeNowAtom = atom<number>(Math.floor(Date.now() / 1000))

// Window UI state
export const windowPosAtom = atomFamily((id: string) => atom(
  (get) => {
    const layout = get(windowLayoutAtom)
    const l = layout[id]
    return { x: l?.x ?? 100, y: l?.y ?? 100 }
  },
  (get, set, pos: { x: number; y: number }) => {
    const layout = get(windowLayoutAtom)
    const prev = layout[id] || { x: 100, y: 100, z: 1000 }
    set(windowLayoutAtom, { ...layout, [id]: { ...prev, x: pos.x, y: pos.y } })
  }
))

export const windowZAtom = atomFamily((id: string) => atom(
  (get) => (get(windowLayoutAtom)[id]?.z ?? 1000),
  (get, set, z: number) => {
    const layout = get(windowLayoutAtom)
    const prev = layout[id] || { x: 100, y: 100, z: 1000 }
    set(windowLayoutAtom, { ...layout, [id]: { ...prev, z } })
  }
))

export const zCounterAtom = atom<number>(initialZCounter)
export const activeWindowAtom = atom<string | null>(null)

export const bringWindowToFrontAtom = atom(null, (get, set, id: string) => {
  const next = (get(zCounterAtom) as number) + 1
  set(zCounterAtom, next)
  set(windowZAtom(id), next)
  set(activeWindowAtom, id)
})
