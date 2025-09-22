hypernote:
  name: Feed
  icon: fax.png
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
  feed_enriched:
    from: queries.following_feed
    pipe:
      - enrich:
          with: queries.profile
          args:
            pubkey: $item.pubkey
          label: profile
---


```each.start
from: queries.feed_enriched
as: feed
```

```hstack.start
width: 400px
```
![avatar]({{ feed[1].picture }}?w=48)

```vstack.start
width: 352px
```
__{{ feed[1].display_name || feed[1].name }}__ - {{ feed[0].created_at }}

{{ feed[0].content }}
```vstack.end
```

```hstack.end
```

---
```each.end
```
