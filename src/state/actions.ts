import { useMemo } from 'react'
import { atom, useAtomValue, useSetAtom } from 'jotai'
import { atomFamily } from 'jotai/utils'
import { getDefaultStore } from 'jotai'
import { relaysAtom, userAtom, docsAtom, openWindowAtom, bringWindowToFrontAtom, editorSelectionAtom } from './appAtoms'
import { formsAtom } from './formsAtoms'
import { hypersauceClientAtom } from './hypersauce'
import { SimplePool, type Event } from 'nostr-tools'
import { interpolate as interpolateTemplate } from '../interp/interpolate'
import { resolveDollarPath } from '../interp/resolveDollar'
import { isDefaultDocId, loadUserDocs, saveUserDocs } from './docs'

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
  template: any
  formKeys: string[]
}

const emptyDocActionsAtom = atom<Record<string, DocActionDefinition>>({})
export const docActionsAtom = atomFamily((id: string) => atom<Record<string, DocActionDefinition>>({}))

export function normalizeActionName(name?: string) {
  if (!name) return undefined as unknown as string
  let n = String(name).trim()
  if (n.startsWith('@')) n = n.slice(1)
  // camelCase → snake_case
  n = n.replace(/([A-Z])/g, '_$1').toLowerCase()
  // dashes/spaces → underscore; collapse repeats
  n = n.replace(/[\-\s]+/g, '_').replace(/__+/g, '_')
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

export function useAction(name?: string, windowId?: string) {
  const setUser = useSetAtom(userAtom)
  const relays = useAtomValue(relaysAtom)
  const user = useAtomValue(userAtom)
  const setDocs = useSetAtom(docsAtom)
  const openWindow = useSetAtom(openWindowAtom)
  const bringToFront = useSetAtom(bringWindowToFrontAtom)
  const setEditorSelection = useSetAtom(editorSelectionAtom)
  const client = useAtomValue(hypersauceClientAtom) as any
  const docActionsAtomRef = useMemo(() => (windowId ? docActionsAtom(windowId) : emptyDocActionsAtom), [windowId])
  const docActions = useAtomValue(docActionsAtomRef)

  async function run(payload?: any, ctx?: ActionContext) {
    if (!name) return
    const n = normalizeActionName(name)
    if (n === 'set_pubkey') {
      const hex = String(payload ?? '')
      setUser(u => ({ ...u, pubkey: hex }))
      return
    }
    if (n === 'load_profile') {
      const pk = user.pubkey
      if (!pk) {
        console.warn('@load_profile: user.pubkey is not set')
        return
      }
      const pool = new SimplePool()
      try {
        console.log('@load_profile: querying kind 0 for', pk)
        const events: Event[] = await pool.querySync(relays || [], { kinds: [0], authors: [pk], limit: 1 })
        if (events.length) {
          try {
            const content = JSON.parse(events[0]!.content)
            setUser(u => ({ ...u, profile: content }))
            console.log('@load_profile: loaded profile', content?.name || content?.display_name || Object.keys(content || {}).length + ' fields')
          } catch (e) {
            console.warn('@load_profile: invalid profile content', e)
          }
        } else {
          console.warn('@load_profile: no profile found on relays')
        }
      } finally {
        pool.close(relays || [])
      }
      return
    }
    if (n === 'install_app') {
      const naddr = normalizeNaddrPayload(payload)
      if (!naddr) {
        console.warn('@install_app: missing naddr payload')
        return
      }
      console.log('@install_app: installing', naddr)
      try {
        const { installByNaddr } = await import('../services/apps')
        console.log('@install_app: calling installByNaddr')
        const result = await installByNaddr(naddr, relays || [])
        console.log('@install_app: installed doc', result.id)
        setDocs(prev => ({ ...prev, [result.id]: result.markdown }))
        if (!isDefaultDocId(result.id)) {
          const userDocs = loadUserDocs()
          saveUserDocs({ ...userDocs, [result.id]: result.markdown })
        }
        setEditorSelection(result.id)
        openWindow(result.id)
        bringToFront(result.id)
      } catch (e) {
        console.warn('@install_app failed', e)
        alert('Install failed: ' + (e as any)?.message)
      }
      return
    }

    const docAction = docActions[n]
    if (docAction) {
      if (!client || typeof client.publishEvent !== 'function') {
        console.warn(`[${n}] Hypersauce client not initialized`)
        alert('Cannot publish: Hypersauce client not ready')
        return
      }
      const scope: ActionScope = {
        globals: ctx?.globals ?? {},
        queries: ctx?.queries ?? {},
      }
      const templateClone = deepClone(docAction.template)
      const interpolatedTemplate = interpolateActionValue(templateClone, scope)
      const payloadInterpolated = payload != null ? interpolateActionValue(deepClone(payload), scope) : undefined
      const finalEvent: Record<string, any> = {
        ...interpolatedTemplate,
        ...(payloadInterpolated || {}),
      }
      coerceEventShape(finalEvent)

      try {
        const result = await client.publishEvent(finalEvent)
        if (ctx?.windowId) {
          const keys = new Set(docAction.formKeys)
          if (payloadInterpolated !== undefined) collectFormKeysInto(payloadInterpolated, keys)
          clearFormFields(ctx.windowId, keys)
          // TODO: surface publish result (event id) to UI so apps can react to their own posts
        }
        return result
      } catch (e) {
        console.warn(`[${n}] publish failed`, e)
        throw e
      }
    }

    console.warn('Unknown action', name)
  }

  return run
}

export function buildDocActionMap(actions: any): Record<string, DocActionDefinition> {
  if (!actions || typeof actions !== 'object') return {}
  const out: Record<string, DocActionDefinition> = {}
  for (const [rawName, spec] of Object.entries(actions)) {
    if (!spec || typeof spec !== 'object') continue
    const normalized = normalizeActionName(rawName)
    if (!normalized) continue
    const { template, extraFormKeys } = normalizeActionSpec(spec as Record<string, any>)
    const keySet = new Set<string>()
    collectFormKeysInto(template, keySet)
    for (const extra of extraFormKeys) keySet.add(extra)
    out[normalized] = { template, formKeys: Array.from(keySet) }
  }
  return out
}

function normalizeActionSpec(raw: Record<string, any>): { template: any; extraFormKeys: string[] } {
  const clone = deepClone(raw)
  const after = clone?.after
  if (clone && Object.prototype.hasOwnProperty.call(clone, 'after')) delete clone.after
  const extraFormKeys: string[] = []
  if (after && typeof after === 'object') {
    const clearList = Array.isArray((after as any).clear) ? (after as any).clear : []
    for (const item of clearList) {
      if (typeof item === 'string') {
        const key = sanitizeFormKey(item)
        if (key) extraFormKeys.push(key)
      }
    }
  }
  return { template: clone, extraFormKeys }
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

function collectFormKeysInto(value: any, target: Set<string>) {
  if (value == null) return
  if (typeof value === 'string') {
    addFormKeysFromString(value, target)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectFormKeysInto(item, target)
    return
  }
  if (typeof value === 'object') {
    for (const entry of Object.values(value)) collectFormKeysInto(entry, target)
  }
}

function addFormKeysFromString(text: string, target: Set<string>) {
  if (!text) return
  const moustache = /{{\s*([^}]+)\s*}}/g
  let match: RegExpExecArray | null
  while ((match = moustache.exec(text)) !== null) {
    const expr = match[1] ?? ''
    addFormKeysFromExpression(expr, target)
  }
  addFormKeysFromExpression(text, target)
}

function addFormKeysFromExpression(expr: string, target: Set<string>) {
  if (!expr) return
  const regex = /\$form\.([A-Za-z0-9_-]+)/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(expr)) !== null) {
    const key = sanitizeFormKey(match[1] ?? '')
    if (key) target.add(key)
  }
}

function sanitizeFormKey(raw: string): string | null {
  if (!raw) return null
  let key = raw.trim()
  if (!key) return null
  if (key.startsWith('$form.')) key = key.slice('$form.'.length)
  else if (key.startsWith('form.')) key = key.slice('form.'.length)
  if (key.startsWith('$')) key = key.slice(1)
  key = key.replace(/[^A-Za-z0-9_-]/g, (char) => (char === '.' ? '' : ''))
  return key.length ? key : null
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
  const templated = interpolateTemplate(value, scope)
  if (typeof templated === 'string') {
    const resolved = resolveDollarPath(templated, scope.queries)
    if (resolved !== undefined && resolved !== null) return resolved
    return templated
  }
  return templated
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

function clearFormFields(windowId: string, keys: Set<string>) {
  if (!keys.size) return
  const store = getDefaultStore()
  const atomRef = formsAtom(windowId)
  try {
    const current = store.get(atomRef) || {}
    let changed = false
    const next: Record<string, any> = { ...(current || {}) }
    for (const rawKey of keys) {
      const key = sanitizeFormKey(rawKey)
      if (!key) continue
      if (next[key] !== '') {
        next[key] = ''
        changed = true
      }
    }
    if (changed) store.set(atomRef, next)
  } catch (e) {
    console.warn('clearFormFields failed', e)
  }
}

function normalizeNaddrPayload(payload: any): string | null {
  if (!payload) return null
  if (typeof payload === 'string') return payload.trim()
  if (typeof payload === 'object') {
    if (typeof payload.naddr === 'string') return payload.naddr.trim()
    if (typeof payload.value === 'string') return payload.value.trim()
  }
  return null
}
