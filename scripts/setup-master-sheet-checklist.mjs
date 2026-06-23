#!/usr/bin/env node
/**
 * Prints setup checklist + rebuilds local CSV bootstrap.
 * Run: node scripts/setup-master-sheet-checklist.mjs
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const LEADS = "/Users/yuvalsacagiu/Downloads/עותק של לידים נווה עוז 21.6.xlsx";
const ANNUAL = "/Users/yuvalsacagiu/Downloads/עותק של stream line עונת 2025_26 21.6.xlsx";
const SUMMER = "/Users/yuvalsacagiu/Downloads/עותק של קיץ 2026 נווה עוז 21.6.xlsx";

const paths = { leads: LEADS, annual: ANNUAL, summer: SUMMER };
const missing = Object.entries(paths).filter(([, p]) => !existsSync(p));

if (!missing.length) {
  const cmd = [
    "node scripts/build-master-sheet.mjs",
    `--leads "${LEADS}"`,
    `--annual "${ANNUAL}"`,
    `--summer "${SUMMER}"`,
    "--out-dir ./data/import/master-sheet",
  ].join(" ");
  execSync(cmd, { stdio: "inherit", cwd: resolve(process.cwd()) });
  console.log("להעלאה לגיליון קיים: node scripts/patch-google-sheet.mjs --upload ...");
}

console.log(`
╔══════════════════════════════════════════════════════════════╗
║  Stream Line — הגדרת Google Sheet מאסטר                     ║
╚══════════════════════════════════════════════════════════════╝

✅ כבר בוצע אוטומטית:
   • Migration ב-Supabase (tc_leads, master_sheet_config)
   • קובץ CSV מקומי: data/import/master-sheet/מאסטר_סנכרון.csv
   • קוד סנכרון (Edge Function sync-google-sheets mode=master)

${missing.length ? `⚠️  קבצי xlsx חסרים: ${missing.map(([k]) => k).join(", ")}` : "✅ Bootstrap מ-3 קבצי xlsx"}

───────────────────────────────────────────────────────────────
שלבים שאתה צריך לעשות ידנית:
───────────────────────────────────────────────────────────────

1️⃣  Google Cloud — Service Account
   • console.cloud.google.com → APIs → הפעל Google Sheets API
   • IAM → Service Accounts → Create → הורד JSON key
   • העתק את כל תוכן ה-JSON

2️⃣  צור Google Sheet מאסטר
   • אפשרות א: העלה את data/import/master-sheet/מאסטר_סנכרון.csv
     ל-Google Sheets חדש (שם: "Stream Line מאסטר")
   • אפשרות ב: אם יש JSON key ב-.env:
     node scripts/build-master-sheet.mjs --create "Stream Line מאסטר" --upload \\
       --leads "..." --annual "..." --summer "..."

3️⃣  שתף את הגיליונות עם ה-Service Account
   • פתח את הגיליון → שיתוף → הוסף את client_email מה-JSON (עורך)
   • חזור על זה גם לגיליון "לידים נווה עוז" (של tc-leads)

4️⃣  הגדר Secrets ב-Supabase
   Dashboard → Edge Functions → sync-google-sheets → Secrets:
   • SHEETS_SPREADSHEET_ID = מזהה הגיליון מאסטר (מה-URL)
   • SHEETS_LEADS_SPREADSHEET_ID = מזהה גיליון לידים נווה עוז
   • GOOGLE_SERVICE_ACCOUNT_JSON = כל ה-JSON בשורה אחת

   אופציונלי ב-.env מקומי + Vercel:
   • VITE_SHEETS_SPREADSHEET_ID (לקישור בממשק מנהל)

5️⃣  גיליון לידים_נכנסים במאסטר
   • בגיליון מאסטר, טאב "לידים_נכנסים" תא A1:
     =IMPORTRANGE("SHEETS_LEADS_SPREADSHEET_ID","'מבדק שחיה 2026'!A:Z")
     (החלף SHEETS_LEADS_SPREADSHEET_ID במזהה האמיתי מה-URL — לא טקסט בעברית!)
   • אשר חיבור IMPORTRANGE בפעם הראשונה
   • שתף גם את "לידים נווה עוז" עם ה-Service Account (עורך)

6️⃣  מורן עובדת במאסטר V2
   • סדר: קבוצות → משבצות_קבוצות → משתמשים → מאסטר_סנכרון
   • בוחרים שם_קבוצה — ימים/שעות/מדריך מתמלאים אוטומטית
   • תא עם "-" = לא רלוונטי (אין למלא)
   • גיל וכיתה מתמלאים מתאריך לידה; מגיל 19 כיתה = לא רלוונטי
   • נוכחות_מבדק=לא → תוצאת_מבדק=לא הגיע
   • לעדכון גיליון קיים: node scripts/patch-google-sheet.mjs --upload --annual ... --summer ...
   • בודקת קונפליקטים (גיליון קונפליקטים)
   • משלימה שדות חסרים (25 שורות עם שלמות=לא)
   • מסמנת מוכן_לסנכרון=כן לשורות מוכנות
   • כשהכל מוכן: גיליון הגדרות → מוכן_לסנכרון_כללי=כן

7️⃣  סנכרון ראשון
   • במערכת: טאב סנכרון גיליונות → "סנכרן מאסטר"
   • או: Supabase → Cron → 0 5 * * * → POST sync-google-sheets
     body: {"mode":"master","direction":"pull"}

8️⃣  אחרי אימות — מורן ממשיכה לעדכן את השיטס
   • הסנכרון היומי ימשיך לעדכן את המערכת
   • לידים חדשים מ-tc-leads יתווספו אוטומטית למאסטר

───────────────────────────────────────────────────────────────
מזהה Spreadsheet: מה-URL של Google Sheets
https://docs.google.com/spreadsheets/d/XXXXXXXXXX/edit
                                    ^^^^^^^^^^
───────────────────────────────────────────────────────────────
`);
