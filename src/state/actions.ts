import { useMemo, useCallback } from 'react'
import { atom, useAtomValue, useSetAtom } from 'jotai'
import { atomFamily } from 'jotai/utils'
import { getDefaultStore } from 'jotai'
import { relaysAtom, userAtom, docsAtom, openWindowAtom, bringWindowToFrontAtom, editorSelectionAtom } from './appAtoms'
import { formsAtom } from './formsAtoms'
import { docStateAtom } from './docStateAtoms'
import { hypersauceClientAtom } from './hypersauce'
import { installedAppsAtom, appHandlesAtom, windowIntentAtom, type SystemAppHandle } from './systemAtoms'
import { queryEpochAtom } from './queriesAtoms'
import { SimplePool, type Event, nip19, getPublicKey } from 'nostr-tools'
import { PipeEngine, toPipeOps } from 'hypersauce'
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

const actionPipeEngine = new PipeEngine()

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
  copy_to_clipboard: async ({ payload, scope }) => {
    const text = coerceClipboardText(payload ?? scope?.globals?.payload);
    if (!text) {
      console.warn('@copy_to_clipboard: missing text payload');
      return;
    }

    const trimmed = text.trim();
    if (!trimmed) {
      console.warn('@copy_to_clipboard: empty text payload');
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(trimmed);
        return;
      } catch (err) {
        console.warn('@copy_to_clipboard: navigator.clipboard failed', err);
      }
    }

    if (typeof document !== 'undefined') {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = trimmed;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        return;
      } catch (err) {
        console.warn('@copy_to_clipboard: fallback copy failed', err);
      }
    }

    console.warn('@copy_to_clipboard: no clipboard API available');
  },
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
    let naddr: string | null = null
    if (typeof payload === 'string') {
      const trimmed = payload.trim()
      naddr = trimmed ? trimmed : null
    } else if (payload && typeof payload === 'object') {
      const candidate = (payload as any).naddr ?? (payload as any).value
      if (typeof candidate === 'string' && candidate.trim()) naddr = candidate.trim()
    }
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
  switch_app: async ({ payload, scope, store }) => {
    const docs = store.get(docsAtom)
    const resolution = resolveSwitchTarget(payload, store, docs)
    const targetId = resolution?.id
    const handle = resolution?.handle ?? null
    if (!targetId) {
      console.warn('@switch_app: unable to resolve target for payload', payload)
      return
    }
    store.set(openWindowAtom, targetId)
    store.set(bringWindowToFrontAtom, targetId)
    try {
      store.set(windowIntentAtom(targetId), payload ?? null)
    } catch (err) {
      console.warn('@switch_app: failed to persist intent', err)
    }

    const refScope: ReferenceScope = {
      globals: scope?.globals ?? {},
      queries: scope?.queries ?? {},
    }

    if (handle?.forms) {
      const resolvedForms = evaluateActionUpdates(handle.forms, refScope)
      if (resolvedForms) {
        try {
          store.set(formsAtom(targetId), (prev: Record<string, any> | undefined) => ({ ...(prev || {}), ...resolvedForms }))
        } catch (err) {
          console.warn('@switch_app: failed to update forms', err)
        }
      }
    }

    if (handle?.state) {
      const resolvedState = evaluateActionUpdates(handle.state, refScope)
      if (resolvedState) {
        try {
          store.set(docStateAtom(targetId), (prev: Record<string, any> | undefined) => ({ ...(prev || {}), ...resolvedState }))
        } catch (err) {
          console.warn('@switch_app: failed to update state', err)
        }
      }
    }

    if (payload && typeof payload === 'object') {
      const directForms = (payload as any).forms
      const directState = (payload as any).state
      if (directForms && typeof directForms === 'object') {
        const resolvedForms = evaluateActionUpdates(directForms, refScope)
        if (resolvedForms) {
          try {
            store.set(formsAtom(targetId), (prev: Record<string, any> | undefined) => ({ ...(prev || {}), ...resolvedForms }))
          } catch (err) {
            console.warn('@switch_app: failed to apply payload forms', err)
          }
        }
      }
      if (directState && typeof directState === 'object') {
        const resolvedState = evaluateActionUpdates(directState, refScope)
        if (resolvedState) {
          try {
            store.set(docStateAtom(targetId), (prev: Record<string, any> | undefined) => ({ ...(prev || {}), ...resolvedState }))
          } catch (err) {
            console.warn('@switch_app: failed to apply payload state', err)
          }
        }
      }
    }
  },
}

type ActionReference = { scope: 'system' | 'actions'; name: string }

// Parse user-facing action strings into explicit namespaces. We accept
// `system.*` or `actions.*` (defaulting to document actions when no prefix is
// provided) so runtime dispatch does not need to guess or normalize names.
function parseActionReference(raw?: string): ActionReference | null {
  if (!raw) return null
  let value = String(raw).trim()
  if (!value) return null
  if (value.startsWith('@')) {
    console.warn('[actions] Legacy "@" prefix is deprecated; use system.* or actions.* syntax instead.')
    value = value.slice(1).trim()
    if (!value) return null
  }
  if (value.startsWith('system.')) {
    const name = value.slice('system.'.length).trim()
    return isValidActionKey(name) ? { scope: 'system', name } : null
  }
  if (value.startsWith('actions.')) {
    const name = value.slice('actions.'.length).trim()
    return isValidActionKey(name) ? { scope: 'actions', name } : null
  }
  if (!value.includes('.')) {
    return isValidActionKey(value) ? { scope: 'actions', name: value } : null
  }
  return null
}

export function useSystemAction(name?: string, windowId?: string) {
  const ref = useMemo(() => parseActionReference(name), [name])
  const handler = ref?.scope === 'system' ? systemActionHandlers[ref.name] : undefined
  const store = getDefaultStore()

  const run = useCallback(async (payload?: any, ctx?: ActionContext) => {
    if (!handler) {
      if (name) console.warn('Unknown system action', name)
      return
    }
    const baseGlobals = ctx?.globals ?? {}
    const scopeGlobals = { ...baseGlobals, payload }
    const scope: ActionScope = {
      globals: scopeGlobals,
      queries: ctx?.queries ?? {},
    }
    const targetWindowId = ctx?.windowId ?? windowId
    return handler({ payload, scope, windowId: targetWindowId, store })
  }, [handler, name, windowId, store])

  return handler ? run : undefined
}

export function useDocAction(name?: string, windowId?: string) {
  const ref = useMemo(() => parseActionReference(name), [name])
  const actionName = ref?.scope === 'actions' ? ref.name : undefined
  const docActionsAtomRef = useMemo(() => (windowId ? docActionsAtom(windowId) : emptyDocActionsAtom), [windowId])
  const docActions = useAtomValue(docActionsAtomRef)
  const client = useAtomValue(hypersauceClientAtom) as any
  const formsAtomRef = useMemo(() => formsAtom(windowId ?? '__doc__'), [windowId])
  const setForms = useSetAtom(formsAtomRef)
  const stateAtomRef = useMemo(() => docStateAtom(windowId ?? '__doc__'), [windowId])
  const setDocState = useSetAtom(stateAtomRef)
  const docAction = actionName ? docActions[actionName] : undefined

  const run = useCallback(async (payload?: any, ctx?: ActionContext) => {
    if (!docAction || !actionName) {
      if (name) console.warn('Unknown doc action', name)
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
        console.warn(`[${actionName}] Hypersauce client not initialized`)
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
  }, [docAction, actionName, client, name, windowId, setForms, setDocState])

  return docAction ? run : undefined
}

export function useAction(name?: string, windowId?: string) {
  const ref = useMemo(() => parseActionReference(name), [name])
  const systemRunner = useSystemAction(ref?.scope === 'system' ? name : undefined, windowId)
  const docRunner = useDocAction(ref?.scope === 'actions' ? name : undefined, windowId)

  return useCallback(async (payload?: any, ctx?: ActionContext) => {
    const mergedCtx: ActionContext | undefined = ctx
      ? { ...ctx, windowId: ctx.windowId ?? windowId }
      : (windowId ? { windowId } : undefined)
    if (ref?.scope === 'system' && systemRunner) return systemRunner(payload, mergedCtx)
    if (ref?.scope === 'actions' && docRunner) return docRunner(payload, mergedCtx)
    console.warn('Unknown action', name)
  }, [ref?.scope, systemRunner, docRunner, name, windowId])
}

export function buildDocActionMap(actions: any): Record<string, DocActionDefinition> {
  if (!actions || typeof actions !== 'object') return {}
  const out: Record<string, DocActionDefinition> = {}
  for (const [rawName, spec] of Object.entries(actions)) {
    if (!isValidActionKey(rawName)) {
      console.warn(`[actions] Invalid doc action key "${rawName}"`)
      continue
    }
    if (!isPlainObject(spec)) {
      console.warn(`[actions] Expected doc action "${rawName}" to be an object`)
      continue
    }
    const templateSource = deepClone(spec as Record<string, any>)
    const formUpdates = extractPlainObject(templateSource, 'forms')
    const stateUpdates = extractPlainObject(templateSource, 'state')
    const template = Object.keys(templateSource).length ? templateSource : undefined
    out[rawName] = {
      ...(template ? { template } : {}),
      ...(formUpdates ? { formUpdates } : {}),
      ...(stateUpdates ? { stateUpdates } : {}),
    }
  }
  return out
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

// Lightweight guard to ensure YAML blocks produced actual maps before cloning.
function isPlainObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function extractPlainObject(source: Record<string, any>, key: string): Record<string, any> | undefined {
  if (!Object.prototype.hasOwnProperty.call(source, key)) return undefined
  const value = source[key]
  delete source[key]
  if (!isPlainObject(value)) {
    if (value !== undefined) console.warn(`[actions] Expected "${key}" to be an object`)
    return undefined
  }
  return deepClone(value)
}

function isValidActionKey(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value)
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

function coerceClipboardText(input: unknown): string | null {
  if (input === undefined || input === null) return null
  if (typeof input === 'string') return input
  if (typeof input === 'number' || typeof input === 'boolean') return String(input)
  if (Array.isArray(input)) {
    const joined = input.map(item => (typeof item === 'string' ? item : '')).filter(Boolean).join('\n')
    return joined ? joined : JSON.stringify(input)
  }
  if (typeof input === 'object') {
    const objectInput = input as Record<string, any>
    const candidate = objectInput.text ?? objectInput.value ?? objectInput.naddr ?? objectInput.id
    if (typeof candidate === 'string') return candidate
    try {
      return JSON.stringify(input)
    } catch {
      return null
    }
  }
  return null
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

type SwitchResolution = { id: string; handle?: SystemAppHandle | null } | null

function resolveSwitchTarget(payload: any, store: ReturnType<typeof getDefaultStore>, docs: Record<string, string>): SwitchResolution {
  if (!docs || typeof docs !== 'object') return null

  const directId = coerceDocIdFromPayload(payload)
  if (directId && Object.prototype.hasOwnProperty.call(docs, directId)) {
    return { id: directId }
  }

  const kind = extractKindFromPayload(payload)
  if (kind !== null) {
    try {
      const orderedApps = store.get(installedAppsAtom)
      const handlesMap = store.get(appHandlesAtom)
      for (const app of orderedApps) {
        const handles = handlesMap[app.id] || app.handles || []
        const match = handles.find(h => h.kind === kind)
        if (match) return { id: app.id, handle: match }
      }
      for (const [id, handles] of Object.entries(handlesMap)) {
        if (!handles || !handles.length) continue
        const match = handles.find(h => h.kind === kind)
        if (match && Object.prototype.hasOwnProperty.call(docs, id)) {
          return { id, handle: match }
        }
      }
    } catch (err) {
      console.warn('@switch_app: failed to inspect handles', err)
    }
  }

  const fallback = selectDefaultAppId(docs)
  return fallback ? { id: fallback } : null
}

function coerceDocIdFromPayload(payload: any): string | null {
  if (typeof payload === 'string') {
    const trimmed = payload.trim()
    if (!trimmed) return null
    if (trimmed.startsWith('app:')) return trimmed.slice(4)
    return trimmed
  }
  if (payload && typeof payload === 'object') {
    const candidates = [
      (payload as any).id,
      (payload as any).docId,
      (payload as any).app,
      (payload as any).appId,
      (payload as any).window,
      (payload as any).value,
    ]
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
    }
  }
  return null
}

function extractKindFromPayload(payload: any): number | null {
  if (typeof payload === 'number' && Number.isFinite(payload)) return payload
  if (!payload || typeof payload !== 'object') return null
  const candidates = [
    (payload as any).kind,
    (payload as any).event?.kind,
    (payload as any).target?.kind,
    (payload as any).data?.kind,
  ]
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate
    if (typeof candidate === 'string') {
      const parsed = Number(candidate)
      if (!Number.isNaN(parsed)) return parsed
    }
  }
  return null
}

function selectDefaultAppId(docs: Record<string, string>): string | null {
  if (Object.prototype.hasOwnProperty.call(docs, 'apps')) return 'apps'
  for (const id of Object.keys(docs)) {
    if (id === 'system') continue
    return id
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
      const secretBytes = typeof data === 'string' ? hexToBytes(data) : data
      const pubkey = getPublicKey(secretBytes)
      return pubkey.toLowerCase()
    }
  } catch {}
  return null
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  if (clean.length % 2 !== 0) throw new Error('Invalid hex string length')
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i += 1) {
    const byte = clean.slice(i * 2, i * 2 + 2)
    out[i] = parseInt(byte, 16)
  }
  return out
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
  try {
    store.set(queryEpochAtom, (value: number) => value + 1)
  } catch {}
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
