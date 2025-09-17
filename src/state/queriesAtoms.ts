import { atom } from 'jotai'
import { atomFamily } from 'jotai/utils'

// Per-window query scalars atom
export const windowScalarsAtom = atomFamily<string, Record<string, any>>(
  (id: string) => atom<Record<string, any>>({}),
  (a, b) => a === b,
)

// Helper to merge scalars with deep-equality on objects
function deepEqual(a: any, b: any) {
  if (a === b) return true
  if (typeof a === 'object' && a && typeof b === 'object' && b) {
    try { return JSON.stringify(a) === JSON.stringify(b) } catch { return false }
  }
  return false
}

export function mergeScalars(prev: Record<string, any>, next: Record<string, any>) {
  let changed = false
  const out: Record<string, any> = { ...prev }
  for (const k of Object.keys(next)) {
    if (!deepEqual(prev[k], next[k])) { out[k] = next[k]; changed = true }
  }
  return changed ? out : prev
}

