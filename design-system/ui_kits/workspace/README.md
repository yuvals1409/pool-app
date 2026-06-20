# Workspace UI Kit

A high-fidelity, click-through recreation of the **Stream Line admin workspace**,
re-skinned in the Notion-light direction (warm off-white canvas, flat sidebar,
generous whitespace, hairline borders, solid pool-blue primary actions).

Open `index.html` and click between **Schedule**, **Enrollments**, and
**Dashboard** in the sidebar.

## Files

| File | Purpose |
|---|---|
| `index.html` | Workspace shell — flat sidebar + top bar + tab switching |
| `data.js` | Mock data (instructors, lessons, enrollments, stats) on `window.SL_DATA` |
| `Schedule.jsx` | Week calendar with instructor-colored lesson blocks |
| `Enrollments.jsx` | Searchable enrollment table with payment + session progress |
| `Dashboard.jsx` | KPI tiles + weekly attendance bars + product donut |

## How it's built

Screens compose the design-system primitives (`Sidebar`, `NavItem`, `TopBar`,
`Card`, `KpiCard`, `Badge`, `Avatar`, `Button`, `Input`, `SegmentedControl`) from
the compiled bundle (`window.StreamLineDesignSystem_132b60`). Views are loaded as
Babel scripts that register `window.SL_*` globals — they do not re-implement
primitives.

## Notes & fidelity

- This applies the **new Notion-light direction** to the real product surfaces
  (schedule / enrollments / dashboard) — the live app currently ships an
  iOS-native dark/frosted look. It is a re-skin, not a 1:1 copy of current pixels.
- The live product is **Hebrew RTL**. This kit is shown LTR/English for clarity;
  switch `dir="rtl"` and the `--font-hebrew` stack for production Hebrew screens.
  Numeric data (times, phones, money) always stays LTR + mono (`.num`).
- Source of truth: `pool-app-cursor/` codebase and
  [yuvals1409/pool-app](https://github.com/yuvals1409/pool-app).
