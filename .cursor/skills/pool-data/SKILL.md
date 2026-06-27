---
name: pool-data
description: Stream Line Supabase data layer. Use for database schema, RLS policies, migrations, SQL, edge functions, queries in src/lib/supabase.js, or any change under supabase/.
---

# נתונים — Supabase

## לפני כל שינוי DB

1. קרא Supabase plugin skill (`plugin-supabase-supabase`) — best practices, migrations, RLS
2. סרוק `src/lib/` לצרכני הנתונים שיושפעו
3. בדוק אם יש edge functions ב-`supabase/functions/`

## נתיבים

| נתיב | שימוש |
|------|--------|
| `src/lib/supabase.js` | client ו-queries מרכזיים |
| `supabase/` | migrations, functions, config |
| `src/lib/*.js` | לוגיקה שקוראת/כותבת DB |

## עקרונות

- שינויי schema בזהירות — אל תשבור queries קיימים
- כל migration: מה משתנה, מי נפגע, האם צריך backfill
- RLS — אל תרפה מדיניות בלי סיבה מפורשת
- העדף שינויים מינימליים; עדכן צרכנים ב-`src/lib/` באותו PR

## צ'קליסט migration

- [ ] טבלה/עמודה חדשה מתועדת
- [ ] RLS policies מעודכנות
- [ ] queries ב-`src/lib/` מעודכנים
- [ ] אין breaking change ל-PWA בפרודקשן בלי תוכנית

## מחוץ לתחום

- עיצוב טבלאות במסך → `pool-design`
- האם שדה חדש נדרש מוצרית → `pool-domain` קודם

## local dev

אם זמין: `supabase` CLI לסטאק מקומי לפני apply ל-remote (ראה Supabase skill).
