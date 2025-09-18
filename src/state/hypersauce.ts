import { atom } from 'jotai'
import { getDefaultStore } from 'jotai'

export const hypersauceClientAtom = atom<any | null>(null)

export async function createHypersauceClient(relays: string[]): Promise<any | null> {
  try {
    const mod: any = await import('hypersauce')
    const HS = mod?.HypersauceClient ?? mod?.default?.HypersauceClient
    if (!HS) {
      console.warn('[Hypersauce] export missing')
      return null
    }
    const client = new HS({ relays })
    return client
  } catch (e) {
    console.warn('[Hypersauce] module not available', e)
    return null
  }
}

export function getHypersauceClientSync(): any | null {
  try { return getDefaultStore().get(hypersauceClientAtom) } catch { return null }
}

