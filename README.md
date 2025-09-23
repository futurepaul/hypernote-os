# Hypernote OS

Hypernote OS is a desktop-style environment for composing and running Hypernote apps. Authors write Markdown with YAML frontmatter, the compiler turns it into a typed document IR, Hypersauce streams data into the runtime, and the React renderer displays the UI.

## Getting Started

```bash
bun install
bun dev
```

Open http://localhost:3420/ to launch the desktop. Use **Apps** → **Welcome** to read the in-app guide.

## Architecture Overview

```
markdown + yaml
      │         (sample_apps/*.md)
      ▼
compileMarkdownDoc (src/compiler.ts)
      │ produces DocIR { version, meta, ast }
      │
      ├── meta.dependencies: query/global usage
      ├── meta.queries: Hypersauce specs
      └── ast: Markdown + UI nodes with dependency metadata
      ▼
queryRuntime.start (src/queries/runtime.ts)
      │ wires DocIR.meta.queries into Hypersauce
      ▼
Hypersauce observables (../hypersauce)
      │ emit `{ status, data }` per query
      ▼
AppView + RenderNodes (src/components/AppView.tsx, nodes.tsx)
      │ subscribe to streams, gather globals/forms/state
      ▼
React renderer (desktop windows, stacks, markdown)
```

Key modules:

- `src/compiler.ts` – masks moustache templates, parses Markdown/YAML, validates nodes, records dependencies, and emits DocIR.
- `src/queries/runtime.ts` – maps DocIR queries to Hypersauce, exposing Rx-style streams per window.
- `src/state/actions.ts` – manages system actions (`system.install_app`, `system.set_pubkey`) and doc actions (`actions.post_note`), interpolating payloads and updating form/state atoms.
- `src/components/AppView.tsx` – entry point per window; starts queries, builds globals, and renders nodes.
- `src/components/nodes.tsx` – renders Markdown, inputs, stacks, and `each` blocks using dependency metadata.

## Developing Apps

1. Create a Markdown file with frontmatter in `sample_apps/`.
2. Add it to `src/apps/app.ts` so it appears in the OS.
3. Iterate with `bun dev`; the compiler hot-reloads on save.

Doc anatomy:

```yaml
---
hypernote:
  name: Clock
  icon: clock.png
queries:
  time:
    kinds: [some-kind]
actions:
  post:
    kind: 1
    content: "{{ form.note }}"
forms:
  note: ""
state:
  profile_target: user.pubkey
---
```

- `queries` describe Hypersauce subscriptions (filters + pipes).
- `actions` describe publish templates and optional form/state mutations.
- `forms` seed per-window inputs; `state` stores app-local data.

Code fences define UI nodes (`button`, `input`, `markdown_editor`, `each.start`, `hstack.start`, `vstack.start`). Use moustache expressions (`{{ queries.feed[0].content }}`) to reference data.

## Testing

```bash
bun test               # full suite (compiler, runtime, publish/install)
bun test compile.test.ts
```

## Directory Guide

- `sample_apps/` – Markdown sources for default apps (Welcome, App Store, Poast, etc.).
- `src/apps/app.ts` – registers default apps and system windows.
- `src/components/` – desktop UI, renderer, markdown bridge.
- `src/state/` – Jotai atoms, actions, docs persistence.
- `src/queries/` – Hypersauce runtime integration.
- `src/lib/` – rendering/date utilities.
- `../hypersauce/` – local Hypersauce dependency when developing pipelines.

## Publishing

Run the publish/install roundtrip tests to verify serialized DocIR:

```bash
bun test publishRoundtrip.test.ts
```

Apps are published to Nostr as `{ version, meta, ast }` JSON (kind 32616). `install_app` uses `system.install_app` with an `naddr` payload.

## Contributing

- Keep renderer pure: derive everything from DocIR, globals, and query streams.
- Avoid adding new runtime normalizers—validate via schema or compilation instead.
- Prefer descriptive comments only for complex logic (compiler, actions, query runtime).
