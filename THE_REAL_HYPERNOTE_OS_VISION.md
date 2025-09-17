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
  - meta/frontmatter: `{ name, icon, kind?, type?, actions?, queries? }`.
  - refs array per node for dependency tracking.
- Implement `compile(md) → { meta, ast }` (we already have a good start).
- Implement `decompile({ meta, ast }) → md` with stable formatting rules.
- Acceptance: compile→decompile→compile is stable (structural equality) on our default apps.

### Phase 1 — App Registry (naddr‑first)
Goal: Make installed apps be a list of `naddr` pointers, not local copies.

- `installedAppsAtom`: `Array<{ id: string; naddr: string }>` persisted to localStorage initially.
- “Add App” in Dock: prompts for `naddr`, resolves to JSON AST (via Hypersauce), stores pointer only (cache content locally for fast boot optionally).
- Editor opens one app at a time (single‑file editing). “Edit” button on each app opens editor for that app’s content (fetched via naddr).
- Acceptance: user can add by naddr, app appears and runs; editor opens that app for editing.

### Phase 2 — Publish to Nostr (kind 32616)
Goal: Publish current app to Nostr using Hypersauce API.

- Hypersauce extension API:
  - `publishApp({ meta, ast }, opts) → Promise<{ naddr, eventId }>`
  - Handles: signing, relays, tags, kind=32616, versioning.
- Editor “Publish” action in File menu.
- When publishing a local (non‑naddr) app: on success, install by returned `naddr` and (optionally) replace local working copy with pointer.
- Acceptance: editor can publish; app can be re‑installed anywhere by naddr and renders identically.

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

### Phase 4 — Elements & Composition
Goal: Support nested Hypernotes (elements) and param passing.

- Embeds in Markdown:
  - `"#profile_badge": "naddr1..."`
  - Optional params: `"#profile_badge": { naddr: "...", props: { pubkey: "{form.pk}" } }`
- Runtime fetches element AST by naddr, passes `props` into interpolation scope.
- Acceptance: Chess board element and Profile badge element render inside other apps.

### Phase 5 — App List on Nostr
Goal: Sync installed apps across devices via Nostr.

- Define a list event (kinds: either existing list kind or custom) storing array of `naddr` + small metadata (order, pinned).
- On startup: fetch user’s list; fallback to localStorage if unavailable; merge sensibly.
- Acceptance: sign into another machine; your dock populates from Nostr.

### Phase 6 — Blossom Uploads (assets)
Goal: Allow uploading images/icons, return URLs used in apps.

- Minimal API: `uploadImage(file) → url` (Hypersauce or tiny helper lib).
- Editor: “Upload Image” returns URL; user pastes into frontmatter `icon:` or content.
- Acceptance: user updates an icon by uploading and sees it in dock.

### Phase 7 — Polish & Hardening
Goal: Keep it simple, stable, and testable.

- Tests: round‑trip compiler, interpolation, image `$` substitution, action publishing dry‑run.
- Performance: memoization on node refs already; keep it.
- Logging: debug toggle; quiet by default.

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
2. Versioning: include `schema_version` in content, and a `d` tag for replaceable semantics?
3. Relays/signing: assume Hypersauce owns signing + pool? Any preferred NIPs beyond NIP‑07 for interactive signing?

Installed app list
4. Which kind should hold the user’s “installed apps” list (array of naddr)? Use an existing list kind or a new custom kind? Replaceable or append‑only?
5. Do we store window state (positions/order) in that list event too, or keep that local?

Elements
6. Element vs app: same kind 32616 with `type: element` in meta? Or distinct kind?
7. Param passing for elements: do we restrict to primitives/strings (interpolated) for simplicity?

Actions
8. Safety: do we require explicit allow‑list per app for kinds it may publish? Any per‑action confirmation?
9. Interpolation scope for actions: `{ user, time, form, queries }` OK? Anything else?

Round‑trip & Syntax
10. Are `if` and `each` blocks mandatory for v1? If yes, suggested Markdown fence shapes:
    - ```if expr
    - ```each item in items
11. YAML formatting in decompile: OK to sort keys in frontmatter for stability?

Assets (Blossom)
12. Which Blossom instance(s) do we target? Any auth or payoff expectations? Timeouts/retries?

Dock & Editor
13. Single‑file editor only (no multi‑pane)? “Edit” button per app spawns editor window — confirmed?
14. On publish of an edited naddr app: do we overwrite the original (replaceable) or publish new and update the list to the new naddr?

Icons
15. Prefer remote URLs for `icon:` in meta? Local fallbacks allowed? Any size guideline (e.g., 48px square)?

Misc
16. Any compliance with ContextVM JSON‑RPC expected now, or Phase 4+? Example kinds for tool calls OK?
17. Minimal relay set defaults acceptable (we already have 3) or should Hypersauce own all relay config?

---

## Concrete Next Steps (Incremental, Simple)

1) Phase 0: lock JSON AST and decompiler; add tests for round‑trip on all default apps.
2) Phase 1: switch “Add App” to accept `naddr`; create `installedAppsAtom`; install and cache fetched AST.
3) Phase 2: expose `publishApp` in Hypersauce; add Editor “Publish” button; store returned `naddr`.
4) Phase 3: extend frontmatter `actions:`; wire action publishing via Hypersauce.
5) Phase 4: implement element embedding by `naddr` with optional props; basic cache.
6) Phase 5: persist `installedApps` list to Nostr; merge with local on boot.
7) Phase 6: image upload helper; surface in editor.
8) Phase 7: tighten logs, add tests, document schema.

All along: keep code tiny, push Nostr concerns into Hypersauce, and iterate behind feature flags where helpful.

