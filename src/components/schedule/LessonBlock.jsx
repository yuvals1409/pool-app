import { getInstructorColor } from "../../lib/instructorColors.js";
import { fmt_time, lessonStatus, isPastLesson } from "../../lib/lessonDates.js";

export default function LessonBlock({
  lesson,
  compact = false,
  onClick,
  style,
  className = "",
  t,
}) {
  const status = lessonStatus(lesson);
  const color = getInstructorColor(lesson.instructor_id);
  const past = isPastLesson(lesson);

  const classes = [
    "lesson-block",
    compact ? "month" : "",
    past ? "past" : "",
    status === "cancelled" ? "cancelled" : "",
    status === "used" ? "used" : "",
    className,
  ].filter(Boolean).join(" ");

  return (
    <div
      className={classes}
      style={{ background: color.bg, color: color.text, ...style }}
      onClick={(e) => { e.stopPropagation(); onClick?.(lesson); }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") onClick?.(lesson); }}
    >
      <div className="lesson-block-name">{lesson.child_name}</div>
      {!compact && <div className="lesson-block-time">{fmt_time(lesson.start_time)}</div>}
      {status === "used" && t && <div className="lesson-block-status">{t("used")}</div>}
      {status === "cancelled" && t && <div className="lesson-block-status">{t("cancelled")}</div>}
    </div>
  );
}
