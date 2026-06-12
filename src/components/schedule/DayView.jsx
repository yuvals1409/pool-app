import { useLang } from "../../i18n.jsx";
import {
  SCHEDULE_HOURS, isToday, toLocalDateStr, timeToMinutes,
} from "../../lib/lessonDates.js";
import { LESSON_DURATION_MINUTES } from "../../lib/config.js";
import LessonBlock from "./LessonBlock.jsx";

const SLOT_H = 48;

function slotTime(hour, half) {
  const m = half ? 30 : 0;
  return `${String(hour).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export default function DayView({
  anchorDate,
  lessons,
  onLessonClick,
  onSlotClick,
  onDragStart,
  canEdit,
  dropTarget,
}) {
  const { t, fmtDateDay } = useLang();
  const dateStr = toLocalDateStr(anchorDate);
  const dayLessons = lessons.filter(l => l.lesson_date === dateStr);
  const totalSlots = SCHEDULE_HOURS.length * 2;

  return (
    <div className="schedule-calendar time-grid-wrap">
      <div className="time-grid">
        <div className="time-axis">
          <div className="time-col-header" style={{ height: 52 }}>
            {isToday(anchorDate) ? t("today") : ""}
          </div>
          {SCHEDULE_HOURS.flatMap(h => [
            <div key={`${h}-0`} className="time-axis-label">{String(h).padStart(2, "0")}:00</div>,
            <div key={`${h}-1`} className="time-axis-label" style={{ opacity: 0.4 }}>:</div>,
          ])}
        </div>
        <div className="time-col" style={{ flex: 1 }}>
          <div className={`time-col-header ${isToday(anchorDate) ? "today" : ""}`}>
            {fmtDateDay(dateStr)}
          </div>
          <div style={{ position: "relative" }}>
            {SCHEDULE_HOURS.flatMap(h =>
              [0, 1].map(half => {
                const time = slotTime(h, half);
                const dropKey = `${dateStr}|${time}`;
                return (
                  <div
                    key={dropKey}
                    className={`time-slot ${dropTarget === dropKey ? "drop-target" : ""}`}
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
                    left: 4,
                    right: 4,
                    top: top + 1,
                    height: Math.max(height - 2, 28),
                    zIndex: 2,
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
