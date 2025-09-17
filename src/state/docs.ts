import { defaultApps } from "../apps/app";
import YAML from 'yaml'

export function getDefaultDocs(): Record<string, string> {
  return { ...defaultApps }
}

export function parseFrontmatterName(doc: string): string | undefined {
  try {
    if (doc.startsWith('---\n')) {
      const idx = doc.indexOf('\n---\n', 4)
      if (idx !== -1) {
        const meta = YAML.parse(doc.slice(4, idx))
        if (meta?.name) return String(meta.name)
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
        return meta || {}
      }
    }
  } catch {}
  return {}
}
