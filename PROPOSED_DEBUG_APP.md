# Proposed Debug App: Query Inspector

### Goal
Ship an OS-native panel that shows every query registered for a window—status, payload, last emission, errors—so authors can debug without cracking open the console. This builds on the node-level error boundaries we just shipped.

---

## Surface & Navigation
- **Dev Tools Window**: new Hypernote doc (hidden by default) that opens via command palette (`⌘K → Open Dev Tools`) or a footer button in the editor.

PAUL: we should make it accessible from the app, next to the "edit" button.

- **Layout**: two-pane view. Left column lists windows + queries; right column shows payload JSON, emission log, and quick actions.

PAUL: I don't think we need to make it support multiple windows. It should be specific to one app. you click debug on an app and it opens the debugger just for that app.

- **Window Selector**: filter/sort by window name; highlight the active window, allow jumping directly to it.

PAUL: not needed, see above

## Data Flow
- Add `windowQueryDebugAtom(windowId)` capturing `{ status, lastEmission, lastError, samples[] }`.
- Runtime’s `wrapStream` updates this atom on `subscribe`, `next`, `error`, and `complete`—no extra subscriptions required.
- Store a bounded emission log (e.g., last 10 snapshots with timestamps) per query inside the debug atom.
- Expose a selector `windowDebugSnapshotAtom(windowId)` that merges stream keys, debug metadata, and current scalar values.

## UI Details
- **Query Table**: rows show query id, status (loading/ready/error), last emission age, array length/count.

PAUL: can this be based on hypersauce's compiled query graph?

- **Payload Viewer**: collapsible JSON (MVP can use `<pre>` + `JSON.stringify`, upgrade later).

PAUL: this is probably the most important part!

PAUL: we should also make a json.viewer node in nodes so we can do ```json.viewer and debug what data we're getting from inside the app as well

- **Emission Log**: timestamped list of last N emissions with size hints (e.g., “13:04:12 · 4 rows”).
- **Quick Actions**:
  - `Refetch` (re-run query by bumping `queryEpochAtom`).
  - `Copy payload` to clipboard.
  - Toggle runtime logging level (flips debug atom the runtime already reads).
- Stretch: “Replay emission” to re-deliver the last payload to the app without hitting the network.

PAUL: the queryEpochAtom was kind of a hack I don't know if we should rely on it. the ```json.viewer should def have a copy button though that would be great.

PAUL: the big thing this is missing is an AST viewer. we should be able to see the DocIR that we've compiled to.

## Implementation Steps
1. **State Layer**
   - Extend `src/state/queriesAtoms.ts` with `windowQueryDebugAtom` and helper selectors.
   - Update `wrapStream` in `src/queries/runtime.ts` to write debug updates (subscribe/next/error/completion).
   - Guard store writes with `try/catch` so diagnostics never crash the runtime.
2. **Dev Tools Doc**
   - Add `sample_apps/dev-tools.md` with metadata marking it as a system app (hidden toggle).
   - Content renders query data via moustache expressions (`queries.debug.window.<id>`).
3. **React Components**
   - Create `QueryInspectorPanel.tsx`, consuming the debug snapshot selector and rendering the two-pane UI.
   - Wire into `AppView` so when doc id is `dev-tools` it renders the panel instead of Markdown.
4. **Navigation Hooks**
   - Add palette command + footer button to open the Dev Tools window; auto-open when editing if debug mode is enabled.
5. **Documentation**
   - Update `sample_apps/welcome.md` (Debugging section) with instructions on accessing the inspector.

## Future Enhancements
- AST viewer + node dependency tree alongside the query inspector.
- Live reference resolver (hover moustache expression to see value/error).
- Mock data mode so queries can be populated without relay access.
- Export query snapshots for bug reports.

---
Feedback welcome—happy to adjust scope or priorities before implementation.
