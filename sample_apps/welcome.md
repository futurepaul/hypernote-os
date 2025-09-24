---
hypernote:
  name: Welcome
  icon: home.png
forms:
  note: ""
state:
  profile_target: user.pubkey
  frontmatter_block: |
    ---
    hypernote:
      name: My App
      icon: folder.png
    forms:
      note: ""
    state:
      profile_target: user.pubkey
    queries:
      feed:
        kinds: [1]
        authors: [user.pubkey]
    actions:
      post:
        kind: 1
        content: {{ form.note }}
        forms:
          note: ""
    ---
  docs:
    ui_block: |
      ```hstack.start
      width: 320px
      ```
      ![avatar](https://placekitten.com/64/64)

      ```vstack.start
      ```
      **{{ user.profile?.name || 'Anonymous' }}**
      _{{ user.profile?.about || 'No bio yet.' }}_

      ```button
      text: Install example app
      action: system.install_app
      payload:
        naddr: "naddr1...."
      ```

      ```vstack.end
      ```
      ```hstack.end
      ```
    each_block: |
      ```each.start
      from: queries.feed
      as: item
      ```
      - {{ item.content }}
      ```each.end
      ```
    button_block: |
      ```button
      text: Post Note
      action: actions.post
      payload:
        published_at: {{ time.now }}
      ```
---
# Welcome to Hypernote OS

Hypernote OS is a OS-in-the-browser for doing nostr stuff and having a good time. Hypernote apps are simple to write and can be published to nostr. Make your own apps and share them with your friends!

## How it works

Hypernote apps are written in Markdown with YAML frontmatter. They get compiled to a structured AST. This AST can then be published to nostr as a `{ version, meta, ast }` JSON object (kind 32616). When you run an app the AST is parsed into queries, actions, and UI nodes. The queries are resolved using Hypersauce and the UI nodes are rendered using React.

## Quick Start for Building Apps

1. Edit documents under **Apps → Editor**.
2. Frontmatter describes metadata, `queries`, `actions`, optional `forms` and `state`.
3. Use fenced code blocks to add UI nodes (`button`, `input`, `each.start`, `hstack.start`, etc.).
4. Reference data with moustache expressions like `{{ queries.feed[0].content }}`.

## Frontmatter Template

```markdown.viewer
value: {{ state.frontmatter_block | trim }}
height: 460
```

## UI Blocks

```markdown.viewer
value: {{ state.docs.ui_block | trim }}
height: 500
```

- `hstack.start` / `vstack.start` create flex containers.
- `each.start` iterates over data sources:

```markdown.viewer
value: {{ state.docs.each_block | trim }}
height: 200
```

## Actions and System Hooks

- Document actions use the `actions.*` namespace and run within the app.
- OS-level hooks live under `system.*` (e.g. `system.install_app`, `system.set_pubkey`).
- Buttons bind to actions:

```markdown.viewer
value: {{ state.docs.button_block | trim }}
height: 180
```

## Tips

- Use `\{{ time.now | format_date }}` for user-friendly timestamps.
- Enrich data by piping queries (see App Store sample for `enrich` usage).
- Reference local form/state values with `\{{ form.field }}` or `\{{ state.key }}`.
- Test round-trip serialization with `bun test` to ensure your app publishes cleanly.

## Built-in Nodes & Nostr Links

- ```note``` renders a nostr event body. Pass the event in `event:` and optionally a profile map in `profile:` if you want the renderer to draw avatar/name/timestamp. When `profile` is omitted the node emits just the parsed content.
- ```json.viewer``` prints any value as formatted JSON. Pass `source:` (e.g. `queries.feed`) and optional `label`, `maxDepth`, or `collapsed`. Handy for debugging state inside an app.
- Markdown links support the `nostr:` scheme. Examples:
  - `[View profile](nostr:{{ queries.feed[0].npub }})`
  - `[Open note](nostr:{{ queries.feed[0].nevent }})`
  - `[Launch app](nostr:{{ queries.feed[0].naddr }})`

Links automatically dispatch `system.switch_app` based on the decoded payload, so apps can lean on OS-level handlers instead of wiring bespoke buttons.

Explore the other sample apps for working examples, then make it your own!
