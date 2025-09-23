# GENIE Findings

Scales used below:
- **Difficulty** gauges engineering effort with today’s Hypernote OS code: *Low* (fits existing primitives), *Medium* (needs new wiring but matches current architecture), *High* (demands new subsystems or external integrations), *Very High* (multiple hard problems / product design).
- **Expressive Power** reflects how much the feature unlocks for app authors and the broader Nostr audience: *Low*, *Medium*, *High*, *Transformative*.

For each wishlist item I call out present blockers, likely implementation path, and who benefits.

## Progress Tracker
- [x] 1 — System exposes `system.apps` data for Hypernote docs
- [x] 2 — Added `system.switch_app` with payload + capability routing
- [x] 3 — Apps switcher now authored in Markdown (`sample_apps/apps.md`)
- [x] 4 — Apps declare `hypernote.handles` with form/state updates
- [x] 5 — Feed integrates new routing via note renderer & handles
- [x] 15 — Implemented `note` renderer node for kind 1 events

## 1. System query for installed apps (local "app registry")
- **Difficulty:** Medium
- **Expressive Power:** High
- **Notes:** Installed docs already live in `docsAtom`; exposing that list to apps means extending `AppView` globals or adding a pseudo-query resolved from local state. We would also need compiler metadata so authors can declare the dependency (e.g. `$system.apps`). Once exposed, first-party and community launchers become possible. This is aligned with Phase 1–2 vision work.
- **Audience impact:** Gives dashboard/app-store builders rich context; makes Hypernote feel more like a real OS.

PAUL: `$` prefix for stuff like system has been deprecated, please don't reintroduce it!

## 2. `system.switch_app` action
- **Difficulty:** Low
- **Expressive Power:** High
- **Notes:** The action layer already routes `system.*` handlers through `systemActionHandlers` and `openWindowAtom`. Adding a `switch_app` handler that opens a window and maybe focuses it is straight-forward. The hardest part is validating app IDs vs friendly names. Works great with item 1.
- **Audience impact:** Authors can link experiences together; navigation parity with native apps.

## 3. "Apps" app written in Hypernote
- **Difficulty:** Low (once 1 & 2 land)
- **Expressive Power:** High
- **Notes:** Depends on having the installed-apps data and switch action. After that, a Markdown app can render tiles/buttons and call the action. Good dogfood test for the primitives.
- **Audience impact:** Shows end-users that Hypernote apps can administer the OS itself; great showcase piece.

## 4. Switch action accepts payload describing handled kinds
- **Difficulty:** Medium-High
- **Expressive Power:** Transformative
- **Notes:** Requires schema work so apps advertise the kinds they can handle (likely via `hypernote.capabilities.handles` or similar) and runtime plumbing to include that in metadata. `switch_app` then needs routing logic to pick an app by declared capability and forward event payloads. Also introduces type-safety/design questions (multiple handlers? priorities?).
- **Audience impact:** Enables deep linking and contextual routing—key to making Hypernote OS feel smart for regular Nostr users.

PAUL: type safety is sort of handled by nostr kinds. we'll punt on multiple handlers / priority for now and just do some simple default (ios does this lol)

## 5. Click profile/name in Feed opens profile view or filtered feed
- **Difficulty:** Medium (blocked on 2 & 4)
- **Expressive Power:** High
- **Notes:** Once switching supports payloads, the Feed app can attach actions on avatar/name taps to open the profile app (with `pubkey`) or spawn a filtered feed. Also needs a way to express actions inside Markdown text; right now buttons handle actions, so inline link actions may require renderer tweaks.
- **Audience impact:** Critical UX polish—mirrors expectations from every social client.

PAUL: this is a good state where we should do 15: dedicated note renderer node

## 6. Multi-instance Editor app
- **Difficulty:** High
- **Expressive Power:** High
- **Notes:** Window IDs currently equal doc IDs (`openWindowAtom` de-dupes). Supporting multiple editors needs a new notion of window instance (e.g. `editor:doc-123`), coordination with form/state atoms, and persistence decisions. Also must revisit editor UI (Overtype) so multiple instances share selection state safely.
- **Audience impact:** Power users gain real multitasking; essential as library of apps grows.

## 7. Editor implemented as pure Hypernote app
- **Difficulty:** Very High
- **Expressive Power:** Transformative (for dogfooding)
- **Notes:** Our Markdown editor is a custom React component with Overtype, bespoke persistence, and publish flows. Rebuilding it in Hypernote needs richer primitives: virtualized lists, file picker, syntax-highlighted editors, and system actions for save/publish. A staged approach (bootstrap UI in Markdown but keep custom nodes for the editor surface) could lower risk.
- **Audience impact:** Demonstrates self-hosting power, inspires community IDE tooling, but heavy lift.

PAUL: I wasn't suggesting rewriting overtype in hyernote. just that once it's a single window per document (no tabbed browser) then the save and publish and download .md buttons are the only "hypernote" concepts and can easily be defined as normal or system actions

## 8. AST debug viewer (multi-instance)
- **Difficulty:** Medium
- **Expressive Power:** Medium-High (for builders)
- **Notes:** Compiler already emits `{ meta, ast }`; we can expose a system query (e.g. `$system.doc_ast[id]`) that returns JSON and render via a Markdown code block. Needs UI affordances to pick target docs and multi-window support similar to item 6. Great aid for app authors inspecting pipelines.
- **Audience impact:** Primarily developer tooling; niche but valuable.

PAUL: one idea is to extend the debugger off to the right side of the actual window. happy to do this at os level and not try to do any hypernote tricks for rendering

## 9. AI image prompt app + app-to-app pipes
- **Difficulty:** Very High
- **Expressive Power:** Transformative
- **Notes:** Single app calling an AI endpoint is manageable (just an action hitting an external service). But wiring “pipes” so other apps can request/consume output introduces inter-app messaging, routing, and permissioning. We currently lack a bus for app-generated data. Likely requires a shared event log (local or Nostr-based) plus declarative wiring syntax.
- **Audience impact:** Big differentiator if done right—modular creative workflows resonate with Nostr artists/writers—but needs careful scope control.

PAUL: let's backburner but keep thinking about what a world with multi-app pipes could look like! maybe it's an os-level special app where you can design these graphs.

## 10. Image upload + library (Blossom integration)
- **Difficulty:** High
- **Expressive Power:** High
- **Notes:** Requires integrating Blossom client SDK or HTTP calls, handling auth tokens, progress UI, and a secure index of uploaded assets (probably encrypted 30078 or local cache). Also need a UX pattern for apps requesting upload access. This ties into Phase 6 roadmap.
- **Audience impact:** Essential for any social or blog app; high demand among mainstream Nostr users.

## 11. Filesystem / encrypted drafts
- **Difficulty:** Very High
- **Expressive Power:** Transformative
- **Notes:** We need a persistence story beyond localStorage: pick event kinds (likely 30078), handle NIP-44 or nip49 encryption, sync via Hypersauce, and expose CRUD actions/queries to apps. Also deals with conflict resolution and offline edits. It underpins multi-device continuity.
- **Audience impact:** Unlocks serious writing, note-taking, and task apps—core to Hypernote’s vision.

PAUL: yeah this sounds truly hard without immediate synergistic gains

## 12. OS-level wallet with budgets/approvals
- **Difficulty:** Very High
- **Expressive Power:** Transformative
- **Notes:** Goes beyond current sample wallet. Needs integration with NWC or a signing backend, budget tracking per app, UX for approvals, and secure storage of credentials. Impacts action system (must intercept payment requests). Pre-req for any paid features.
- **Audience impact:** Huge—Nostr users expect smooth Lightning payments; budget limits protect them.

PAUL: yeah I really want this personally. and it could pair well with the ai stuff

## 13. Open Markdown links in new tab
- **Difficulty:** Low
- **Expressive Power:** Low-Medium
- **Notes:** Renderer currently treats Markdown anchors as plain `<a>`; we can inject `target="_blank" rel="noreferrer"` in `nodes.tsx`. Quick win, minimal risk.
- **Audience impact:** Small UX polish; reduces user frustration when following external references.

PAUL: nice, also relates to 15's note renderer

## 14. Simple web browser window (one URL per window)
- **Difficulty:** Medium-High
- **Expressive Power:** Medium
- **Notes:** Technically an iframe pointed at the URL with some chrome. Concerns: CSP restrictions, credentials, and distinguishing trusted vs untrusted origins. Also need system UI to manage permissions. Cool demo, but value is limited relative to effort.
- **Audience impact:** Novelty factor for Nostr OS enthusiasts; less utility for everyday users who already have a browser.

PAUL: good point!

## 15. Dedicated note renderer for kind 1 events
- **Difficulty:** Medium
- **Expressive Power:** High
- **Notes:** Our renderer already enriches queries; building a reusable element that formats Nostr notes (links, media, mentions) requires Markdown/HTML sanitizer updates and maybe a `note` node type. It dovetails with the plan to have elements embeddable by `naddr`.
- **Audience impact:** High—improves all social feeds and fits general expectations from Nostr clients.

PAUL: I think this belongs in the first batch for sure

## 16. Cashu wallet actions (via coco-cashu)
- **Difficulty:** High
- **Expressive Power:** High
- **Notes:** Need to bundle a Cashu client, manage mint configs, and expose system actions (`system.cashu.pay`, `system.cashu.mint`). Security prompts similar to wallet budgets apply. Integrates nicely once generic wallet substrate (item 12) exists.
- **Audience impact:** Appealing to Nostr power users using eCash; niche but growing.

## 17. NIP-44 encrypted messaging app
- **Difficulty:** Very High
- **Expressive Power:** High
- **Notes:** Requires NIP-44 key management, Hypersauce support for decrypting/encrypting 4xxx events, UI for threads, and storage of conversations. Also need to handle message indexing and read-state. Could leverage the future filesystem/drafts stack.
- **Audience impact:** Private messaging is a must-have for mainstream adoption, but security stakes are high.

PAUL: I don't think you understand this problem too well or you didn't actually research it

## 18. ContextVM JSON-RPC helper
- **Difficulty:** Medium-High
- **Expressive Power:** High
- **Notes:** Hypersauce already publishes arbitrary events; we’d wrap that in convenience actions/queries so authors can call a ContextVM tool by pubkey. Need request/response correlation helpers and maybe timeout handling. Aligns with Vision doc notes about wallet/chess tooling.
- **Audience impact:** Opens the door to agentic apps (bots, AI, services) on Nostr—compelling for builders.

## 19. Todo app publishing encrypted 30078 state
- **Difficulty:** High
- **Expressive Power:** Medium-High
- **Notes:** Straightforward UI, but storing state as encrypted 30078 events needs encryption, key reuse, and Hypersauce query support. A good pilot project once filesystem/encryption primitives exist.
- **Audience impact:** Useful example app demonstrating private state sync; showcases Hypernote’s unique value.

PAUL: seems like convincing you we can do encryption will be a big unlock for other stuff

---

**Overall:** Items 1–5 are tightly coupled and offer a high payoff for modest effort—great near-term targets. Items 10–12 & 15 create obvious user value but require coordinated infrastructure (storage, wallet substrate). The more ambitious ideas (7, 9, 11, 12, 16, 17) should likely ride behind foundational work on app capabilities, encrypted storage, and action safety so the platform stays coherent as it grows.
