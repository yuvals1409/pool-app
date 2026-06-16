import { useLang } from "../../i18n.jsx";
import {
  SCHEDULE_HOURS, isToday, toLocalDateStr, timeToMinutes,
} from "../../lib/lessonDates.js";
import { LESSON_DURATION_MINUTES } from "../../lib/config.js";
import LessonBlock from "./LessonBlock.jsx";

const SLOT_H = 24;
const SLOT_GAP = 1;

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

export default function DayView({
  anchorDate,
  lessons,
  onLessonClick,
  onSlotClick,
  canEdit,
}) {
  const { t, fmtDateDay } = useLang();
  const dateStr = toLocalDateStr(anchorDate);
  const dayLessons = lessons.filter(l => l.lesson_date === dateStr);
  const totalSlots = SCHEDULE_HOURS.length * 2;
  const today = isToday(anchorDate);

  const axisLabels = SCHEDULE_HOURS.flatMap(h => [
    { key: `${h}-0`, text: `${String(h).padStart(2, "0")}:00`, half: false },
    { key: `${h}-1`, text: ":30", half: true },
  ]);

  return (
    <div className="schedule-calendar time-grid-wrap">
      <div className="time-grid">
        <div className="time-axis">
          <div className="time-axis-corner">{today ? t("today") : ""}</div>
          {axisLabels.map(({ key, text, half }) => (
            <div key={key} className={`time-axis-label ${half ? "time-axis-label-half" : ""}`}>
              {text}
            </div>
          ))}
        </div>
        <div className="time-col" style={{ flex: 1 }}>
          <div className={`time-col-header ${today ? "today" : ""}`}>
            {fmtDateDay(dateStr)}
          </div>
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
                    height: Math.max(lessonHeight(LESSON_DURATION_MINUTES), SLOT_H),
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
