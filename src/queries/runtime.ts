// Lightweight runtime wrapper around Hypersauce that manages per-window
// query subscriptions and exposes streams directly back to the store.

import { getDefaultStore } from 'jotai'
import { BehaviorSubject } from 'rxjs'
import { nip19 } from 'nostr-tools'
import { hypersauceClientAtom } from '../state/hypersauce'
import { windowQueryStreamsAtom } from '../state/queriesAtoms'
import { debugAtom } from '../state/appAtoms'
import type { HypernoteMeta } from '../compiler'
import { parseReference, resolveReference } from '../interp/reference'

type StartArgs = {
  windowId: string
  meta: HypernoteMeta | Record<string, any>
  relays: string[]
  context: any // { user: { pubkey } }
}

type WindowSession = {
  docSubject: BehaviorSubject<any>
  contextSubject: BehaviorSubject<any>
  metaKey: string
  docFingerprint: string
  contextFingerprint: string
}

class QueryRuntime {
  private client: any | null = null
  private relays: string[] = []
  private warnedMissing = false
  private sessions = new Map<string, WindowSession>()

  async ensureClient(relays: string[]): Promise<boolean> {
    const store = getDefaultStore()
    const hs = store.get(hypersauceClientAtom) as any | null
    if (!hs) {
      if (!this.warnedMissing) {
        console.warn('[Hypersauce] client not initialized')
        this.warnedMissing = true
      }
      return false
    }
    this.client = hs
    if (JSON.stringify(relays) !== JSON.stringify(this.relays)) {
      try { this.client.setRelays(relays) } catch {}
      this.relays = relays.slice()
    }
    return true
  }

  async setRelays(relays: string[]) {
    if (!this.client) return
    if (JSON.stringify(relays) !== JSON.stringify(this.relays)) {
      this.client.setRelays(relays)
      this.relays = relays.slice()
    }
  }

  private destroySession(windowId: string) {
    const session = this.sessions.get(windowId)
    if (!session) return
    try { session.docSubject.complete() } catch {}
    try { session.contextSubject.complete() } catch {}
    this.sessions.delete(windowId)
  }

  stop(windowId: string) {
    const store = getDefaultStore()
    try { store.set(windowQueryStreamsAtom(windowId), {}) } catch {}
    this.destroySession(windowId)
  }

  async start({ windowId, meta, relays, context }: StartArgs) {
    try {
      const queriesMeta = (meta && typeof meta.queries === 'object') ? (meta.queries as Record<string, any>) : {}
      const queryEntries = Object.entries(queriesMeta)
      if (!queryEntries.length) return
      const ok = await this.ensureClient(relays)
      if (!ok) return
      if (!context?.user?.pubkey) return

      const store = getDefaultStore()
      const debugEnabled = !!store.get(debugAtom)
      const debugPrefix = debugEnabled ? `[Runtime:${windowId}]` : ''
      const docTemplate = buildDocTemplate(windowId, meta, queryEntries)
      const resolvedDoc = resolveQueryDoc(docTemplate, context)
      const metaKey = JSON.stringify(docTemplate)
      const docFingerprint = JSON.stringify(resolvedDoc)
      const contextFingerprint = JSON.stringify(context || {})

      let session = this.sessions.get(windowId)
      if (session && session.metaKey !== metaKey) {
        this.destroySession(windowId)
        session = undefined
      }

      if (session) {
        const docChanged = session.docFingerprint !== docFingerprint
        const contextChanged = session.contextFingerprint !== contextFingerprint
        if (docChanged || contextChanged) {
          session.docFingerprint = docFingerprint
          session.docSubject.next(resolvedDoc)
          if (debugEnabled) console.debug(`${debugPrefix} doc update`, { queryKeys: Object.keys(resolvedDoc).filter(k => k.startsWith('$')).map(k => k.slice(1)) })
        }
        if (contextChanged) {
          session.contextFingerprint = contextFingerprint
          session.contextSubject.next(context)
          if (debugEnabled) console.debug(`${debugPrefix} context update`, { keys: Object.keys(context || {}) })
        }
        return
      }

      if (debugEnabled) {
        console.debug(`${debugPrefix} start`, { relays, contextKeys: Object.keys(context || {}), queryKeys: queryEntries.map(([name]) => name) })
      }

      const docSubject = new BehaviorSubject(resolvedDoc)
      const contextSubject = new BehaviorSubject(context)

      const streamMap: Map<string, any> = this.client.composeDocQueries(
        docSubject,
        contextSubject,
        debugEnabled
          ? {
              onDebug(debugMap) {
                const entries = Array.from(debugMap.entries()).map(([key, info]) => ({ key, ...info }))
                console.debug(`${debugPrefix} composeDocQueries`, entries)
              },
            }
          : undefined
      )

      const entries = Array.from(streamMap.entries()).map(([key, stream]) => {
        const normalized = key.startsWith('$') ? key.slice(1) : key
        return [normalized, wrapStream(stream, normalized, debugPrefix)] as const
      })

      const normalizedStreams = Object.fromEntries(entries)
      store.set(windowQueryStreamsAtom(windowId), normalizedStreams)
      if (debugEnabled) console.debug(`${debugPrefix} registered streams`, Object.keys(normalizedStreams))

      this.sessions.set(windowId, {
        docSubject,
        contextSubject,
        metaKey,
        docFingerprint,
        contextFingerprint,
      })
    } catch (e) {
      console.warn('[Hypersauce] start error', e)
    }
  }
}

export const queryRuntime = new QueryRuntime()

function buildDocTemplate(windowId: string, meta: HypernoteMeta | Record<string, any>, queryEntries: Array<[string, any]>) {
  const doc: any = { type: 'hypernote', name: String(windowId) }
  if (meta?.hypernote && typeof meta.hypernote === 'object') doc.hypernote = meta.hypernote
  for (const [name, def] of queryEntries) {
    doc[`$${name}`] = normalizeQueryDefinition(def)
  }
  return doc
}

function resolveQueryDoc(doc: any, context: any): any {
  return deepResolve(doc, context)
}

function deepResolve(value: any, context: any): any {
  if (Array.isArray(value)) return value.map(item => deepResolve(item, context))
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(value)) out[k] = deepResolve(v, context)
    return out
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (/^\$[A-Za-z0-9_.-]+$/.test(trimmed)) {
      const resolved = getContextPath(trimmed.slice(1), context)
      if (resolved !== undefined) return resolved
    }
    const ref = parseReference(trimmed)
    if (ref) {
      if (ref.root === 'queries') return trimmed
      const resolved = resolveReference(trimmed, { globals: context })
      if (resolved !== undefined) return resolved
    }
  }
  return value
}

function getContextPath(path: string, context: any): any {
  const parts = path.split('.').filter(Boolean)
  let current: any = context
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined
    current = current[part]
  }
  return current
}

function normalizeQueryDefinition(value: any): any {
  if (Array.isArray(value)) return value.map(item => normalizeQueryDefinition(item))
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(value)) out[k] = normalizeQueryDefinition(v)
    return out
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.startsWith('queries.')) return `$${trimmed.slice('queries.'.length)}`
    return value
  }
  return value
}

function toRenderable(value: any): any {
  if (value instanceof Map) return toRenderable(Object.fromEntries(value.entries()))
  if (Array.isArray(value)) return value.map(item => toRenderable(item))
  if (!value || typeof value !== 'object') return value

  const out: Record<string, any> = {}
  for (const [key, val] of Object.entries(value)) out[key] = toRenderable(val)

  if (typeof out.kind === 'number' && typeof out.pubkey === 'string' && Array.isArray(out.tags)) {
    const identifier = findDTag(out.tags)
    if (identifier && !out.naddr) {
      try {
        out.naddr = nip19.naddrEncode({ kind: out.kind, pubkey: out.pubkey, identifier: String(identifier) })
      } catch {}
    }
    if (!out.parsed && typeof out.content === 'string') {
      try { out.parsed = JSON.parse(out.content) } catch {}
    }
    if (!out.npub) {
      try { out.npub = nip19.npubEncode(out.pubkey) } catch {}
    }
    if (!out.nevent && typeof out.id === 'string') {
      try {
        out.nevent = nip19.neventEncode({
          id: out.id,
          relays: Array.isArray(out.relays) ? out.relays : undefined,
          author: typeof out.pubkey === 'string' ? out.pubkey : undefined,
          kind: typeof out.kind === 'number' ? out.kind : undefined,
        })
      } catch {}
    }
  }

  return out
}

function findDTag(tags: any[]): string | null {
  for (const tag of tags) {
    if (Array.isArray(tag) && tag[0] === 'd' && typeof tag[1] === 'string') return tag[1]
  }
  return null
}

function wrapStream(stream: any, name: string, debugPrefix: string) {
  return {
    subscribe(observer: any) {
      const handlers = typeof observer === 'function' ? { next: observer } : observer || {}
      if (debugPrefix) console.debug(`${debugPrefix} subscribe ${name}`)
      const sub = stream?.subscribe?.({
        next: (value: any) => {
          const rendered = toRenderable(value)
          if (debugPrefix) {
            const preview = Array.isArray(rendered) ? { length: rendered.length } : rendered
            console.debug(`${debugPrefix} next ${name}`, preview)
          }
          try { handlers.next?.(rendered) } catch (err) { handlers.error?.(err) }
        },
        error: (err: any) => {
          if (debugPrefix) console.warn(`${debugPrefix} error ${name}`, err)
          handlers.error?.(err)
        },
        complete: () => {
          if (debugPrefix) console.debug(`${debugPrefix} complete ${name}`)
          handlers.complete?.()
        },
      })
      return {
        unsubscribe() {
          if (debugPrefix) console.debug(`${debugPrefix} unsubscribe ${name}`)
          try { sub?.unsubscribe?.() } catch {}
        },
      }
    },
  }
}
