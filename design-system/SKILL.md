---
name: stream-line-design
description: Use this skill to generate well-branded interfaces and assets for Stream Line (סטרים ליין), the swimming-school management platform for Country Club Neve Oz — either for production or throwaway prototypes/mocks. Notion-light direction: warm off-white canvas, flat sidebar, generous whitespace, hairline borders, solid pool-blue primary actions. Contains design guidelines, color/type/spacing tokens, fonts, brand assets, and UI kit components.
user-invocable: true
---

Read the `readme.md` file within this skill first — it holds the full design
guide (content fundamentals, visual foundations, iconography) and a file index.
Then explore the other files as needed:

- `styles.css` + `tokens/` — the design tokens (colors, type, spacing, radius,
  shadow, motion). Link `styles.css` to inherit everything.
- `guidelines/` — visual specimen cards (colors, type, spacing, radius, shadows, logo).
- `components/` — reusable React primitives (Button, Badge, Card, Sidebar, etc.).
  Each has a `.d.ts` (props) and a `.prompt.md` (usage). They read CSS variables.
- `ui_kits/workspace/` — a full click-through admin workspace to copy from.
- `assets/` — logos and PWA icons.

If creating visual artifacts (slides, mocks, throwaway prototypes), copy the
assets you need out and produce static HTML files for the user to view. If
working on production code, copy assets and read the rules here to design as a
Stream Line brand expert.

Key rules to honor: Notion-light density (warm off-white, NOT iOS dark); pool-blue
`#0077B6` for primary/active only, used sparingly; border-first cards with no heavy
shadows; IBM Plex Sans for text + IBM Plex Mono for all numbers; Lucide icons (no
emoji as UI icons); numbers/times/phones always LTR + mono. The live product is
Hebrew RTL — switch `dir="rtl"` and `--font-hebrew` for Hebrew screens.

If the user invokes this skill without other guidance, ask them what they want to
build, ask a few clarifying questions, then act as an expert designer who outputs
HTML artifacts or production code depending on the need.
