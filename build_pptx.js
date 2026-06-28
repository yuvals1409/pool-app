const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const path = require("path");

function renderIconSvg(IconComponent, color = "#000000", size = 256) {
  return ReactDOMServer.renderToStaticMarkup(
    React.createElement(IconComponent, { color, size: String(size) })
  );
}
async function iconToBase64Png(IconComponent, color, size = 256) {
  const svg = renderIconSvg(IconComponent, color, size);
  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + pngBuffer.toString("base64");
}

const C = {
  navy: "1A2B4A", blue: "2563EB", lightBlue: "3B82F6", orange: "F97316",
  white: "FFFFFF", offWhite: "F8FAFC", lightGray: "F1F5F9",
  midGray: "94A3B8", darkGray: "334155", text: "1E293B",
  green: "059669", red: "DC2626", teal: "0D9488",
};
const makeShadow = () => ({ type: "outer", color: "000000", blur: 8, offset: 3, angle: 45, opacity: 0.12 });
const LOGO_DIR = path.join(__dirname, "public");
const SL_LOGO = path.join(LOGO_DIR, "stream-line-logo.jpeg");
const NO_LOGO = path.join(LOGO_DIR, "logo.png");

async function build() {
  const { FaExclamationTriangle, FaCreditCard, FaWhatsapp, FaWpforms, FaChartLine, FaRocket, FaUsers, FaClipboardList, FaMobileAlt, FaLaptop, FaCheck, FaArrowRight, FaGlobe, FaMoneyBillWave, FaPercentage, FaClock } = require("react-icons/fa");

  const icons = {};
  const iconMap = {
    warning: [FaExclamationTriangle, C.orange], credit: [FaCreditCard, C.blue],
    whatsapp: [FaWhatsapp, "#25D366"], forms: [FaWpforms, C.teal],
    chart: [FaChartLine, C.blue], rocket: [FaRocket, C.orange],
    users: [FaUsers, C.blue], clipboard: [FaClipboardList, C.darkGray],
    mobile: [FaMobileAlt, C.blue], laptop: [FaLaptop, C.navy],
    check: [FaCheck, C.green], arrow: [FaArrowRight, C.orange],
    globe: [FaGlobe, C.blue], money: [FaMoneyBillWave, C.green],
    percent: [FaPercentage, C.red], clock: [FaClock, C.orange],
    invoice: [FaMoneyBillWave, C.blue],
  };
  for (const [k, [comp, col]] of Object.entries(iconMap)) {
    icons[k] = await iconToBase64Png(comp, col);
  }

  let pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  pres.author = "Stream Line";
  pres.title = "Stream Line - Neve Oz";
  pres.rtlMode = true;

  // SLIDE 1: TITLE
  let s1 = pres.addSlide();
  s1.background = { color: C.navy };
  s1.addImage({ path: SL_LOGO, x: 7.5, y: 0.3, w: 2.0, h: 1.0 });
  s1.addImage({ path: NO_LOGO, x: 8.0, y: 3.8, w: 1.3, h: 1.0 });
  s1.addText("STREAM LINE", { x: 0.5, y: 1.0, w: 6.8, h: 1.2, fontSize: 48, fontFace: "Arial", bold: true, color: C.white, align: "right", margin: 0 });
  s1.addText("ניהול בית ספר לשחייה | סליקה דיגיטלית | בוט WhatsApp | טפסים דיגיטליים", { x: 0.5, y: 2.2, w: 7, h: 0.6, fontSize: 16, fontFace: "Arial", color: C.midGray, align: "right", margin: 0 });
  s1.addShape(pres.shapes.LINE, { x: 3, y: 3.0, w: 4.5, h: 0, line: { color: C.orange, width: 3 } });
  s1.addText("מרכז ספורט נווה עוז — פתח תקווה", { x: 0.5, y: 3.3, w: 7, h: 0.5, fontSize: 20, fontFace: "Arial", color: C.lightBlue, align: "right", margin: 0 });
  s1.addText("יוני 2026", { x: 0.5, y: 3.9, w: 7, h: 0.4, fontSize: 14, fontFace: "Arial", color: C.midGray, align: "right", margin: 0 });
  s1.addNotes("פתיחה: הצג את עצמך כמדריך שחייה שבנה מערכת ניהול מהשטח. ציין שאתה מכיר את האתגרים מבפנים. הקדם: 'בואו נראה את הנתונים ואיך אפשר לשפר.'");

  // SLIDE 2: FINANCIAL SNAPSHOT
  let s2 = pres.addSlide();
  s2.background = { color: C.white };
  s2.addText("תמונה כספית — נווה עוז 2024", { x: 0.5, y: 0.3, w: 9, h: 0.6, fontSize: 28, fontFace: "Arial", bold: true, color: C.navy, align: "right", margin: 0 });
  s2.addText("מתוך הדוחות הכספיים המבוקרים", { x: 0.5, y: 0.85, w: 9, h: 0.4, fontSize: 12, fontFace: "Arial", color: C.midGray, align: "right", margin: 0 });

  const stats = [
    { val: "9.3M", unit: "₪", label: "מחזור שנתי", icon: icons.money, bg: "F0FDF4" },
    { val: "427K", unit: "₪", label: "עודף נטו (ירידה של 30%)", icon: icons.percent, bg: "FEF2F2" },
    { val: "3.7M", unit: "₪", label: "מזומנים בקופה", icon: icons.invoice, bg: "EFF6FF" },
    { val: "51", unit: "", label: "עובדים | 369 חברים", icon: icons.users, bg: "F5F3FF" },
  ];
  for (let i = 0; i < 4; i++) {
    const col = i % 2, row = Math.floor(i / 2);
    const x = col === 0 ? 5.2 : 0.5, y = 1.5 + row * 1.8;
    s2.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: 4.3, h: 1.5, fill: { color: stats[i].bg }, rectRadius: 0.15, shadow: makeShadow() });
    s2.addImage({ data: stats[i].icon, x: x + 3.4, y: y + 0.15, w: 0.5, h: 0.5 });
    s2.addText(stats[i].val + stats[i].unit, { x: x + 0.2, y: y + 0.15, w: 3, h: 0.7, fontSize: 36, fontFace: "Arial", bold: true, color: C.navy, align: "right", margin: 0 });
    s2.addText(stats[i].label, { x: x + 0.2, y: y + 0.85, w: 3.8, h: 0.45, fontSize: 14, fontFace: "Arial", color: C.darkGray, align: "right", margin: 0 });
  }
  s2.addNotes("שקף כספי — הראה שאתה מכיר את הנתונים. נקודות: מחזור 9.3M אבל עודף ירד 30%. שכר שטח עלה 17.3%. הכנסות מראש 3.7M = כמעט כל המזומנים — שימור קריטי. הוצאות משרדיות עלו 23% ל-243K.");

  // SLIDE 3: PAIN POINTS
  let s3 = pres.addSlide();
  s3.background = { color: C.offWhite };
  s3.addText("האתגרים שזיהינו", { x: 0.5, y: 0.3, w: 9, h: 0.6, fontSize: 28, fontFace: "Arial", bold: true, color: C.navy, align: "right", margin: 0 });

  const pains = [
    { icon: icons.clipboard, title: "ניהול ידני", desc: "שכר הנהלה 985K₪, הוצאות משרדיות 243K₪ (+23%). תהליכים ידניים שורפים זמן ותקציב.", bg: "FFF7ED" },
    { icon: icons.credit, title: "אין סליקה דיגיטלית", desc: "ללא ניהול תקין מ-2019. עמלות כרטיסי אשראי 54K₪. PayMe פותר את זה מיידית.", bg: "FEF2F2" },
    { icon: icons.clock, title: "עומס על צוות השטח", desc: "שכר שטח זינק 17.3% ל-3.47M₪. יותר עובדים, אותם כלים ידניים — צריך אוטומציה.", bg: "EFF6FF" },
    { icon: icons.forms, title: "טפסים פיזיים", desc: "הצהרות בריאות, רישום, ודוחות נוכחות על נייר. 369 חברים + מאות תלמידי שחייה.", bg: "F0FDF4" },
  ];
  for (let i = 0; i < 4; i++) {
    const row = Math.floor(i / 2), col = i % 2;
    const x = col === 0 ? 5.2 : 0.5, y = 1.2 + row * 2.1;
    s3.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: 4.3, h: 1.85, fill: { color: pains[i].bg }, rectRadius: 0.12, shadow: makeShadow() });
    s3.addImage({ data: pains[i].icon, x: x + 3.5, y: y + 0.15, w: 0.45, h: 0.45 });
    s3.addText(pains[i].title, { x: x + 0.2, y: y + 0.15, w: 3.2, h: 0.4, fontSize: 18, fontFace: "Arial", bold: true, color: C.navy, align: "right", margin: 0 });
    s3.addText(pains[i].desc, { x: x + 0.2, y: y + 0.65, w: 3.9, h: 1.0, fontSize: 12, fontFace: "Arial", color: C.darkGray, align: "right", margin: 0 });
  }
  s3.addNotes("כאבים — תן דוגמה מהשטח לכל אחד. ניהול ידני: מורן מתעדת נוכחות ידנית. סליקה: בלי ניהול תקין מ-2019. עומס: שכר שטח +17% כי עובדים שעות על דברים שצריכים להיות אוטומטיים. טפסים: 600+ בשנה על נייר.");

  // SLIDE 4: CRM SOLUTION
  let s4 = pres.addSlide();
  s4.background = { color: C.white };
  s4.addText("שכבה 1: מערכת CRM לבית הספר לשחייה", { x: 0.5, y: 0.3, w: 9, h: 0.6, fontSize: 24, fontFace: "Arial", bold: true, color: C.navy, align: "right", margin: 0 });

  const features = ["ניהול תלמידים, קבוצות ומדריכים", "לוח שיעורים שבועי חכם", "מעקב נוכחות דיגיטלי — במקום דפי נייר", "הערכות שחייה ודוחות התקדמות", "ניהול כספי — חיובים, תשלומים, חובות", "דשבורד מנהלים עם תובנות בזמן אמת", "עובד לצד Fizikal — לא מחליף אותו"];
  for (let i = 0; i < features.length; i++) {
    s4.addImage({ data: icons.check, x: 8.8, y: 1.15 + i * 0.5, w: 0.3, h: 0.3 });
    s4.addText(features[i], { x: 0.5, y: 1.15 + i * 0.5, w: 8.1, h: 0.4, fontSize: 14, fontFace: "Arial", color: C.text, align: "right", margin: 0 });
  }
  s4.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.5, y: 4.6, w: 9, h: 0.7, fill: { color: "EFF6FF" }, rectRadius: 0.1 });
  s4.addText("המערכת כבר פעילה ומוכחת בשטח — נבנתה מתוך ניסיון של מדריך שחייה", { x: 0.5, y: 4.6, w: 9, h: 0.7, fontSize: 14, fontFace: "Arial", bold: true, color: C.blue, align: "center", valign: "middle", margin: 0 });
  s4.addNotes("הדגש: המערכת נבנתה מתוך הצורך שלך כמדריך. לא מחליף את Fizikal — משלים. הראה דמו אחרי השקף.");

  // SLIDE 5: PayMe + WhatsApp
  let s5 = pres.addSlide();
  s5.background = { color: C.offWhite };
  s5.addText("סליקה + תקשורת אוטומטית", { x: 0.5, y: 0.3, w: 9, h: 0.6, fontSize: 24, fontFace: "Arial", bold: true, color: C.navy, align: "right", margin: 0 });

  // PayMe card (right in RTL)
  s5.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 5.2, y: 1.1, w: 4.5, h: 3.5, fill: { color: "FEF2F2" }, rectRadius: 0.15, shadow: makeShadow() });
  s5.addImage({ data: icons.credit, x: 9.0, y: 1.3, w: 0.45, h: 0.45 });
  s5.addText("שכבה 2: סליקה PayMe", { x: 5.5, y: 1.3, w: 3.3, h: 0.5, fontSize: 18, fontFace: "Arial", bold: true, color: C.navy, align: "right", margin: 0 });
  ["עובד בלי ניהול תקין — הפתרון היחיד", "קישורי תשלום ב-WhatsApp ומייל", "חיוב אוטומטי חוזר (הוראות קבע)", "דוחות גבייה מלאים במערכת", "חוסך עמלות — היום 54K₪/שנה"].forEach((t, i) => {
    s5.addText("  " + t, { x: 5.4, y: 2.0 + i * 0.48, w: 4.1, h: 0.4, fontSize: 12, fontFace: "Arial", color: C.darkGray, align: "right", margin: 0 });
  });

  // WhatsApp card (left in RTL)
  s5.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.3, y: 1.1, w: 4.5, h: 3.5, fill: { color: "F0FDF4" }, rectRadius: 0.15, shadow: makeShadow() });
  s5.addImage({ data: icons.whatsapp, x: 4.1, y: 1.3, w: 0.45, h: 0.45 });
  s5.addText("שכבה 3: בוט WhatsApp", { x: 0.5, y: 1.3, w: 3.3, h: 0.5, fontSize: 18, fontFace: "Arial", bold: true, color: C.navy, align: "right", margin: 0 });
  ["בוט AI שעונה 24/7 להורים", "תזכורות שיעורים אוטומטיות", "עדכוני נוכחות להורים בזמן אמת", "שליחת קישורי תשלום ישירות", "API ישיר מ-Meta — לא Twilio"].forEach((t, i) => {
    s5.addText("  " + t, { x: 0.5, y: 2.0 + i * 0.48, w: 4.1, h: 0.4, fontSize: 12, fontFace: "Arial", color: C.darkGray, align: "right", margin: 0 });
  });

  s5.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 1.5, y: 4.8, w: 7, h: 0.6, fill: { color: C.orange }, rectRadius: 0.1 });
  s5.addText("PayMe = הנקודה החזקה ביותר. Fizikal לא יכול לפתור את בעיית הסליקה.", { x: 1.5, y: 4.8, w: 7, h: 0.6, fontSize: 13, fontFace: "Arial", bold: true, color: C.white, align: "center", valign: "middle", margin: 0 });
  s5.addNotes("PayMe — הקלף המנצח: בלי ניהול תקין אי אפשר סליקה רגילה. 54K₪ עמלות. WhatsApp: במקום שמורן תתקשר — בוט שולח הכל אוטומטי. Fizikal לא מציע לא סליקה ולא WhatsApp.");

  // SLIDE 6: DIGITAL FORMS
  let s6 = pres.addSlide();
  s6.background = { color: C.white };
  s6.addText("שכבה 4: טפסים דיגיטליים", { x: 0.5, y: 0.3, w: 9, h: 0.6, fontSize: 24, fontFace: "Arial", bold: true, color: C.navy, align: "right", margin: 0 });

  s6.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 5.2, y: 1.1, w: 4.5, h: 2.8, fill: { color: "FEF2F2" }, rectRadius: 0.15, shadow: makeShadow() });
  s6.addText("היום — נייר", { x: 5.4, y: 1.2, w: 4, h: 0.4, fontSize: 18, fontFace: "Arial", bold: true, color: C.red, align: "right", margin: 0 });
  ["הצהרות בריאות על נייר — 600+ בשנה", "אין דרך לאמת חתימות", "תיקים פיזיים תופסים מקום", "הוצאות משרדיות: 243K₪ (+23%)"].forEach((t, i) => {
    s6.addText("  " + t, { x: 5.4, y: 1.75 + i * 0.48, w: 4.1, h: 0.4, fontSize: 12, fontFace: "Arial", color: C.darkGray, align: "right", margin: 0 });
  });

  s6.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.3, y: 1.1, w: 4.5, h: 2.8, fill: { color: "F0FDF4" }, rectRadius: 0.15, shadow: makeShadow() });
  s6.addText("אחרי — דיגיטלי", { x: 0.5, y: 1.2, w: 4, h: 0.4, fontSize: 18, fontFace: "Arial", bold: true, color: C.green, align: "right", margin: 0 });
  ["טפסים דיגיטליים עם חתימה אלקטרונית", "שמירה אוטומטית ב-CRM", "גישה מיידית מכל מקום", "חיסכון בזמן, נייר, ואחסון"].forEach((t, i) => {
    s6.addText("  " + t, { x: 0.5, y: 1.75 + i * 0.48, w: 4.1, h: 0.4, fontSize: 12, fontFace: "Arial", color: C.darkGray, align: "right", margin: 0 });
  });

  s6.addImage({ data: icons.arrow, x: 4.75, y: 2.2, w: 0.5, h: 0.5 });

  s6.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.5, y: 4.2, w: 9, h: 1.1, fill: { color: "EFF6FF" }, rectRadius: 0.12, shadow: makeShadow() });
  s6.addText([
    { text: "369 חברים + 250-300 תלמידי שחייה = ", options: { fontSize: 14, color: C.darkGray } },
    { text: "600+ טפסים בשנה", options: { fontSize: 14, bold: true, color: C.blue } },
    { text: "\nטפסים דיגיטליים חוסכים עשרות שעות עבודה ואלפי שקלים בהוצאות משרדיות", options: { fontSize: 12, color: C.midGray, breakLine: true } },
  ], { x: 0.7, y: 4.3, w: 8.6, h: 0.9, align: "right", margin: 0 });
  s6.addNotes("השוואה ויזואלית. 600+ טפסים בשנה. הוצאות משרדיות 243K₪ (+23%). חתימה אלקטרונית, שמירה ב-CRM.");

  // SLIDE 7: LANDING PAGES BONUS
  let s7 = pres.addSlide();
  s7.background = { color: C.offWhite };
  s7.addText("בונוס: דפי נחיתה מחוברים למערכת", { x: 0.5, y: 0.2, w: 5.0, h: 0.6, fontSize: 22, fontFace: "Arial", bold: true, color: C.navy, align: "right", margin: 0 });
  s7.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 6.2, y: 0.25, w: 3.3, h: 0.5, fill: { color: C.orange }, rectRadius: 0.1 });
  s7.addText("כלול בחבילת WhatsApp", { x: 6.2, y: 0.25, w: 3.3, h: 0.5, fontSize: 13, fontFace: "Arial", bold: true, color: C.white, align: "center", valign: "middle", margin: 0 });

  const funnelSteps = [
    { label: "דף נחיתה", desc: "הורה רואה מודעה ונכנס לדף רישום", icon: icons.globe, color: "DBEAFE" },
    { label: "בוט WhatsApp", desc: "מקבל תשובות אוטומטיות ומידע", icon: icons.whatsapp, color: "D1FAE5" },
    { label: "נכנס ל-CRM", desc: "הליד נשמר אוטומטית במערכת", icon: icons.laptop, color: "E0E7FF" },
    { label: "תשלום PayMe", desc: "משלם ומתחיל שיעורים", icon: icons.credit, color: "FEF3C7" },
  ];
  for (let i = 0; i < 4; i++) {
    const x = 0.3 + (3 - i) * 2.4, y = 1.2;
    s7.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: 2.15, h: 2.6, fill: { color: funnelSteps[i].color }, rectRadius: 0.12, shadow: makeShadow() });
    s7.addShape(pres.shapes.OVAL, { x: x + 0.75, y: y + 0.15, w: 0.6, h: 0.6, fill: { color: C.navy } });
    s7.addText(String(i + 1), { x: x + 0.75, y: y + 0.15, w: 0.6, h: 0.6, fontSize: 18, fontFace: "Arial", bold: true, color: C.white, align: "center", valign: "middle", margin: 0 });
    s7.addImage({ data: funnelSteps[i].icon, x: x + 0.82, y: y + 0.9, w: 0.5, h: 0.5 });
    s7.addText(funnelSteps[i].label, { x: x + 0.1, y: y + 1.5, w: 1.95, h: 0.4, fontSize: 14, fontFace: "Arial", bold: true, color: C.navy, align: "center", margin: 0 });
    s7.addText(funnelSteps[i].desc, { x: x + 0.1, y: y + 1.9, w: 1.95, h: 0.55, fontSize: 10, fontFace: "Arial", color: C.darkGray, align: "center", margin: 0 });
    if (i < 3) s7.addImage({ data: icons.arrow, x: x - 0.35, y: y + 1.0, w: 0.35, h: 0.35 });
  }

  s7.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.5, y: 4.2, w: 9, h: 1.1, fill: { color: "FFF7ED" }, rectRadius: 0.12, shadow: makeShadow() });
  s7.addText([
    { text: "היום: ", options: { bold: true, color: C.red, fontSize: 13 } },
    { text: "הורה רואה מודעה → מתקשר → ממלא טופס נייר → משלם בצ'ק", options: { fontSize: 13, color: C.darkGray } },
    { text: "\nמחר: ", options: { bold: true, color: C.green, fontSize: 13, breakLine: true } },
    { text: "הורה נכנס לדף נחיתה → בוט עונה → CRM שומר → PayMe גובה. אוטומטי.", options: { fontSize: 13, color: C.darkGray } },
  ], { x: 0.7, y: 4.3, w: 8.6, h: 0.9, align: "right", margin: 0 });
  s7.addNotes("בונוס — אל תתקוף TC! המסר: דפי נחיתה כלולים בחבילת WhatsApp. לידים מפרסום נכנסים ישר למערכת. אל תגיד 'במקום TC' — תגיד 'בנוסף'.");

  // SLIDE 8: ROI
  let s8 = pres.addSlide();
  s8.background = { color: C.white };
  s8.addText("ROI — תשואה על ההשקעה", { x: 0.5, y: 0.3, w: 9, h: 0.6, fontSize: 26, fontFace: "Arial", bold: true, color: C.navy, align: "right", margin: 0 });

  s8.addChart(pres.charts.BAR, [{
    name: "עלות שנתית",
    labels: ["הוצאות משרדיות\nשניתן לחסוך", "עמלות כרטיסי\nאשראי", "Stream Line\nשנתי"],
    values: [120000, 54000, 50400]
  }], {
    x: 5.0, y: 1.0, w: 4.5, h: 3.0, barDir: "col",
    chartColors: [C.blue], showValue: true, dataLabelPosition: "outEnd", dataLabelColor: C.text,
    valGridLine: { color: "E2E8F0", size: 0.5 }, catGridLine: { style: "none" },
    catAxisLabelColor: C.darkGray, valAxisLabelColor: C.darkGray,
    catAxisLabelFontSize: 9, valAxisLabelFontSize: 9,
    chartArea: { fill: { color: C.white }, roundedCorners: true }, showLegend: false,
  });

  const roiStats = [
    { num: "55K₪", label: "הקמה חד-פעמית", sub: "פחות מ-0.6% מהמחזור" },
    { num: "4,200₪", label: "עלות חודשית", sub: "= 50,400₪ בשנה" },
    { num: "174K₪", label: "חיסכון פוטנציאלי", sub: "משרדיות + עמלות + שעות" },
    { num: "4 חודשים", label: "זמן החזר השקעה", sub: "ROI חיובי מהחודש ה-5" },
  ];
  for (let i = 0; i < 4; i++) {
    const y = 1.1 + i * 0.92;
    s8.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.3, y, w: 4.4, h: 0.78, fill: { color: i === 3 ? "F0FDF4" : C.offWhite }, rectRadius: 0.1 });
    s8.addText(roiStats[i].num, { x: 3.3, y, w: 1.3, h: 0.78, fontSize: 18, fontFace: "Arial", bold: true, color: i === 3 ? C.green : C.navy, align: "center", valign: "middle", margin: 0 });
    s8.addText(roiStats[i].label, { x: 0.5, y: y + 0.05, w: 2.7, h: 0.35, fontSize: 13, fontFace: "Arial", bold: true, color: C.text, align: "right", margin: 0 });
    s8.addText(roiStats[i].sub, { x: 0.5, y: y + 0.4, w: 2.7, h: 0.3, fontSize: 10, fontFace: "Arial", color: C.midGray, align: "right", margin: 0 });
  }
  s8.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.5, y: 4.8, w: 9, h: 0.6, fill: { color: C.navy }, rectRadius: 0.1 });
  s8.addText("סה\"כ הפתרון = פחות מ-1% מהמחזור השנתי (9.3M₪)", { x: 0.5, y: 4.8, w: 9, h: 0.6, fontSize: 15, fontFace: "Arial", bold: true, color: C.white, align: "center", valign: "middle", margin: 0 });
  s8.addNotes("ROI: הקמה 55K = 0.6% מהמחזור. שנתי 50.4K. חיסכון 174K (120K משרדיות + 54K עמלות). החזר ב-4 חודשים. פחות מ-1% מהמחזור. אם הנחה: 15% מקסימום בפגישה ראשונה.");

  // SLIDE 9: STRATEGIC ANALYSIS (NEW!)
  let s9 = pres.addSlide();
  s9.background = { color: C.offWhite };
  s9.addText("למה עכשיו? ניתוח אסטרטגי", { x: 0.5, y: 0.3, w: 9, h: 0.6, fontSize: 24, fontFace: "Arial", bold: true, color: C.navy, align: "right", margin: 0 });

  const strategies = [
    { title: "הסטת השקעה לשטח", desc: "שכר השטח עלה 17.3% ושכר ההנהלה ירד 19.4%. אתם כבר משקיעים באיכות — חסרים הכלים הדיגיטליים.", icon: icons.chart, bg: "EFF6FF" },
    { title: "סיכון שימור — הכנסות מראש", desc: "3.7M₪ הכנסות מראש = כמעט כל המזומנים. שימור לקוחות קריטי. CRM + WhatsApp משפרים תקשורת.", icon: icons.warning, bg: "FEF3C7" },
    { title: "הגירעון נסגר — חלון השקעה", desc: "הגירעון התפעולי ירד מ-766K₪ ל-62K₪. זו נקודת מפנה — הזמן להשקיע במודרניזציה.", icon: icons.rocket, bg: "F0FDF4" },
    { title: "דמי חבר בירידה", desc: "הכנסות מדמי חבר ירדו 17% (מ-1,087K ל-900K). צריך כלים שיגייסו ויחזיקו חברים — בדיוק מה שדפי נחיתה + בוט עושים.", icon: icons.users, bg: "FFF7ED" },
  ];
  for (let i = 0; i < 4; i++) {
    const row = Math.floor(i / 2), col = i % 2;
    const x = col === 0 ? 5.2 : 0.3, y = 1.1 + row * 2.15;
    s9.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: 4.5, h: 1.9, fill: { color: strategies[i].bg }, rectRadius: 0.12, shadow: makeShadow() });
    s9.addImage({ data: strategies[i].icon, x: x + 3.7, y: y + 0.15, w: 0.45, h: 0.45 });
    s9.addText(strategies[i].title, { x: x + 0.2, y: y + 0.15, w: 3.4, h: 0.4, fontSize: 16, fontFace: "Arial", bold: true, color: C.navy, align: "right", margin: 0 });
    s9.addText(strategies[i].desc, { x: x + 0.2, y: y + 0.65, w: 4.0, h: 1.05, fontSize: 11, fontFace: "Arial", color: C.darkGray, align: "right", margin: 0 });
  }
  s9.addNotes("שקף אסטרטגי: 1. אתם משקיעים בשטח — תנו כלים. 2. מזומנים=הכנסות מראש — שימור קריטי. 3. הגירעון כמעט נסגר — השקיעו מעמדה של חוזקה. 4. דמי חבר ירדו 17% — צריך גיוס.");

  // SLIDE 10: SUMMARY
  let s10 = pres.addSlide();
  s10.background = { color: C.navy };
  s10.addImage({ path: SL_LOGO, x: 7.8, y: 0.15, w: 1.8, h: 0.9 });
  s10.addImage({ path: NO_LOGO, x: 0.5, y: 4.3, w: 1.0, h: 0.8 });
  s10.addText("4 שכבות. פתרון אחד שלם.", { x: 0.5, y: 0.3, w: 7.0, h: 0.7, fontSize: 28, fontFace: "Arial", bold: true, color: C.white, align: "right", margin: 0 });

  const layers = [
    { num: "1", name: "CRM לבית הספר לשחייה", desc: "ניהול תלמידים, קבוצות, נוכחות, הערכות" },
    { num: "2", name: "סליקה PayMe", desc: "הפתרון היחיד בלי ניהול תקין — גבייה אוטומטית" },
    { num: "3", name: "בוט WhatsApp + דפי נחיתה", desc: "תקשורת 24/7, גיוס לידים, שימור חברים" },
    { num: "4", name: "טפסים דיגיטליים", desc: "חתימה אלקטרונית, ביטול נייר, חיסכון 120K₪+" },
  ];
  for (let i = 0; i < 4; i++) {
    const y = 1.4 + i * 0.85;
    s10.addShape(pres.shapes.OVAL, { x: 8.5, y: y + 0.05, w: 0.55, h: 0.55, fill: { color: C.orange } });
    s10.addText(layers[i].num, { x: 8.5, y: y + 0.05, w: 0.55, h: 0.55, fontSize: 20, fontFace: "Arial", bold: true, color: C.white, align: "center", valign: "middle", margin: 0 });
    s10.addText(layers[i].name, { x: 1.0, y, w: 7.3, h: 0.35, fontSize: 18, fontFace: "Arial", bold: true, color: C.white, align: "right", margin: 0 });
    s10.addText(layers[i].desc, { x: 1.0, y: y + 0.35, w: 7.3, h: 0.35, fontSize: 12, fontFace: "Arial", color: C.midGray, align: "right", margin: 0 });
  }
  s10.addShape(pres.shapes.LINE, { x: 2, y: 4.95, w: 5, h: 0, line: { color: C.orange, width: 2 } });
  s10.addText("נתחיל?", { x: 0.5, y: 5.0, w: 7, h: 0.5, fontSize: 22, fontFace: "Arial", bold: true, color: C.orange, align: "right", margin: 0 });
  s10.addNotes("סיכום: 4 שכבות. פחות מ-1% מהמחזור. חיסכון 174K+. החזר ב-4 חודשים. שאל: מה השלב הבא? הנחה: 15% מקסימום.");

  const outPath = path.join(__dirname, "stream_line_presentation_neve_oz.pptx");
  await pres.writeFile({ fileName: outPath });
  console.log("Done:", outPath);
}

build().catch(e => { console.error(e); process.exit(1); });
