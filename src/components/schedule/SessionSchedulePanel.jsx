import { useLang } from "../../i18n.jsx";
import { AnimatedSheetOverlay, AnimatedSheetPanel } from "../ui/AnimatedSheet.jsx";
import { fmt_time } from "../../lib/lessonDates.js";
import { templateLabel } from "../../lib/attendance.js";

export default function SessionSchedulePanel({ event, onClose }) {
  const { t, fmtDateDay } = useLang();

  return (
    <>
      <AnimatedSheetOverlay onClose={onClose} />
      <AnimatedSheetPanel onClose={onClose} title={event.display_title || event.child_name}>
        <div className="lesson-panel-view">
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
      </AnimatedSheetPanel>
    </>
  );
}
