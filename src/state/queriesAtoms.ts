import { atom } from 'jotai'
import { atomFamily } from 'jotai/utils'

export type QuerySnapshot = {
  status: 'loading' | 'ready' | 'error';
  data: any;
  error?: string;
};

export const windowScalarsAtom = atomFamily((id: string) => atom<Record<string, QuerySnapshot>>({}))
