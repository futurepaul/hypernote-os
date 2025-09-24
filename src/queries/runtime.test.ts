import { expect, test } from 'bun:test'
import { getDefaultStore } from 'jotai'
import { BehaviorSubject } from 'rxjs'
import { queryRuntime } from './runtime'
import { hypersauceClientAtom } from '../state/hypersauce'
import { windowQueryStreamsAtom } from '../state/queriesAtoms'
import { debugAtom } from '../state/appAtoms'

test('queryRuntime exposes composeDocQueries streams', async () => {
  const store = getDefaultStore()
  const windowId = 'window-test'
  const relays = ['wss://example']
  const meta = {
    hypernote: { name: 'Test' },
    queries: {
      feed: { kinds: [1], limit: 1 },
    },
  }

  const payload = [{ foo: 'bar' }]
  let capturedDoc: any
  let capturedDebug: any = null
  let docSubject: BehaviorSubject<any> | null = null
  let contextSubject: BehaviorSubject<any> | null = null
  let composeCalls = 0
  const client = {
    composeDocQueries(doc: any, _context: any, opts?: any) {
      composeCalls += 1
      docSubject = doc as BehaviorSubject<any>
      contextSubject = _context as BehaviorSubject<any>
      capturedDoc = docSubject.getValue()
      capturedDebug = opts
      return new Map([
        [
          '$feed',
          {
            subscribe(observer: any) {
              observer?.next?.(payload)
              return { unsubscribe() {} }
            },
          },
        ],
      ])
    },
    setRelays() {},
  }

  store.set(hypersauceClientAtom, client)
  store.set(debugAtom, true)

  await queryRuntime.start({
    windowId,
    meta,
    relays,
    context: { user: { pubkey: 'abc' } },
  })

  expect(docSubject).toBeInstanceOf(BehaviorSubject)
  expect(contextSubject).toBeInstanceOf(BehaviorSubject)
  expect(capturedDoc?.$feed).toEqual(meta.queries.feed)
  expect(typeof capturedDebug?.onDebug).toBe('function')
  const streams = store.get(windowQueryStreamsAtom(windowId))
  expect(Object.keys(streams)).toEqual(['feed'])

  const results: any[] = []
  const subscription = streams.feed.subscribe((value: any) => {
    results.push(value)
  })
  subscription.unsubscribe()
  expect(results[0]).toEqual(payload)

  await queryRuntime.start({
    windowId,
    meta,
    relays,
    context: { user: { pubkey: 'abc' }, form: { topic: 'nostr' } },
  })

  expect(composeCalls).toBe(1)
  expect(contextSubject?.getValue()).toEqual({ user: { pubkey: 'abc' }, form: { topic: 'nostr' } })

  queryRuntime.stop(windowId)
  expect(store.get(windowQueryStreamsAtom(windowId))).toEqual({})

  store.set(hypersauceClientAtom, null)
})
