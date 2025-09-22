# THE REAL HYPERNOTE OS — Vision & Plan

Principles
- Nostr‑native: apps are Nostr events; installs are Nostr addresses.
- Grug brain: pick the simplest workable thing; avoid cleverness.
- One source of truth: compiled JSON AST for runtime/publish; Markdown as human‑friendly editable form.
- Small, composable building blocks: queries, elements, layout primitives, actions.
- Deterministic round‑trip: Markdown ↔ JSON AST without surprises.

Outcomes
1) Users “install” apps by `naddr` and keep a list on Nostr (sync across devices).
2) Users edit any app (even installed ones) in the editor and “Publish” to Nostr (kind 32616).
3) Apps can both read (queries) and write (actions → events) to Nostr.
4) Thin client: Hypersauce handles Nostr queries + publishing; UI is a small shell.

---

## Milestones (Phases)

### Phase 0 — Foundations (schema + round‑trip)
Goal: Establish the canonical JSON AST and deterministic round‑trip with Markdown.

- Define minimal JSON AST schema (versioned):
  - nodes: `html`, `button`, `input`, `hstack`, `vstack`, `if`, `each` (future), `element` (embed by naddr).
  - meta/frontmatter: `{ name, icon, type: application|element, actions?, queries? }`.
  - refs array per node for dependency tracking.
- Implement `compile(md) → { meta, ast }` (we already have a good start).
- Implement `decompile({ meta, ast }) → md` with stable formatting rules.
- Acceptance: compile→decompile→compile is stable (structural equality) on our default apps.

- If/Each semantics
  - `if expr`: truthy‑existence only (no operators); evaluates whether a value exists/loaded.
  - `each $items as item`: iterate only arrays from queries; no arbitrary ranges.

Status: DONE (compiler hardening, decompiler, round‑trip tests). TODO: add `if`/`each` parser + decompiler.

### Phase 1 — App Registry (naddr‑first) + System Menu
Goal: Make installed apps be a list of `naddr` pointers, not local copies.

- `installedAppsAtom`: `Array<{ id: string; naddr: string }>` persisted to localStorage initially.
- “Add App” in Dock: prompts for `naddr`, resolves to JSON AST (via Hypersauce), stores pointer only (cache content locally for fast boot optionally).
- Editor opens one app at a time (single‑file editing). “Edit” button on each app opens an editor window for that app’s content (fetched via naddr). Multiple editor windows allowed.
- System‑wide menu (NextOS‑style): compact bar/context menu with global actions: Login (NIP‑07), Add App (naddr), New Local Draft, Open Editor, Toggle Debug. Keyboard shortcuts where obvious.
- Acceptance: user can add by naddr, app appears and runs; editor opens that app for editing.

Status: PARTIAL. System menu window with Login (NIP‑07), Add App (naddr), New Draft, Open Editor, Toggle Debug — DONE. Single‑file “Edit App” windows and naddr list persistence — TODO.

### Phase 2 — Publish to Nostr (kind 32616)
Goal: Publish current app to Nostr using Hypersauce API.

- Hypersauce extension API:
  - `publishApp({ meta, ast }, opts) → Promise<{ naddr, eventId }>`
  - Handles: signing (NIP‑07), relays, tags, kind=32616, versioning.
  - Event shape: JSON content `{ version: "1.2.0", meta, ast }`; tags: `['d', slug(name)]`, `['hypernote','1.2.0']`, `['hypernote-type', meta.type]`, optional `['title', meta.name]`, `['description', meta.description]`.
  - Overwrite: publish replaceable by `d` tag = slug(name); author overwrites their own app by republishing with same name.
  - Editor “Publish” in File menu and app context menu.
  - Local drafts: on publish success, install by returned `naddr` and replace draft with pointer.
- Acceptance: editor can publish; app can be re‑installed anywhere by naddr and renders identically.

Status: PARTIAL. Generic `login()` + `publishEvent()` added to Hypersauce; `publishApp()` wrapper and installer wired with markdown AST. New generic Markdown renderer + tests landed, and frontmatter actions now flow through the renderer/runtime stack. TODO: extend App Store to refresh entries post-publish & expose install feedback in UI.

#### Phase 2.5 — Markdown AST Hardening (new)
- Switch runtime to use very-small-parser MDAST throughout; remove HTML rendering path and reject inline HTML on compile.
- Preserve YAML arrays and structural metadata during compile/decompile.
- Future: render directly from MDAST without converting to HTML once UI supports it (safer interpolation, less mutation).
- Status: PARTIAL. Dedicated `MarkdownRenderer` replaced the hand-rolled HTML path, new interpolation tests cover moustache/`$` usage, and `markdown-editor` blocks reuse OverType inside the runtime. Still pending: finish tuple-only shaping so App Store enrich helpers move entirely into YAML pipes.

##### Phase 2.5a — Pure Tuple Renderer (Planned)
- Collapse `AppView.tsx` down to a generic markdown renderer. Inputs are `{ globals, queries }`; outputs are markdown → DOM. No per-app special casing.
- Runtime contract: each `$query` resolves to raw arrays, maps, or enrich tuples. We expose tuple members via numeric indexes (`item.0`, `item.1`, …) and never decorate them in React.
- All presentation shaping (slugs, avatar fallbacks, display labels) happens in YAML pipes (`map`, `default`, `coalesce`, `project`). If an app needs a helper, it lives in the query layer, not the renderer.
- Action buttons keep working via generic payload interpolation; we remove payload munging and publisher helpers from `AppView.tsx`.
- Deliverables:
  1. Strip `AppView.tsx` back to: compile markdown → render nodes → evaluate interpolations. Delete publisher/slug/image helpers and any tuple mutation logic. ✅ `AppView.tsx` now delegates rendering to `components/nodes.tsx`.
  2. Update `queryRuntime` to stop injecting fallback data; it simply returns what Hypersauce produced (events, tuples, maps).
  3. Rewrite bundled apps (App Store, etc.) so queries compute `display_label`, `avatar_url`, etc., and markdown references tuple indices (`{{ app.0.meta.name }}`, `{{ app.1.picture }}`) or pipe-produced fields (`{{ app.profile.display_label }}` when the query writes that).
  4. Adjust tests to assert that compile/decompile + render works with tuple access, and add regression coverage for rejecting html while ensuring tuple interpolation passes through untouched.
- Renderer friction log (keep pruning this list as we land fixes):
  - Hypersauce emits `Map` instances and unparsed events; we currently normalise them in `queryRuntime`. A JSON-ready mode would collapse this extra pass.
  - Asset URLs do not advertise display metadata, so the renderer parses query strings such as `?w=48`. Hypersauce (or the pipe helpers) could surface `asset.width`/`asset.height` so the view never guesses.
  - Markdown mixed `$profile.picture` and `{{ app.1.picture }}` forms. We standardised on moustache expressions and flag bare `$` usage, but the `||` fallback syntax still needs first-class support (today the renderer only evaluates the first truthy operand). Aim to revive this once Hypersauce exposes richer tuple helpers.
  - The new reference resolver proved the value of shared interpolation utilities. Future nodes (`element`, `action`, etc.) should use similar helpers so components stay declarative rather than hand-parsing scope each time.
- Acceptance: deleting `AppView.tsx` should essentially break rendering; adding back the minimal renderer restores everything without re-implementing special cases.

### Phase 3 — Actions (write to Nostr)
Goal: Let apps define write actions using a minimal, explicit schema.

- Frontmatter `actions:` map names → nostr event template, e.g.
  ```yaml
  actions:
    "@post_note":
      kind: 1
      content: "{form.note}"
      tags: [["client", "hypernote-client"]]
  ```
- Runtime:
  - `useAction(name)` resolves either built‑ins or frontmatter‑defined actions.
  - `runAction(name, scope)` performs interpolation and asks Hypersauce to publish.
- Acceptance: Profile or Wallet demo includes a working `@post_note` using form data.

Status: DONE. Frontmatter-defined actions now interpolate against `{ globals, $form, queries }`, publish through Hypersauce, and clear referenced form fields. The Poast default app demonstrates a `markdown-editor` control feeding `@post_note` kind 1 events. TODO: surface publish result metadata (event ids) back to apps for follow-up queries.

### Phase 4 — Elements & Composition
Goal: Support nested Hypernotes (elements) and param passing.

- Embeds in Markdown:
  - `"#profile_badge": "naddr1..."`
  - Optional params: `"#profile_badge": { naddr: "...", props: { pubkey: "{form.pk}" } }`
- Runtime fetches element AST by naddr, passes `props` into interpolation scope.
- Param passing: by expected kind (e.g., kind 0 expects a pubkey) and whole events where appropriate; no arbitrary JSON blobs for now.
- Acceptance: Chess board element and Profile badge element render inside other apps.

Status: TODO (embed by naddr + props; caching minimal; facade stable).

### Phase 5 — App List on Nostr
Goal: Sync installed apps across devices via Nostr.

- Store `installedApps` in a replaceable 30078 event with `['d','hypernote.installed-apps']` and JSON content `{ apps: [{ id, naddr }], pinned?: [...], order?: [...] }`.
- On startup: fetch user’s list; fallback to localStorage if unavailable; merge sensibly.
- Acceptance: sign into another machine; your dock populates from Nostr.

Status: TODO (kind 30078 replaceable list with d=hypernote.installed-apps; merge with local on boot).

### Phase 6 — Blossom Uploads (assets)
Goal: Allow uploading images/icons, return URLs used in apps.

- Minimal API: `uploadImage(file) → url` (Hypersauce or tiny helper lib).
- Editor: “Upload Image” returns URL; user pastes into frontmatter `icon:` or content.
- Acceptance: user updates an icon by uploading and sees it in dock.

Status: TODO (await instance).

### Phase 7 — Polish & Hardening
Goal: Keep it simple, stable, and testable.

- Tests: round‑trip compiler, interpolation, image `$` substitution, action publishing dry‑run.
- Performance: memoization on node refs already; keep it.
- Logging: debug toggle; quiet by default.

Status: PARTIAL. Debug toggle DONE; add tests for interpolate and image `$` substitution — TODO.

---

## Architecture Decisions & Boot Lifecycle (CURRENT)

Decision: Boot Singleton + Atom (Option A), with a future seam for a tiny runtime façade (Option C) if/when desired.

- Hypersauce Client
  - Exactly one instance is created during boot and stored in `hypersauceClientAtom`.
  - Central relay setting via `client.setRelays(relays)`; TODO: after login fetch user’s preferred relays and update.
  - Hypersauce is generic: `login()`, `publishEvent()`, `runQueryDocumentLive()`.

- Boot Lifecycle
  - `boot:init` → construct Hypersauce client → set `bootStage=login` if `user.pubkey` empty, else `ready`.
  - `boot:login` → LoginWindow supports npub paste or NIP‑07; on success set `user.pubkey` and `bootStage=ready`.
  - `boot:ready` → OS windows render; runtime starts live queries (gated on context e.g. pubkey).

- Runtime Layer
  - Only the runtime reads `hypersauceClientAtom`; if null, it quietly no‑ops. Apps never branch on readiness.
  - Future: introduce a tiny façade (Option C) exposing `runtime.query.start/stop`, `runtime.login`, `runtime.publishEvent` for clearer boundaries; not required now.

- Packaging (DEV)
  - During development, the app may import Hypersauce from the sibling repo to avoid package export ambiguity.
  - TODO: stabilize `hypersauce` package export shape (named `HypersauceClient` via `index.ts`, package.json `exports`), then switch to static package import in app boot.

---

## Execution Status Snapshot

Done
- Markdown removed; defaults as in‑repo strings.
- Editor/AppSwitcher → panels; no nested windows.
- Window layout persistence (pos/z) to localStorage.
- HtmlNode memoization + per‑window `time.now` gating; clock no longer re‑renders other windows.
- Profile query fallback: `$profile` sourced from `user.profile` when Hypersauce absent.
- Action name normalization.
- Dock UI with icons, beveled windows, close button; retro palette.
- System Menu window (Login, Add App by naddr, New Draft, Open Editor, Toggle Debug).
- Hypersauce generic `login()` + `publishEvent()`; publish via applesauce RelayPool with optimistic EventStore add.
- Decompiler + round‑trip tests (Phase 0 acceptance for existing nodes).
- LoginWindow gating OS until identity ready (`bootStage`).

In Progress / Next
- Editor: Add “Publish App” button using `publishApp()`; on success install naddr and replace local draft.
- Dock: Add “Edit” per app (opens single‑file editor windows for installed apps).
- Installed apps: pointers list + persist via kind 30078 (replaceable) using `publishEvent()`; hydrate on boot.
- Relays: After login, fetch user relay prefs and call `client.setRelays()`.
- Runtime façade (optional): small module wrapping `runQueryDocumentLive`, `publishEvent`, `login` for apps.
- Compiler: Add `if` and `each` blocks (parse + decompile) per semantics above.
- Elements: embed hypernotes by naddr with props (by kind), minimal caching.
- Tests: interpolation + image `$` resolution; action publishing dry‑run.
- Packaging: finalize hypersauce named export and flip app boot to static package import.

Risks / Unknowns
- package export resolution differences (Bun/Node) — tracked; fall back to sibling import during dev.
- Blossom upload API details — blocked until instance provided.
- ContextVM integration — covered by `publishEvent` (actions) and live query subscriptions to the response pubkey.

---

## Short‑Term Task Board

1) Editor “Publish” flow
   - Wire button to `publishApp(meta, ast)`.
   - On success: install by naddr, replace draft with pointer, open/focus app window.

2) Dock “Edit” + Single‑File Editor
   - Add an Edit button per app tile; opens an editor window for that app only.

3) Installed apps list
   - `installedAppsAtom` pointers; persist via kind 30078 (d=hypernote.installed-apps) using `publishEvent()`.
   - Load on boot (live doc); merge with local.

4) Relays post‑login (TODO hook)
   - After login, fetch preferred relays and call `client.setRelays(newRelays)`.

5) Compiler features
   - Implement `if` / `each` (existence check and array iteration from queries).

6) Elements
   - Embed by naddr with simple props (by kind); pass props into interpolation scope; cache minimal.

7) Packaging cleanup
   - Confirm `hypersauce` named export is stable; switch boot to static import.


---

## Architecture (Thin + Nostr‑native)

- Compiler: `compile(md) → { meta, ast }` and `decompile(json) → md`.
- Runtime queries: Hypersauce drives per‑window scalars; we pass minimal context.
- Actions: `useAction(name)` merges built‑ins with doc‑defined actions; Hypersauce publishes.
- Registry/Installer: manages `installedApps` (naddr list); fetches AST on demand.
- Editor: single‑file editor with File menu (New, Save Local, Publish, Export, Reset).

Non‑goals (for now)
- Full theming system; CSS is fine.
- Rich layout beyond stacks/if/each; keep it minimal.
- Client‑side auth flows beyond NIP‑07/keys the user already has.

---

## Clarifying Questions (Please reply inline)

Publishing (kind 32616)
1. Event content format: raw JSON `{ meta, ast }` as `content`, or `kind`/`tags` carry some meta? Any required tags (e.g., `type: app|element`, `version`)?

1. ANSWER:
here's what a 32616 event looks like, though we should bump the hypernote version to 1.2.0 and it's fine to make any other changes we think are more nostr-native. we actually parse the meta into queries and actions and ops and stuff.

```json
{
    "content": "{\"version\":\"1.1.0\",\"component_kind\":null,\"elements\":[{\"type\":\"h1\",\"content\":[\"♟️ Chess\"]},{\"type\":\"div\",\"elements\":[{\"type\":\"p\",\"content\":[{\"type\":\"strong\",\"content\":[\"Debug FEN\"]},\": \",\"{$chess_fen}\",\" \"]}],\"style\":{\"marginTop\":\"1rem\",\"fontSize\":\"0.875rem\",\"color\":\"rgb(75,85,99)\"}},{\"type\":\"component\",\"alias\":\"chess_board\",\"argument\":\"\"},{\"type\":\"form\",\"elements\":[{\"type\":\"div\",\"elements\":[{\"type\":\"input\",\"content\":[],\"attributes\":{\"name\":\"move\",\"placeholder\":\"Enter move (e.g., e4, Nf3, O-O)\"},\"style\":{\"padding\":\"0.5rem\",\"borderWidth\":\"1px\",\"borderRadius\":\"0.25rem\"}},{\"type\":\"button\",\"elements\":[{\"type\":\"p\",\"content\":[\"Make Move\"]}],\"style\":{\"backgroundColor\":\"rgb(59,130,246)\",\"color\":\"rgb(255,255,255)\",\"paddingLeft\":\"1.5rem\",\"paddingRight\":\"1.5rem\",\"paddingTop\":\"0.5rem\",\"paddingBottom\":\"0.5rem\",\"borderRadius\":\"0.25rem\",\"fontWeight\":700}}],\"style\":{\"display\":\"flex\",\"gap\":\"0.5rem\"}}],\"event\":\"@make_move\"},{\"type\":\"form\",\"elements\":[{\"type\":\"button\",\"elements\":[{\"type\":\"p\",\"content\":[\"New Game\"]}],\"style\":{\"backgroundColor\":\"rgb(34,197,94)\",\"color\":\"rgb(255,255,255)\",\"paddingLeft\":\"1rem\",\"paddingRight\":\"1rem\",\"paddingTop\":\"0.5rem\",\"paddingBottom\":\"0.5rem\",\"borderRadius\":\"0.25rem\",\"marginTop\":\"0.5rem\"}}],\"event\":\"@new_game\"},{\"type\":\"h2\",\"content\":[\"How to Play\"]},{\"type\":\"div\",\"elements\":[{\"type\":\"p\",\"content\":[\"- \",{\"type\":\"strong\",\"content\":[\"Pawns\"]},\": \",{\"type\":\"code\",\"content\":[\"e4\"]},\", \",{\"type\":\"code\",\"content\":[\"d5\"]},\", \",{\"type\":\"code\",\"content\":[\"exd5\"]},\" \",\"- \",{\"type\":\"strong\",\"content\":[\"Pieces\"]},\": \",{\"type\":\"code\",\"content\":[\"Nf3\"]},\", \",{\"type\":\"code\",\"content\":[\"Bxe5\"]},\", \",{\"type\":\"code\",\"content\":[\"Qd8\"]},\"  \",\"- \",{\"type\":\"strong\",\"content\":[\"Castling\"]},\": \",{\"type\":\"code\",\"content\":[\"O-O\"]},\" (kingside), \",{\"type\":\"code\",\"content\":[\"O-O-O\"]},\" (queenside)\",\" \",\"- \",{\"type\":\"strong\",\"content\":[\"Check/Checkmate\"]},\": Add \",{\"type\":\"code\",\"content\":[\"+\"]},\" or \",{\"type\":\"code\",\"content\":[\"#\"]},\" \"]}],\"style\":{\"marginTop\":\"1rem\",\"padding\":\"1rem\",\"backgroundColor\":\"rgb(243,244,246)\",\"borderRadius\":\"0.25rem\"}}],\"type\":\"hypernote\",\"title\":\"Chess\",\"description\":\"Play chess with hypermedia UI from MCP server\",\"name\":\"chess\",\"queries\":{\"$chess_fen\":{\"kinds\":[30078],\"authors\":[\"2e6ad883d5a134a6fb3f0de9063ab170deeb805592bba90ac7351cf3920bbbd0\"],\"#d\":[\"chess-fen\"],\"limit\":1,\"pipe\":[{\"op\":\"first\"},{\"op\":\"get\",\"field\":\"content\"},{\"op\":\"default\",\"value\":\"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1\"}]},\"#chess_board\":{\"kinds\":[32616],\"authors\":[\"2e6ad883d5a134a6fb3f0de9063ab170deeb805592bba90ac7351cf3920bbbd0\"],\"#d\":[\"chess-board\"],\"limit\":1,\"pipe\":[{\"op\":\"first\"}]}},\"events\":{\"@make_move\":{\"kind\":25910,\"json\":{\"jsonrpc\":\"2.0\",\"id\":\"{time.now}\",\"method\":\"tools/call\",\"params\":{\"name\":\"make_move\",\"arguments\":{\"move\":\"{form.move}\"}}},\"tags\":[[\"p\",\"2e6ad883d5a134a6fb3f0de9063ab170deeb805592bba90ac7351cf3920bbbd0\"]]},\"@new_game\":{\"kind\":25910,\"json\":{\"jsonrpc\":\"2.0\",\"id\":\"{time.now}\",\"method\":\"tools/call\",\"params\":{\"name\":\"new_game\",\"arguments\":{}}},\"tags\":[[\"p\",\"2e6ad883d5a134a6fb3f0de9063ab170deeb805592bba90ac7351cf3920bbbd0\"]]}}}",
    "created_at": 1755555288,
    "id": "4129430f6cc8cbeb2eb45b17a450ed8d5633224065234f8c994a19fb71a293df",
    "kind": 32616,
    "pubkey": "0d6c8388dcb049b8dd4fc8d3d8c3bb93de3da90ba828e4f09c8ad0f346488a33",
    "sig": "173f3454cbabdd33babf170e053f527cff3015e3aa1d2d5b03f8336a7cfde47b68f59d772ba63d40687caaf8bbf4d8baffae25cd6b7593a632c0d8bd37d0df7e",
    "tags": [
      [
        "d",
        "chess"
      ],
      [
        "hypernote",
        "1.1.0"
      ],
      [
        "t",
        "hypernote"
      ],
      [
        "hypernote-type",
        "application"
      ],
      [
        "t",
        "hypernote-application"
      ],
      [
        "title",
        "Chess"
      ],
      [
        "description",
        "Play chess with hypermedia UI from MCP server"
      ]
    ]
  },
```

2. Versioning: include `schema_version` in content, and a `d` tag for replaceable semantics?

2. ANSWER:
yes

3. Relays/signing: assume Hypersauce owns signing + pool? Any preferred NIPs beyond NIP‑07 for interactive signing?

3. ANSWER
yes, hypersauce owns signing and pool. let's do nip-07 for signing
(we'll need to edit hypersauce in this plan! or make a plan for someone else to do that!)

Installed app list
4. Which kind should hold the user’s “installed apps” list (array of naddr)? Use an existing list kind or a new custom kind? Replaceable or append‑only?

4. ANSWER
let's just do kind 30078 arbitrary app data. and just replace it is fine
example 30078 event (all that really matters is the d tag and the json content
```json
{
  "id": "...",
  "pubkey": "...",
  "created_at": 1671217411,
  "kind": 30078,
  "tags": [
    ["d", "com.example.myapp.user-settings"]
  ],
  "content": "{\"theme\": \"dark\", \"language\": \"en\", \"notifications\": true}",
  "sig": "..."
}
```

5. Do we store window state (positions/order) in that list event too, or keep that local?
5. ANSWER let's keep window state local

Elements
6. Element vs app: same kind 32616 with `type: element` in meta? Or distinct kind?
6. ANSWER correct, same kind, different type (the applications are type: application)
7. Param passing for elements: do we restrict to primitives/strings (interpolated) for simplicity?
7. ANSWER
param passing so far has been based on the "kind"
so a "kind 0" prop expects a pubkey
that's enough to get profiles working... and would work for feeds.
but we should also support passing any event (but by saying the kind, the component is showing what shape of data it expects the event to be)
let's not do arbitrary data args for now

Actions
8. Safety: do we require explicit allow‑list per app for kinds it may publish? Any per‑action confirmation?
8. ANSWER - we don't allow any automatic actions, we always use nip-07 to authorize any action that publishes to nostr (the user always approves)
9. Interpolation scope for actions: `{ user, time, form, queries }` OK? Anything else?
9 - ANSWER
that looks correct to me!

Round‑trip & Syntax
10. Are `if` and `each` blocks mandatory for v1? If yes, suggested Markdown fence shapes:
    - ```if expr
    - ```each item in items
10. ANSWER yes we need if an each but if should only be for "truthy" basically does the data exist or not. no actual `pubkey === something` "logic" just an existence test for data (so we can hide things while loading). each should only operate on arrays that come out of queries. not arbitrary range stuff.
11. YAML formatting in decompile: OK to sort keys in frontmatter for stability?
11. ANSWER:
yeah stability sounds good. we can "prettify" by doing the roundtrip to ast on save so it's not surprising

Assets (Blossom)
12. Which Blossom instance(s) do we target? Any auth or payoff expectations? Timeouts/retries?
12. ANSWER: I will provide a blossom instance when we get to this stage. ask me then

Dock & Editor
13. Single‑file editor only (no multi‑pane)? “Edit” button per app spawns editor window — confirmed?
13. ANSWER no multi-pane tabbed editor but we should be able to have unlimited editors open (both for drafting new apps, and one editor open per-app if the user hits edit on that app). we should probably have "context menu" that has system wide commands like login with npub, create new file, and I'm sure other stuff we'll think of) (this is like old nextos menu)
    - FUTURE: add resizable window chrome (drag handles snapping to grid) so tall apps/editors can expand without relying on internal scroll. Target after the rest of Phase 2.5 once window layout stabilises.

14. On publish of an edited naddr app: do we overwrite the original (replaceable) or publish new and update the list to the new naddr?
14. ANSWER yes overwrite when it has the same name. the name becomes a d-tag-like-this. this is fine because d tags are per author so it's up to the author if they want to overwrite.

Icons
15. Prefer remote URLs for `icon:` in meta? Local fallbacks allowed? Any size guideline (e.g., 48px square)?
15. ANSWER this is blocked on blossom so let's use the local ones for now. no size guidance but we should scale them to 48px and square

Misc
16. Any compliance with ContextVM JSON‑RPC expected now, or Phase 4+? Example kinds for tool calls OK?
16. ANSWER the wallet and chess apps will use contextvm. as long as we can publish arbitrary events like the one I defined we should be good (and subscribe to the responses we'll get from the contextvm pubkey... which our queries are likely already capable of)
17. Minimal relay set defaults acceptable (we already have 3) or should Hypersauce own all relay config?
ANSWER: default relays are fine but circle back on this when we get close to prod so we do it right.

---

## Concrete Next Steps (Incremental, Simple)

1) Phase 0: lock JSON AST and decompiler; add tests for round-trip on all default apps.
2) Phase 1: switch “Add App” to accept `naddr`; create `installedAppsAtom`; install and cache fetched AST.
3) Phase 2: expose `publishApp` in Hypersauce; add Editor “Publish” button; store returned `naddr`.
4) Phase 3: extend frontmatter `actions:`; wire action publishing via Hypersauce. **DONE** — Poast ships as the first writer app.
5) Phase 4: implement element embedding by `naddr` with optional props; basic cache.
6) Phase 5: persist `installedApps` list to Nostr; merge with local on boot.
7) Phase 6: image upload helper; surface in editor.
8) Phase 7: tighten logs, add tests, document schema.

All along: keep code tiny, push Nostr concerns into Hypersauce, and iterate behind feature flags where helpful.
