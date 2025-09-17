# Jotai Feature Parity Plan

Goal: land the Jotai‑only architecture with the same or better UX than pre‑refactor (Zustand), and remove remaining flakiness (MD loading, window duplication, flicker, window positions). This plan is scoped, testable, and staged so the app remains runnable between steps.

---

## Current Issues To Fix

1) Tick re‑render/flicker
- Some windows still re‑render every second when the clock updates.
- Images flicker due to repeated innerHTML writes.

2) Editor shows twice / is nested
- We render a DraggableWindow for every doc, and EditorWindow itself renders a DraggableWindow → nested/duplicate window.

3) Window positions
- All windows start at the same position.
- Positions are not persisted across runs.

4) Markdown loader vs hydration
- After reset, some docs display as Bun asset URLs instead of markdown text.
- Editor and runtime are not using a single, definitive data path for docs.

5) Actions wiring
- Actions are partly wired; we want a clean Jotai registry for system and doc‑defined actions.

6) Forms support
- Inputs should bind to form values and interpolate with `{{ form.name }}`.

---

## Guiding Principles

- Single source of truth for docs: `docsAtom` holds canonical markdown text for each window id.
- Deterministic compile/render: compiler → AST with node ids + refs → HtmlNode recomputes only when deps change.
- Per‑window state isolation: positions, z, queries, forms are window‑scoped atoms.
- No conditional hooks. Subscriptions should be slice‑based and as narrow as possible.

---

## Target Architecture Snapshot

- State (Jotai)
  - `docsAtom: Record<string, string>`
  - `userAtom: { pubkey: string|null, profile?: any }`
  - `relaysAtom: string[]`
  - `timeNowAtom: number`
  - `windowPosAtom(id)`, `windowZAtom(id)`, `bringWindowToFrontAtom`
  - `windowScalarsAtom(id)` for query results
  - `formsAtom(id)` for input values
  - `actionsAtom` + `useAction(name)`

- Rendering
  - App renders each `[id, doc]` as a DraggableWindow + content
    - id === `editor` → EditorPanel (content only)
    - id === `apps` → AppSwitcherPanel (content only)
    - otherwise → AppView(id)
  - AppView compiles doc → AST (with node ids + refs), renders node list
  - HtmlNode memoizes the final string from `refs` → `scope` to avoid flicker

- Queries
  - Per‑window runtime subscription → `windowScalarsAtom(id)` (deep‑equal merge)
  - Guarded by context (e.g., `user.pubkey`)

- Actions
  - `useAction` resolves built‑in and doc‑defined actions (merged from frontmatter)

- Markdown
  - Prefer hydration path to convert asset URLs → text once at startup and after resets
  - Editor writes to `docsAtom`; runtime/UI only read from it

---

## Work Plan (Phases)

### Phase 1 — Fix UX issues (feature parity)
1. Editor/Apps windows
   - Convert EditorWindow to `EditorPanel` (no DraggableWindow inside). App wraps it in a single DraggableWindow — no duplicates.
   - Convert `AppSwitcher` to `AppSwitcherPanel` (content only). Same wrapping rule.
   - Acceptance: only one Editor window, only one Apps window.

2. Window positions & persistence
   - Initial layout: assign default positions in a simple grid (e.g., stepped offsets by index) so windows don’t overlap on first run.
   - Persistence: add `windowLayoutAtom: Record<id,{x,y,z}>` persisted to localStorage. Hydrate `windowPosAtom/windowZAtom` from it and write back (debounced on change).
   - Acceptance: windows restore their last positions/z after reload.

3. Tick re‑render & image flicker
   - App only sets time; does not read it.
   - AppView always calls `useAtomValue(timeNowAtom)` but computes `timeNow = usesTime ? timeNowAll : 0` so hooks are stable (already done).
   - HtmlNode (already added) ensures nodes that don’t depend on time won’t re‑render every second. Verify images don’t flicker.
   - Acceptance: profile/wallet do not re‑render on clock tick; images do not flicker.

4. MD loading (one path)
   - Keep build‑time MD loader for prod. In dev, prefer hydration to replace asset URLs with markdown text.
   - EditorPanel Save/Reset must only update `docsAtom` and immediately re‑hydrate to text if any asset URLs appear.
   - Acceptance: no `/_bun/asset/...md` visible anywhere after reset/refresh.

### Phase 2 — Actions & Forms
5. Actions registry
   - `actionsAtom` holds built‑in actions; `useAction(name)` resolves registry + merges doc‑level actions from frontmatter.
   - Wire ButtonNode to invoke actions; provide a tiny context object with `{ windowId, globals, forms }` as needed.
   - Acceptance: `@load_profile`, `@set_pubkey` work via registry; easy to add `@post_note` etc.

6. Forms support
   - `formsAtom(id)` to store `{ [name]: value }` for inputs with YAML `{ name, text }`.
   - Interpolation supports `{{ form.name }}`; actions can read from forms.
   - Acceptance: inputs with `name` update forms; HTML and actions can reference those values.

### Phase 3 — Query gating & refs (optional polish)
7. Query gating
   - Gate starting a query doc based on required vars (already done for `user.pubkey`).
   - (Later) derive additional dependency signals from node refs for precise gating.

8. Node‑level dependency‑driven update
   - Use `node.refs` to drive HtmlNode memoization (already implemented) so only affected nodes recompute.
   - Acceptance: nodes only recompute when their dependency values change.

### Phase 4 — Cleanup & DX
9. Remove Bun runtime loader in dev (optional)
   - Keep only build‑time loader; rely on hydration for dev.

10. Log levels
   - Debug logger controlled by a query param or atom to toggle logs on/off.

11. Tests
   - Expand `compile.test.ts`; add tests for interpolate and resolveImgDollarSrc.

---

## Acceptance Criteria
- Editor and Apps render once each; no nested/duplicate windows.
- No windows show asset URLs after initial load or after Reset Docs.
- Profile/Wallet do not re‑render on clock ticks; images don’t flicker when clock updates.
- Windows remember their positions and z‑order across reloads.
- Actions run via `useAction`; `@load_profile` updates `user.profile`.
- Forms with `name` bind to `formsAtom(windowId)` and interpolate with `{{ form.name }}`.
- All TypeScript checks pass.

---

## Rollout Checklist
- Implement Phase 1 tasks, verify locally (manual QA) and keep tsc passing.
- Convert EditorWindow → EditorPanel and AppSwitcher → AppSwitcherPanel.
- Add window layout persistence.
- Verify hydration cleans up asset URLs post‑reset.
- Add actions/forms in Phase 2.
- Optional gating and cleanup in subsequent phases.

---

## Notes / Extras
- If Hypersauce is not available/mislinked, runtime now no‑ops gracefully with a console warning.
- We can add an optional “Save Session” button later that persists docsAtom to localStorage for user edits, without making localStorage the default source of truth.
- HtmlNode is a minimal memoized string render, not a new framework.

