# Supabase — Stream Line (pool-app)

## מבנה

```
supabase/
├── config.toml                          # הגדרות Supabase CLI
├── migrations/
│   ├── 20260630120000_baseline.sql      # snapshot מלא — setup + כל ה-migrations ההיסטוריים
│   └── archive/                         # 32 קבצי SQL מקוריים (לעיון בלבד)
├── legacy/
│   └── supabase_setup.sql               # סקריפט התקנה ראשוני מקורי
└── functions/                           # Edge Functions
```

## סביבה חדשה (מקומית)

```bash
# דורש Supabase CLI: npx supabase או brew install supabase/tap/supabase
supabase start
supabase db reset          # מריץ את baseline migration
```

## פרויקט קיים (פרודקשן)

הפרודקשן כבר מכיל את כל השינויים — הוחלו ידנית דרך SQL Editor ו-Supabase MCP.

ה-baseline `20260630120000` סומן כ-**applied** ב-history (`migration repair`) — **בלי להריץ SQL כפול**.

לחיבור מקומי לפרויקט:

```bash
supabase link --project-ref <ref>   # ref מ-VITE_SUPABASE_URL
```

## שינויי סכמה חדשים

**תמיד** דרך Supabase CLI — לא SQL ידני ב-Dashboard:

```bash
supabase migration new my_feature_name
# ערוך את הקובץ ב-supabase/migrations/
supabase db reset          # בדיקה מקומית
npm run db:advisors        # advisors מקומי
npm run db:rls             # בדיקות RLS אוטומטיות (SupaShield)
# RLS Tester ב-Dashboard — ראה docs/rls-tester.md
npm run db:advisors:remote # advisors על פרויקט מקושר
supabase db push           # פריסה לפרודקשן (אחרי review)
```

פקודות שימושיות:

| פקודה | שימוש |
|--------|--------|
| `supabase migration list` | מצב migrations מקומי מול remote |
| `supabase db diff` | הבדל בין מקומי ל-remote |
| `supabase db pull` | משיכת סכמה מ-remote (לעדכון baseline) |
| `supabase migration repair --status applied <ver>` | סימון migration כהוחל בלי הרצה |
| `npm run db:advisors` | בדיקת advisors מקומית (Splinter lints) |
| `npm run db:advisors:remote` | advisors על פרויקט מקושר |
| `npm run db:rls` | בדיקות RLS אוטומטיות לפי תפקיד (SupaShield) |
| `npm run db:rls:audit` | סריקת RLS כללית |

## RLS Tester

מדריך בדיקת policies לפי תפקיד: [`docs/rls-tester.md`](../docs/rls-tester.md)

- **ידני:** Supabase Dashboard → Feature Previews → **RLS Tester**
- **אוטומטי:** `npm run db:rls` — תרחישים ב-[`rls-scenarios.json`](rls-scenarios.json)

## בנייה מחדש של baseline

אם עדכנת קבצים ב-`archive/` או `legacy/`:

```bash
node scripts/build-baseline-migration.mjs
```

## סדר היסטורי (archive — לעיון בלבד)

1. `stream_line_os` → stages 2–6
2. `group_model_v2`, `recurring_lessons`, `lessons_instructor_id`, `lesson_manage`
3. `season_planning` → `season_planning_v2` → `merge_swimming_seasons`
4. `child_portal`, `leads_crm`, `price_list`, `waitlist`
5. `utilization_makeup`, `instructor_payroll`, `session_revenue`, `session_instructor_overrides`
6. `analytics_v2`, `command_center_*` (foundation → sheets → analytics → alerts → operations → perf_indexes)
7. `fix_*` (revenue, occupancy, list_due_lead_tasks)
8. `stream_line_cron`

## משתני סביבה לסקריפטים

| משתנה | שימוש |
|--------|--------|
| `DATABASE_URL` / `SUPABASE_DB_URL` | חיבור ישיר ל-Postgres (`scripts/apply-sql-files.mjs`) |
| `SUPABASE_SERVICE_ROLE_KEY` | seed, import scripts |
| `VITE_SUPABASE_URL` | כתובת הפרויקט (ref ב-JWT) |

Connection string: Supabase Dashboard → Settings → Database → Connection string (pooler).
