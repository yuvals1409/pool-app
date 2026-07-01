# Pool App (Stream Line)

מדריך התקנה מלא: [`SETUP.md`](SETUP.md)

## פקודות איכות קוד

```bash
npm run lint          # ESLint על src + supabase/functions
npm run lint:fix      # תיקון אוטומטי
npm run typecheck     # בדיקת טיפוסים (checkJs) על src/lib
npm test              # Vitest — בדיקות unit
npm run test:watch    # Vitest במצב watch
npm run test:e2e      # Playwright — E2E (desktop + mobile)
npm run build         # בניית production
npm run seed:demo     # משתמשי דמו ב-Supabase
npm run seed:e2e      # fixtures קבועים לבדיקות E2E (אחרי seed:demo)
npm run db:advisors   # Supabase advisors מקומי (אחרי supabase start)
npm run db:advisors:security  # advisors — רק אבטחה
npm run db:advisors:remote    # advisors על פרויקט מקושר
npm run tools:verify  # בדיקת supabase CLI + gh
```

לפני כל commit רצים אוטומטית `lint-staged` + `npm test` (Husky).

## בדיקות E2E (Playwright)

Playwright טוען את `.env` אוטומטית — אין צורך ב-`export` ידני.

אם `npm run dev` רץ על פורט 5173 — אין התנגשות; Playwright מרים שרת נפרד על **5174** עם `VITE_E2E_HOOKS=true`.

לפני הרצה מקומית עם זרימות DB (guard QR, office search, parent ticket):

```bash
npm run seed:demo
npm run seed:e2e   # דורש SUPABASE_SERVICE_ROLE_KEY ב-.env
npm run test:e2e
```

### פרויקטים

| פרויקט | מכשיר | specs |
|--------|--------|-------|
| `desktop` | Desktop Chrome | רוב הבדיקות |
| `mobile` | iPhone 13 | `instructor-mobile.spec.js`, `instructor-attendance.spec.js` |

### משתני סביבה

| משתנה | שימוש |
|--------|--------|
| `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` | login ב-`login.spec.js` |
| `E2E_QR_TOKEN` | סריקת שומר (ברירת מחדל מה-seed) |
| `E2E_SEARCH_PHONE` | חיפוש משרד |
| `E2E_LESSON_ID` | כרטיס הורה `?ticket=` |
| `E2E_PASS_TOKEN` | כרטיס מנוי `/t/` |
| `E2E_GROUP_SESSION_ID` | חוג קבוצתי לנוכחות מדריך (ברירת מחדל מה-seed) |
| `VITE_E2E_HOOKS` | `true` ב-webServer של Playwright — hook לסריקת QR |

## GitHub Actions (CI)

אחרי `git push`, בדוק ב-GitHub → **Actions** שהריצה ירוקה.

הגדר ב-GitHub → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | ערך |
|--------|-----|
| `VITE_SUPABASE_URL` | כתובת הפרויקט |
| `VITE_SUPABASE_ANON_KEY` | מפתח anon |
| `VITE_ADMIN_EMAIL` | אימייל המנהל |
| `E2E_TEST_EMAIL` | `demo.admin@demo.streamline` |
| `E2E_TEST_PASSWORD` | `Demo1234!` |
| `SUPABASE_SERVICE_ROLE_KEY` | service role — ל-seed ב-CI |
| `E2E_QR_TOKEN` | `e2e00001-0000-4000-8000-000000000001` |
| `E2E_SEARCH_PHONE` | `0501111999` |
| `E2E_LESSON_ID` | `e2e00002-0000-4000-8000-000000000002` |
| `E2E_PASS_TOKEN` | `e2e00003-0000-4000-8000-000000000003` |
| `E2E_GROUP_SESSION_ID` | `e2e00005-0000-4000-8000-000000000005` |
| `SUPABASE_ACCESS_TOKEN` | ל-workflow DB Advisors — Access Token מ-Supabase |
| `SUPABASE_PROJECT_REF` | ref מתוך `VITE_SUPABASE_URL` (למשל `abcdefghijklmnop`) |
| `SNYK_TOKEN` | ל-workflow Snyk — API token מ-[snyk.io](https://snyk.io) (Account Settings → General) |

### Snyk (workflow נפרד)

קובץ [`.github/workflows/snyk.yml`](.github/workflows/snyk.yml) רץ על PR/push ל-`main` (ובשבועיות) וסורק תלויות (`snyk test`) וקוד (`snyk code test`) עם סף חומרה `high`.

```bash
gh secret set SNYK_TOKEN --body "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

בלי `SNYK_TOKEN` — הסריקה מדולגת (notice, לא כשל).

**Snyk Code** (סריקת קוד סטטית) כבוי כברירת מחדל. להפעלה: ב-[snyk.io](https://snyk.io) הפעל **Snyk Code** לארגון, ואז הגדר repository variable:

```bash
gh variable set SNYK_CODE_ENABLED --body true
```

### DB Advisors (workflow נפרד)

קובץ [`.github/workflows/db-advisors.yml`](.github/workflows/db-advisors.yml) רץ על כל PR/push ל-`main` ובודק אבטחת DB בפרויקט המקושר (`supabase db advisors --linked --type security`).

בלי `SUPABASE_ACCESS_TOKEN` ו-`SUPABASE_PROJECT_REF` — ה-workflow ייכשל.

### Dependabot

[`.github/dependabot.yml`](.github/dependabot.yml) פותח PRs שבועיים לעדכוני npm ו-GitHub Actions.

ב-CI רצים `seed:demo` ו-`seed:e2e` לפני `test:e2e` (כש-`SUPABASE_SERVICE_ROLE_KEY` מוגדר).

בלי Supabase אמיתי — smoke ו-health-declaration עדיין רצים; בדיקות DB מדולגות.

## Vercel (פרודקשן)

בנוסף ל-secrets של CI, הגדר ב-Vercel → **Settings → Environment Variables**:

| משתנה | חובה | שימוש |
|--------|------|--------|
| `VITE_SENTRY_DSN` | מומלץ | ניטור שגיאות בפרודקשן |
| `SENTRY_AUTH_TOKEN` | אופציונלי | source maps ב-build |
| `SENTRY_ORG` | עם token | שם הארגון ב-Sentry |
| `SENTRY_PROJECT` | עם token | שם הפרויקט ב-Sentry |

אחרי deploy — בדוק ב-Sentry dashboard שהשגיאות מגיעות (אפשר לזרוק שגיאה מכוונת פעם אחת).

## שלב 3 — Vitest + E2E נוכחות

```bash
npm test                              # ~114 בדיקות unit (waitlist + attendance)
npm run seed:demo && npm run seed:e2e # fixtures לשיעור פרטי + חוג קבוצתי
npm run test:e2e                      # ~17 בדיקות (כולל נוכחות מדריך במובייל)
```

רק בדיקות mobile (מדריך):

```bash
npx playwright test --project=mobile
```
