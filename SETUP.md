# Pool App (Stream Line) — מדריך התקנה

מדריך להקמת סביבת פיתוח מקומית ופריסה לפרודקשן.

---

## דרישות מקדימות

- **Node.js 22** (או 20+)
- חשבון [Supabase](https://supabase.com)
- (אופציונלי) [Supabase CLI](https://supabase.com/docs/guides/cli) — `npx supabase` או `brew install supabase/tap/supabase`
- (אופציונלי) חשבון [Sentry](https://sentry.io) לניטור שגיאות בפרודקשן

---

## שלב 1 — Clone והתקנה

```bash
git clone <repo-url> pool-app
cd pool-app
npm install
cp .env.example .env
```

---

## שלב 2 — משתני סביבה

ערוך את `.env` בשורש הפרויקט. הערכים נטענים דרך Vite (`import.meta.env.VITE_*`) — **אין לערוך מפתחות ב-`App.jsx`**.

### חובה (אפליקציה)

| משתנה | תיאור |
|--------|--------|
| `VITE_SUPABASE_URL` | כתובת הפרויקט — Supabase → Settings → API |
| `VITE_SUPABASE_ANON_KEY` | מפתח anon (public) |
| `VITE_ADMIN_EMAIL` | אימייל המנהל/בעל המערכת |

### סקריפטים ו-CLI (לא ב-client)

| משתנה | תיאור |
|--------|--------|
| `SUPABASE_SERVICE_ROLE_KEY` | service role — ל-`seed:demo`, import scripts |
| `SUPABASE_URL` | אותה כתובת כמו `VITE_SUPABASE_URL` |
| `DATABASE_URL` | connection string ל-Postgres — ל-Supabase CLI ו-`scripts/apply-sql-files.mjs` |

### אופציונלי

| משתנה | תיאור |
|--------|--------|
| `VITE_SENTRY_DSN` | ניטור שגיאות בפרודקשן |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | העלאת source maps ב-build (Vercel) |
| `VITE_AUTH_REDIRECT_URL` | כתובת חזרה מפורשת אחרי Google (פיתוח) |
| `VITE_LANDING_VIDEO_URL` | סרטון לדף הרשמה למבדק |

רשימה מלאה: [`.env.example`](.env.example)

---

## שלב 3 — Supabase: פרויקט ומסד נתונים

### פרויקט חדש

1. [supabase.com](https://supabase.com) → **New Project** — אזור מומלץ: `eu-central-1`
2. העתק URL ו-anon key ל-`.env`
3. חבר את הפרויקט:
   ```bash
   supabase link --project-ref <ref>   # ref מתוך ה-URL
   ```
4. הרץ migrations:
   ```bash
   supabase db push
   ```
   או מקומית:
   ```bash
   supabase start
   supabase db reset
   ```

ה-baseline המלא נמצא ב-[`supabase/migrations/20260630120000_baseline.sql`](supabase/migrations/20260630120000_baseline.sql). פרטים: [`supabase/README.md`](supabase/README.md).

### פרויקט קיים (כבר מעודכן)

אם ה-DB כבר מכיל את כל הטבלאות — **אל תריץ SQL ידנית**. חבר בלבד:

```bash
supabase link --project-ref <ref>
supabase migration list    # וידוא סנכרון
```

---

## שלב 4 — Google Auth

1. **Supabase Dashboard → Authentication → Providers → Google** — הפעל
2. [console.cloud.google.com](https://console.cloud.google.com) → OAuth 2.0 Client (Web)
3. **Authorized redirect URI:** `https://<ref>.supabase.co/auth/v1/callback`
4. העתק Client ID + Secret ל-Supabase Google Provider

### כניסה עם אימייל וסיסמה

1. **Authentication → Providers → Email** — הפעל
2. (פיתוח) כבה **Confirm email** למשתמשי דמו

---

## שלב 5 — משתמשי דמו

לאחר הגדרת `SUPABASE_SERVICE_ROLE_KEY` ב-`.env`:

```bash
npm run seed:demo
```

| תפקיד | אימייל | סיסמה |
|-------|--------|-------|
| שומר | `demo.guard@demo.streamline` | `Demo1234!` |
| מדריך | `demo.instructor@demo.streamline` | `Demo1234!` |
| מנהל | `demo.admin@demo.streamline` | `Demo1234!` |
| משרד | `demo.office@demo.streamline` | `Demo1234!` |

במצב פיתוח (`npm run dev`) מופיעים כפתורי כניסה מהירה במסך הכניסה.

---

## שלב 6 — פיתוח מקומי

```bash
npm run dev
```

האפליקציה ב-[http://localhost:5173](http://localhost:5173).

אם חסרים משתני Supabase — יוצג מסך שגיאה עם הוראות (לא קריסה שקטה).

קונפיגורציה: [`src/lib/config.js`](src/lib/config.js)

---

## שלב 7 — Redirect URLs ב-Supabase

**Authentication → URL Configuration:**

- **Site URL:** `https://your-app.vercel.app`
- **Redirect URLs:**
  ```
  https://your-app.vercel.app/**
  http://localhost:5173/**
  http://127.0.0.1:5173/**
  ```

> בלי `localhost` ברשימה, התחברות מקומית עם Google עלולה להחזיר ל-Vercel.

---

## שלב 8 — פריסה ב-Vercel

1. דחוף ל-GitHub וחבר ל-[vercel.com](https://vercel.com)
2. הגדר **Environment Variables** (Production + Preview):

| משתנה | חובה |
|--------|------|
| `VITE_SUPABASE_URL` | כן |
| `VITE_SUPABASE_ANON_KEY` | כן |
| `VITE_ADMIN_EMAIL` | כן |
| `VITE_SENTRY_DSN` | מומלץ |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | ל-source maps |

3. Deploy אוטומטי בכל push ל-`main`

Rewrites ל-SPA: [`vercel.json`](vercel.json) (`/k/:token`, `/t/:token`, דפי הרשמה).

---

## שלב 9 — Sentry (ניטור שגיאות)

1. צור פרויקט ב-[sentry.io](https://sentry.io) — פלטפורמה: **React**
2. העתק DSN ל-`VITE_SENTRY_DSN` ב-Vercel
3. (אופציונלי) הגדר Auth Token + Org + Project ל-source maps
4. הגדר **Alert** לשגיאות חדשות בפרודקשן

Sentry פעיל **רק בפרודקשן** (`import.meta.env.PROD`) ורק כשיש DSN.

---

## מבנה הפרויקט

```
pool-app/
├── src/
│   ├── App.jsx              # אפליקציה ראשית
│   ├── main.jsx             # כניסה + Sentry + ErrorBoundary
│   ├── components/          # קומפוננטות UI
│   └── lib/                 # לוגיקה, config, Supabase client
├── supabase/
│   ├── migrations/          # migrations רשמיים (baseline + חדשים)
│   ├── functions/           # Edge Functions (WhatsApp, Sheets)
│   └── README.md            # מדריך DB
├── scripts/                 # seed, import, sync
├── e2e/                     # בדיקות Playwright
├── .env.example
├── SETUP.md                 # המסמך הזה
└── README.md                # פקודות פיתוח ו-CI
```

---

## זרימת אישור משתמש

```
מדריך/שומר → כניסה עם Google או אימייל
      ↓
מסך "ממתין לאישור"
      ↓
מנהל → לשונית ניהול → "מדריך" / "שומר" / "משרד"
      ↓
המשתמש מרענן → נכנס עם התפקיד
```

---

## שאלות נפוצות

**ש: ההורה צריך להתחבר?**  
ת: לא. דף הכרטיס (`?ticket=UUID`) פתוח. רק צוות (מדריך/שומר/מנהל/משרד) מתחבר.

**ש: איך מוסיפים שינוי לסכמת DB?**  
ת: `supabase migration new <name>` → עריכה → `supabase db reset` (מקומי) → `supabase db push` (פרודקשן). ראה [`supabase/README.md`](supabase/README.md).

**ש: מה עם הקבצים הישנים `supabase_migration_*.sql`?**  
ת: הועברו ל-`supabase/migrations/archive/` לתיעוד. ה-baseline כולל את כולם.

**ש: הסורק לא עובד בנייד?**  
ת: יש לאשר הרשאת מצלמה בפעם הראשונה.

---

## פקודות שימושיות

```bash
npm run dev           # שרת פיתוח
npm run build         # בניית production
npm run lint          # ESLint
npm test              # Vitest
npm run test:e2e      # Playwright
npm run seed:demo     # משתמשי דמו
```

פרטים נוספים: [`README.md`](README.md)
