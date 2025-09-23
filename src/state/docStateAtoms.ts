import { atom } from 'jotai'
import { atomFamily } from 'jotai/utils'

// Per-window doc-scoped state shared between actions and queries.
export const docStateAtom = atomFamily((id: string) => atom<Record<string, any>>({}))
