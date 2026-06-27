---
name: pool-domain
description: Stream Line business logic and product domain. Use for permissions, roles, schedule flows, enrollments, QR passes, attendance, lesson mutations, waitlist, payroll rules, or any product behavior in src/lib/ and tab components.
---

# דומיין / מוצר — Stream Line

## תפקידי משתמש

| Role | עברית | משטח |
|------|-------|------|
| Owner | מפתח מערכת | הכל |
| Admin | מנהל | CRM workspace |
| Instructor | מדריך | לו"ז + נוכחות |
| Guard | שומר | סורק QR |
| Office | משרד | טבלת הרשמות |
| Parent | הורה | כרטיס שיעור / QR |

## קבצי מפתח

| קובץ | תחום |
|------|------|
| `src/lib/permissions.js` | הרשאות לפי תפקיד |
| `src/lib/lessonMutations.js` | יצירה/עדכון/ביטול שיעורים |
| `src/lib/attendance.js` | נוכחות |
| `src/lib/accessPass.js` | כרטיסי כניסה / QR |
| `src/lib/makeup.js` | שיעורי makeup |
| `src/lib/waitlist.js` | רשימת המתנה |
| `src/components/schedule/` | לו"ז — לוגיקה ותצוגה |
| `src/components/*Tab*.jsx` | מסכי תפקידים |

## עקרונות

- שמור על מודל המוצר הקיים — אל תשבור flows שעובדים
- שינוי UX (סדר, labels, affordances) — מותר
- שינוי כלל עסקי (מי רואה מה, מתי מותר לבטל) — **רק באישור בעל המוצר**
- mutations דרך helpers ב-`src/lib/` — לא כפילות לוגיקה ב-UI

## זרימות נפוצות

- **לו"ז:** שיעורים חוזרים, החלפות מדריך, scope dialogs
- **הרשמות:** enrollments, waitlist, products, seasons
- **כניסה:** QR scan (guard), access passes (parent)
- **נוכחות:** instructor attendance, payroll hooks

## מחוץ לתחום

- migrations / schema → `pool-data`
- בחירת Button vs Card → `pool-design`

## לפני שינוי גדול

שאל: מי המשתמש? איזה תפקיד? מה הכלל היום? מה צריך להישאר?
