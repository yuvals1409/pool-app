# Pool App (Stream Line)

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
| `mobile` | iPhone 13 | `instructor-mobile.spec.js` |

### משתני סביבה

| משתנה | שימוש |
|--------|--------|
| `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` | login ב-`login.spec.js` |
| `E2E_QR_TOKEN` | סריקת שומר (ברירת מחדל מה-seed) |
| `E2E_SEARCH_PHONE` | חיפוש משרד |
| `E2E_LESSON_ID` | כרטיס הורה `?ticket=` |
| `E2E_PASS_TOKEN` | כרטיס מנוי `/t/` |
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

ב-CI רצים `seed:demo` ו-`seed:e2e` לפני `test:e2e` (כש-`SUPABASE_SERVICE_ROLE_KEY` מוגדר).

בלי Supabase אמיתי — smoke ו-health-declaration עדיין רצים; בדיקות DB מדולגות.
