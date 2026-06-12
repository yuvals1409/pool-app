# 🏊 Pool App — מדריך הפעלה

## מה שבנינו
- **כניסה עם Google** — מדריכים ושומרים נרשמים
- **אישור מנהל** — אתה רואה רשימה, לוחץ "מדריך" או "שומר" → המשתמש מאושר ומקבל גישה
- **ברקוד חד-פעמי** — נוצר ב-QR, נשלח ב-WhatsApp, נסרק בכניסה ומבוטל מיידית
- **לוג מלא** — כל כניסה מתועדת

---

## שלב 1 — יצירת פרויקט Supabase

1. כנס ל-[supabase.com](https://supabase.com) → **New Project**
2. תן שם: `pool-app`, בחר סיסמה חזקה, אזור: `eu-central-1` (פרנקפורט, הכי קרוב)
3. המתן ~2 דקות עד שהפרויקט מוכן

---

## שלב 2 — הרצת SQL

1. לך ל-**SQL Editor** (סרגל צד שמאל)
2. פתח את הקובץ `supabase_setup.sql` ממדריך זה
3. **הרץ** (Run) — תראה `Setup complete ✓`

---

## שלב 3 — הפעלת Google Auth

1. **Supabase Dashboard → Authentication → Providers → Google**
2. הפעל (Enable)
3. לך ל-[console.cloud.google.com](https://console.cloud.google.com)
4. צור פרויקט חדש → **APIs & Services → Credentials → Create OAuth 2.0 Client**
5. סוג: **Web Application**
6. Authorized redirect URIs: `https://YOUR_PROJECT.supabase.co/auth/v1/callback`
   (מצא את ה-URL ב-Supabase → Settings → API → Project URL)
7. העתק **Client ID** ו-**Client Secret** → הדבק ב-Supabase Google Provider
8. שמור

---

## שלב 4 — עדכון הקוד

פתח `App.jsx` ועדכן שלוש שורות בראש הקובץ:

```js
const SUPABASE_URL    = "https://xxxxxxxxxxxx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";
const ADMIN_EMAIL     = "your@gmail.com";  // המייל שלך
```

מצא את הערכים ב-Supabase → **Settings → API**

---

## שלב 5 — פריסה ב-Vercel (חינם)

### אפשרות א׳ — Vite (מומלץ)
```bash
npm create vite@latest pool-app -- --template react
cd pool-app
# החלף את src/App.jsx בקובץ שלנו
npm install @supabase/supabase-js qrcode jsqr
npm run build
```
העלה ל-GitHub → חבר ל-[vercel.com](https://vercel.com) → Deploy אוטומטי.

### אפשרות ב׳ — StackBlitz
גרור את `App.jsx` ל-[stackblitz.com/fork/vite-react](https://stackblitz.com/fork/vite-react) ← מיידי.

---

## שלב 6 — הגדרת Redirect URL ב-Supabase

1. **Supabase → Authentication → URL Configuration**
2. **Site URL** (פרודקשן): `https://your-app.vercel.app`
3. **Redirect URLs** — הוסף את **כל** הכתובות הבאות (שורה לכל אחת):
   ```
   https://your-app.vercel.app/**
   http://localhost:5173/**
   http://127.0.0.1:5173/**
   ```

> **חשוב:** בלי `localhost` ברשימה, התחברות מקומית תחזיר אותך אוטומטית ל-Vercel אחרי Google.

---

## זרימת אישור משתמש

```
מדריך/שומר → כניסה עם Google
      ↓
מסך "ממתין לאישור"
      ↓
אתה (מנהל) → לשונית "ניהול" → לוחץ "מדריך" או "שומר"
      ↓
המשתמש מרענן את הדף → נכנס למערכת עם התפקיד שלו
```

> **טיפ:** כדי לשלוח מייל אוטומטי לאחר אישור, בעתיד אפשר להוסיף Supabase Edge Function קטנה.

---

## מבנה הקובץ

```
pool-app/
├── App.jsx              ← כל האפליקציה (קומפוננטה אחת)
├── supabase_setup.sql   ← הרץ פעם אחת ב-Supabase
└── SETUP.md             ← המסמך הזה
```

---

## שאלות נפוצות

**ש: ההורה צריך להתחבר?**  
ת: לא. דף הכרטיס (`?ticket=UUID`) פתוח לכולם. רק מדריכים/שומרים מתחברים.

**ש: מה קורה אם הסורק לא עובד?**  
ת: הדפדפן ב-iPhone/Android מבקש הרשאת מצלמה בפעם הראשונה. יש לאשר.

**ש: אפשר להוסיף מדריכים נוספים?**  
ת: כן — כל מי שנכנס עם Google מופיע בלשונית "ניהול" שלך לאישור.
