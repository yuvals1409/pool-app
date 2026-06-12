import { useLang } from "../../i18n.jsx";
import { getMonthGridDays, isToday, toLocalDateStr } from "../../lib/lessonDates.js";
import LessonBlock from "./LessonBlock.jsx";

const MAX_VISIBLE = 3;

export default function MonthView({
  anchorDate,
  lessons,
  onLessonClick,
  onSlotClick,
  onDragStart,
  canEdit,
  dropTargetDate,
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
          const isDrop = dropTargetDate === dateStr;

          return (
            <div
              key={dateStr}
              className={[
                "month-day",
                otherMonth ? "other-month" : "",
                today ? "today" : "",
                isDrop ? "drop-target" : "",
              ].filter(Boolean).join(" ")}
              onClick={() => canEdit && onSlotClick?.(dateStr, "09:00")}
              data-drop-date={dateStr}
            >
              <div className="month-day-num">{day.getDate()}</div>
              {dayLessons.slice(0, MAX_VISIBLE).map(l => (
                <LessonBlock
                  key={l.id}
                  lesson={l}
                  compact
                  t={t}
                  draggable={canEdit && !l.used && !l.cancelled}
                  onClick={onLessonClick}
                  onDragStart={onDragStart}
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
