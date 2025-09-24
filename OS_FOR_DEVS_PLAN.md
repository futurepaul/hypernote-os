# OS for Devs Plan

Making Hypernote OS fun—and sane—to build on means shipping better tooling in three layers: authoring, runtime insight, and failure recovery. Below is a living checklist of ideas to pursue.

## Authoring UX
- Dedicated "Dev Tools" window that auto-opens when editing: shows current doc metadata, node tree, and resolved references.
- Built-in AST viewer: render both raw Markdown AST and compiled Hypernote AST side-by-side with diffing as you type.
- Query playground: type filters/pipes in a sandbox, preview results, then paste directly into frontmatter.
- Snippets & templates: quick-insert blocks for common patterns (query + enrich, note renderer, actions scaffold) to reduce syntax errors.

## Runtime Visibility
- Per-window query inspector listing each query, its latest payload, and last error; allow replaying or forcing refresh.
- Stream log panel that shows emissions in real time (e.g. `note_enriched -> [event, profile]`).
- Reference resolver overlay: hover a moustache expression to see the resolved value (or error) in place.
- Debug action console: inspect dispatched actions, payloads, and resulting state/form mutations.
- Toggle-able verbose logging levels (runtime vs hypersauce vs renderer) controllable from UI.

## Failure Recovery & Safety Nets
- Error boundaries around every render node with a friendly fallback and console trace.
- Lint pass during compile that flags common mistakes (e.g. `ids` array of strings, missing `$` in enrich args, unknown pipes).
- Dry-run compiler command (`bun run dev-tools validate <file>`) that surfaces issues before publishing.
- Snapshot diffs: show how compiled doc changes relative to last publish to catch accidental breakage.

## Longer Term Enhancements
- Integrated mock data mode so apps can be developed without relays (fixtures for queries/actions).
- Visual query builder that round-trips to YAML frontmatter.
- State time-travel debugger (à la Redux DevTools) for forms/state atoms.
- Live collaboration mode: share a dev session, broadcast logs to collaborators.

## Next Steps
1. Ship node-level error boundaries (in progress) and a minimal per-window query debug panel.
2. Build a command palette entry to open Dev Tools window and wire it into the editor.
3. Scriptable lint/validate command leveraging the compiler for CI and local preflight checks.
4. Iterate on AST viewer mock-ups—decide on the right amount of detail for authors.

_Add more ideas as we discover friction when building sample apps._
