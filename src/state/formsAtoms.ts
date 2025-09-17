import { atom } from 'jotai'
import { atomFamily } from 'jotai/utils'

// Per-window forms store: { [name]: value }
export const formsAtom = atomFamily((id: string) => atom<Record<string, any>>({}))

