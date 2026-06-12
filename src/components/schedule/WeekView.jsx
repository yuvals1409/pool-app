import { useLang } from "../../i18n.jsx";
import {
  SCHEDULE_HOURS, getWeekBounds, isToday, toLocalDateStr, timeToMinutes,
} from "../../lib/lessonDates.js";
import { LESSON_DURATION_MINUTES } from "../../lib/config.js";
import LessonBlock from "./LessonBlock.jsx";

const SLOT_H = 48;
const HOUR_SLOTS = 2;

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

export default function WeekView({
  anchorDate,
  lessons,
  onLessonClick,
  onSlotClick,
  onDragStart,
  canEdit,
  dropTarget,
}) {
  const { t, days: dayNames } = useLang();
  const weekDays = getWeekDays(anchorDate);

  const byDate = {};
  for (const l of lessons) {
    (byDate[l.lesson_date] ||= []).push(l);
  }

  const totalSlots = SCHEDULE_HOURS.length * HOUR_SLOTS;

  return (
    <div className="schedule-calendar time-grid-wrap">
      <div className="time-grid">
        <div className="time-axis">
          <div className="time-col-header" style={{ height: 52 }} />
          {SCHEDULE_HOURS.flatMap(h => [
            <div key={`${h}-0`} className="time-axis-label">{String(h).padStart(2, "0")}:00</div>,
            <div key={`${h}-1`} className="time-axis-label" style={{ opacity: 0.4 }}>:</div>,
          ])}
        </div>
        {weekDays.map((day, colIdx) => {
          const dateStr = toLocalDateStr(day);
          const today = isToday(day);
          const dayLessons = byDate[dateStr] || [];

          return (
            <div key={dateStr} className="time-col">
              <div className={`time-col-header ${today ? "today" : ""}`}>
                {dayNames[colIdx]}
                <span className="day-num">{day.getDate()}</span>
              </div>
              <div style={{ position: "relative" }}>
                {SCHEDULE_HOURS.flatMap(h =>
                  [0, 1].map(half => {
                    const time = slotTime(h, half);
                    const dropKey = `${dateStr}|${time}`;
                    const isDrop = dropTarget === dropKey;
                    return (
                      <div
                        key={dropKey}
                        className={`time-slot ${isDrop ? "drop-target" : ""}`}
                        data-drop-date={dateStr}
                        data-drop-time={time}
                        onClick={() => canEdit && onSlotClick?.(dateStr, time)}
                      />
                    );
                  })
                )}
                {dayLessons.map(lesson => {
                  const mins = timeToMinutes(lesson.start_time);
                  const startSlot = (mins - 5 * 60) / 30;
                  const height = (LESSON_DURATION_MINUTES / 30) * SLOT_H;
                  const top = startSlot * SLOT_H;
                  if (startSlot < 0 || startSlot >= totalSlots) return null;
                  return (
                    <LessonBlock
                      key={lesson.id}
                      lesson={lesson}
                      t={t}
                      draggable={canEdit && !lesson.used && !lesson.cancelled}
                      onClick={onLessonClick}
                      onDragStart={onDragStart}
                      style={{
                        position: "absolute",
                        left: 2,
                        right: 2,
                        top: top + 1,
                        height: Math.max(height - 2, 22),
                        zIndex: 2,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
