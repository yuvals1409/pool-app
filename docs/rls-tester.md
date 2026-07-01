# RLS Tester — מדריך בדיקה

כלי Dashboard של Supabase לבדיקת Row Level Security (RLS) לפי תפקיד משתמש.

## הפעלה (פעם אחת)

1. פתח [Supabase Dashboard](https://supabase.com/dashboard)
2. בחר את הפרויקט של Stream Line
3. לחץ על תמונת הפרופיל (למעלה) → **Feature Previews**
4. הפעל **RLS Tester**
5. עבור ל-**Database → RLS Tester**

## מתי להריץ

- אחרי כל migration שמוסיף/משנה טבלה
- אחרי שינוי ב-RLS policies
- לפני `supabase db push` לפרודקשן

בנוסף, הרץ מקומית:

```bash
npm run db:advisors
npm run db:advisors:remote
npm run db:rls          # בדיקות RLS אוטומטיות (SupaShield)
npm run db:rls:audit    # סריקת בעיות RLS נפוצות
```

## בדיקות אוטומטיות (SupaShield)

תרחישי גישה לפי תפקיד מוגדרים ב-[`supabase/rls-scenarios.json`](../supabase/rls-scenarios.json) ונבדקים אוטומטית עם [SupaShield](https://github.com/Rodrigotari1/supashield).

**דוגמה מרכזית:** מדריך (`demo.instructor@demo.streamline`) **לא** אמור לראות `families` — Advisors לא בודק את זה.

### הרצה מקומית

```bash
supabase start
supabase db reset
eval "$(supabase status -o env)"
export DATABASE_URL="$POSTGRES_URL"
export SUPABASE_URL="$API_URL"
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
npm run seed:demo
npm run db:rls
```

### פקודות

| פקודה | תיאור |
|--------|--------|
| `npm run db:rls` | תרחישי דומיין לפי תפקיד (מדריך/שומר/משרד/מנהל/anon) |
| `npm run db:rls:audit` | סריקה כללית לבעיות RLS |
| `npm run db:rls:coverage` | דוח כיסוי policies |

**חשוב:** הרץ מול DB מקומי או staging בלבד — **לא** פרודקשן.

CI: workflow [`.github/workflows/rls-tests.yml`](../.github/workflows/rls-tests.yml) רץ על שינויי `supabase/`.

## תרחישים לפי תפקיד

מבוסס על [`src/lib/permissions.js`](../src/lib/permissions.js):

| תפקיד | מה לבדוק | צפוי |
|-------|----------|------|
| `anon` | גישה לנתונים ציבוריים בלבד | רק RPC/טבלאות שמותרות ללא login |
| `instructor` | שיעורים ונוכחות | רואה רק שיעורים/חוגים שלו, לא enrollments של משרד |
| `guard` | לו"ז וסריקות | רואה לו"ז רחב, לא עריכת הרשמות/תשלומים |
| `office` | הרשמות ותשלומים | גישה ל-families/participants/enrollments, לא הגדרות admin |
| `admin` | ניהול מערכת | גישה רחבה, לא פעולות owner-only |
| `authenticated` (ללא role) | משתמש ממתין לאישור | מינימום גישה — בעיקר profile עצמי |

## טבלאות קריטיות לבדיקה

| טבלה | למה |
|------|-----|
| `profiles` | תפקידים ואישור משתמשים |
| `families` | מידע משפחות — רגיש |
| `participants` | ילדים/משתתפים |
| `enrollments` | הרשמות ותשלומים |
| `lessons` | שיעורים פרטיים |
| `scheduled_sessions` | חוגים קבוצתיים |
| `access_passes` | כרטיסי כניסה / QR |
| `access_logs` | לוג סריקות שומר |
| `billing_records` | חיובים |
| `portal_sessions` | פורטל הורה |

## דוגמאות queries

הרץ ב-RLS Tester עם impersonation של תפקיד:

```sql
-- כ-instructor: אמור להחזיר רק שיעורים רלוונטיים
SELECT id, instructor_id, starts_at FROM lessons LIMIT 10;

-- כ-office: families לחיפוש משרד
SELECT id, phone, name FROM families LIMIT 10;

-- כ-guard: access_logs אחרונים
SELECT id, scanned_at, pass_id FROM access_logs ORDER BY scanned_at DESC LIMIT 10;

-- כ-anon: לא אמור לראות families
SELECT id FROM families LIMIT 1;
```

אם query מחזיר שורות שלא אמורות להיות גלויות — **עצור deploy** ותקן policy.

## זרימת עבודה מומלצת

```text
migration חדש
    → supabase db reset (מקומי)
    → npm run db:advisors
    → npm run db:rls
    → RLS Tester (תרחישים ידניים נוספים)
    → npm run db:advisors:remote
    → supabase db push
```

## קישורים

- [Supabase RLS Tester changelog](https://supabase.com/changelog/45233-feature-preview-rls-tester)
- [Database Advisors](https://supabase.com/docs/guides/database/database-advisors)
- [`supabase/README.md`](../supabase/README.md)
