# What We Learned About Forms

## 1. Requested Change
Paul asked for profile-app UX improvements:
- Keep the free-form text field for pasting a pubkey.
- Add buttons to load that pasted pubkey or revert to "view my profile".
- Avoid toggling the OS-wide `user.pubkey`; the app should stay scoped to its own form state.

## 2. What I Attempted
- Introduced a new system action (`@set_form_value`) that normalized/processed payloads before updating `formsAtom`.
- Changed the Profile sample to drive both the staging input and the active target through that new action, relying on filtered form context and additional normalization helpers in `nodes.tsx` and `queryRuntime`.
- Updated inputs to mirror values from `formsAtom`, added query guards that trimmed empty authors, and attempted to reuse the same action for pre-filling the input field.

## 3. Feedback / Issues
- The generated form syntax (`entries:` payload, auto-normalization helpers) is unsupported in the current language, so the Profile app stopped rendering correctly.
- Heavy-handed normalization logic felt fragile and obscured the intent; instead of simplifying, it introduced new layers to reason about.
- The changes continued to mutate `user.pubkey`, violating the requirement that the Profile app remain isolated from OS-level state.

Key takeaway: stick to the existing form primitives (direct `formsAtom` updates / simple actions) and avoid speculative abstractions until the language supports them explicitly.
