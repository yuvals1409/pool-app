import { getInstructorClass } from "../../lib/instructorColors.js";
import { fmt_time, lessonStatus, isPastLesson } from "../../lib/lessonDates.js";
import { isGroupScheduleEvent } from "../../lib/scheduleEvents.js";
import { templateLabel } from "../../lib/attendance.js";

export default function LessonBlock({
  lesson,
  compact = false,
  onClick,
  style,
  className = "",
  t,
}) {
  const isGroup = isGroupScheduleEvent(lesson);
  const status = isGroup ? null : lessonStatus(lesson);
  const instrClass = getInstructorClass(lesson.instructor_id);
  const past = isPastLesson(lesson);
  const title = lesson.display_title || lesson.child_name;

  const classes = [
    "lesson-block",
    instrClass,
    isGroup ? "group-session" : "",
    lesson.is_substitute ? "substitute-session" : "",
    compact ? "month" : "",
    past ? "past" : "",
    status === "cancelled" ? "cancelled" : "",
    status === "used" ? "used" : "",
    className,
  ].filter(Boolean).join(" ");

  return (
    <div
      className={classes}
      style={style}
      onClick={(e) => { e.stopPropagation(); onClick?.(lesson); }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") onClick?.(lesson); }}
    >
      <div className="lesson-block-name">{title}</div>
      {!compact && (
        <div className="lesson-block-time">
          {fmt_time(lesson.start_time)}
          {isGroup && t ? ` · ${templateLabel(t, lesson.template_code)}` : ""}
        </div>
      )}
      {status === "used" && t && <div className="lesson-block-status">{t("used")}</div>}
      {status === "cancelled" && t && <div className="lesson-block-status">{t("cancelled")}</div>}
    </div>
  );
}
