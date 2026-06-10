import { createContext, useContext, useEffect, useState, useCallback } from "react";

export const LANGS = ["he", "en", "ru"];
const STORAGE_KEY = "pool-app-lang";

const T = {
  he: {
    days: ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"],
    roleOwner: "מפתח מערכת",
    roleAdmin: "מנהל",
    roleInstructor: "מדריך",
    roleGuard: "שומר",
    roleParent: "הורה",
    tabLesson: "שיעור",
    tabScan: "סריקה",
    tabHistory: "היסטוריה",
    tabAdmin: "ניהול",
    loading: "טוען...",
    loadingProfile: "טוען פרופיל...",
    save: "שמור",
    cancel: "ביטול",
    logout: "התנתק",
    child: "ילד/ה",
    date: "תאריך",
    startTime: "שעת התחלה",
    instructor: "מדריך",
    loginTitle: "מרכז ספורט נווה עוז",
    loginSub: "מערכת שיעורים פרטיים",
    loginContinue: "התחבר כדי להמשיך",
    signInGoogle: "כניסה עם Google",
    signingIn: "מתחבר...",
    loginNote: "לאחר ההתחברות, מנהל המערכת יאשר את חשבונך",
    pendingTitle: "ממתין לאישור",
    pendingSub: "החשבון שלך ({email}) אינו מורשה עדיין. פנה למנהל המערכת כדי שיוסיף את המייל שלך בעמודת הניהול עם פרופיל ההרשאות המתאים.",
    headerSub: "מערכת שיעורים פרטיים",
    parentTicket: "כרטיס כניסה",
    neveOz: "נווה עוז",
    editNickname: "לחץ לעריכת כינוי",
    nicknamePlaceholder: "כינוי לתצוגה",
    nicknameRequired: "יש להזין כינוי",
    nicknameError: "שגיאה בשמירת הכינוי",
    nicknameSaved: "הכינוי נשמר",
    loginError: "שגיאה בהתחברות",
    newLesson: "שיעור חדש",
    newLessonSub: "מלא פרטים וצור ברקוד כניסה להורה",
    childName: "שם הילד",
    childPlaceholder: "למשל: יואב כהן",
    lessonDate: "תאריך השיעור",
    lessonStartTime: "שעת התחלת השיעור",
    timeHint: "בין 05:00 ל-23:00 · גלול לבחירת שעה",
    parentPhone: "טלפון ההורה (WhatsApp)",
    createBarcode: "צור ברקוד לשיעור",
    creating: "יוצר...",
    barcodeReady: "הברקוד מוכן ✓",
    barcodeReadySub: "שלח תמונת ברקוד לסריקה להורה ב-WhatsApp",
    sendWhatsApp: "שלח ברקוד להורה ב-WhatsApp",
    preparingImage: "מכין תמונה...",
    createAnother: "צור שיעור נוסף",
    fillAllFields: "יש למלא את כל השדות",
    invalidTime: "שעת התחלה חייבת להיות בין 05:00 ל-23:00",
    createError: "שגיאה ביצירה",
    shareError: "שגיאה ביצירת תמונת הברקוד",
    poolEntry: "כניסה לבריכה",
    scanSub: "סרוק את הברקוד של ההורה לאישור כניסה",
    verifying: "מאמת ברקוד...",
    scanBarcode: "סרוק ברקוד",
    scanHint: "מקרב את הברקוד למרכז המסגרת",
    entryApproved: "כניסה מאושרת",
    entryDenied: "כניסה נדחית",
    scanAnother: "סרוק ברקוד נוסף",
    recentEntries: "כניסות אחרונות",
    scannedAt: "נסרק",
    barcodeNotFound: "ברקוד לא נמצא במערכת",
    barcodeUsed: "ברקוד זה כבר נוצל",
    scannedOn: "נסרק ב",
    systemError: "שגיאת מערכת — נסה שוב",
    noCamera: "אין גישה למצלמה",
    history: "היסטוריה",
    historySub: "כל הכרטיסים שנוצרו במערכת",
    searchPlaceholder: "חפש לפי שם ילד או מדריך...",
    noResults: "אין תוצאות",
    used: "נוצל",
    waiting: "ממתין",
    entry: "כניסה",
    manageUsers: "ניהול משתמשים",
    manageSubOwner: "הוסף מנהלים, מדריכים ושומרים לפי כתובת מייל",
    manageSubAdmin: "הוסף מדריכים ושומרים לפי כתובת מייל",
    userEmail: "מייל המשתמש",
    roleProfile: "פרופיל הרשאות",
    addUser: "הוסף משתמש",
    saving: "שומר...",
    waitingLogin: "ממתינים להתחברות",
    notLoggedInYet: "טרם התחבר למערכת",
    activeUsers: "משתמשים פעילים",
    noActiveUsers: "אין משתמשים פעילים עדיין",
    revoke: "בטל",
    revokeConfirm: "לבטל גישה של {name}?",
    assignedRole: "הוקצה תפקיד {role} ל-{email}",
    invalidEmail: "יש להזין כתובת מייל תקינה",
    ownerPreset: "מפתח המערכת מוגדר מראש",
    noPermission: "אין לך הרשאה לשייך תפקיד זה",
    saveError: "שגיאה בשמירה",
    profileError: "שגיאה בעדכון פרופיל",
    accessRevoked: "הגישה בוטלה",
    ticketValid: "תקף לכניסה",
    ticketUsedBadge: "כרטיס מומש",
    showToGuard: "הציג ברקוד זה לשומר בכניסה",
    ticketUsedMsg: "כרטיס זה נסרק ואינו תקף יותר",
    ticketInvalid: "כרטיס לא תקף",
    ticketNotFound: "הכרטיס לא נמצא",
    ticketTitle: "כרטיס כניסה לשיעור שחייה",
    ticketOneTime: "ברקוד חד-פעמי · תקף לכניסה אחת בלבד",
    waHello: "שלום!",
    waBarcodeFor: "ברקוד כניסה לשיעור שחייה של {name}.",
    waOneTimeNote: "שימו לב: הברקוד חד-פעמי — לא ניתן לסרוק אותו פעמיים.",
    waShowGuard: "הציגו את תמונת הברקוד לשומר בכניסה לבריכה.",
    waLocation: "ניווט לקאנטרי נווה עוז (רח' דגניה 1, פתח תקווה):",
    imageDownloaded: "התמונה הורדה — צרף אותה ב-WhatsApp",
    langHe: "עב",
    langEn: "EN",
    langRu: "RU",
    language: "שפה",
    logoAlt: "מרכז ספורט נווה עוז",
  },
  en: {
    days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    roleOwner: "System owner",
    roleAdmin: "Manager",
    roleInstructor: "Instructor",
    roleGuard: "Guard",
    roleParent: "Parent",
    tabLesson: "Lesson",
    tabScan: "Scan",
    tabHistory: "History",
    tabAdmin: "Admin",
    loading: "Loading...",
    loadingProfile: "Loading profile...",
    save: "Save",
    cancel: "Cancel",
    logout: "Log out",
    child: "Child",
    date: "Date",
    startTime: "Start time",
    instructor: "Instructor",
    loginTitle: "Neve Oz Sports Center",
    loginSub: "Private lessons system",
    loginContinue: "Sign in to continue",
    signInGoogle: "Sign in with Google",
    signingIn: "Signing in...",
    loginNote: "After sign-in, a system manager will authorize your account",
    pendingTitle: "Awaiting approval",
    pendingSub: "Your account ({email}) is not authorized yet. Ask a manager to add your email in the Admin tab with the correct role.",
    headerSub: "Private lessons system",
    parentTicket: "Entry ticket",
    neveOz: "Neve Oz",
    editNickname: "Click to edit display name",
    nicknamePlaceholder: "Display name",
    nicknameRequired: "Please enter a display name",
    nicknameError: "Error saving display name",
    nicknameSaved: "Display name saved",
    loginError: "Sign-in error",
    newLesson: "New lesson",
    newLessonSub: "Fill in details and create an entry barcode for the parent",
    childName: "Child's name",
    childPlaceholder: "e.g. John Cohen",
    lessonDate: "Lesson date",
    lessonStartTime: "Lesson start time",
    timeHint: "Between 05:00 and 23:00 · scroll to select",
    parentPhone: "Parent phone (WhatsApp)",
    createBarcode: "Create lesson barcode",
    creating: "Creating...",
    barcodeReady: "Barcode ready ✓",
    barcodeReadySub: "Send barcode image to parent via WhatsApp",
    sendWhatsApp: "Send barcode to parent via WhatsApp",
    preparingImage: "Preparing image...",
    createAnother: "Create another lesson",
    fillAllFields: "Please fill in all fields",
    invalidTime: "Start time must be between 05:00 and 23:00",
    createError: "Creation error",
    shareError: "Error creating barcode image",
    poolEntry: "Pool entry",
    scanSub: "Scan the parent's barcode to approve entry",
    verifying: "Verifying barcode...",
    scanBarcode: "Scan barcode",
    scanHint: "Center the barcode in the frame",
    entryApproved: "Entry approved",
    entryDenied: "Entry denied",
    scanAnother: "Scan another barcode",
    recentEntries: "Recent entries",
    scannedAt: "Scanned",
    barcodeNotFound: "Barcode not found in system",
    barcodeUsed: "This barcode was already used",
    scannedOn: "Scanned at",
    systemError: "System error — try again",
    noCamera: "No camera access",
    history: "History",
    historySub: "All tickets created in the system",
    searchPlaceholder: "Search by child or instructor...",
    noResults: "No results",
    used: "Used",
    waiting: "Pending",
    entry: "Entry",
    manageUsers: "User management",
    manageSubOwner: "Add managers, instructors and guards by email",
    manageSubAdmin: "Add instructors and guards by email",
    userEmail: "User email",
    roleProfile: "Role",
    addUser: "Add user",
    saving: "Saving...",
    waitingLogin: "Waiting to sign in",
    notLoggedInYet: "Has not signed in yet",
    activeUsers: "Active users",
    noActiveUsers: "No active users yet",
    revoke: "Revoke",
    revokeConfirm: "Revoke access for {name}?",
    assignedRole: "Assigned {role} to {email}",
    invalidEmail: "Please enter a valid email",
    ownerPreset: "System owner is predefined",
    noPermission: "You cannot assign this role",
    saveError: "Save error",
    profileError: "Profile update error",
    accessRevoked: "Access revoked",
    ticketValid: "Valid for entry",
    ticketUsedBadge: "Ticket used",
    showToGuard: "Show this barcode to the guard at entry",
    ticketUsedMsg: "This ticket was scanned and is no longer valid",
    ticketInvalid: "Invalid ticket",
    ticketNotFound: "Ticket not found",
    ticketTitle: "Swimming lesson entry ticket",
    ticketOneTime: "One-time barcode · valid for one entry only",
    waHello: "Hello!",
    waBarcodeFor: "Pool entry barcode for {name}.",
    waOneTimeNote: "Please note: this barcode is one-time use — it cannot be scanned twice.",
    waShowGuard: "Show the barcode image to the guard at pool entry.",
    waLocation: "Navigate to Country Neve Oz (1 Daganiya St, Petah Tikva):",
    imageDownloaded: "Image downloaded — attach it in WhatsApp",
    langHe: "עב",
    langEn: "EN",
    langRu: "RU",
    language: "Language",
    logoAlt: "Neve Oz Sports Center",
  },
  ru: {
    days: ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"],
    roleOwner: "Владелец системы",
    roleAdmin: "Менеджер",
    roleInstructor: "Инструктор",
    roleGuard: "Охранник",
    roleParent: "Родитель",
    tabLesson: "Урок",
    tabScan: "Скан",
    tabHistory: "История",
    tabAdmin: "Админ",
    loading: "Загрузка...",
    loadingProfile: "Загрузка профиля...",
    save: "Сохранить",
    cancel: "Отмена",
    logout: "Выйти",
    child: "Ребёнок",
    date: "Дата",
    startTime: "Время начала",
    instructor: "Инструктор",
    loginTitle: "Спортивный центр Неве Оз",
    loginSub: "Система частных уроков",
    loginContinue: "Войдите, чтобы продолжить",
    signInGoogle: "Войти через Google",
    signingIn: "Вход...",
    loginNote: "После входа менеджер системы подтвердит ваш аккаунт",
    pendingTitle: "Ожидание одобрения",
    pendingSub: "Ваш аккаунт ({email}) ещё не авторизован. Обратитесь к менеджеру, чтобы он добавил ваш email во вкладке «Админ» с нужной ролью.",
    headerSub: "Система частных уроков",
    parentTicket: "Входной билет",
    neveOz: "Неве Оз",
    editNickname: "Нажмите, чтобы изменить имя",
    nicknamePlaceholder: "Отображаемое имя",
    nicknameRequired: "Введите отображаемое имя",
    nicknameError: "Ошибка сохранения имени",
    nicknameSaved: "Имя сохранено",
    loginError: "Ошибка входа",
    newLesson: "Новый урок",
    newLessonSub: "Заполните данные и создайте штрихкод для родителя",
    childName: "Имя ребёнка",
    childPlaceholder: "например: Иван Коэн",
    lessonDate: "Дата урока",
    lessonStartTime: "Время начала урока",
    timeHint: "С 05:00 до 23:00 · прокрутите для выбора",
    parentPhone: "Телефон родителя (WhatsApp)",
    createBarcode: "Создать штрихкод урока",
    creating: "Создание...",
    barcodeReady: "Штрихкод готов ✓",
    barcodeReadySub: "Отправьте изображение штрихкода родителю в WhatsApp",
    sendWhatsApp: "Отправить штрихкод родителю в WhatsApp",
    preparingImage: "Подготовка изображения...",
    createAnother: "Создать ещё урок",
    fillAllFields: "Заполните все поля",
    invalidTime: "Время начала должно быть с 05:00 до 23:00",
    createError: "Ошибка создания",
    shareError: "Ошибка создания изображения",
    poolEntry: "Вход в бассейн",
    scanSub: "Отсканируйте штрихкод родителя для подтверждения входа",
    verifying: "Проверка штрихкода...",
    scanBarcode: "Сканировать штрихкод",
    scanHint: "Поместите штрихкод в центр рамки",
    entryApproved: "Вход разрешён",
    entryDenied: "Вход отклонён",
    scanAnother: "Сканировать ещё",
    recentEntries: "Последние входы",
    scannedAt: "Отсканировано",
    barcodeNotFound: "Штрихкод не найден в системе",
    barcodeUsed: "Этот штрихкод уже использован",
    scannedOn: "Отсканировано",
    systemError: "Ошибка системы — попробуйте снова",
    noCamera: "Нет доступа к камере",
    history: "История",
    historySub: "Все билеты, созданные в системе",
    searchPlaceholder: "Поиск по ребёнку или инструктору...",
    noResults: "Нет результатов",
    used: "Использован",
    waiting: "Ожидает",
    entry: "Вход",
    manageUsers: "Управление пользователями",
    manageSubOwner: "Добавляйте менеджеров, инструкторов и охранников по email",
    manageSubAdmin: "Добавляйте инструкторов и охранников по email",
    userEmail: "Email пользователя",
    roleProfile: "Роль",
    addUser: "Добавить пользователя",
    saving: "Сохранение...",
    waitingLogin: "Ожидают входа",
    notLoggedInYet: "Ещё не входил в систему",
    activeUsers: "Активные пользователи",
    noActiveUsers: "Пока нет активных пользователей",
    revoke: "Отозвать",
    revokeConfirm: "Отозвать доступ у {name}?",
    assignedRole: "Назначена роль {role} для {email}",
    invalidEmail: "Введите корректный email",
    ownerPreset: "Владелец системы задан заранее",
    noPermission: "У вас нет прав назначить эту роль",
    saveError: "Ошибка сохранения",
    profileError: "Ошибка обновления профиля",
    accessRevoked: "Доступ отозван",
    ticketValid: "Действителен для входа",
    ticketUsedBadge: "Билет использован",
    showToGuard: "Покажите этот штрихкод охраннику при входе",
    ticketUsedMsg: "Этот билет отсканирован и больше недействителен",
    ticketInvalid: "Недействительный билет",
    ticketNotFound: "Билет не найден",
    ticketTitle: "Входной билет на урок плавания",
    ticketOneTime: "Одноразовый штрихкод · действителен для одного входа",
    waHello: "Здравствуйте!",
    waBarcodeFor: "Штрихкод входа на урок плавания для {name}.",
    waOneTimeNote: "Обратите внимание: штрихкод одноразовый — его нельзя отсканировать дважды.",
    waShowGuard: "Покажите изображение штрихкода охраннику при входе в бассейн.",
    waLocation: "Маршрут до Country Neve Oz (ул. Дагания 1, Пета-Тиква):",
    imageDownloaded: "Изображение скачано — прикрепите его в WhatsApp",
    langHe: "עב",
    langEn: "EN",
    langRu: "RU",
    language: "Язык",
    logoAlt: "Спортивный центр Неве Оз",
  },
};

export function fmtDate(d) {
  if (!d) return "";
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}`;
}

export function fmtDateDay(lang, d) {
  if (!d) return "";
  const [y, m, dd] = d.split("-").map(Number);
  const day = T[lang]?.days?.[new Date(y, m - 1, dd).getDay()] || "";
  return `${day}, ${fmtDate(d)}`;
}

export function fmtLocale(lang) {
  return { he: "he-IL", en: "en-GB", ru: "ru-RU" }[lang] || "he-IL";
}

function interpolate(str, params = {}) {
  return str.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? "");
}

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return LANGS.includes(saved) ? saved : "he";
  });

  const setLang = useCallback((l) => {
    if (!LANGS.includes(l)) return;
    setLangState(l);
    localStorage.setItem(STORAGE_KEY, l);
  }, []);

  const dir = lang === "he" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    document.title = T[lang]?.loginTitle ?? T.he.loginTitle;
  }, [lang, dir]);

  const t = useCallback((key, params) => {
    const str = T[lang]?.[key] ?? T.he[key] ?? key;
    return params ? interpolate(str, params) : str;
  }, [lang]);

  const roleLabel = useCallback((role, owner = false) => {
    if (owner) return t("roleOwner");
    return { admin: t("roleAdmin"), instructor: t("roleInstructor"), guard: t("roleGuard") }[role] || role;
  }, [t]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, dir, t, roleLabel, fmtDateDay: (d) => fmtDateDay(lang, d), locale: fmtLocale(lang) }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLang must be used within LanguageProvider");
  return ctx;
}

export function LanguageSwitcher({ compact = false, className = "" }) {
  const { lang, setLang, t } = useLang();
  const opts = [
    { id: "he", label: t("langHe") },
    { id: "en", label: t("langEn") },
    { id: "ru", label: t("langRu") },
  ];
  return (
    <div className={`lang-switcher ${compact ? "lang-switcher-compact" : ""} ${className}`.trim()} role="group" aria-label={t("language")}>
      {opts.map(o => (
        <button
          key={o.id}
          type="button"
          className={`lang-btn ${lang === o.id ? "active" : ""}`}
          onClick={() => setLang(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
