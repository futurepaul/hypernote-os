---
hypernote:
  name: Profile
  icon: contact.png
forms:
  pubkey: user.pubkey
state:
  profile_target: user.pubkey
queries:
  profile:
    kinds:
      - 0
    authors:
      - state.profile_target
    limit: 1
    pipe:
      - first
      - json:
          from: content
          as: parsed
      - get: parsed
actions:
  set_profile:
    state:
      profile_target: payload.pubkey
    forms:
      pubkey: payload.pubkey
---

```vstack.start
width: 192px
```
# {{ queries.profile.display_name || queries.profile.name || 'No profile yet' }}

![avatar]({{ queries.profile.picture }}?w=192)

_{{ queries.profile.about || '—' }}_

```input
name: pubkey
text: Paste npub or hex...
```

```button
text: View profile
action: actions.set_profile
payload:
  pubkey: form.pubkey
```

```button
text: View my profile
action: actions.set_profile
payload:
  pubkey: user.pubkey
```

```vstack.end
```
