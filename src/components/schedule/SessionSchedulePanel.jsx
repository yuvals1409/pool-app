import { useLang } from "../../i18n.jsx";
import { AnimatedSheetOverlay, AnimatedSheetPanel } from "../ui/AnimatedSheet.jsx";
import { fmt_time } from "../../lib/lessonDates.js";
import { templateLabel } from "../../lib/attendance.js";

export default function SessionSchedulePanel({ event, onClose, layout = "sheet" }) {
  const { t, fmtDateDay } = useLang();

  const content = (
      <div className="lesson-panel-view">
        {layout === "inline" && (
          <div className="schedule-rail-header">
            <div className="section-title" style={{ fontSize: 17, margin: 0 }}>
              {event.display_title || event.child_name}
            </div>
            <button type="button" className="schedule-rail-close" onClick={onClose} aria-label={t("cancel")}>✕</button>
          </div>
        )}
        <div className="lesson-info-row">
          <span className="li-key">{t("productType")}</span>
          <span className="li-val">{templateLabel(t, event.template_code)}</span>
        </div>
        <div className="lesson-info-row">
          <span className="li-key">{t("date")}</span>
          <span className="li-val">{fmtDateDay(event.lesson_date)}</span>
        </div>
        <div className="lesson-info-row">
          <span className="li-key">{t("startTime")}</span>
          <span className="li-val" dir="ltr">
            {fmt_time(event.start_time)}
            {event.end_time ? ` – ${fmt_time(event.end_time)}` : ""}
          </span>
        </div>
        {event.instructor_name && (
          <div className="lesson-info-row">
            <span className="li-key">{t("instructor")}</span>
            <span className="li-val">{event.instructor_name}</span>
          </div>
        )}
        <p className="schedule-session-hint">{t("scheduleGroupSessionHint")}</p>
      </div>
  );

  if (layout === "inline") {
    return (
      <div className="schedule-rail-panel">
        {content}
      </div>
    );
  }

  return (
    <>
      <AnimatedSheetOverlay onClose={onClose} />
      <AnimatedSheetPanel onClose={onClose} title={event.display_title || event.child_name}>
        {content}
      </AnimatedSheetPanel>
    </>
  );
}
