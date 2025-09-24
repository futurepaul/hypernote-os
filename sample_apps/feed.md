---
hypernote:
  icon: fax.png
  name: Feed
queries:
  contact_list:
    authors:
      - user.pubkey
    kinds:
      - 3
    limit: 1
    pipe:
      - first
      - get: tags
      - whereIndex:
          index: 0
          eq: p
      - pluckIndex: 1
  feed_enriched:
    from: queries.following_feed
    pipe:
      - enrich:
          with: queries.profile
          args:
            pubkey: $item.pubkey
          label: profile
  following_feed:
    authors: queries.contact_list
    kinds:
      - 1
    limit: 20
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
dependencies:
  globals:
    - feed
  queries:
    - feed_enriched
---


```each.start
from: queries.feed_enriched
as: feed
```

```hstack.start
width: 420px
```
![avatar]({{ feed[1].picture }}?w=48)

```vstack.start
width: 352px
```
__[{{ feed[1].display_name || feed[1].name || feed[0].pubkey }}](nostr:{{ feed[0].npub || feed[0].pubkey }})__ - _{{ feed[0].created_at | format_date:datetime }}_

```note
event: feed[0]
```

```vstack.end
```

```hstack.end
```

---
```each.end
```
