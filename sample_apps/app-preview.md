---
hypernote:
  name: App Preview
  icon: search.png
  handles:
    - kind: 32616
      state:
        app_identifier: payload.identifier
        app_pubkey: payload.pubkey
        app_naddr: payload.naddr || payload.value
queries:
  app:
    kinds:
      - 32616
    authors:
      - state.app_pubkey
    "#d":
      - state.app_identifier
    limit: 1
    pipe:
      - json:
          from: content
          as: parsed
  profile:
    args:
      - pubkey
    query:
      kinds:
        - 0
      authors:
        - $pubkey
      limit: 1
    pipe:
      - first
      - json:
          from: content
          as: parsed
      - get: parsed
  app_enriched:
    from: queries.app
    pipe:
      - enrich:
          with: queries.profile
          args:
            pubkey: $item.pubkey
          label: profile
state:
  app_identifier: null
  app_pubkey: null
  app_naddr: null
dependencies:
  globals:
    - state
  queries:
    - app_enriched
---
# App Preview

```if.start
value: queries.app_enriched.length
```

```each.start
from: queries.app_enriched
as: app
limit: 1
```

```vstack.start
gap: 16px
```

```hstack.start
gap: 16px
align: flex-start
```
![avatar]({{ app[1].picture || app.profile.picture }}?w=64)

```vstack.start
gap: 8px
```
__{{ app[0].parsed.meta.hypernote.name || "Untitled App" }}__

Version {{ app[0].parsed.version || "unknown" }} • {{ app[1].display_name || app.profile.display_name || app[0].pubkey }}

{{ app[0].parsed.meta.hypernote.description || "No description provided." }}

Published _{{ app[0].created_at | format_date }}_

```hstack.start
gap: 12px
```
```button
text: Install
action: system.install_app
payload:
  naddr: "{{ state.app_naddr || app[0].naddr }}"
```

```button
text: View raw
action: system.switch_app
payload:
  id: json-viewer
  forms:
    payload: "{{ app[0] | json:2 }}"
```

```hstack.end
```

```vstack.end
```

```hstack.end
```

```grid.start
gap: 16px
columns: repeat(2, minmax(0, 1fr))
```
```json.viewer
label: Parsed Meta
source: app[0].parsed.meta
maxDepth: 6
```

```json.viewer
label: Raw Event
source: app[0]
maxDepth: 6
```
```grid.end
```

```vstack.end
```

```each.end
```

```if.else
```
Launch this app from a `nostr:naddr` link to preview its metadata and install it.

```if.end
```
