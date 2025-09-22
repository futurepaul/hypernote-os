# Pipe & YAML Cleanup Plan

This plan captures concrete steps for unifying the Hypernote / Hypersauce DSL, informed by the audit and feedback. Each task notes the owner, affected modules, and validation steps (including round-trip compile/decompile against `sample_apps/clock.md`, `sample_apps/feed.md`, and `sample_apps/poast.md`).

## 1. Frontmatter Restructuring
- **Status**: DONE — compiler/runtime and sample apps now use `hypernote`/`queries`/`actions` layout; round-trip tests pass with new schema.
- **Task**: Move queries/actions/components under explicit sections.
  - `hypernote:` metadata (name, icon, etc.).
  - `queries:` map (drop `$` prefix).
  - `actions:` map (drop `@` prefix for user-defined actions).
  - `components:`/`events:` optional future sections.
- **Owner**: Compiler & runtime.
- **Implementation details**:
  - Update `compileMarkdownDoc` to accept both legacy prefixes and the new sections during transition.
  - Update downstream consumers (`AppView`, action runtime) to look up via `queries.<id>`.
  - Retain legacy parsing temporarily with deprecation warnings.
- **Validation**:
  - Round-trip compile/decompile of the three sample apps.
  - Ensure Jotai atoms (`docAtom`, `docActions`) still hydrate correctly under new structure.

## 2. Namespace Reference Sugar
- **Status**: DONE — moustache/action interpolation now resolves `queries.foo`/`user.pubkey`; `$` aliases removed from scope.
- **Task**: Use scoped paths (`queries.feed[0]`) for moustache references and retire `$` sugar.
- **Owner**: `interpolate.ts`, `interp/reference.ts`.
- **Implementation details**:
  - New reference parser resolves dotted/bracket paths; runtime rewrites `queries.*` when emitting Hypersauce docs.
  - Globals expose `user`, `time`, `form` without `$` mirrors.
- **Validation**:
  - Sample apps + default docs updated; round-trip/compile tests cover new syntax.

## 3. Pipe Operation Registry
- **Status**: TODO — awaiting implementation after namespace sugar.
- **Task**: Define a canonical registry describing each pipe op (name, aliases, arguments, availability in YAML/moustache/actions).
- **Owner**: Hypersauce (`pipe-engine.ts`, `dsl.ts`); shared util exported for Hypernote.
- **Implementation details**:
  - Encapsulate argument parsing & validation in registry.
  - Adjust `toPipeOps` to use registry metadata.
  - Update `PipeEngine` to accept registry definitions (checks, default params).
- **Validation**:
  - Unit tests in Hypersauce verifying op parsing.
  - Round-trip tests ensure existing pipelines function.

## 4. Inline Moustache Pipes
- **Status**: TODO — blocked on pipe op registry work.
- **Task**: Enable `{{ expr | op(arg?) }}` syntax, compiling to the same pipe ops.
- **Owner**: `interpolate.ts`, ops registry.
- **Implementation details**:
  - Parse moustache expressions into AST → pipe op array.
  - Support single-argument form initially (`| op`, `| op:arg`). Consider named args later.
  - Convert `||` fallback into `coalesce` pipe.
  - Document available operators (trim, format_date, etc.).
- **Validation**:
  - Unit tests for moustache parser.
  - Update sample apps to demonstrate inline pipes once we have helper functions.

## 5. Helper Function Library
- **Status**: TODO — helper inventory defined but not yet implemented.
- **Task**: Ship built-in helpers accessible in both YAML pipes and moustache.
- **Initial set**: `trim`, `linkify`, `markdown` (string → HTML), `parse_note`, `format_date`, `nip44_decrypt` (wrapping Hypersauce op).
- **Owner**: Hypersauce (pipe registry) + Hypernote (expose to moustache).
- **Implementation details**:
  - Add operations with consistent input/output argument shapes.
  - `nip44_decrypt` should resolve secrets from context or explicit args.
- **Validation**:
  - Unit tests for each helper.
  - Sample apps updated to exercise at least one helper.

## 6. Enrich Alignment
- **Status**: TODO — enrich shape still uses legacy keys.
- **Task**: Normalize `enrich` op across YAML and moustache.
  - Standard shape: `{ op: 'enrich', input: '$queries.feed', query: 'profile', args: { pubkey: '$item.pubkey' }, output: 'profile' }`.
  - Inline moustache form TBD (single-arg pipe or function-style once decided).
- **Owner**: Hypersauce client (`client.ts`) & pipe registry.
- **Implementation details**:
  - Update enrich parsing to expect new keys (keep old ones temporarily with warning).
  - Ensure results merge sensibly into item (maybe attach under `output` key).
- **Validation**:
  - Integration test ensuring enrich populates Feed sample correctly.

## 7. Code Fence Cleanup
- **Status**: TODO — legacy space-based fences still accepted.
- **Task**: Only allow dotted fence syntax (`hstack.start`, `each.start`, `each.end`, etc.).
- **Owner**: Compiler.
- **Implementation details**:
  - Remove space-detection branches; optionally warn when encountered.
- **Validation**:
  - Compiler unit test verifying rejection of legacy syntax.
  - Sample apps updated accordingly.

## 8. Query Filter Merge & Tags
- **Status**: TODO — duplicate tag handling not yet merged.
- **Task**: Merge duplicate tag filters (`#t`, `#p`, etc.) instead of overwriting.
- **Owner**: Hypersauce (`toFilter`).
- **Implementation details**:
  - When encountering same `#x`, concatenate arrays and dedupe.
  - Allow string shorthand for single tag values.
- **Validation**:
  - Unit tests in Hypersauce for merging behaviour.

## 9. Actions Enhancements
- **Status**: TODO — awaiting namespace sugar and pipe registry decisions.
- **Task**: Prepare actions for pipe support and consistent naming.
- **Owner**: `src/state/actions.ts`.
- **Implementation details**:
  - Allow `pipe:` array in action definitions; apply before signing.
  - Remove `@` requirement in button YAML (reserve for built-ins only).
  - Insert TODOs for future features (e.g. autopublishing after transform).
- **Validation**:
  - Action publishing tests (existing ones) updated for new syntax.
  - Sample apps ensure actions still function.

## 10. Schema & Validation
- **Status**: TODO — schema work to follow DSL stabilization.
- **Task**: Produce JSON Schema for Hypernote docs and optionally Zod/Valibot adapters.
- **Owner**: Compiler + tooling.
- **Implementation details**:
  - Schema reflects new structure (namespaces, pipes, components).
  - Provide validation step in build/tests; fail on unknown keys.
  - Record inline moustache pipes as metadata for schema awareness (if feasible).
- **Validation**:
  - Validate sample apps during tests.
  - Ensure schema and runtime stay in sync.

## 11. Tests & Docs
- **Status**: TODO — baseline coverage exists; new scenarios pending feature work.
- **Task**: Expand regression coverage.
  - Each loading fallback, pending sentinel, action interpolation, moustache pipelines.
  - Sample app roundtrips after each major change.
- **Owner**: Both repos.

## 12. Documentation
- **Status**: TODO — audit tracked in README; new DSL spec pending feature completion.
- **Task**: Produce DSL spec in repo (supersede audit once implemented).
  - Include examples for queries, actions, moustache piping, helper usage.

---

### Immediate Next Steps
1. Align namespace structure & drop prefixed keys (`queries:`, `actions:`).
2. Build the pipe operation registry and expose helpers.
3. Implement moustache piping + `||` → `coalesce` rewrite.
4. Update sample apps to new syntax; use them for regression tests.
