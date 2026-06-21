import { useLang } from "../../i18n.jsx";
import {
  SCHEDULE_HOURS, getWeekBounds, isToday, toLocalDateStr, timeToMinutes,
} from "../../lib/lessonDates.js";
import { eventDurationMinutes } from "../../lib/scheduleEvents.js";
import { assignEventColumns, buildTimedEventStyle } from "../../lib/scheduleLayout.js";
import LessonBlock from "./LessonBlock.jsx";
import CurrentTimeLine from "./CurrentTimeLine.jsx";

const HOUR_ROW = 54;
const SLOT_H = 27;
const SLOT_GAP = 0;
const AXIS_W = 56;

function getWeekDays(anchorDate) {
  const { start } = getWeekBounds(anchorDate);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function slotTime(hour, half) {
  const m = half ? 30 : 0;
  return `${String(hour).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function slotTop(index) {
  return index * (SLOT_H + SLOT_GAP);
}

function lessonHeight(durationMinutes) {
  const slots = durationMinutes / 30;
  return slots * SLOT_H + (slots - 1) * SLOT_GAP;
}

export default function WeekView({
  anchorDate,
  lessons,
  onLessonClick,
  onSlotClick,
  onDayClick,
  canEdit,
}) {
  const { t, days: dayNames } = useLang();
  const weekDays = getWeekDays(anchorDate);
  const totalSlots = SCHEDULE_HOURS.length * 2;
  const gridCols = `${AXIS_W}px repeat(7, 1fr)`;

  const byDate = {};
  for (const l of lessons) {
    (byDate[l.lesson_date] ||= []).push(l);
  }

  return (
    <div className="schedule-calendar week-grid-card">
      <div className="week-grid-header" style={{ gridTemplateColumns: gridCols }}>
        <div className="week-grid-corner" />
        {weekDays.map((day, colIdx) => {
          const dateStr = toLocalDateStr(day);
          const today = isToday(day);
          return (
            <button
              key={dateStr}
              type="button"
              className={`week-grid-day-header ${today ? "today" : ""}`}
              onClick={() => onDayClick?.(dateStr)}
              title={t("openDayView")}
            >
              <div className="week-grid-day-name">{dayNames[colIdx]}</div>
              <div className="num week-grid-day-num">{day.getDate()}</div>
            </button>
          );
        })}
      </div>

      <div className="week-grid-body" style={{ gridTemplateColumns: gridCols }}>
        <div className="week-grid-axis">
          {SCHEDULE_HOURS.map((h) => (
            <div key={h} className="week-grid-hour" style={{ height: HOUR_ROW }}>
              <span className="num week-grid-hour-label">
                {String(h).padStart(2, "0")}:00
              </span>
            </div>
          ))}
        </div>

        {weekDays.map((day) => {
          const dateStr = toLocalDateStr(day);
          const today = isToday(day);
          const dayLessons = byDate[dateStr] || [];
          const columnLayout = assignEventColumns(dayLessons);

          return (
            <div
              key={dateStr}
              className={`week-grid-col ${today ? "today" : ""}`}
            >
              {SCHEDULE_HOURS.flatMap((h, hi) =>
                [0, 1].map((half) => {
                  const time = slotTime(h, half);
                  const isLastHour = hi === SCHEDULE_HOURS.length - 1 && half === 1;
                  return (
                    <div
                      key={`${dateStr}|${time}`}
                      className={`week-grid-slot${isLastHour ? " week-grid-slot--last" : ""}`}
                      style={{ height: SLOT_H }}
                      onClick={() => canEdit && onSlotClick?.(dateStr, time)}
                    />
                  );
                })
              )}
              {dayLessons.map((lesson) => {
                const mins = timeToMinutes(lesson.start_time);
                const startSlot = (mins - SCHEDULE_HOURS[0] * 60) / 30;
                if (startSlot < 0 || startSlot >= totalSlots) return null;
                const duration = eventDurationMinutes(lesson);
                return (
                  <LessonBlock
                    key={lesson.id}
                    lesson={lesson}
                    t={t}
                    onClick={onLessonClick}
                    style={buildTimedEventStyle(lesson, columnLayout, {
                      top: slotTop(startSlot) + 1,
                      height: Math.max(lessonHeight(duration), SLOT_H) - 3,
                    })}
                  />
                );
              })}
            </div>
          );
        })}
        <CurrentTimeLine anchorDate={anchorDate} variant="week" />
      </div>
    </div>
  );
}
