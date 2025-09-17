---
name: Profile
"$profile":
  kinds: [0]
  authors: [user.pubkey]
  limit: 1
  pipe:
    - first
    - json: { from: content, as: parsed }
    - get: parsed
---
Paste your nsec and view profile for {{user.pubkey}}.

# Name: {{ $profile.name }}

![avatar]($profile.picture)

```input
text: Paste nsec or npub here...
```

```button
text: Load Profile
action: @load_profile
```
