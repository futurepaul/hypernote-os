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
