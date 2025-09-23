import { atom } from 'jotai'
import { atomFamily } from 'jotai/utils'
import { docsAtom } from './appAtoms'
import { getDocMeta } from './docs'
import { iconRegistry } from './icons'

export type SystemAppHandle = {
  kind: number
  label?: string
  forms?: Record<string, any>
  state?: Record<string, any>
}

export type SystemAppInfo = {
  id: string
  name: string
  icon?: string | null
  iconUrl?: string | null
  type?: string | null
  handles: SystemAppHandle[]
}

const RESERVED_DOC_IDS = new Set(['apps'])

function normalizeHandles(raw: any): SystemAppHandle[] {
  if (!raw) return []
  const arr = Array.isArray(raw) ? raw : [raw]
  const handles: SystemAppHandle[] = []
  for (const entry of arr) {
    if (entry == null) continue
    if (typeof entry === 'number') {
      handles.push({ kind: entry })
      continue
    }
    if (typeof entry === 'object') {
      const kindRaw = (entry as any).kind
      const kind = typeof kindRaw === 'number' ? kindRaw : typeof kindRaw === 'string' ? Number(kindRaw) : NaN
      if (!Number.isFinite(kind)) continue
      const handle: SystemAppHandle = { kind }
      if (typeof (entry as any).label === 'string' && (entry as any).label.trim()) handle.label = (entry as any).label.trim()
      if ((entry as any).forms && typeof (entry as any).forms === 'object') handle.forms = (entry as any).forms as Record<string, any>
      if ((entry as any).state && typeof (entry as any).state === 'object') handle.state = (entry as any).state as Record<string, any>
      handles.push(handle)
    }
  }
  return handles
}

function docToSystemApp(id: string, markdown: string): SystemAppInfo {
  const meta = getDocMeta(markdown) || {}
  const name = typeof (meta as any)?.name === 'string' && (meta as any).name.trim() ? (meta as any).name.trim() : id
  const icon = typeof (meta as any)?.icon === 'string' ? (meta as any).icon : null
  const iconUrl = icon ? iconRegistry[icon] ?? null : null
  const type = typeof (meta as any)?.type === 'string' ? (meta as any).type : null
  const handles = normalizeHandles((meta as any)?.handles || (meta as any)?.capabilities?.handles)
  return { id, name, icon, iconUrl, type, handles }
}

export const installedAppsAtom = atom<SystemAppInfo[]>((get) => {
  const docs = get(docsAtom)
  const entries = Object.entries(docs)
  return entries
    .map(([id, doc]) => docToSystemApp(id, doc))
    .filter(app => !RESERVED_DOC_IDS.has(app.id))
})

export const appHandlesAtom = atom<Record<string, SystemAppHandle[]>>((get) => {
  const docs = get(docsAtom)
  const map: Record<string, SystemAppHandle[]> = {}
  for (const [id, doc] of Object.entries(docs)) {
    map[id] = docToSystemApp(id, doc).handles
  }
  return map
})

export const windowIntentAtom = atomFamily((id: string) => atom<any>(null))
