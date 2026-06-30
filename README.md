# Pool App (Stream Line)

## פקודות איכות קוד

```bash
npm run lint          # ESLint על src + supabase/functions
npm run lint:fix      # תיקון אוטומטי
npm run typecheck     # בדיקת טיפוסים (checkJs) על src/lib
npm test              # Vitest — בדיקות unit
npm run test:watch    # Vitest במצב watch
npm run test:e2e      # Playwright — smoke + login (אופציונלי)
npm run build         # בניית production
```

לפני כל commit רצים אוטומטית `lint-staged` + `npm test` (Husky).

לבדיקת login ב-E2E הגדר ב-`.env`:

- `E2E_TEST_EMAIL` — למשל `demo.admin@demo.streamline`
- `E2E_TEST_PASSWORD` — `Demo1234!` (אחרי `npm run seed:demo`)

Playwright טוען את `.env` אוטומטית — אין צורך ב-`export` ידני.

## GitHub Actions (CI)

אחרי `git push`, בדוק ב-GitHub → **Actions** שהריצה ירוקה.

הגדר ב-GitHub → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | ערך (מה-`.env` שלך) |
|--------|---------------------|
| `VITE_SUPABASE_URL` | כתובת הפרויקט |
| `VITE_SUPABASE_ANON_KEY` | מפתח anon |
| `VITE_ADMIN_EMAIL` | אימייל המנהל |
| `E2E_TEST_EMAIL` | `demo.admin@demo.streamline` |
| `E2E_TEST_PASSWORD` | `Demo1234!` |

בלי ה-secrets האלה בדיקת ה-login ב-CI תדולג; smoke עדיין ירוץ אם Supabase מוגדר.
