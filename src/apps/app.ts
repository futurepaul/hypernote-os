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
---
Paste your nsec and view profile for {{user.pubkey}}.

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
---
The time is {{time.now}}.
`,
  apps: `---
name: Apps
---
Use the app switcher to activate windows.
`,
  editor: `---
name: Editor
---
Edit app documents on the right; click Save to persist.
`,
};
