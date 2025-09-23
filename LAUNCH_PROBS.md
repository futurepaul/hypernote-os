# Launch-time Query Issues

## Symptom Recap
- On cold boot, the profile app now loads immediately (thanks to the pubkey fix).
- Feed and App Store still require closing/reopening to load dependent queries (profile enrichment in feed and per-app meta in App Store) because the dependent Hypersauce streams never emit.
- After reopening a window, the dependent queries fire as expected.

## Observed Behaviour
1. **Boot logs** show the top-level query (feed or app list) building and Hypersauce wiring the address loader.
2. No subsequent events appear for the dependent profile lookup until the window is reopened.
3. On window reopen, Hypersauce rebuilds the doc graph and dependent requests execute successfully.

## Working Theory
The Hypersauce client is only subscribing to dependent queries after the base query emits once. At cold boot the base query is missing the required data when Hypersauce first registers the dependency (because the doc graph resolves immediately with empty results), so the dependent request never starts. A reopen rebuilds the doc graph with non-empty base data, triggering the dependent query.

## Attempts So Far
- Added `queryEpochAtom` bumps when Hypersauce connects or pubkey changes → ensured base queries start, but dependents still missing.
- Delayed queryRuntime start until forms/state defaults resolve → no improvement for dependent queries.
- Tried rewriting the runtime to store streams in Jotai before reverting; dependent issue persisted.
- Confirmed compile/decompile pipelines handle the `note` node (feed publishes cleanly) – not related but validated.

## Next Steps Considered
- Investigate `composeDocQueries` and `runQueryDocumentLive` in Hypersauce to ensure dependent graph nodes start even when base queries emit empty arrays.
- Possibly seed dummy emissions in base nodes to poke dependents, or modify Hypersauce to re-run dependent loaders when new documents arrive.
- Add instrumentation to Hypersauce client to confirm dependency resolution order and whether `collectDocQueries` marks dependents correctly at boot time.
