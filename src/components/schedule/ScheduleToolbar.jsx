import { useLang } from "../../i18n.jsx";
import { getWeekBounds, isToday, toLocalDateStr } from "../../lib/lessonDates.js";

const MONTH_NAMES = {
  he: ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  ru: ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"],
};

function formatTitle(view, anchorDate, locale, t, fmtDateDay) {
  const months = MONTH_NAMES[locale] || MONTH_NAMES.he;
  if (view === "month") {
    return t("scheduleTitleMonth", {
      month: months[anchorDate.getMonth()],
      year: anchorDate.getFullYear(),
    });
  }
  if (view === "week") {
    const { start, end } = getWeekBounds(anchorDate);
    return t("scheduleTitleWeek", {
      start: fmtDateDay(toLocalDateStr(start)),
      end: fmtDateDay(toLocalDateStr(end)),
    });
  }
  return t("scheduleTitleDay", { date: fmtDateDay(toLocalDateStr(anchorDate)) });
}

export default function ScheduleToolbar({ view, anchorDate, onViewChange, onNavigate, onToday }) {
  const { t, locale, fmtDateDay } = useLang();
  const title = formatTitle(view, anchorDate, locale, t, fmtDateDay);
  const showToday = !isToday(anchorDate);

  return (
    <div className="schedule-toolbar">
      <div className="schedule-toolbar-row">
        <div className="schedule-nav">
          <button type="button" className="schedule-nav-btn" onClick={() => onNavigate(-1)} aria-label="prev">◀</button>
          <button type="button" className="schedule-nav-btn" onClick={() => onNavigate(1)} aria-label="next">▶</button>
        </div>
        <div className="schedule-title">{title}</div>
        {showToday && (
          <button type="button" className="schedule-today-btn" onClick={onToday}>{t("today")}</button>
        )}
      </div>
      <div className="schedule-view-switch">
        {["day", "week", "month"].map(v => (
          <button
            key={v}
            type="button"
            className={`schedule-view-btn ${view === v ? "active" : ""}`}
            onClick={() => onViewChange(v)}
          >
            {t(v === "day" ? "viewDay" : v === "week" ? "viewWeek" : "viewMonth")}
          </button>
        ))}
      </div>
    </div>
  );
}
