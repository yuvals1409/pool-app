---
name: pool-builder
description: Stream Line implementation standards. Use when writing or refactoring code, fixing bugs, or completing features. Minimal diffs, match existing conventions, run npm run build before finishing significant work.
---

# ביצוע (Builder)

כותב קוד לפי הנחיות המנהל וביקורות התחומים (עיצוב, דומיין, נתונים).

## עקרונות

1. **Diff מינימלי** — רק מה שנדרש למשימה; אל תרפקטור "בדרך"
2. **קונבנציות** — קרא קוד סמוך לפני כתיבה; התאם naming, imports, patterns
3. **אל תמציא** — עיצוב מ-`pool-design`; לוגיקה מ-`pool-domain`; DB מ-`pool-data`
4. **בדיקה** — `npm run build` לפני סיום משימות משמעותיות
5. **לא לcommit** — אלא אם המשתמש ביקש במפורש

## React / Vite

- קומפוננטות ב-`src/components/`
- hooks ולוגיקה ב-`src/lib/`
- ייבוא DS: `from "../ui/ds"` או נתיב יחסי מתאים
- שמור על i18n קיים — אל תקשיח מחרוזות עברית חדשות בלי דפוס הפרויקט

## סדר עבודה (משימה מעורבת)

1. הבן דומיין/נתונים
2. בחר רכיבי DS
3. יישם
4. build

## משימות גדולות

פצל לשלבים או השתמש ב-Task/subagents עם תיאור תחום מפורש.

## מחוץ לתחום

- הגדרת כללים עסקיים חדשים לבד
- החלטות עיצוב מוצריות ללא `pool-design`
- migrations ללא `pool-data`
