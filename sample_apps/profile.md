---
hypernote:
  name: Profile
  icon: contact.png
queries:
  profile:
    kinds:
      - 0
    authors:
      - user.pubkey
    limit: 1
    pipe:
      - first
      - json:
          from: content
          as: parsed
      - get: parsed
---
# {{ queries.profile.display_name || queries.profile.name || 'No profile yet' }}

![avatar]({{ queries.profile.picture }})

_{{ queries.profile.about || '—' }}_

`{{ user.pubkey || 'unsigned user' }}`