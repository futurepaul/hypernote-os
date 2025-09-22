# Another Cleanup Plan

This plan refocuses the Hypernote/Hyper­sauce stack on the minimal, testable pipeline described in **THE_REAL_HYPERNOTE_OS_VISION.md**: Markdown+YAML → canonical doc IR → Hypersauce streams → pure renderer. It replaces legacy shims (dual parsing, `$` tokens, bespoke loading sentinels) with a single well-typed document schema and observable data flow. Each workstream lists the intent, concrete tasks, and validation steps.

## Guiding Principles
- Treat the published JSON `{ meta, ast }` as the source of truth at runtime; Markdown is an authoring surface, not an execution format.
- Prefer declarative data flow (observables, atoms) over one-off timers, caches, or DOM-side hacks.
- Separate Hypernote OS concerns (window management, system actions) from app-defined behaviour.
- Eliminate deprecated syntax immediately unless retention materially simplifies migration. When impossible, tag the code path with `// TODO DEPRECATED`.
- Derive runtime subscriptions and dependencies from compilation artifacts, not regex heuristics.

## Workstream 1 — Canonical Doc Schema
**Goal:** Formalize the `{ meta, ast }` document with Zod so compiler, runtime, and publisher share a single type contract.

Tasks
1. Define `DocSchema = z.object({ version, meta, ast })` with nested Zod schemas for nodes (`markdown`, `button`, `each`, etc.) and frontmatter maps (`hypernote`, `queries`, `actions`).
2. Introduce `DocIR` TypeScript types generated from the schema and export them from `src/types`.
3. Update `compileMarkdownDoc` to emit schema-validated `DocIR` (throwing descriptive errors when invalid) and to store dependency metadata per node (see Workstream 5).
4. Add `validateDoc(doc: unknown)` helper so Hypersauce, renderer, and publisher all call the same guard before using a document.

Validation
- Unit tests covering happy path compile + schema validation for `sample_apps/*.md` and default apps.
- Regression tests ensuring invalid docs fail compile with actionable messages.

## Workstream 2 — Unify Compiler & Runtime Pipeline
**Goal:** Emit a single `DocIR` from the compiler and consume it everywhere without re-parsing or placeholder shims.

Tasks
1. Remove the pre-parse + token-parse merge in `compileMarkdownDoc`; build the AST directly once, populating normalized metadata and dependency info.
2. Persist `DocIR` (and metadata) into jotai state so `AppView` can access it without re-compiling on every render (cache by doc id + version hash).
3. Update `AppView` to hand the cached `DocIR` to both the renderer and query runtime; markdown recompilation happens only when the doc text changes.
4. Delete legacy helpers that mask/restore template placeholders unless they remain necessary for markdown round-trips; clearly mark any temporary shims.

Validation
- Performance benchmark: ensure repeated renders no longer trigger redundant compilation work.
- Tests verifying that storing/retrieving `DocIR` leaves the document unchanged (`compile → schema → serialize → deserialize → render`).

## Workstream 3 — Query Runtime & Observables *(in progress)*
**Goal:** Remove `$` token munging and bespoke loading sentinels; surface Hypersauce data as raw observables.

Progress summary
- ✅ `windowScalarsAtom` now stores `{ status, data, error }` snapshots (no more sentinels/timers).
- ✅ Renderer consumes those snapshots and restores the “Loading…” fallback without flicker.
- ❌ `$` translators (`normalizeQueryDefinition`, `resolveDollar*`) still exist.
- ❌ Runtime still pushes snapshot updates manually; observables aren’t exposed to the component layer yet.
- ❌ No new tests around the observable flow.

Remaining tasks
1. Drop `resolveDollar`, `normalizeQueryDefinition`, and related `$` translators so the compiler/runtime stick with `queries.foo` paths end-to-end.
2. Extend Hypersauce (or add a thin helper) to expose query observables (e.g. via `useObservableMemo`) so `AppView` can subscribe declaratively.
3. Refactor `queryRuntime.start` into a thin adapter that returns those observables instead of managing timers/state internally.
4. Update the renderer hook to consume the observable outputs directly (keeping the `{ status, data }` contract for nodes).
5. Add regression tests covering the observable flow and `$`-free references.

## Workstream 4 — Actions Architecture
**Goal:** Clearly separate OS/system actions from app-defined actions while keeping invocation ergonomics consistent.

Tasks
1. Define two registries:
   - `systemActions`: maintained by Hypernote (e.g., `install_app`, `set_pubkey`, window management).
   - `docActions`: generated per document from `DocIR.meta.actions`.
2. Update `useAction` (or replace with `useSystemAction` + `useDocAction`) so system actions never inspect doc templates and doc actions never mutate OS state directly.
(NOTE FROM PAUL: yes, do this, but some useSystemActions might actually use data from a doc query or a form input, just make sure that's still possible)
3. Move pubkey parsing, form clearing, and installer side effects out of `nodes.tsx` into the appropriate system actions.
4. Ensure action payload interpolation uses the canonical reference resolver (no `$` fallbacks) and respects future pipe support.
5. Tag any temporary compatibility shims with `// TODO DEPRECATED` and log when invoked.

Validation
- Unit/integration tests covering: app-defined publish action, installer action, and pubkey setter.
- Confirm profile/app-store/clock apps still work using only the new registries.

## Workstream 5 — Renderer Purity & Dependency Metadata
**Goal:** Make the renderer a pure projection of `{ nodes, globals, queries }` without hidden side effects or regex heuristics.

Tasks
1. During compilation, capture for each node:
   - Referenced queries (`refs` already exists — ensure populated from schema parsing rather than regex).
   - Global dependencies (`time.now`, `user.pubkey`, `form.*`).
2. Store dependency metadata alongside `DocIR` so `AppView` can subscribe to `timeNowAtom` only when needed (no on-the-fly regex scanning).
3. Strip `ButtonNode` and `InputNode` of inline pubkey inference; instead, they call system actions that handle side effects.
4. Move helper functions (`extractStableId`, `hashObject`, etc.) into a separate utilities module if they remain necessary, documented as pure transforms.
5. Ensure moustache interpolation keeps using the reference resolver + local pipe registry, but returns data without mutating globals or queries.

Validation
- Tests verifying dependency metadata drives subscriptions (e.g., disable time ticker when not referenced).
- Snapshot tests confirming renderer output does not change when system actions run (pure render).

## Workstream 6 — Testing & Migration
**Goal:** Guarantee coverage for the new flow and document the migration path for existing apps/tools.

Tasks
1. Extend test suite to cover:
   - Schema validation errors.
   - Observable query pipelines (mock Hypersauce streams).
   - System vs doc actions dispatch.
   - Renderer dependency-driven subscriptions.
2. Update `sample_apps` and default apps to rely solely on the new syntax (no `$` references, no inline hacks).
3. Document the new architecture (`README`, `PIPE_AND_YAML_AUDIT.md` addendum, or new spec section) outlining how DocIR, Hypersauce, and renderer interact.
4. Provide a short migration checklist for anyone updating legacy apps (even if only we use them): run compiler, fix `$` references, ensure queries/actions follow schema.

Validation
- `bun test` runs green, including new suites.
- Manual smoke test: install + run Clock, Feed, App Store, Profile; verify publish and install flows.

## Risks & Open Questions
- **Hypersauce observables:** confirm we can expose `useObservableMemo` without pulling in the entire Applesauce API, or consider a lighter wrapper.
- **Schema versioning:** decide whether to bump the published doc version (`1.2.x → 1.3.0`?) once schema hardening lands.
- **Performance:** caching `DocIR` should reduce work, but watch memory usage when many docs open simultaneously.
- **Action namespaces:** ensure reserved system action names cannot be overridden by documents (validation rule in schema?).

---

This plan keeps us laser-focused on simplifying the flow while preserving a practical migration path. Once complete, we should have a single, well-typed document pipeline, observable-driven data flow, and a renderer that is trivial to test.
