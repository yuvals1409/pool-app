import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLang } from "../../i18n.jsx";
import { getInstructorColor } from "../../lib/instructorColors.js";
import { getWeekBounds, isToday, toLocalDateStr } from "../../lib/lessonDates.js";
import { SegmentedControl, Button } from "../ui/ds/index.js";

const MONTH_NAMES = {
  he: ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  ru: ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"],
};

function formatTitle(view, anchorDate, locale, t, fmtDateDay) {
  const months = MONTH_NAMES[locale] || MONTH_NAMES.he;
  if (view === "month") {
    return t("scheduleTitleMonth", {
      month: months[anchorDate.getMonth()],
      year: anchorDate.getFullYear(),
    });
  }
  if (view === "week") {
    const { start, end } = getWeekBounds(anchorDate);
    return t("scheduleTitleWeek", {
      start: fmtDateDay(toLocalDateStr(start)),
      end: fmtDateDay(toLocalDateStr(end)),
    });
  }
  return t("scheduleTitleDay", { date: fmtDateDay(toLocalDateStr(anchorDate)) });
}

function shortName(name = "") {
  return name.trim().split(/\s+/)[0] || name;
}

export default function ScheduleToolbar({
  view,
  anchorDate,
  instructors = [],
  showLegend = false,
  hideToday = false,
  onViewChange,
  onNavigate,
  onToday,
}) {
  const { t, locale, fmtDateDay, dir } = useLang();
  const title = formatTitle(view, anchorDate, locale, t, fmtDateDay);
  const showToday = !hideToday && !isToday(anchorDate);
  const PrevIcon = dir === "rtl" ? ChevronRight : ChevronLeft;
  const NextIcon = dir === "rtl" ? ChevronLeft : ChevronRight;

  const viewOptions = [
    { value: "day", label: t("viewDay") },
    { value: "week", label: t("viewWeek") },
    { value: "month", label: t("viewMonth") },
  ];

  return (
    <div className="schedule-toolbar">
      <div className="schedule-toolbar-row schedule-toolbar-row--primary">
        <div className="schedule-toolbar-start">
          <div className="schedule-nav">
            <Button
              variant="ghost"
              size="sm"
              aria-label="prev"
              onClick={() => onNavigate(-1)}
              icon={<PrevIcon size={16} aria-hidden />}
            />
            <Button
              variant="ghost"
              size="sm"
              aria-label="next"
              onClick={() => onNavigate(1)}
              icon={<NextIcon size={16} aria-hidden />}
            />
          </div>
          <span className="schedule-title">{title}</span>
          {showLegend && instructors.length > 0 && (
            <div className="schedule-legend schedule-legend--inline">
              {instructors.map((inst) => (
                <span key={inst.id} className="schedule-legend-pill">
                  <span
                    className="schedule-legend-dot"
                    style={{ background: getInstructorColor(inst.id) }}
                  />
                  {shortName(inst.name)}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="schedule-toolbar-end">
          {showToday && (
            <Button variant="secondary" size="sm" onClick={onToday}>{t("today")}</Button>
          )}
          <SegmentedControl
            options={viewOptions}
            value={view}
            onChange={onViewChange}
            size="sm"
          />
        </div>
      </div>
    </div>
  );
}
