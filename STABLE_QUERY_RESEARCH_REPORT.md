# Stable Query Research Report

## Symptom Recap
- Feed app enriches base timeline events with profile lookups. On initial load everything resolves, but as new notes arrive the profile enrichment drops out: avatars disappear and display names revert to raw npubs.
- Restarting the app/OS restores the enrich data temporarily, implying the query graph is rebuilt correctly on cold boot but loses the secondary stream during incremental updates.

## Observations
- Our runtime currently rewraps Hypersauce streams with an intermediate `windowScalarsAtom` layer. We seed “pending” state and deep-merge payloads, which may discard emissions (e.g., ignore empty arrays or non-array payloads).
- We recreate subscriptions whenever forms/state/globals change (e.g., queryEpoch pubkey bump). Rapid restarts can unsubscribe/re-subscribe, potentially dropping long-lived enrich streams.
- Hypersauce `composeDocQueries` already emits a stable graph: dependent queries (e.g., enrich) subscribe once and emit new pairs when the base observable pushes values. Any caching or memoization we layer on top risks diverging from Hypersauce expectations.
- We still hold onto `windowScalarsAtom` even though apps no longer read from it directly—AppView consumes `windowQueryStreamsAtom` with subscriptions. That atom legacy could be flushing or overriding values inadvertently.

## Possible Causes
1. **Runtime Filtering**: In `wrapStream`, we skip updates when the previous snapshot was a sentinel (pending marker) and the new value is an empty array. If Hypersauce enrich emits combinations like `[event, profile]` where profile is `undefined` for a moment, our logic may treat it as “no change” and never store the profile once it resolves.
2. **Subscription Re-instantiation**: Each time the feed app’s forms/state change (or `queryEpochAtom` bumps), we call `queryRuntime.start`, which unsubscribes and resubscribes to the entire doc. If a new emission comes in while we’re tearing down the old subscription, we may miss the corresponding enrich output.
3. **Pending Timers & Merge Logic** (recently removed but check): earlier versions set timers to clear pending states; if any leftover logic still exists (e.g., merging deep clones or resetting pending flags), it could wipe results when the base query emits again.
4. **Enrich Input Shape**: Hypersauce enrich expects the base stream to emit an array. Our `feed` query emits an array of events; after enrich, the output is `[[event, profile], …]`. If the base stream emits a new array instance but we reuse the previous enrich pipeline, we should still get `[event, profile]`. If we mutate the base array (e.g., by storing references in state), enrich might re-evaluate with stale data.
5. **Loss of Parameter Query Cache**: Hypersauce caches parameterized queries (profile lookups). If we set `relays` or handlers incorrectly on each restart, the cache may clear and cause duplicate or missing emissions.

## Simplification Opportunities
- **Let Hypersauce Own State**: Remove `windowScalarsAtom` entirely. Apps already subscribe to `windowQueryStreamsAtom`, so we can delete scalar merging, pending timers, and sentinel logic. Use direct Hypersauce stream payloads as the source of truth.
- **Single Subscription Lifecycle**: Start each window’s query graph once (on mount) and avoid restarting unless the doc or doc-level context truly changes (e.g., user pubkey transition). Use stable atoms for forms/state to feed `context` without re-subscribing.
- **Direct Graph Composition**: Call `client.composeDocQueries` once per window and store the map. Keep references stable to avoid losing enrich edges when new data arrives. If we must reinstantiate (pubkey change), ensure we queue the new subscription before unsubscribing the old to avoid gaps.
- **Minimal Context Resolution**: Push context resolution into Hypersauce as much as possible (e.g., use `$state.*` placeholders directly instead of pre-resolving and replacing with literal values). This ensures Hypersauce’s graph sees the same pointer each time and can re-trigger enrich queries when base results change.
- **Remove Custom Caching**: If we still maintain any caches (e.g., pending timers, sentinel updates), delete them. Hypersauce already caches parameterized queries and dedups results.

## Proposed Fixes
1. **Runtime Rework**
   - Delete all scalar/pending handling (`windowScalarsAtom`, timers, mergeScalars). Keep only the live stream wrappers and debug hooks.
   - Ensure `wrapStream` never suppresses emissions; remove checks that skip empty arrays.
2. **Stable Subscription**
   - In `AppView`, call `queryRuntime.start` only when the compiled doc or critical context fields actually change (e.g., using `useRef` to track previous context). Consider pushing pubkey updates into Hypersauce via `client.setPubkey` instead of full restart.
   - Introduce a “warm start” mode: when we need to refresh, start new subscription before stopping the old one, then swap atom references.
3. **Profile Enrich Debugging**
   - Add temporary instrumentation (runtime + Hypersauce `onDebug`) to log enrich emissions. Confirm whether the stream actually delivers `[event, profile]` after new notes arrive.
4. **Long-Term Cleanup**
   - Document minimal runtime responsibilities: read doc graph, pass context, expose streams. Anything beyond that (pending UI states, caching) belongs in app-level components or Hypersauce itself.
   - Evaluate whether we can shift to “one doc → one Hypersauce client” mapping, letting Hypersauce manage memoization and event ordering.

## Next Steps
1. Strip `windowScalarsAtom` and pending logic; rerun feed app to verify refresh behaviour.
2. Add guard logs (temporarily) to confirm enrich outputs on new events.
3. If enrich stream is emitting but UI loses data, inspect `EachNode`/`NoteNode` to ensure they don’t mutate the array (e.g., `Each` might wrap data incorrectly).
4. Once stable, update documentation to set expectations: Hypersauce graph is immutable over window lifetime; runtime should not hack around it.

_Removing custom caching and aligning with Hypersauce’s streaming model should eliminate profile drops while simplifying the runtime considerably._
