---
name: stream-line-design
description: Use this skill to generate well-branded interfaces and assets for Stream Line (סטרים ליין) — a swimming school management PWA for Neve Oz Country Club. Contains essential design guidelines, Hebrew RTL layout patterns, colors, typography, component specs, and UI kit screens for prototyping or production.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.

Key things to know about Stream Line:
- Primary language is Hebrew (RTL). Also supports English and Russian (LTR).
- Use `dir` switching; always `dir="ltr"` on dates, times, phone numbers, QR codes.
- Font: IBM Plex Sans Hebrew (Google Fonts) for Hebrew text; IBM Plex Mono for numeric data.
- Color system: pool blue `#0077B6` primary, deep navy `#023E8A` for dark sections, warm orange `#E17055` as accent.
- Mobile-first (max-width 440px column), iOS-native feel with frosted glass nav bar and 44px tap targets.
- Bottom tab bar on mobile, sidebar on desktop (≥768px).
- Lucide React icons (stroke-weight 2 inactive, 1.75 + fill active).
- Token file: `styles.css` at root imports all `tokens/*.css` files.
- Components live in `components/core/` and `components/navigation/`.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. Always use `direction: rtl` and `font-family: -apple-system, "IBM Plex Sans Hebrew", sans-serif` for Hebrew content. If working on production code, copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.
