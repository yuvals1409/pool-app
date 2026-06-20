# Stream Line Design System

> **סטרים ליין** — Swimming-school management for **Country Club Neve Oz**, רחוב דגניה 1, Petah Tikva, Israel.
> This system is a **Notion-light reimagining** of the product: warm off-white canvas, a flat sidebar, generous whitespace, hairline borders, no heavy shadows, and solid pool-blue primary actions — while keeping the Stream Line pool-blue brand. Light mode only.

---

## Company & Product Overview

Stream Line is a mobile-first PWA + CRM that runs a private swimming school:
private lessons, group courses, summer programs, assessments, QR entry passes,
attendance, instructor scheduling, payroll, and parent communication.

### User roles
| Role | Hebrew | Primary surface |
|---|---|---|
| Owner | מפתח מערכת | All |
| Admin | מנהל | CRM workspace |
| Instructor | מדריך | Schedule + attendance |
| Guard | שומר | QR scanner |
| Office | משרד | Enrollment table |
| Parent | הורה | Lesson ticket / QR pass |

### Product surfaces
1. **Admin workspace** (recreated here) — sidebar + schedule, enrollments, dashboard, payroll.
2. **Mobile PWA** — the parent/instructor/guard mobile experience.
3. **Public registration pages** — assessment & summer-course signup.

### Sources (explore these for deeper context)
- **Local codebase**: `pool-app-cursor/` — React + Vite PWA, Supabase backend.
- **GitHub**: <https://github.com/yuvals1409/pool-app> — same codebase, production reference. Browse it for real component patterns, the Supabase schema, and live copy.
- **Brand logo**: `uploads/IMG_3277.jpeg` → `assets/stream-line-logo*.jpeg` — wave mark + STREAM LINE wordmark.

> The codebase ships an earlier **iOS-native dark/frosted** design system. This project intentionally diverges to the Notion-light direction requested by the team — treat *this* as the source of truth for new design work, and the codebase as the source of truth for product structure, data models, and copy.

---

## Content Fundamentals

**Languages.** The live product is **Hebrew (RTL)** first, with English and Russian
support. UI labels in code are English; parent-facing copy is Hebrew/Russian.
Numbers, times, dates, phones, money, and QR values **always render LTR**
(`dir="ltr"`, mono) regardless of page direction, to prevent digit reversal.

**Voice & tone.** Warm, direct, professional — never bureaucratic. Present tense
for status, imperative for actions. Polite second person (אתה/את). Concise.

**Casing.** English UI uses sentence case for labels and buttons ("New lesson",
"Add enrollment", "Mark paid") — not Title Case, not ALL CAPS. The only all-caps
is the small overline label (tracked +0.05em), used sparingly for section headers.

**Copy patterns**
- **Actions** — short imperatives: New lesson · Save · Cancel · Add · Export · Mark paid.
  Hebrew equivalents: שמור · ביטול · כנס · הוסף · מחק · שלח.
- **Status** — nouns/adjectives: Active · Pending · Cancelled · Paid · Unpaid · Waived
  (פעיל · ממתין · בוטל · שולם).
- **Roles** — professional nouns: Admin · Instructor · Guard · Office · Parent.
- **Empty states** — friendly + actionable: "No lessons this week — create one to
  generate an entry QR." ("אין שיעורים בתקופה זו").
- **Errors** — clear, short: "Required field" · "Entry not authorized" (שדה חובה).

**Emoji.** Used **only** in scan-result / status feedback (✅ pass, ❌ deny, ⏳ pending).
Never in navigation, buttons, or headings. The UI relies on Lucide icons, not emoji.

---

## Visual Foundations

**The vibe.** A calm, document-like workspace — Notion light mode density and
spacing, not iOS. Surfaces are warm and paper-like; the brand shows up as a single
confident pool-blue used for primary actions, active nav, links, and selection.
Color is a seasoning, not a wash.

**Colors.** See `tokens/colors.css`.
- *Brand* — pool blue `--pool #0077B6` (primary), `--pool-deep #023E8A`, with
  `--pool-wash #EAF4FB` for selected rows and a warm `--accent-warm #E8722E`
  flame accent lifted from the logo. Used sparingly.
- *Canvas* — warm off-whites: `--canvas #FAFAF7` (page), `--sidebar #F6F5F1`
  (flat sidebar), `--surface #FFFFFF` (cards), `--surface-sunk #F4F3EF` (wells).
  Never pure-white full pages.
- *Ink* — warm charcoal, not blue-black: `--ink #32302C`, `--ink-mid #6B675F`,
  `--ink-soft #9A958B`.
- *Borders* — warm hairlines: `--border #ECEAE3`, `--border-strong #DEDBD2`.
- *Semantic* — success / danger / warn / info each with a solid + a soft tint bg.
- *Instructor palette* — 8 distinct hues for schedule blocks.

**Typography.** `tokens/typography.css`. **IBM Plex Sans** for all UI/display,
**IBM Plex Mono** (tabular) for every number — times, dates, phones, money, IDs,
QR. These are the product's real typefaces. Tracking is restrained: tight on
display (−0.02em), near-neutral on body. Type scale tops out at 36px display.

**Spacing.** 8-point grid (`tokens/spacing.css`). Notion rhythm: generous section
padding (24–32px), tight control padding (6–12px). Content column maxes ~1080px;
sidebar is 248px.

**Radius.** Notion-soft (`tokens/radius.css`): 6px controls, 8px cards/menus,
12px modals, 3–4px schedule chips, 999px pills/badges/avatars.

**Elevation.** **Border-first.** Most cards use a 1px border and *no* shadow.
Shadows are faint and warm-grey (`tokens/shadow.css`), reserved for things that
truly float — menus, modals, toasts. No pool-tinted or heavy shadows.

**Backgrounds.** Flat warm fills only. No gradients, no images behind content, no
textures or patterns. The logo JPEG is the one piece of brand imagery.

**Borders & cards.** Cards = white surface on warm canvas, 1px `--border`, 8px
radius, no shadow. Hover (when interactive) deepens the border to `--border-strong`
and adds the faintest `--shadow-sm`. Table rows separate with hairline borders and
tint to `--surface-hover` on hover.

**Motion.** Calm and quick, **no bounce**. Color/opacity transitions dominate
(120–180ms, `--ease-standard`); layout barely moves. Buttons nudge 0.5px on press.
Honor `prefers-reduced-motion`.

**Hover & press states.** Buttons: primary → `--pool-press` darker on hover;
secondary/ghost → `--surface-hover`. Nav rows: `--surface-hover` on hover,
`--pool-wash` + pool text when active. Press = 0.5px translate, no scale.

**Transparency & blur.** Not used. (The old iOS frosted nav is dropped in this
direction — the sidebar is a flat opaque fill.) Modal scrim is a plain
`--overlay` (rgba warm-black 0.32).

**Imagery vibe.** The brand mark is cool ocean blues + a warm orange tail on white.
No photography in the system; if added, keep it bright, clean, and water-themed.

**Focus.** Visible 3px pool-blue ring (`--ring`) on keyboard focus.

---

## Iconography

**System: [Lucide](https://lucide.dev/)** — stroke icons, ~2px stroke, 17–20px in
UI. This matches the product (`lucide-react` is a dependency). The DS cards and UI
kit load Lucide from the CDN (`unpkg.com/lucide`). Common mappings:

| Feature | Icon | Feature | Icon |
|---|---|---|---|
| Schedule | `Calendar` | Dashboard | `LayoutDashboard` |
| Enrollments | `Users` | Payroll | `Wallet` |
| Attendance | `ClipboardCheck` | Products | `Package` |
| Scanner | `ScanLine` | Settings | `Settings` |
| New / add | `Plus` | Export | `Download` |

- Active nav/tab icons take the pool-blue color; inactive are `--ink-soft`.
- Decorative icons get `aria-hidden`; min target 44px on mobile.
- **No emoji** as UI icons; **no unicode glyphs** as icons. Numbers stay in mono.
- The product also ships PWA icons (`assets/icon-192.png`, `icon-512.png`,
  `apple-touch-icon.png`) and `assets/logo.png` (square app icon). *(The codebase
  `icon.svg` could not be imported — invalid encoding; re-export if needed.)*

---

## Files Index

```
styles.css                     ← entry point (imports only)
tokens/
  fonts.css        colors.css   typography.css  spacing.css
  radius.css       shadow.css   motion.css      base.css
guidelines/                     ← Design System tab specimen cards
  brand-logo · colors-{brand,neutral,semantic,instructors}
  type-{display,body,mono} · spacing · radius · shadows
components/
  core/        Button · Badge · Avatar · Card/KpiCard · Field/Input/Select/Textarea
               · Switch/Checkbox · SegmentedControl · Spinner   (+ core.card.html)
  navigation/  Sidebar/NavItem/NavSection · TopBar              (+ navigation.card.html)
  feedback/    Toast · EmptyState                               (+ feedback.card.html)
ui_kits/
  workspace/   index.html + data.js + Schedule/Enrollments/Dashboard.jsx
assets/        logo.png · stream-line-logo(.jpeg/-full.jpeg) · icon-{192,512}.png · apple-touch-icon.png
fonts/README.md   readme.md   SKILL.md
```

### Components (namespace `window.StreamLineDesignSystem_…`)
`Button` · `Badge` · `Avatar` · `Card` · `KpiCard` · `Field` · `Input` ·
`Textarea` · `Select` · `Switch` · `Checkbox` · `SegmentedControl` · `Spinner` ·
`Sidebar` · `NavItem` · `NavSection` · `TopBar` · `Toast` · `EmptyState`

### UI kits
- **Workspace** (`ui_kits/workspace/`) — admin workspace: schedule, enrollments, dashboard.

---

## Substitutions & flags
- **Fonts** load from the Google Fonts CDN (IBM Plex Sans + Mono). For offline PWA
  builds, self-host the woff2 files — see `fonts/README.md`. *No substitute font was
  used* — these are the product's real typefaces.
- **`--font-hebrew`** points at "IBM Plex Sans Hebrew" (a webfont, not yet uploaded
  here); it falls back gracefully. Upload the Hebrew woff2 for production Hebrew RTL.
- **`assets/icon.svg`** from the codebase failed to import (invalid encoding) — only
  PNG/JPEG variants are included.

*Built from the `pool-app-cursor/` codebase + [yuvals1409/pool-app](https://github.com/yuvals1409/pool-app).*
