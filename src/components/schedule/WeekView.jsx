import { useLang } from "../../i18n.jsx";
import {
  SCHEDULE_HOURS, getWeekBounds, isToday, toLocalDateStr, timeToMinutes,
} from "../../lib/lessonDates.js";
import { eventDurationMinutes } from "../../lib/scheduleEvents.js";
import LessonBlock from "./LessonBlock.jsx";

const SLOT_H = 24;
const SLOT_GAP = 1;

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

  const byDate = {};
  for (const l of lessons) {
    (byDate[l.lesson_date] ||= []).push(l);
  }

  const axisLabels = SCHEDULE_HOURS.flatMap(h => [
    { key: `${h}-0`, text: `${String(h).padStart(2, "0")}:00`, half: false },
    { key: `${h}-1`, text: ":30", half: true },
  ]);

  return (
    <div className="schedule-calendar time-grid-wrap">
      <div className="time-grid">
        <div className="time-axis">
          <div className="time-axis-corner" />
          {axisLabels.map(({ key, text, half }) => (
            <div key={key} className={`time-axis-label ${half ? "time-axis-label-half" : ""}`}>
              {text}
            </div>
          ))}
        </div>
        {weekDays.map((day, colIdx) => {
          const dateStr = toLocalDateStr(day);
          const today = isToday(day);
          const dayLessons = byDate[dateStr] || [];

          return (
            <div key={dateStr} className="time-col">
              <button
                type="button"
                className={`time-col-header time-col-header-btn ${today ? "today" : ""}`}
                onClick={() => onDayClick?.(dateStr)}
                title={t("openDayView")}
              >
                {dayNames[colIdx]}
                <span className="day-num">{day.getDate()}</span>
              </button>
              <div className="time-col-body">
                {SCHEDULE_HOURS.flatMap(h =>
                  [0, 1].map(half => {
                    const time = slotTime(h, half);
                    return (
                      <div
                        key={`${dateStr}|${time}`}
                        className="time-slot"
                        onClick={() => canEdit && onSlotClick?.(dateStr, time)}
                      />
                    );
                  })
                )}
                {dayLessons.map(lesson => {
                  const mins = timeToMinutes(lesson.start_time);
                  const startSlot = (mins - 5 * 60) / 30;
                  if (startSlot < 0 || startSlot >= totalSlots) return null;
                  return (
                    <LessonBlock
                      key={lesson.id}
                      lesson={lesson}
                      t={t}
                      onClick={onLessonClick}
                      style={{
                        position: "absolute",
                        left: 3,
                        right: 3,
                        top: slotTop(startSlot),
                        height: Math.max(lessonHeight(eventDurationMinutes(lesson)), SLOT_H),
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
