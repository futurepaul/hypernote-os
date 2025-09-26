---
hypernote:
  name: App Store
  icon: library.png
queries:
  apps:
    kinds:
      - 32616
    "#t":
      - hypernote-application
    limit: 20
    sort: created_at:desc
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
  apps_enriched:
    from: queries.apps
    pipe:
      - enrich:
          with: queries.profile
          args:
            pubkey: $item.pubkey
          label: profile
---
# Hypernote App Store

{{ queries.apps.length }} published apps tagged hypernote 1.2.0.

```each.start
from: queries.apps_enriched
as: app
```
![avatar]({{ app[1].picture || app.profile.picture }}?w=48)

__{{ app[0].parsed.meta.hypernote.name }}__

Version {{ app[0].parsed.version }} • {{ app[1].display_name }}

{{ app[0].parsed.meta.description }}

Published _{{ app[0].created_at | format_date }}_

```button
text: Install
action: system.install_app
payload:
  naddr: "{{ app[0].naddr }}"
```

```button
text: Copy naddr
action: system.copy_to_clipboard
payload: "{{ app[0].naddr }}"
```

```button
text: View raw
action: system.switch_app
payload:
  id: json-viewer
  forms:
    payload: "{{ app[0] | json:2 }}"
```

---

```each.end
```

If no apps appear yet, publish from the editor to populate the store.
