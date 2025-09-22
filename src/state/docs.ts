import { defaultApps } from "../apps/app";
import YAML from 'yaml'

const USER_DOCS_KEY = 'userDocs.v1'

export function getDefaultDocs(): Record<string, string> {
  return { ...defaultApps }
}

export function parseFrontmatterName(doc: string): string | undefined {
  try {
    if (doc.startsWith('---\n')) {
      const idx = doc.indexOf('\n---\n', 4)
      if (idx !== -1) {
        const meta = YAML.parse(doc.slice(4, idx))
        if (meta?.hypernote?.name) return String(meta.hypernote.name)
      }
    }
  } catch {}
  return undefined
}

export function getDocMeta(doc: string): any {
  try {
    if (doc.startsWith('---\n')) {
      const idx = doc.indexOf('\n---\n', 4)
      if (idx !== -1) {
        const meta = YAML.parse(doc.slice(4, idx))
        if (meta?.hypernote) return meta.hypernote
        return meta || {}
      }
    }
  } catch {}
  return {}
}

export function loadUserDocs(): Record<string, string> {
  try {
    if (typeof localStorage === 'undefined') return {}
    const raw = localStorage.getItem(USER_DOCS_KEY)
    if (!raw) return {}
    const obj = JSON.parse(raw)
    if (obj && typeof obj === 'object') return obj
  } catch {}
  return {}
}

export function saveUserDocs(docs: Record<string, string>) {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(USER_DOCS_KEY, JSON.stringify(docs))
  } catch {}
}

export function clearUserDocs() {
  try { if (typeof localStorage !== 'undefined') localStorage.removeItem(USER_DOCS_KEY) } catch {}
}

export function getInitialDocs(): Record<string, string> {
  const base = getDefaultDocs()
  const user = loadUserDocs()
  return { ...base, ...user }
}

export function isDefaultDocId(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(defaultApps, id)
}
