import { useLang } from "../../i18n.jsx";
import { getMonthGridDays, isToday, toLocalDateStr } from "../../lib/lessonDates.js";
import LessonBlock from "./LessonBlock.jsx";

const MAX_VISIBLE = 3;

export default function MonthView({
  anchorDate,
  lessons,
  onLessonClick,
  onDayClick,
  canEdit,
}) {
  const { t, days: dayNames } = useLang();
  const gridDays = getMonthGridDays(anchorDate);
  const currentMonth = anchorDate.getMonth();

  const byDate = {};
  for (const l of lessons) {
    (byDate[l.lesson_date] ||= []).push(l);
  }
  for (const key of Object.keys(byDate)) {
    byDate[key].sort((a, b) => a.start_time.localeCompare(b.start_time));
  }

  return (
    <div className="schedule-calendar">
      <div className="month-grid">
        {dayNames.map(d => (
          <div key={d} className="month-header-cell">{d}</div>
        ))}
        {gridDays.map(day => {
          const dateStr = toLocalDateStr(day);
          const dayLessons = byDate[dateStr] || [];
          const otherMonth = day.getMonth() !== currentMonth;
          const today = isToday(day);

          return (
            <div
              key={dateStr}
              className={[
                "month-day",
                otherMonth ? "other-month" : "",
                today ? "today" : "",
              ].filter(Boolean).join(" ")}
              onClick={() => onDayClick?.(dateStr)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") onDayClick?.(dateStr); }}
              title={t("openDayView")}
            >
              <div className="month-day-num num">{day.getDate()}</div>
              {dayLessons.slice(0, MAX_VISIBLE).map(l => (
                <LessonBlock
                  key={l.id}
                  lesson={l}
                  compact
                  t={t}
                  onClick={onLessonClick}
                />
              ))}
              {dayLessons.length > MAX_VISIBLE && (
                <div className="lesson-block-more">
                  {t("moreLessons", { count: dayLessons.length - MAX_VISIBLE })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
