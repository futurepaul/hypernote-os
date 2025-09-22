export const defaultApps: Record<string, string> = {
  profile: `---
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

{{ queries.profile.about || '—' }}

Showing profile for \`{{ user.pubkey || 'unsigned user' }}\`
`,
  wallet: `---
hypernote:
  name: Wallet
  icon: settings.png
---
# $60

\`\`\`hstack.start
\`\`\`

\`\`\`button
text: Send
action: @send
\`\`\`

\`\`\`button
text: Receive
action: @receive
\`\`\`

\`\`\`hstack.end
\`\`\`
`,
  apps: `---
hypernote:
  name: Apps
  icon: folder.png
---
Use the app switcher to activate windows.
`,
  'app-store': `---
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

\`\`\`each.start
from: queries.apps_enriched
as: app
\`\`\`
![avatar]({{ app[1].picture || app.profile.picture }}?w=48)

### {{ app[0].parsed.meta.hypernote.name }}

Version {{ app[0].parsed.version }} • {{ app[1].display_name }}

{{ app[0].parsed.meta.description }}

\`\`\`button
text: Install
action: "@install_app"
payload:
  naddr: "{{ app[0].naddr }}"
\`\`\`

\`\`\`each.end
\`\`\`

If no apps appear yet, publish from the editor to populate the store.
`,
  editor: `---
hypernote:
  name: Editor
  icon: edit.png
---
Edit app documents on the right; click Save to persist.
`,
  system: `---
hypernote:
  name: System Menu
  icon: settings.png
---
System-wide actions.
`,
};
