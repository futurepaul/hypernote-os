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
  const name = String(meta?.hypernote?.name || 'app')
  const d = slugify(name)
  const version = '1.2.0'
  const content = JSON.stringify({ version, meta, ast })
  const appType = String(meta?.hypernote?.type || 'application')
  const tags: string[][] = [
    ['d', d],
    ['hypernote', version],
    ['t', 'hypernote'],
    ['t', `hypernote-${appType}`],
    ['t', `hypernote-v${version}`],
  ]
  if (meta?.hypernote?.name) tags.push(['title', String(meta.hypernote.name)])
  if (meta?.hypernote?.description) tags.push(['description', String(meta.hypernote.description)])
  const res = await client.publishEvent({ kind: 32616, content, tags })
  // Encode naddr (assuming single relay set is fine for now without relays list)
  const naddr = nip19.naddrEncode({ kind: 32616, pubkey: res.event.pubkey, identifier: d })
  return { naddr, id: res.id }
}

export async function installByNaddr(naddr: string, relays: string[]): Promise<{ id: string; markdown: string; meta: any; ast: any }>
{
  // Decode address
  console.log('[installByNaddr] request', naddr)
  const decoded = nip19.decode(naddr)
  if (decoded.type !== 'naddr') throw new Error('Not an naddr')
  const data: any = decoded.data
  const kind = data.kind
  const pubkey = data.pubkey
  const identifier = data.identifier
  console.log('[installByNaddr] decoded', { kind, pubkey, identifier })
  // Build a tiny live query doc to fetch the app event content
  const metaDoc: any = {
    hypernote: { name: 'installer' },
    queries: {
      app: {
        kinds: [kind],
        authors: [pubkey],
        '#d': [identifier],
        limit: 1,
        pipe: [
          'first',
          { json: { from: 'content', as: 'parsed' } },
        ],
      },
    },
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
      const raw = map.get('app')
      console.log('[installByNaddr] snapshot', raw)
      if (!raw) return
      const obj = typeof raw === 'string' ? safeJson(raw) : raw
      if (!obj || typeof obj !== 'object') return
      let meta = obj.meta
      let ast = obj.ast
      if ((!meta || !ast) && typeof obj.content === 'string') {
        const parsed = safeJson(obj.content)
        if (parsed && typeof parsed === 'object') {
          meta = parsed.meta
          ast = parsed.ast
        }
      }
      if (!meta || !ast) {
        console.warn('[installByNaddr] missing meta/ast in snapshot')
        return
      }
      try {
        const md = decompile({ meta, ast } as any)
        const id = String(meta?.hypernote?.name ? slugify(meta.hypernote.name) : identifier)
        cleanup()
        resolve({ id, markdown: md, meta, ast })
      } catch (err) {
        cleanup()
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    } catch (e) { cleanup(); reject(e) }
      },
      error: (e: any) => { cleanup(); reject(e) },
    })
  })
}

function safeJson(input: string): any {
  try { return JSON.parse(input) } catch { return null }
}
