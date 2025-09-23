import { useMemo, useCallback } from 'react'
import { atom, useAtomValue, useSetAtom } from 'jotai'
import { atomFamily } from 'jotai/utils'
import { getDefaultStore } from 'jotai'
import { relaysAtom, userAtom, docsAtom, openWindowAtom, bringWindowToFrontAtom, editorSelectionAtom } from './appAtoms'
import { formsAtom } from './formsAtoms'
import { docStateAtom } from './docStateAtoms'
import { hypersauceClientAtom } from './hypersauce'
import { SimplePool, type Event, nip19, getPublicKey } from 'nostr-tools'
import { interpolate as interpolateTemplate } from '../interp/interpolate'
import { isDefaultDocId, loadUserDocs, saveUserDocs } from './docs'
import { parseReference, resolveReference, type ReferenceScope } from '../interp/reference'

type ActionScope = {
  globals: any
  queries: Record<string, any>
}

type ActionContext = {
  windowId?: string
  globals?: any
  queries?: Record<string, any>
}

export type DocActionDefinition = {
  template?: any
  formUpdates?: Record<string, any>
  stateUpdates?: Record<string, any>
}

const emptyDocActionsAtom = atom<Record<string, DocActionDefinition>>({})
export const docActionsAtom = atomFamily((id: string) => atom<Record<string, DocActionDefinition>>({}))

type SystemActionArgs = {
  payload: any
  scope: ActionScope
  windowId?: string
  store: ReturnType<typeof getDefaultStore>
}

type SystemActionHandler = (args: SystemActionArgs) => Promise<any> | void

const systemActionHandlers: Record<string, SystemActionHandler> = {
  set_pubkey: async ({ payload, scope, store }) => {
    const pubkey = resolvePubkeyCandidate(payload, scope)
    if (!pubkey) return
    setUserPubkey(store, pubkey)
  },
  load_profile: async ({ payload, scope, store }) => {
    const relays = store.get(relaysAtom) || []
    let pubkey = resolvePubkeyCandidate(payload, scope)
    if (pubkey) {
      setUserPubkey(store, pubkey)
    } else {
      pubkey = store.get(userAtom)?.pubkey ?? null
    }
    if (!pubkey) {
      console.warn('@load_profile: user.pubkey is not set')
      return
    }
    const pool = new SimplePool()
    try {
      console.log('@load_profile: querying kind 0 for', pubkey)
      const events: Event[] = await pool.querySync(relays, { kinds: [0], authors: [pubkey], limit: 1 })
      if (events.length) {
        try {
          const content = JSON.parse(events[0]!.content)
          const prev = store.get(userAtom) || { pubkey }
          store.set(userAtom, { ...prev, pubkey, profile: content })
          console.log('@load_profile: loaded profile', content?.name || content?.display_name || Object.keys(content || {}).length + ' fields')
        } catch (e) {
          console.warn('@load_profile: invalid profile content', e)
        }
      } else {
        console.warn('@load_profile: no profile found on relays')
      }
    } finally {
      pool.close(relays)
    }
  },
  install_app: async ({ payload, store }) => {
    const relays = store.get(relaysAtom) || []
    const naddr = normalizeNaddrPayload(payload)
    if (!naddr) {
      console.warn('@install_app: missing naddr payload')
      return
    }
    console.log('@install_app: installing', naddr)
    try {
      const { installByNaddr } = await import('../services/apps')
      console.log('@install_app: calling installByNaddr')
      const result = await installByNaddr(naddr, relays)
      console.log('@install_app: installed doc', result.id)
      const prevDocs = store.get(docsAtom)
      store.set(docsAtom, { ...prevDocs, [result.id]: result.markdown })
      if (!isDefaultDocId(result.id)) {
        const userDocs = loadUserDocs()
        saveUserDocs({ ...userDocs, [result.id]: result.markdown })
      }
      store.set(editorSelectionAtom, result.id)
      store.set(openWindowAtom, result.id)
      store.set(bringWindowToFrontAtom, result.id)
    } catch (e) {
      console.warn('@install_app failed', e)
      alert('Install failed: ' + (e as any)?.message)
    }
  },
}

export function normalizeActionName(name?: string) {
  if (!name) return undefined as unknown as string
  let n = String(name).trim()
  if (n.startsWith('@')) n = n.slice(1)
  // camelCase → snake_case
  n = n.replace(/([A-Z])/g, '_$1').toLowerCase()
  // dashes/spaces → underscore; collapse repeats
  n = n.replace(/[\-\s]+/g, '_').replace(/__+/g, '_')
  if (n.startsWith('actions.')) n = n.slice('actions.'.length)
  if (n.startsWith('system.')) n = n.slice('system.'.length)
  // alias map
  const aliases: Record<string, string> = {
    setpubkey: 'set_pubkey',
    set_pubkey: 'set_pubkey',
    loadprofile: 'load_profile',
    load_profile: 'load_profile',
    install: 'install_app',
    installapp: 'install_app',
    install_app: 'install_app',
  }
  return aliases[n] || n
}
export function useSystemAction(name?: string, windowId?: string) {
  const normalized = useMemo(() => (name ? normalizeActionName(name) : undefined), [name])
  const handler = normalized ? systemActionHandlers[normalized] : undefined
  const store = getDefaultStore()

  const run = useCallback(async (payload?: any, ctx?: ActionContext) => {
    if (!handler) {
      console.warn('Unknown system action', name)
      return
    }
    const scope: ActionScope = {
      globals: ctx?.globals ?? {},
      queries: ctx?.queries ?? {},
    }
    const targetWindowId = ctx?.windowId ?? windowId
    return handler({ payload, scope, windowId: targetWindowId, store })
  }, [handler, name, windowId, store])

  return handler ? run : undefined
}

export function useDocAction(name?: string, windowId?: string) {
  const normalized = useMemo(() => (name ? normalizeActionName(name) : undefined), [name])
  const docActionsAtomRef = useMemo(() => (windowId ? docActionsAtom(windowId) : emptyDocActionsAtom), [windowId])
  const docActions = useAtomValue(docActionsAtomRef)
  const client = useAtomValue(hypersauceClientAtom) as any
  const formsAtomRef = useMemo(() => formsAtom(windowId ?? '__doc__'), [windowId])
  const setForms = useSetAtom(formsAtomRef)
  const stateAtomRef = useMemo(() => docStateAtom(windowId ?? '__doc__'), [windowId])
  const setDocState = useSetAtom(stateAtomRef)
  const docAction = normalized ? docActions[normalized] : undefined

  const run = useCallback(async (payload?: any, ctx?: ActionContext) => {
    if (!docAction) {
      console.warn('Unknown doc action', name)
      return
    }
    const baseGlobals = ctx?.globals ?? {}
    const scopeGlobals = { ...baseGlobals, payload }
    const actionScope: ActionScope = {
      globals: scopeGlobals,
      queries: ctx?.queries ?? {},
    }
    const refScope: ReferenceScope = {
      globals: scopeGlobals,
      queries: ctx?.queries ?? {},
    }

    let result: any = undefined
    if (docAction.template) {
      if (!client || typeof client.publishEvent !== 'function') {
        console.warn(`[${normalized}] Hypersauce client not initialized`)
        alert('Cannot publish: Hypersauce client not ready')
        return
      }
      const templateClone = deepClone(docAction.template)
      const interpolatedTemplate = interpolateActionValue(templateClone, actionScope)
      const pipeSpec = Array.isArray((interpolatedTemplate as any)?.pipe) ? (interpolatedTemplate as any).pipe : undefined
      if (pipeSpec) delete (interpolatedTemplate as any).pipe
      const payloadInterpolated = payload != null ? interpolateActionValue(deepClone(payload), actionScope) : undefined
      const finalEvent: Record<string, any> = {
        ...(typeof interpolatedTemplate === 'object' ? interpolatedTemplate : {}),
        ...(payloadInterpolated && typeof payloadInterpolated === 'object' ? payloadInterpolated : {}),
      }
      const pipedEvent = pipeSpec && pipeSpec.length ? applyActionPipe(finalEvent, pipeSpec) : finalEvent
      coerceEventShape(pipedEvent)
      result = await client.publishEvent(pipedEvent)
    }

    const targetWindowId = ctx?.windowId ?? windowId
    if (targetWindowId) {
      if (docAction.formUpdates) {
        const resolvedForms = evaluateActionUpdates(docAction.formUpdates, refScope)
        if (resolvedForms) {
          setForms(prev => ({ ...(prev || {}), ...resolvedForms }))
        }
      }
      if (docAction.stateUpdates) {
        const resolvedState = evaluateActionUpdates(docAction.stateUpdates, refScope)
        if (resolvedState) {
          setDocState(prev => ({ ...(prev || {}), ...resolvedState }))
        }
      }
    }

    return result
  }, [docAction, client, name, normalized, windowId, setForms, setDocState])

  return docAction ? run : undefined
}

export function useAction(name?: string, windowId?: string) {
  const systemRunner = useSystemAction(name, windowId)
  const docRunner = useDocAction(name, windowId)

  return useCallback(async (payload?: any, ctx?: ActionContext) => {
    const mergedCtx: ActionContext | undefined = ctx
      ? { ...ctx, windowId: ctx.windowId ?? windowId }
      : (windowId ? { windowId } : undefined)
    if (systemRunner) return systemRunner(payload, mergedCtx)
    if (docRunner) return docRunner(payload, mergedCtx)
    console.warn('Unknown action', name)
  }, [systemRunner, docRunner, name, windowId])
}

export function buildDocActionMap(actions: any): Record<string, DocActionDefinition> {
  if (!actions || typeof actions !== 'object') return {}
  const out: Record<string, DocActionDefinition> = {}
  for (const [rawName, spec] of Object.entries(actions)) {
    if (!spec || typeof spec !== 'object') continue
    const normalized = normalizeActionName(rawName)
    if (!normalized) continue
    const { template, formUpdates, stateUpdates } = normalizeActionSpec(spec as Record<string, any>)
    out[normalized] = {
      ...(template ? { template } : {}),
      ...(formUpdates ? { formUpdates } : {}),
      ...(stateUpdates ? { stateUpdates } : {}),
    }
  }
  return out
}

function normalizeActionSpec(raw: Record<string, any>): { template?: any; formUpdates?: Record<string, any>; stateUpdates?: Record<string, any> } {
  const clone = deepClone(raw)
  let formUpdates: Record<string, any> | undefined
  let stateUpdates: Record<string, any> | undefined
  if (clone && Object.prototype.hasOwnProperty.call(clone, 'forms')) {
    const forms = clone.forms
    delete clone.forms
    if (forms && typeof forms === 'object') formUpdates = deepClone(forms)
  }
  if (clone && Object.prototype.hasOwnProperty.call(clone, 'state')) {
    const state = clone.state
    delete clone.state
    if (state && typeof state === 'object') stateUpdates = deepClone(state)
  }
  const template = Object.keys(clone || {}).length ? clone : undefined
  return { template, formUpdates, stateUpdates }
}

function deepClone<T>(value: T): T {
  if (Array.isArray(value)) return value.map(item => deepClone(item)) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(value as Record<string, any>)) out[k] = deepClone(v)
    return out as T
  }
  return value
}

function interpolateActionValue(value: any, scope: ActionScope): any {
  if (typeof value === 'string') return interpolateActionString(value, scope)
  if (Array.isArray(value)) return value.map(item => interpolateActionValue(item, scope))
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {}
    for (const [key, val] of Object.entries(value)) out[key] = interpolateActionValue(val, scope)
    return out
  }
  return value
}

function interpolateActionString(value: string, scope: ActionScope): any {
  return interpolateTemplate(value, scope)
}

function coerceEventShape(event: Record<string, any>) {
  if (typeof event.kind === 'string') {
    const k = Number(event.kind)
    if (!Number.isNaN(k)) event.kind = k
  }
  if (event.kind === undefined) {
    console.warn('[actions] event.kind missing; defaulting to kind 1')
    event.kind = 1
  }
  if (Array.isArray(event.tags)) {
    event.tags = event.tags.map(tag => {
      if (Array.isArray(tag)) return tag.map(part => (typeof part === 'string' ? part : part != null ? String(part) : ''))
      return tag
    })
  }
}

function resolvePubkeyCandidate(payload: any, scope: ActionScope): string | null {
  const candidates: Array<unknown> = []
  if (payload != null) {
    if (typeof payload === 'string') candidates.push(payload)
    else if (typeof payload === 'object') {
      const maybePub = (payload as any).pubkey
      if (typeof maybePub === 'string') candidates.push(maybePub)
      const maybeValue = (payload as any).value
      if (typeof maybeValue === 'string') candidates.push(maybeValue)
    }
  }
  const formPubkey = scope?.globals?.form?.pubkey
  if (typeof formPubkey === 'string') candidates.push(formPubkey)
  const scopedUserPub = scope?.globals?.user?.pubkey
  if (typeof scopedUserPub === 'string') candidates.push(scopedUserPub)
  for (const candidate of candidates) {
    const resolved = extractPubkey(candidate)
    if (resolved) return resolved
  }
  return null
}

function extractPubkey(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return trimmed.toLowerCase()
  try {
    const decoded = nip19.decode(trimmed)
    if (decoded.type === 'npub') {
      const data = decoded.data as Uint8Array | string
      const hex = typeof data === 'string' ? data : bytesToHex(data)
      return hex.toLowerCase()
    }
    if (decoded.type === 'nsec') {
      const data = decoded.data as Uint8Array | string
      const secret = typeof data === 'string' ? data : bytesToHex(data)
      const pubkey = getPublicKey(secret)
      return typeof pubkey === 'string' ? pubkey.toLowerCase() : bytesToHex(pubkey as unknown as Uint8Array).toLowerCase()
    }
  } catch {}
  return null
}

function bytesToHex(data: Uint8Array): string {
  return Array.from(data).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function evaluateActionUpdates(record: Record<string, any>, scope: ReferenceScope): Record<string, any> | null {
  const entries = Object.entries(record || {})
  if (!entries.length) return null
  const out: Record<string, any> = {}
  for (const [key, value] of entries) {
    const resolved = resolveActionValue(value, scope)
    if (resolved !== undefined) out[key] = resolved
  }
  return Object.keys(out).length ? out : null
}

function resolveActionValue(value: any, scope: ReferenceScope): any {
  if (typeof value === 'string') {
    const parsed = parseReference(value)
    if (parsed) return resolveReference(value, scope)
    return value
  }
  if (Array.isArray(value)) return value.map(item => resolveActionValue(item, scope))
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {}
    for (const [key, val] of Object.entries(value)) out[key] = resolveActionValue(val, scope)
    return out
  }
  return value
}

function setUserPubkey(store: ReturnType<typeof getDefaultStore>, pubkey: string) {
  const prev = store.get(userAtom) || { pubkey: null }
  if (prev.pubkey === pubkey) return
  store.set(userAtom, { ...prev, pubkey })
}

function normalizeNaddrPayload(payload: any): string | null {
  if (!payload) return null
  const extract = (value: unknown): string | null => {
    if (typeof value !== 'string') return null
    let out = value.trim()
    if (!out) return null
    if (out.startsWith('nostr:')) out = out.slice('nostr:'.length)
    return out
  }
  const normalize = (value: string | null): string | null => {
    if (!value) return null
    const lower = value.toLowerCase()
    if (!/^naddr1[0-9a-z]+$/.test(lower)) {
      console.warn('[install_app] invalid naddr payload', value)
      return null
    }
    return lower
  }
  if (typeof payload === 'string') return normalize(extract(payload))
  if (typeof payload === 'object') {
    const fromNaddr = normalize(extract((payload as any).naddr))
    if (fromNaddr) return fromNaddr
    const fromValue = normalize(extract((payload as any).value))
    if (fromValue) return fromValue
  }
  return null
}

function applyActionPipe(event: any, pipeSpec: any[]) {
  if (!pipeSpec || pipeSpec.length === 0) return event
  try {
    const ops = toPipeOps(pipeSpec)
    const result = actionPipeEngine.execute(event, ops as any)
    if (Array.isArray(result)) return result[result.length - 1] ?? event
    return result
  } catch (err) {
    console.warn('[actions] pipe execution failed', err)
    return event
  }
}
