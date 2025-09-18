let ctor: any | null = null
let tried = false

export async function preloadHypersauce() {
  if (tried) return ctor
  tried = true
  try {
    const mod: any = await import('hypersauce')
    const HS = mod?.HypersauceClient ?? mod?.default?.HypersauceClient
    if (!HS) {
      console.warn('[Hypersauce] module loaded but HypersauceClient export missing')
      ctor = null
    } else {
      ctor = HS
    }
  } catch (e) {
    console.warn('[Hypersauce] module not available', e)
    ctor = null
  }
  return ctor
}

export function getHypersauceCtorSync(): any | null { return ctor }
export async function getHypersauceCtor(): Promise<any | null> { return ctor ?? preloadHypersauce() }

