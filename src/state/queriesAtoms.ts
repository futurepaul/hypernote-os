import { atom } from 'jotai'
import { atomFamily } from 'jotai/utils'

export type QueryStream = {
  subscribe(
    observer:
      | { next?: (value: any) => void; error?: (err: any) => void; complete?: () => void }
      | ((value: any) => void)
  ): { unsubscribe(): void }
}

export const windowQueryStreamsAtom = atomFamily((id: string) => atom<Record<string, QueryStream>>({}))

export const queryEpochAtom = atom(0)
