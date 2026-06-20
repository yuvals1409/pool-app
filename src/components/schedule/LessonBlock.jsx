import { getInstructorClass, getInstructorColor } from "../../lib/instructorColors.js";
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
  const instrColor = getInstructorColor(lesson.instructor_id);
  const past = isPastLesson(lesson);
  const title = lesson.display_title || lesson.child_name;
  const instructorShort = lesson.instructor_name?.trim().split(/\s+/)[0];

  const classes = [
    "lesson-block",
    compact ? "lesson-block--month" : "",
    isGroup ? "group-session" : "",
    lesson.is_substitute ? "substitute-session" : "",
    past ? "past" : "",
    status === "cancelled" ? "cancelled" : "",
    status === "used" ? "used" : "",
    className,
  ].filter(Boolean).join(" ");

  const blockStyle = compact
    ? { ...style, borderInlineStartColor: instrColor }
    : {
      ...style,
      borderInlineStart: `3px solid ${instrColor}`,
      ...(instrClass ? {} : {}),
    };

  return (
    <div
      className={classes}
      style={blockStyle}
      onClick={(e) => { e.stopPropagation(); onClick?.(lesson); }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") onClick?.(lesson); }}
    >
      <div className="lesson-block-name">{title}</div>
      {!compact && (
        <div className="lesson-block-meta">
          <span className="num lesson-block-time">{fmt_time(lesson.start_time)}</span>
          {instructorShort && (
            <span className="lesson-block-instructor" style={{ color: instrColor }}>
              · {instructorShort}
            </span>
          )}
          {isGroup && t && (
            <span className="lesson-block-instructor"> · {templateLabel(t, lesson.template_code)}</span>
          )}
        </div>
      )}
      {status === "used" && t && <div className="lesson-block-status">{t("used")}</div>}
      {status === "cancelled" && t && <div className="lesson-block-status">{t("cancelled")}</div>}
    </div>
  );
}
