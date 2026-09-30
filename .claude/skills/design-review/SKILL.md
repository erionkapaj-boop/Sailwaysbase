---
name: design-review
description: Mandatory aesthetic review of any user-visible change. Screenshot the result at 390px and 1280px in every state, review it against docs/DESIGN.md (premium, minimal, modern), fix, and repeat until it passes. Use after building or changing any screen, component, or copy, before reporting done.
---

Read `docs/DESIGN.md` first; it is the checklist.

1. Render every state of the changed screen at 390×844 and 1280×900
   (`shoot()` in `tests/e2e/lib.mjs`, run via `tests/e2e/run.sh`).
2. Open the screenshots and look at them. Do not judge from code.
3. Go through the rules and the "cheap signs" list in docs/DESIGN.md.
4. Fix and re-shoot until nothing fails.
5. In the final message list which screens/states were reviewed. Write in Greek.
