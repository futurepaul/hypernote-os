# Hypernote OS Plan (Draft)

This is a living sketch of how we’ll evolve the app/runtime, actions, and component system. It’s intentionally lightweight and pragmatic.

## Goals

- Text-first app definitions using Markdown + YAML metadata.
- Deterministic “compiler” from MD to a tiny UI AST (layout + components).
- Data/query/actions as first‑class citizens (declarative where possible).
- User‑defined actions ("@…") and queries ("$…") with safe capabilities.
- Transport‑agnostic: local, HTTP, Nostr, MCP (JSON‑RPC over Nostr), etc.

## Primitives

- Documents: Markdown with YAML frontmatter and fenced components.
- Variables: `{{path.to.value}}` pulled from a global store (`globals`).
- Components: code fences with YAML payload (e.g., `button`, `input`, `hstack.start`).
- Actions: strings beginning with `@` that map to handlers.
- Queries: strings beginning with `$` that map to resolvers.

## MVP Runtime

- Parser: `very-small-parser` for MDAST, convert to HAST for normal MD.
- Compiler: single pass that:
  - Extracts frontmatter.
  - Pools normal MD tokens → HTML nodes.
  - Converts special fences → UI AST nodes.
- Renderer: React components for layout + built‑ins.
- Store (Zustand):
  - `globals.user.pubkey`, `globals.user.profile`, `globals.time.now`.
  - `docs` map persisted to `localStorage`.
  - `actions` registry + `runAction(name, args)`.

## Actions

- System actions built in:
  - `@load_profile`: fetch Kind 0 for `globals.user.pubkey` and store into `globals.user.profile`.
  - Later: `@post_note`, `@open`, `@navigate`, `@save_doc`, etc.
- User actions:
  - YAML objects under quoted keys (e.g., "@post_note") compiled to an executable spec and registered per‑doc.
  - Execution context: access to `globals`, optional `form` values and `doc` scope.

## Queries

- `$name` entries in frontmatter define resolvers (MCP, Nostr filters, HTTP, etc.).
- Pipeline ops: `first`, `get: path`, `default: value`, etc.
- Cached in store; invalidated by actions.

## Components (initial)

- `button` — YAML `{ text, action }`.
- `input` — YAML `{ text, name? }`; binds to store under `form.{name}` later.
- `hstack.start/.end`, `vstack.start/.end` — layout containers.
- Future: `text`, `image`, `select`, `table`, `form`, and `component` by Nostr reference.

## Security

- Capabilities per document: which actions/queries are allowed.
- User confirmation for side‑effects (posting notes, calling tools).

## MCP Integration (later)

- Actions that call MCP tools via JSON‑RPC over Nostr (`kind: 25910`).
- Remote components fetched by naddr and rendered as custom components.

## Next Steps

1. Add per‑doc user actions registry and execution engine.
2. Form model: bind `input.name` → `globals.form.{name}`; template interpolation.
3. Button actions: pass `form` values and `doc` context into `runAction`.
4. Queries (`$…`): implement a basic resolver interface + cache.
5. Add Tailwind Typography (optional) for nicer markdown.

