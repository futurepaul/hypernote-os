---
hypernote:
  name: Note Viewer
  icon: folder.png
  handles:
    - kind: 1
state:
  event_target: payload.eventId
queries:
  note:
    ids:
      - state.event_target
    limit:
      - 1
  profile:
    args:
      - pubkey
    query:
      kinds:
        - 0
      authors:
        - pubkey
      limit: 1
    pipe:
      - first
      - json:
          from: content
          as: parsed
      - get: parsed
  note_enriched:
    from: queries.note
    pipe:
      - enrich:
          with: queries.profile
          args:
            pubkey: $item.pubkey 
---
Hello from note-viewer?

{{ state.event_target }}

{{ queries.note_enriched }}

```each.start
from: queries.note_enriched
as: note
```

__[{{ note[1].display_name || note[1].name || note[0].pubkey }}](nostr:{{ note[0].npub || note[0].pubkey }})__ - _{{ note[0].created_at | format_date:datetime }}_

```note
event: note[0]
```

```each.end
```
