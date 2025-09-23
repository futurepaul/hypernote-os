# Future Query Simplification Ideas

## Plan 1 — Stream-First Runtime (current work)
- Keep Hypersauce as the source of truth: `composeDocQueries` returns observables that are stored in `windowQueryStreamsAtom` and consumed directly by React.
- Remove custom scalar caches, pending sentinels, and deep merge logic so debugging can rely on raw stream emissions.
- Wrap each stream once (for `toRenderable` helpers) and let components subscribe as needed; runtime only handles wiring and cleanup.
- Tests should lean on the doc graph here too: exercising `composeDocQueries` in unit tests verifies Hypersauce graph output while keeping the runtime totally thin.

## Plan 2 — Flat Runtime with Direct Queries
- Skip the document graph and instantiate each frontmatter query as a direct `client.pipedQuery` call.
- Manage dependent/enrich queries with small helper atoms/effects (e.g., call another `pipedQuery` when a base list changes) so cross-query behaviour is explicit in the app state layer.
- Eliminates doc graph memoization entirely; runtime just owns a map of live subscriptions keyed by query id.
- Good candidate if we ever want per-query lifecycle hooks (manual refetch, filter injection) without touching Hypersauce internals.

## Plan 3 — Slim Hypersauce Graph
- Modify Hypersauce’s `runQueryDocumentLive` to emit per-query notifications instead of a single `combineLatest` map.
- Drop the internal memo/cache/shareReplay layers so dependents subscribe immediately, even when parent queries are still empty.
- Runtime would stay extremely small (just forwards events) while Hypersauce keeps graph semantics, making it easier to add debugging hooks or deterministic tests around “query X emitted with args Y”.
- Also unlocks richer test coverage: we could snapshot the doc graph wiring and assert enrich/dependent ordering without booting the full UI.

## Testing Thoughts
- Regardless of the path, invest in doc-graph centric tests (feed/profile/app store docs) so regressions show up when the graph fails to emit dependents.
- Add fixtures that simulate empty-first emissions to ensure dependents still subscribe, the scenario that triggered the current launch problem.
