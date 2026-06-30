# Stream Line Design System

> **סטרים ליין** — Swimming school management platform for Neve Oz Country Club, Petah Tikva, Israel.

---

## Company & Product Overview

**Stream Line** is a mobile-first PWA and CRM for managing a private swimming school at **Country Club Neve Oz** (קאנטרי נווה עוז), רחוב דגניה 1, פתח תקווה. It manages private lessons, group courses, summer programs, assessments, attendance scanning, scheduling, instructor payroll, and parent communication.

### User Roles

| Role | Hebrew | Primary Surface | Key Actions |
|---|---|---|---|
| **Owner** | מפתח מערכת | All | Full system access |
| **Admin** | מנהל | CRM dashboard | Manage users, schedules, enrollments |
| **Instructor** | מדריך | Schedule + Attendance | View own lessons, mark attendance |
| **Guard** | שומר | QR Scanner | Scan entry QR codes |
| **Office** | משרד | Enrollment table | Manage registrations, payments |
| **Parent** | הורה | Lesson ticket | View lesson details, QR entry pass |

### Product Surfaces

1. **Mobile PWA** — The main product. iOS-native feel, bottom tab bar navigation, max 440px column. Hebrew RTL default, with English/Russian LTR support.
2. **Desktop Admin** — Same app with sidebar navigation at ≥768px; admin-specific tabs (Dashboard, Enrollments, Attendance, Payroll, etc.)
3. **Assessment Landing Page** — Public-facing registration page for assessment events (Hebrew). Deep navy gradient hero, full responsive.
4. **Summer Registration Page** — Public registration form for summer swimming courses.

### Sources

- **Local codebase**: `pool-app-cursor/` — React + Vite PWA; Supabase backend
- **GitHub repo**: [yuvals1409/pool-app](https://github.com/yuvals1409/pool-app) — same codebase, production reference
- **Brand logo**: uploaded `IMG_3277.jpeg` — fluid wave mark with ocean blues + orange accent

---

## Content Fundamentals

### Voice & Tone

- **Primary language**: Hebrew (עברית) — warm, direct, professional but not bureaucratic
- **Secondary**: English labels in code + UI, Russian for some parent communications
- **Tense**: Present tense for status ("השיעור פעיל"), imperative for actions ("שמור", "בטל", "כנס")
- **Formality**: Semi-formal — uses the polite second person (אתה/את) but avoids officialese
- **Numbers & times**: Always LTR regardless of page direction (`dir="ltr"` on numeric elements). Use 24-hour clock (e.g. `16:30`), Israeli date format (`DD/MM/YYYY`)

### Specific Copy Patterns

- **Action buttons**: Short imperatives — שמור, ביטול, כנס, בטל, מחק, שלח, הוסף
- **Status labels**: Nouns — פעיל, ממתין, בוטל, שומש
- **Role labels**: Professional nouns — מדריך, מנהל, שומר, הורה, משרד
- **Empty states**: Friendly, explain what to do — "אין שיעורים בתקופה זו"
- **Error messages**: Clear, actionable — "שדה חובה", "הכניסה לא מורשית"
- **Navigation labels**: Short nouns — לו"ז, סריקה, היסטוריה, ניהול, משרד

### Emoji Usage

Emoji appear **only in empty states and status results** — `✅` / `❌` in scan results, `⏳` in pending states. Never in navigation, buttons, or headings.

### LTR islands inside RTL

Phone numbers, email addresses, dates, times, QR codes, and numeric data always render with `dir="ltr"` to prevent digit reversal.

---

## Visual Foundations

### Colors

The palette is built around water — deep navy, pool blue, sky, and pale aqua — with a warm orange accent from the logo's flame/tail motif. Clean whites and barely-blue surface tints replace generic greys.

| Role | Token | Value | Use |
|---|---|---|---|
| Primary action | `--pool` | `#0077B6` | Buttons, links, active tabs |
| Deep brand | `--pool-deep` | `#023E8A` | Gradient endpoints, hero sections |
| Light accent | `--pool-light` | `#90E0EF` | Scanner overlay, info borders |
| Pale surface | `--pool-pale` | `#CAF0F8` | Active sidebar item, lesson info bg |
| Page canvas | `--pool-faint` / `--surface` | `#F0F8FF` | Page backgrounds |
| Warm accent | `--accent-warm` | `#E17055` | Logo accent, instructor-4 |
| Primary text | `--ink` | `#012A4A` | All headings + body |
| Secondary text | `--ink-mid` | `#2C6E8A` | Labels, metadata |
| Muted text | `--ink-soft` | `#6BA3BE` | Placeholders, captions |

### Typography

System-native font stack. **IBM Plex Sans Hebrew** (Google Fonts) provides high-quality Hebrew rendering; falls back to system-ui on both iOS and Android. **IBM Plex Mono** is used for all numeric data (times, phone numbers, QR codes, statistics).

- **Body tracking**: `−0.022em` applied globally — matches the native iOS letter-spacing feel
- **Display titles**: add `letter-spacing: -0.03em` to `−0.04em` for large Hebrew type
- **Monospace numbers**: always `font-family: var(--font-mono)` for times, counts, IDs

> **Font substitution flag**: IBM Plex Sans Hebrew is loaded via Google Fonts CDN by default. For offline PWA support, self-host the `.woff2` files — see `fonts/README.md` for step-by-step instructions and uncomment the `@font-face` block in `tokens/typography.css`. Files can be downloaded from [Google Fonts](https://fonts.google.com/specimen/IBM+Plex+Sans+Hebrew).

### Class-based integration

Besides the React components (inline-styled), `components.css` ships drop-in CSS classes (`.btn`, `.btn-primary`, `.badge`, `.badge-active`, `.role-badge`, `.nav`, `.nav-btn`, `.sidebar-btn`, …) that mirror the pool-app codebase conventions and read from the same tokens. Import it after `styles.css` to integrate into an existing CSS-class-based React app.

### Backgrounds & Surfaces

- **Page**: `--surface` (`#F0F8FF`) — barely-blue off-white, never pure white for full pages
- **Cards**: `--bg` (white) on top of the surface for clear figure/ground separation
- **Nav bar**: `rgba(255,255,255,0.72)` with `backdrop-filter: blur(20px)` — iOS frosted glass
- **Dark mode**: full dark mode support via `@media (prefers-color-scheme: dark)` in every token file

### Shapes & Radius

- **16px** (`--radius-card`) — cards, bottom sheets, modals — the primary container shape
- **10px** (`--radius`) — buttons, inputs, segmented controls — the control shape
- **999px** (`--radius-pill`) — tags, badges, nav labels — pills
- **4px** (`--radius-xs`) — schedule lesson blocks, inline chips

### Elevation

Pool-blue tinted shadows (not grey). Most cards use **border only** (flat, no shadow). Shadows appear only on:
- Lifted cards in hero sections → `--shadow`
- Primary buttons → `--shadow-btn` (`0 4px 16px rgba(0,119,182,.28)`)
- Bottom sheets, modals → `--shadow-lg`
- Frosted nav bar → implicit from blur

### Animations & Motion

- **Framer Motion** for page/tab transitions and bottom sheet slides (`AnimatePresence + motion.div`)
- **CSS keyframes** for the scanner scan-line animation and spinner
- **Durations**: button press `50ms`, hover/color `120ms`, most UI `220ms`, sheets `350ms`
- **Spring physics**: `stiffness 300, damping 30` for snappy feel on modal entry
- **Scan flash**: full-screen green/red overlay at `0.35` opacity for QR scan feedback

### Hover & Press States

- **Buttons**: `translateY(-1px)` + deeper shadow on hover; reset on press
- **Sidebar items**: background tints to `--pool-pale` on active, `--surface` on hover
- **List rows**: `background: rgba(0,119,182,.03)` on hover
- **Schedule blocks**: lighten on hover

### Cards

White surface (`--bg`) on `--surface` canvas. 16px radius. Border: `1px solid var(--separator)`. No shadow on default cards. KPI cards use `--bg-secondary` fill (light pool-faint) for inset look.

### RTL Layout

- All layout uses **logical CSS properties**: `margin-inline-start`, `padding-inline`, `border-inline-start`, `text-align: start`
- Sidebar sits on the `inline-start` edge (right in RTL)
- Tab bar centers to max-width column using `inset-inline: 0`
- Direction switches dynamically per user's language preference (`he`→RTL, `en`/`ru`→LTR)
- Dates, times, phone numbers always `dir="ltr"` regardless of page direction

### Responsive

| Breakpoint | Layout |
|---|---|
| `< 768px` | Mobile: single column, bottom tab bar, 440px max |
| `≥ 768px` | Desktop: sidebar (240px) + main content area, tab bar hidden |
| `≥ 1280px` | Wide desktop: max content width 1280px |

---

## Iconography

### Primary Icon System

**[Lucide React](https://lucide.dev/)** — Stroke-based icons, `strokeWidth: 2` (inactive) / `1.75` (active). Currently installed as `lucide-react` npm package. Key icons:

| Tab / Feature | Icon |
|---|---|
| Schedule / Calendar | `Calendar` |
| QR Scanner | `ScanLine` |
| Attendance | `ClipboardList` |
| Instructor lessons | `Waves` |
| Admin / Settings | `Settings` |
| Success scan | `CheckCircle2` |
| Failed scan | `XCircle` |

### Active State

Icons fill with `fill="currentColor"` when active (tab bar / sidebar), stroke when inactive. This matches native iOS tab bar behavior.

### Icon Usage Rules

- Minimum 22×22px rendered size inside 24×24px container
- Always `aria-hidden` on decorative icons
- Use `strokeWidth={active ? 1.75 : 2}` to visually distinguish active/inactive

### Monospace Characters as Data Icons

Hebrew numerals and special characters are rendered as-is. No unicode icon characters used for UI. Clock and status symbols come exclusively from Lucide.

---

## Files Index

```
stream-line-design-system/
├── styles.css                    ← Entry point — @import all tokens
├── components.css                ← Class-based component styles (.btn, .badge, .nav…) for CSS-class apps
├── tokens/
│   ├── colors.css                ← Brand, semantic, surface, instructor + badge palette
│   ├── typography.css            ← Font families, type scale, weights, tracking, @font-face
│   ├── spacing.css               ← 8-point grid (space-1 through space-16)
│   ├── radius.css                ← Border radius scale
│   ├── shadow.css                ← Pool-blue elevation shadows
│   ├── layout.css                ← App shell dimensions, z-index, breakpoints
│   └── motion.css                ← Easing curves, duration scale
│
├── fonts/
│   └── README.md                 ← How to self-host IBM Plex woff2 files for offline PWA
│
├── components/
│   ├── core/
│   │   ├── Button.jsx / .d.ts    ← 8 variants: primary, secondary, outline, danger, success, ghost, whatsapp, google
│   │   ├── Badge.jsx / .d.ts     ← Status + role badges (13 variants)
│   │   ├── Avatar.jsx / .d.ts    ← Circular user avatar with initials fallback
│   │   ├── Card.jsx / .d.ts      ← Card container + KpiCard dashboard tile
│   │   ├── Input.jsx / .d.ts     ← Field wrapper, Input, Select
│   │   ├── Spinner.jsx / .d.ts   ← Loading spinner (4 color variants)
│   │   ├── Toast.jsx / .d.ts     ← Fixed-position toast notification
│   │   └── core.card.html        ← DS tab specimen card
│   └── navigation/
│       ├── TabBar.jsx / .d.ts    ← iOS-style frosted bottom tab bar
│       ├── Sidebar.jsx / .d.ts   ← Desktop sidebar nav
│       └── navigation.card.html  ← DS tab specimen card
│
├── guidelines/
│   ├── brand-logo.card.html      ← Logo + identity
│   ├── colors-brand.card.html    ← Pool blue ramp
│   ├── colors-semantic.card.html ← Success/danger/warn/info
│   ├── colors-instructors.card.html ← 8-color instructor palette
│   ├── type-display.card.html    ← Large title through headline
│   ├── type-body.card.html       ← Body through micro + mono
│   ├── spacing.card.html         ← 8-point grid specimens
│   ├── radius.card.html          ← Border radius scale
│   └── shadows.card.html         ← Elevation scale
│
├── assets/
│   ├── logo.png                  ← App icon (square, PWA)
│   ├── stream-line-logo.jpeg     ← Full brand logo: wave mark + STREAM LINE wordmark
│   ├── icon-192.png              ← PWA icon 192×192
│   ├── icon-512.png              ← PWA icon 512×512
│   └── apple-touch-icon.png      ← iOS home screen icon
│
├── ui_kits/
│   ├── mobile/index.html         ← Mobile PWA interactive prototype
│   └── crm/index.html            ← Admin CRM dashboard prototype
│
├── readme.md                     ← This file
└── SKILL.md                      ← Agent skill manifest
```

---

## Key Data Models

From the Supabase migrations, the core entities are:

- **lessons** — private lesson record (child_name, instructor_id, lesson_date, start_time, qr_token, status)
- **group_sessions** — recurring group class sessions
- **enrollments** — child enrollment in a product/season
- **products** — course offerings (private, group, summer, etc.)
- **seasons** — term/season container for products
- **profiles** — user profiles with roles
- **attendance** — attendance records per session
- **waitlist** — waitlist entries for full courses
- **assessment_leads** — assessment event registrations

---

*Built from: [yuvals1409/pool-app](https://github.com/yuvals1409/pool-app) (GitHub) + local `pool-app-cursor/` codebase. Explore these for deeper component context and real production patterns.*
