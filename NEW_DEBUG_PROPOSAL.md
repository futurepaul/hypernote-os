# New Debugging & Dev-Tooling Proposal

This plan folds in your inline feedback. We’ll deliver tooling in four stages, each building on the last, and tackle compiler diagnostics alongside stage 1.

---

## Stage 1 – JSON Viewer Node & Debug App

### 1A. `json.viewer` Node
- **Purpose**: let authors drop a fence block in any app to inspect arbitrary data (queries, state, forms, globals) in-place.
- **Syntax**:
  ```
  ```json.viewer
  source: queries.feed
  maxDepth: 4        # optional
  collapsed: false   # optional
  ```
  ```
- **Implementation**:
  - Extend compiler/decompiler/types to recognise `json.viewer` fences (`type: "json_viewer"`).
  - Render component that evaluates `source` via `buildPayload` and feeds it to a new `JsonViewer` React component (think `<pre>` with collapsible children). Allow copy-to-clipboard button.
  - Support optional props (`maxDepth`, `collapsed`, `label`, etc.) to tune rendering.

### 1B. JSON Viewer App (single-window)
- **Purpose**: standalone app to inspect any JSON payload, using the same viewer component.
- **Handles**:
  ```yaml
  handles:
    - label: Inspect JSON
      forms:
        payload_json: payload.value
  ```
- **UI**: simple layout with textarea input and rendered JSON viewer below; include buttons for “Format”, “Copy”.
- **Usage**: editor/devs can open the app, paste data, or wiring other apps to launch it with a payload.

### 1C. Compiler Diagnostics Upgrade
- **Goal**: surface meaningful errors in the editor panel on save instead of cryptic runtime crashes.
- **Work**:
  - Expand compiler validation: check pipes against allowlist, ensure required fields exist, detect unknown node properties, catch YAML type mismatches.
  - Return structured error objects (`{ message, location (line/column), help }`).
  - Update `EditorPanel` to display compile errors inline (banner + jump-to-line).
  - Add CLI command (`bun run hypernote lint <doc>`) to reuse the validation in CI.

### Deliverables for Stage 1
- `json.viewer` node (compiler/types/components/tests).
- `sample_apps/json-viewer.md` showcasing the node & app.
- Enhanced compiler error surfacing (editor + CLI).

---

## Stage 2 – AST Viewer App & App-ID UX

### 2A. App-ID Visibility
- Show the active doc ID in the editor header (e.g., “Editing `feed`”).
- Add “Copy App ID” button next to “Edit” in window chrome and in app launcher entries.

### 2B. AST Viewer App
- **Purpose**: inspect the compiled DocIR for any app; output is JSON so it reuses the `json.viewer` node/app.
- **Inputs**:
  - Handle that accepts `{ appId }` and loads the compiled doc from cache/compile.
  - Optionally let user type an app ID.
- **Implementation**:
  - Expose a selector `compiledDocAtom(id)` (already exists) and feed its `doc` output into the viewer.
  - Present metadata (version, nodes count) plus the raw JSON tree via `json.viewer`.

---

## Stage 3 – Multi-Window Apps

### 3A. Window Multiplicity API
- Extend Hypernote metadata to declare `multiWindow: true` or similar, allowing multiple instances to exist simultaneously.
- Update window manager to treat such apps differently: launching again opens a new window with its own state/forms atoms keyed by `windowInstanceId`.

### 3B. Editor & AST Viewer Multi-Window Support
- Adopt the new API for the Markdown editor (so “Edit” on another app spawns a second editor window).
- Do the same for the AST viewer so you can inspect multiple apps side by side.
- Ensure handles/actions can target specific instances (scoped intent/state).

---

## Stage 4 – Query Graph Viewer

### 4A. Hypersauce Graph Exposure
- Use Hypersauce’s existing `composeDocQueries(..., { onDebug })` output to capture the compiled graph (routes, pipes, enrich edges).
- Store that metadata per window (reuse the debug atom infrastructure from Stage 1 for logs).

### 4B. Query Graph App
- App consumes `{ appId }`, builds/loads the query graph via runtime helper, and visualises it.
- MVP: render the graph as JSON using `json.viewer` plus a text summary (e.g., “feed_enriched → enrich(profile)”).
- Stretch: add a force-directed visual in the future, but JSON + table is enough initially.

---

## Supporting Work – Robust Compile Errors
- While Stage 1 focuses on the editor, continue hardening the compiler:
  - Maintain a canonical list of pipe ops and node props with helpful suggestions (“Did you mean `first`?”).
  - Catch invalid moustache expressions early (bad references, missing `$item` etc.).
  - Emit actionable messages with doc/line info consumed by the editor and the CLI validator.

---

## Summary Roadmap
1. **Stage 1**: `json.viewer` node & app, improved compiler diagnostics, copy buttons.
2. **Stage 2**: Surfaced app IDs + AST viewer app (built on JSON viewer).
3. **Stage 3**: Multi-window app API; apply to editor and AST viewer.
4. **Stage 4**: Query graph viewer app leveraging runtime debug data.

Each stage is shippable on its own and adds immediate value for app authors, while laying the groundwork for richer tooling down the line.
