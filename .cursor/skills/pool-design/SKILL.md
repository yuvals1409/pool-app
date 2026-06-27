---
name: pool-design
description: Stream Line UI and design system guardian. Use for screens, components, tokens, RTL layout, workspace shell, DS v2 consistency, reskinning, or visual review. Covers design-system/, src/components/ui/ds/, src/styles/, and AppWorkspaceShell.
---

# שומר עיצוב — Stream Line DS v2

## קודם כל

1. קרא `design-system/SKILL.md` ו-`design-system/readme.md` — מקור אמת ל-DS
2. לעבודה בייצור: קרא `.cursor/skills/pool-design/SKILL.md` (קובץ זה) + הקבצים הרלוונטיים ב-`src/`

## נתיבי ייצור

| נתיב | שימוש |
|------|--------|
| `src/components/ui/ds/` | רכיבי React קנוניים (Button, Field, Card, TopBar, Sidebar, וכו') |
| `src/components/layout/AppWorkspaceShell.jsx` | shell של workspace מאומת |
| `src/styles/tokens/` | טוקני CSS |
| `design-system/ui_kits/workspace/index.html` | רפרנס ויזואלי מלא |

## ייבוא רכיבים

```javascript
import { Button, Field, Input, Card, TopBar } from "../ui/ds";
// או נתיב יחסי מתאים
```

## כללי עיצוב (תמצית)

- Notion-light: רקע חם, sidebar שטוח, whitespace, גבולות דקים
- pool-blue `#0077B6` — primary/active בלבד
- IBM Plex Sans + Mono; Lucide icons
- עברית RTL, light mode בלבד
- מספרים/שעות: LTR + `font-mono`

## ביקורת UI

כשבודקים מסך קיים:

1. האם משתמש ב-`ui/ds` או legacy (`.btn`, `.card`)?
2. האם טוקנים עקביים עם `src/styles/tokens/`?
3. האם RTL ו-light mode נשמרים?

## מחוץ לתחום

- Supabase, `src/lib/permissions.js`, mutations
- copy i18n חדש ללא הקשר דומיין
- שינוי כללים עסקיים

## כשלא בטוח

הפנה לדומיין ללוגיקה, לנתונים ל-DB — עיצוב מנצח רק על **מראה**.
