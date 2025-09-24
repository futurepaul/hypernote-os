---
hypernote:
  name: Note Viewer
  icon: folder.png
  handles:
    - kind: 1
      state:
        event_target: payload.eventId
state:
  event_target: null
queries:
  note:
    kinds:
      - 1
    ids:
      - state.event_target
    limit: 1
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
      - merge:
          parsed: parsed
  note_enriched:
    from: queries.note
    pipe:
      - enrich:
          with: queries.profile
          args:
            pubkey: $item.pubkey
---
```each.start
from: queries.note_enriched
as: pair
```

__[{{ (pair[1] && pair[1].display_name) || (pair[1] && pair[1].name) || pair[0].pubkey }}](nostr:{{ pair[0].npub || pair[0].pubkey }})__ · _{{ pair[0].created_at | format_date:datetime }}_

```note
event: pair[0]
profile: pair[1]
```

```each.end
```
