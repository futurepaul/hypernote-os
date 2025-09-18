import { nip19 } from 'nostr-tools'
import { decompile } from '../decompiler'
import { getDefaultStore } from 'jotai'
import { hypersauceClientAtom } from '../state/hypersauce'

export function slugify(name: string): string {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\-\s_]+/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
}

export async function publishApp({ meta, ast }: { meta: any; ast: any }, relays: string[]) {
  const client = getDefaultStore().get(hypersauceClientAtom) as any
  if (!client) throw new Error('Hypersauce client not initialized')
  const name = String(meta?.name || 'app')
  const d = slugify(name)
  const content = JSON.stringify({ version: '1.2.0', meta, ast })
  const tags: string[][] = [
    ['d', d],
    ['hypernote', '1.2.0'],
    ['hypernote-type', String(meta?.type || 'application')],
  ]
  if (meta?.name) tags.push(['title', String(meta.name)])
  if (meta?.description) tags.push(['description', String(meta.description)])
  const res = await client.publishEvent({ kind: 32616, content, tags })
  // Encode naddr (assuming single relay set is fine for now without relays list)
  const naddr = nip19.naddrEncode({ kind: 32616, pubkey: res.event.pubkey, identifier: d })
  return { naddr, id: res.id }
}

export async function installByNaddr(naddr: string, relays: string[]): Promise<{ id: string; markdown: string; meta: any; ast: any }>
{
  // Decode address
  const decoded = nip19.decode(naddr)
  if (decoded.type !== 'naddr') throw new Error('Not an naddr')
  const data: any = decoded.data
  const kind = data.kind
  const pubkey = data.pubkey
  const identifier = data.identifier
  // Build a tiny live query doc to fetch the app event content
  const metaDoc: any = {
    '$app': {
      kinds: [kind],
      authors: [pubkey],
      '#d': [identifier],
      limit: 1,
      pipe: [ 'first', { json: { from: 'content' } } ]
    }
  }
  const client = getDefaultStore().get(hypersauceClientAtom) as any
  if (!client) throw new Error('Hypersauce client not initialized')
  const sub = client.runQueryDocumentLive(metaDoc as any, { user: {} })
  return await new Promise((resolve, reject) => {
    let subscription: { unsubscribe(): void } | null = null
    const cleanup = () => {
      if (subscription) {
        try { subscription.unsubscribe() } catch {}
        subscription = null
      }
    }
    subscription = sub.subscribe({
      next: (map: Map<string, any>) => {
        try {
          const obj = map.get('$app') || {}
          const meta = obj.meta || {}
          const ast = obj.ast || []
          const md = decompile({ meta, ast } as any)
          const id = String(meta?.name ? slugify(meta.name) : identifier)
          cleanup()
          resolve({ id, markdown: md, meta, ast })
        } catch (e) { cleanup(); reject(e) }
      },
      error: (e: any) => { cleanup(); reject(e) },
    })
  })
}
