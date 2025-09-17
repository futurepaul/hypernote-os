**Objective**
- Integrate Hypersauce to run YAML-defined Nostr queries from app docs, starting with the Profile app. Results stream live and become available for interpolation in the rendered view. Queries must be gated on `globals.user.pubkey`.

**Approach**
- Keep our compiler focused: extract frontmatter + compile Markdown → UI AST. Do not execute queries in the compiler.
- Add a small query runtime wrapper around Hypersauce that:
  - Reads `$queries` from frontmatter (the frontmatter object itself can contain `$key` entries).
  - Starts a live subscription only when `globals.user.pubkey` is present (drop/stop otherwise).
  - Publishes snapshots to a `queries` map in Zustand (scoped by window/app id).
  - Supports clean start/stop on doc change, relay change, or pubkey change.

**Plan (Minimal, Clean Cut)**
1) Add dependency and wire client
   - Add dependency: in `package.json` set `"hypersauce": "link:../hypersauce"` (local dev) and `"nostr-idb"` for optional cache.
   - Create `src/queries/hypersauceClient.ts` with:
     - `class QS` (tiny wrapper) holding a `HypersauceClient` instance and a map of active subs per `docId`.
     - Methods: `setRelays(string[])`, `start(docId: string, docMeta: any, context: any, onMap: (Map) => void)`, `stop(docId)` and `clear()`.
     - Use `openDB` + `getEventsForFilters`/`addEvents` from `nostr-idb` if available; otherwise fall back to no cache.

2) Store shape and lifecycle
   - Extend Zustand (`src/store/windows.ts`) with:
     - `relays: string[]` (default a few sane relays) and `setRelays()`.
     - `queryResults: Record<WindowId, Map<string, any>>`.
     - `startQueriesFor(id: WindowId, meta: any)` and `stopQueriesFor(id: WindowId)` that delegate to `QS` and write into `queryResults[id]` on updates.
   - Gate by `globals.user.pubkey`:
     - If absent → `stopQueriesFor(id)` and clear `queryResults[id]`.
     - If present → start with `context = { user: { pubkey } }`.
   - Hook to lifecycle:
     - When a doc is set/reset for a window → restart queries for that window with its latest frontmatter.
     - When `globals.user.pubkey` changes → restart affected queries.
     - Optionally suspend queries when a window is closed in the future; for now, keep running.

3) Compiler hand‑off
   - `src/compiler.ts` already returns `{ meta, ast }`.
   - Do not alter `ast` for queries; only ensure `meta` can contain arbitrary `$query` keys.
   - Where we call the compiler (AppView), after `compileMarkdownDoc(doc)` dispatch `startQueriesFor(id, compiled.meta)`.

4) Interpolation contract
   - Extend interpolation to allow `{{queries.$id}}` (and nested paths):
     - In `AppView.interpolate`, if key starts with `queries.` read from `queryResults[windowId].get('$id')`.
     - Typical cases:
       - Scalar: `{{queries.$display_name}}`.
       - Arrays: `{{queries.$mentions.length}}`.
       - Tuple arrays: use custom components later; for the MVP, we show counts or simple mapping.
   - Keep `{{user.*}}` and `{{time.now}}` behavior unchanged.

5) Profile demo doc
   - Update `src/apps/profile.md` frontmatter to include a `$profile_display_name` query (from Hypersauce README):
     ```yaml
     ---
     name: Profile
     "$profile":
       args: [pubkey]
       query:
         kinds: [0]
         authors: [$pubkey]
         limit: 1
       pipe:
         - first
         - json: { from: content, as: parsed }
         - coalesce: [parsed.display_name, parsed.name]

     "$profile_display_name":
       from: $profile
     ---
     ```
   - In the body, render the value:
     ```md
     # {{queries.$profile_display_name}}
     ```
   - The global action `@load_profile` remains the user’s UX to set `user.pubkey`; once set, queries stream.

6) Error/empty handling
   - If `user.pubkey` is missing, do not start the Hypersauce subscription; render a gentle notice or just an empty value.
   - If Hypersauce throws, show a small error indicator in the Profile window (non‑blocking).

7) Testing
   - Unit tests (`bun test`):
     - Add `src/queries/hypersauceClient.test.ts` with a mocked client interface to ensure:
       - Gate on missing pubkey → no start call.
       - Start when pubkey arrives → publish into store.
       - Stop on `setRelays()`/pubkey change.
     - Extend `compile.test.ts` to assert the presence of `$` keys in meta from `profile.md`.
   - Integration (optional): add a minimal mock client injected via dependency injection to avoid network in CI.

8) Dev wiring & Bun best practices
   - Keep `.md` app files and compile at runtime (already supported).
   - For Hypersauce linking: use `link:../hypersauce` in `package.json` during development. For production, use the published package or keep the link if monorepo.
   - Use a single HypersauceClient instance (module‑level singleton in `QS`) and update relays via `setRelays()` to avoid reconnect churn.
   - Clean up subscriptions on hot reload and window unmounts to prevent duplicate streams.

9) Minimal UI change for Profile
   - Add a line under the title to show the resolved display name: `Name: {{queries.$profile_display_name}}`.
   - Keep existing input/button (YAML driven) for setting pubkey and loading Kind 0 (so user can verify both paths).

10) Acceptance criteria
   - With no `user.pubkey`: Profile renders with empty query values; no network activity is initiated.
   - After entering npub/nsec and clicking Load Profile: Kind 0 loads; Hypersauce queries start; `{{queries.$profile_display_name}}` shows the display name or name.
   - Changing relays live restarts the query stream cleanly.

**Out‑of‑scope (for this PR)**
- User‑defined `"@…"` actions compiled from frontmatter.
- Full query UI components for tuples (`enrich`) or event lists (we’ll add renderer components next).
- Persisting query snapshots to localStorage.

**Nice‑to‑have follow‑ups**
- Add a small debug panel per window to show active `$queries` and their latest snapshot shapes.
- Form binding for inputs (e.g., `name:`) to use in action args and queries.
- Add Tailwind Typography for prettier Markdown rendering.

