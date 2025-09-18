export const defaultApps: Record<string, string> = {
  profile: `---
name: Profile
"$profile":
  kinds: [0]
  authors: [user.pubkey]
  limit: 1
  pipe:
    - first
    - json: { from: content, as: parsed }
    - get: parsed
icon: contact.png
---
Paste an npub to view a profile.

# Name: {{ $profile.name }}

![avatar]($profile.picture)

\`\`\`input
name: pubkey
text: Paste nsec or npub here...
\`\`\`

\`\`\`button
text: Load Profile
action: @load_profile
\`\`\`
`,
  wallet: `---
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
  clock: `---
name: Clock
icon: clock.png
---
The time is {{time.now}}.
`,
  apps: `---
name: Apps
icon: folder.png
---
Use the app switcher to activate windows.
`,
  'app-store': `---
name: App Store
icon: folder.png
"$apps":
  kinds: [32616]
  "#t": ["hypernote-application"]
  limit: 20
  sort: created_at:desc
"$profile":
  args: [pubkey]
  query:
    kinds: [0]
    authors: [$pubkey]
    limit: 1
  pipe:
    - first
"$apps_enriched":
  from: $apps
  pipe:
    - enrich:
        with: $profile
        args:
          pubkey: $item.pubkey
        label: profile
---
# Hypernote App Store

{{ $apps.length }} published apps tagged hypernote 1.2.0.

\`\`\`each
from: $apps_enriched
as: app
\`\`\`
{{ app.publisherImageMarkdown }}

### {{ app.name }}

Version {{ app.version }} • {{ app.publisherName }}

{{ app.description }}

\`\`\`button
text: Install
action: "@install_app"
payload:
  naddr: "{{ app.naddr }}"
\`\`\`

---
\`\`\`each.end
\`\`\`

If no apps appear yet, publish from the editor to populate the store.
`,
  editor: `---
name: Editor
icon: edit.png
---
Edit app documents on the right; click Save to persist.
`,
  system: `---
name: System Menu
icon: folder.png
---
System-wide actions.
`,
};
