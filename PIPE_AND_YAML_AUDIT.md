# Pipe & YAML Audit

This document surveys the current Hypernote / Hypersauce DSL surfaces (frontmatter, code fences, pipelines, actions, and moustache interpolation), points out inconsistencies, and proposes directions to simplify and future‑proof the stack. References are to the Hypernote OS repo unless explicitly noted.

## 1. Surfaces & Responsibilities

| Surface | Definition | Notes |
| --- | --- | --- |
| Frontmatter meta | `src/compiler.ts` (parsed with `yaml`) | Houses namespaced Nostr query definitions (`queries:` map), actions (`actions:` map), and arbitrary metadata like `icon`/`name`. |
| Code fences | ` ```button`, ` ```input`, ` ```each.start`, etc. | Produce UI nodes with YAML payloads (`safeParseYamlBlock`). Multiple spellings exist (e.g. `hstack start` vs `hstack.start`). |
| Runtime queries | `hypersauce/dsl.ts`, `types.ts`, `client.ts` | `QueryDefinition` mixes filter fields (`kinds`, `authors`, `#t`, …) with pipe transform stages. |
| Pipe engine | `hypersauce/pipe-engine.ts` | Executes array of imperative ops (`get`, `first`, `json`, `kvconnect_pick`, …). |
| Actions | `actions:` map in frontmatter → `src/state/actions.ts` | Templates for Nostr events; interpolated with `{{ }}` and the shared reference resolver. |
| Moustache interpolation | `src/interp/interpolate.ts` | Replaces `{{ expr }}`; supports `||` fallback, `queries.foo[0]`/`user.pubkey` paths. No inline piping yet. |

## 2. Current Inconsistencies & Redundancies

### 2.1 Query positioning
- Queries should live under a `queries:` block (no `$` prefix) alongside `actions:`.
- Components (`#component`) and events (`@event`) follow the same prefix convention as queries. Mixing top-level prefixed keys with nested maps makes scanning harder.

**Idea**: consolidate under namespaced sections. Example:
```yaml
queries:
  feed:
    kinds: [1]
    authors: queries.contact_list
    pipe: [...]
actions:
  post_note:
    kind: 1
    content: "{{ form.note }}"
```
Compiler can accept old prefixes for now but warn, or we cut over pre-launch.

PAUL: yes, this looks good to me. I like that it removes the `$` prefix! do we even need the prefix for queries.contact_list? removing these prefixes makes it easier to write yaml (don't need to quote strings with prefixes that yaml chokes on)

### 2.2 Terminology drift
- `each.start` YAML expects `from` *or* `source`. Downstream (`EachNode`) normalizes to `source` (`src/components/nodes.tsx:282`).
- `json` pipe uses `{ from, as }`; `nip44_decrypt` uses `{ from?, as? }`; `map` uses a `field`; `kvconnect_pick` uses `id`/`criteria`. Consistent naming (e.g. always `{ input, output }`) would boost clarity.
- `get` vs inline moustache `queries.feed[0].content` vs stack config `width:` vs `height:` etc.

**Idea**: adopt shared vocabulary:
- `input`/`output` (or `source`/`target`) for transforms.
- Reserve `from` for query IDs (`each`, `enrich`, future `use` blocks).
- Encourage singular keys (`as`, `into`, etc.) across pipelines and `enrich` specs.

PAUL: I like input / output a lot! `from` for query ids makes a lot of sense. and sure singular keys.

### 2.3 Multiple spellings
- Code fences previously accepted both `hstack.start` and `hstack start`; same for `each`. As of the latest compiler pass only dot notation is accepted, and we keep a temporary compatibility shim for bare ` ```each` blocks until sample docs are migrated.
- Frontmatter tags use `#t` arrays, but toFilter simply assigns `filter['#t'] = v`; no merging of multiple tag lists. Adding two `#t` entries silently overwrites.

PAUL: yes please get rid of `hstack start` and `each start`! they should always have a dot notation.

### 2.4 Pipes wired only in YAML
- Pipe definitions live under `query.pipe`. Moustache interpolation can only use `||` fallback. No inline piping (`{{ queries.note.content | parse_note }}`) or chained transforms in actions/templates.
- `PipeEngine` already implements stateless transforms; we can expose them to moustache by compiling `| op` expressions into the same op list.

PAUL: I like the suggestion of compiling everything in mustache into pipes so we can use all the same ops and syntax. and I like the idea of compiling `||` into coalesce!

### 2.5 Actions vs Queries
- Actions live under the `actions:` map, and buttons should invoke them via `action: actions.post_note`. System wires use `system.install_app`. Avoid legacy `@action` shorthands.
- Actions support nested `pipe` just like queries? No—they run interpolation only. If we add moustache piping, actions inherit automatically.

PAUL: since we're getting rid of the prefix in the frontmatter let's get rid of it in the markup as well! (`post_note`) ... we could reserve `@` prefix for global actions that rely on os-level functionality that's not defined in the note.
PAUL: actions WILL eventually need pipe queries to do data transforms / pull data from the queries before posting. I don't have a good example use yet but we should at least keep this in mind and put comments in the code where this would go!

### 2.6 Async enrich & loading state
- `enrich` pipe is handled in Hypersauce `client.ts` with parameterized queries. YAML shape is `{ enrich: { with: queries.profile, args: { pubkey: item.pubkey }, label: profile } }`.
- No way to re-use enrich results in moustache aside from `item[1].profile`. Aligning this with the general pipe/moustache story would be nice.

PAUL: enrich is kind of a weird guy. we should align it with pipes/moustache. are you saying we have to pull this out of hypersauce? my ideal world is we move MORE stuff to hypersauce so it's useful for other clients down the road. (hypernote os is just one way of interacting with hypernote!)

## 3. Opportunities for Simplification

### 3.1 One declarative root
Adopt a single frontmatter schema:
```yaml
hypernote:
  name: Feed
  icon: fax.png
queries:
  contact_list:
    kinds: [3]
    authors: [user.pubkey]
    limit: 1
    pipe:
      - first
      - json: { from: content, into: tags }
      - filter: { field: tags.0, eq: "p" }
      - pluck: { field: tags.1 }
  feed:
    kinds: [1]
    authors: queries.contact_list
    pipe:
      - enrich: { with: queries.profile, args: { pubkey: item.pubkey } }
actions:
  post_note:
    kind: 1
    content: "{{ form.note | trim }}"
```
- Explicit namespaces reduce string-prefix magic (`$feed` → `queries.feed`).
- Lets us introduce metadata per section (`queries` default relays, `actions` default tags, etc.).

PAUL: I LOVE the idea of prefixing stuff with `queries.` and get rid of the kind of ambiguous `$` prefixing if at all possible! it's kind of a convention in js for "reactive" stuff... but everything we're doing is reactive so it might be kind of redundant and it's sort of mysterious right now when it's needed. (also mysterious right now where it's optional! there should only be one way!) 

### 3.2 Shared piping everywhere
- Extend moustache parser to support `|` with existing `PipeEngine` ops: `{{ queries.note.content | nip44_decrypt(secret=user.secret) | parse_note }}`.
  - Re-use `toPipeOps` by accepting inline syntax either as strings (`"nip44_decrypt"`) or JS-like call `nip44_decrypt(secret=user.secret)`. For moustache we can compile to JSON representation before handing to engine.
- YAML pipelines (`query.pipe`, future `actions.pipe`) and moustache inline pipes should share the same registry and argument schema.
- Introduce `pipe.aliases` table for operations that differ today (`pluckIndex` vs `pluck`, `map` vs `get` etc.).

PAUL: I don't like the js-like call `nip44_decrypt(secret=user.secret)` if we can't do it with a simple pipe op then it's not gonna be fun (the discovery is really bad for arg names). let's stay married to pipes!
PAUL: DEF want one registry for query.pipe, actions.pipe, and moustache inline pipes! that's vital!
PAUL: it makes sense to do aliases just for a little bit but we should delete it once I've republished all my current apps with the correct syntax, so keep a list of changes somewhere so I can refer to it and get on the new syntax asap!

### 3.3 Operation naming / grouping
- Group pipeline ops by function: **indexing** (`first`, `take`, `skip`), **shape** (`map`, `get`), **parsing** (`json`, `parse_note`), **crypto** (`nip44_decrypt`, future `nip44_decode`/`nip04`), **data** (`match`, `kvconnect_pick`).
- Rename ambiguous ops: `pluckIndex` → `pluck_at`, `whereIndex` → `filter_at`, `map` → `map_field`.
- Standardize argument keys: `index` vs `indices`, `field` vs `from`. Maybe adopt `input`/`output` to avoid context confusion.

PAUL: groups make sense to me. renames make sense to me. standardize argument keys makes sense to me. args names will be especially hard for authors to discover so we should use them as sparingly and as consistently as possible!

### 3.4 Query filters
- Currently `authors` accepts string or array; `#p`/`#t` only accept arrays. We should support string shorthand for tags too (compiler normalizes to array).
- Document multi-tag semantics: if a query needs multiple `#t` arrays they currently collide. Proposal: allow object syntax `tags: { t: ['foo','bar'], r: [...] }` which `toFilter` expands.
- Investigate whether `authors` referencing another query via namespace should be explicit (e.g., `queries.contact_list`) to avoid confusion with moustache paths.

PAUL: I actually prefer it if we require array for both... that's typical for nostr. your choice on best way to handle multi-tag but it should work!
PAUL: referencing another query should use path / pipe access just like in mustache!

### 3.5 Built-in helpers & functions
- Add canonical helper library (pure functions) for moustache + pipes: `trim`, `markdown`, `parse_note`, `linkify`, `emoji`. Could be built as pipe ops but also available inline.
- Provide consistent `nip44_decrypt`/`nip44_encrypt` operations: both as pipe ops and moustache functions, without requiring manual path lookups.
- For decrypt operations requiring secret keys, standardize how secrets are resolved (context path vs inline args). Maybe `nip44_decrypt(secret=user.secret, pubkey=item.pubkey)`.

PAUL: I like linkify, trim, markdown, parse_note. not sure what emoji is. we should also have a format_date that returns date and time (no extra args! just takes the timestamp!)

### 3.6 Enrich & compose
- Treat `enrich` as first-class pipe op with structured arguments: `{ op: 'enrich', query: 'queries.profile', args: { pubkey: 'item.pubkey' }, as: 'profile' }`.
- Support `with` (existing) and `assign` (brown?). Align naming with proposed `input`/`output` pattern.
- Allow moustache inline: `{{ queries.feed | enrich:queries.profile(pubkey=item.pubkey) }}` which returns `[item, enriched]` or merges into object.

PAUL: not sure what assign is for. but yes do align naming
PAUL: maybe it would be best if moustache only supports pipes with single args? I'm trying to avoid this function syntax but it is kind of nice for this use case! argh!

### 3.7 Actions
- Bring actions syntax inline with query pipelines: allow `pipe` inside action definitions for stuff like auto-tagging, encryption, or note parsing.
- Expose moustache pipe functions in actions (so `content: "{{ form.note | markdown_to_json }}"`).
- Provide consistent resolution for `tags`: ability to specify dynamic values with moustache or pipe operations.

PAUL: yes actions need pipes!
PAUL: I think a better example is your `trim` example for this. but good idea (right now the only reason to turn markdown into json is actually hypernote itself... eventually if we make an editor defined in hypernote we will need this!

## 4. Potential “Crazy” Simplifications

1. **Single declarative AST**: Instead of separate frontmatter + fences, move to a single YAML/JSON AST (`structured markdown`). Each node defined as YAML (type, props, children). Markdown blocks become a `text` node. This would drop the ad-hoc code fence parsing entirely. (Radical but consistent.)

PAUL: I wish we could do this but it's too annoying to edit big multi-line markdown strings as a yaml node

2. **Pipe-first moustache**: Invert moustache from template strings to pipe expressions—e.g., `${ feed[0].content | parse_note | markdown }`. Would require new parser but aligns UI + action transformations.

PAUL: can you explain this a bit better? I'm interested!

3. **Query composer**: Replace ad-hoc `pipe` arrays with a tiny query language (like jq-lite). Example: `pipe: "first | json(content)->parsed | map(parsed.tags[1])"`. We can gradually expose to moustache as well.

PAUL: I'm tempted by this, especially now that we're introducing a lot of functions to our pipes... can you outline how big of a lift this change would be? and would it still compile to our same pipe ops we've been working on?

4. **Strict schema checking**: Generate TypeScript schema from YAML spec; validate frontmatter with Zod/Valibot at compile time. Helps keep DSL from drifting.

PAUL: absolutely. we should build a json schema for our entire hypernote. one sad thing is we can't "uplift" all of our markdown inline pipes into query / action pipes in the frontmatter because I want roundtrip compiles to work. I guess we could do a new section called "inline_queries" / "inline_actions" and then reinsert them on decompile. thoughts? 

5. **Remove multiple syntaxes**: Drop support for space-separated fence suffixes, `source:` alias, `actions` leading `@`, etc., before launch.

PAUL: AGREED.

## 5. Immediate Fixes / Improvements

- [x] Fixed: loading sentinel now clears, windows honour min width.
- [ ] Align fence syntax to `block.kind`. Update compiler to warn on the space form, then remove.
- [ ] Expand `toFilter` to merge duplicate `#` tag filters instead of overwriting.
- [ ] Add regression tests covering `actions:` interpolation, `each` loading fallback, and new pending sentinel behaviour.
- [ ] Introduce centralized registry for pipe operations (with metadata: name, args, availability in moustache vs YAML).
- [ ] Document DSL in repo (`PIPE_AND_YAML_AUDIT.md` is the start).

## 6. Suggested Roadmap

1. **Schema pass**: Finalize frontmatter shape (`hypernote`, `queries`, `actions`). Update compiler + runtime accordingly.
2. **Pipe registry**: Build an object describing each op (name, aliases, arity). Use it for YAML parsing and moustache piping.
3. **Moustache piping**: Extend `interpolate.ts` parser to recognize `expr | op(args)` using the registry. Ensure fallback `||` still works by compiling to `coalesce`.
4. **Function library**: Ship default helpers (`parse_note`, `trim`, `linkify`, `nip44_decrypt`, etc.).
5. **Tag merging fix**: Update Hypersauce `toFilter` to merge arrays and document behaviour.
6. **Docs/tests**: Publish a DSL spec, add tests in both hypernote-os and hypersauce for new behaviours.

---

This audit should make it easier to reason about future features (e.g., nostr note parsing, piped decrypt/AST transforms) while keeping the surface area small and consistent.
