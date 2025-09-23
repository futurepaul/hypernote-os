import { expect, test } from 'bun:test'
import { getDefaultStore } from 'jotai'
import { queryRuntime } from './runtime'
import { hypersauceClientAtom } from '../state/hypersauce'
import { windowQueryStreamsAtom, windowScalarsAtom } from '../state/queriesAtoms'

test('queryRuntime wires composeDocQueries streams', async () => {
  const store = getDefaultStore()
  const windowId = 'window-test'
  const relays = ['wss://example']
  const meta = {
    hypernote: { name: 'Test' },
    queries: {
      feed: { kinds: [1], limit: 1 },
    },
  }

  const payload = [new Map([['foo', 'bar']])]
  const fakeStream = {
    subscribe(observer: any) {
      observer?.next?.(payload)
      return { unsubscribe() {} }
    },
  }

  let capturedDoc: any
  let initialScalars: any = null
  const client = {
    composeDocQueries(doc: any) {
      capturedDoc = doc
      return new Map([["$feed", fakeStream]])
    },
    setRelays() {},
  }

  store.set(hypersauceClientAtom, client)

  await queryRuntime.start({
    windowId,
    meta,
    relays,
    context: { user: { pubkey: 'abc' } },
    onScalars: (value) => { initialScalars = value },
  })

  expect(capturedDoc?.queries?.feed).toEqual(meta.queries.feed)
  expect(initialScalars).toEqual({ feed: [] })

  const streams = store.get(windowQueryStreamsAtom(windowId))
  expect(Object.keys(streams)).toEqual(['feed'])

  const results: any[] = []
  const sub = streams.feed.subscribe((value: any) => results.push(value))
  sub.unsubscribe()
  expect(results.length).toBeGreaterThan(0)
  expect(results[0][0]).toEqual({ foo: 'bar' })

  expect(store.get(windowScalarsAtom(windowId))).toEqual({})

  queryRuntime.stop(windowId)
  store.set(hypersauceClientAtom, null)
})
