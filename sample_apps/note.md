---
hypernote:
  handles:
    - kind: 1
      state:
        event_target: payload.eventId
  icon: folder.png
  name: Note Viewer
queries:
  note:
    ids:
      - state.event_target
  note_enriched:
    from: queries.note
    pipe:
      - enrich:
          with: queries.profile
          args:
            pubkey: $item.pubkey
          label: profile
  profile:
    args:
      - pubkey
    pipe:
      - first
      - json:
          from: content
          as: parsed
      - get: parsed
    query:
      authors:
        - $pubkey
      kinds:
        - 0
      limit: 1
state:
  event_target: null
dependencies:
  globals:
    - pair
    - state
  queries:
    - note_enriched
---

{{ state.event_target || "Click on an event to load it here!" }}


```each.start
from: queries.note_enriched
as: pair
```

```hstack.start
```
![avatar]({{pair[1].picture}}?w=48)

```vstack.start
width: 464px
```
__[{{ (pair[1].display_name || pair[1].name) || pair[0].pubkey }}](nostr:{{ pair[0].npub || pair[0].pubkey }})__ · _{{ pair[0].created_at | format_date:datetime }}_

```note
event: pair[0]
```

```vstack.end
```

```hstack.end
```


```vstack.start
width: 512px
```
Raw Note:

```json.viewer
source: pair[0]
```

Raw Profile:

```json.viewer
source: pair[1]
```

```vstack.end
```

```each.end
```
