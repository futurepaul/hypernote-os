import { atom } from 'jotai'
import { atomFamily } from 'jotai/utils'
import { getInitialDocs } from '../state/docs'

type Layout = { x: number; y: number; z: number }

const LAYOUT_STORAGE_KEY = 'windowLayout.v1'
const OPEN_WINDOWS_STORAGE_KEY = 'openWindows.v1'

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

function loadOpenWindows(fallback: string[]): string[] {
  try {
    if (typeof localStorage === 'undefined') return fallback
    const raw = localStorage.getItem(OPEN_WINDOWS_STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      const seen = new Set<string>()
      const filtered: string[] = []
      for (const id of parsed) {
        if (typeof id !== 'string') continue
        if (seen.has(id)) continue
        seen.add(id)
        filtered.push(id)
      }
      return filtered.length ? filtered : fallback
    }
  } catch {}
  return fallback
}

function saveOpenWindows(ids: string[]) {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(OPEN_WINDOWS_STORAGE_KEY, JSON.stringify(ids))
  } catch {}
}

const defaultDocIds = Object.keys(getInitialDocs())
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

export const docsAtom = atom<Record<string, string>>(getInitialDocs())
// Select a single doc by id to avoid re-renders from unrelated doc changes
export const docAtom = atomFamily((id: string) => atom((get) => (get(docsAtom)[id] || '')))
export const editorSelectionAtom = atom<string>(defaultDocIds[0] || '')

// Track which windows are open (rendered). Initialized with all doc ids.
const initialOpen = loadOpenWindows(defaultDocIds)
const openWindowsBaseAtom = atom<string[]>(initialOpen)
export const openWindowsAtom = atom(
  get => get(openWindowsBaseAtom),
  (get, set, updater: string[] | ((prev: string[]) => string[])) => {
    const current = get(openWindowsBaseAtom)
    const next = typeof updater === 'function' ? (updater as any)(current) : updater
    const seen = new Set<string>()
    const normalized: string[] = []
    for (const id of next) {
      if (typeof id !== 'string') continue
      if (seen.has(id)) continue
      seen.add(id)
      normalized.push(id)
    }
    if (normalized.length === 0) {
      for (const id of defaultDocIds) if (!seen.has(id)) normalized.push(id)
    }
    set(openWindowsBaseAtom, normalized)
    saveOpenWindows(normalized)
  }
)
export const isWindowOpenAtom = atomFamily((id: string) => atom((get) => (get(openWindowsAtom).includes(id))))
export const openWindowAtom = atom(null, (get, set, id: string) => {
  const open = get(openWindowsAtom)
  if (!open.includes(id)) set(openWindowsAtom, [...open, id])
})
export const closeWindowAtom = atom(null, (get, set, id: string) => {
  const open = get(openWindowsAtom)
  if (open.includes(id)) set(openWindowsAtom, open.filter(x => x !== id))
})

export const relaysAtom = atom<string[]>([
  'wss://nos.lol',
  'wss://relay.damus.io',
  'wss://relay.snort.social',
])
export const debugAtom = atom<boolean>(false)

export const userAtom = atom<{ pubkey: string | null; profile?: any }>({ pubkey: null })
export const bootStageAtom = atom<'init' | 'login' | 'ready'>('init')
export const timeNowAtom = atom<number>(Math.floor(Date.now() / 1000))
// Only subscribe to global time for windows that reference $time.now
export const windowTimeAtom = atomFamily((id: string) => atom((get) => {
  const doc = get(docAtom(id))
  const usesTime = /{{\s*\$time\.now\s*}}/.test(doc)
  return usesTime ? get(timeNowAtom) : 0
}))

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
    const nextX = Math.max(0, pos.x)
    const nextY = Math.max(0, pos.y)
    set(windowLayoutAtom, { ...layout, [id]: { ...prev, x: nextX, y: nextY } })
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
