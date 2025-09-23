---
hypernote:
  name: Welcome
  icon: home.png
forms:
  note: ""
state:
  profile_target: user.pubkey
  frontmatter_block: |
    ```yaml
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
        content: "\{{ form.note }}"
        forms:
          note: ""
    ---
    ```
  docs:
    ui_block: |
      ```hstack.start
      width: 320px
      ```
      ![avatar](https://placekitten.com/64/64)

      ```vstack.start
      ```
      **\{{ user.profile?.name || 'Anonymous' }}**
      _\{{ user.profile?.about || 'No bio yet.' }}_

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
      - \{{ item.content }}
      ```each.end
      ```
    button_block: |
      ```button
      text: Post Note
      action: actions.post
      payload:
        published_at: \{{ time.now }}
      ```
---
# Welcome to Hypernote OS

Hypernote apps are written in Markdown with YAML frontmatter. The compiler turns this document into a structured AST, Hypersauce streams queries, and the renderer draws the UI inside draggable windows.

## Quick Start

1. Edit documents under **Apps → Editor**.
2. Frontmatter describes metadata, `queries`, `actions`, optional `forms` and `state`.
3. Use fenced code blocks to add UI nodes (`button`, `input`, `each.start`, `hstack.start`, etc.).
4. Reference data with moustache expressions like `{{ queries.feed[0].content }}`.

## Frontmatter Template

```markdown.viewer
value: {{ state.frontmatter_block }}
height: 260
```

## UI Blocks

```markdown.viewer
value: {{ state.docs.ui_block }}
height: 220
```

- `hstack.start` / `vstack.start` create flex containers.
- `each.start` iterates over data sources:

```markdown.viewer
value: {{ state.docs.each_block }}
height: 200
```

## Actions and System Hooks

- Document actions use the `actions.*` namespace and run within the app.
- OS-level hooks live under `system.*` (e.g. `system.install_app`, `system.set_pubkey`).
- Buttons bind to actions:

```markdown.viewer
value: {{ state.docs.button_block }}
height: 180
```

## Tips

- Use `\{{ time.now | format_date }}` for user-friendly timestamps.
- Enrich data by piping queries (see App Store sample for `enrich` usage).
- Reference local form/state values with `\{{ form.field }}` or `\{{ state.key }}`.
- Test round-trip serialization with `bun test` to ensure your app publishes cleanly.

Explore the other sample apps for working examples, then make it your own!
