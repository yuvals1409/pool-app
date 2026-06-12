import { useLang } from "../../i18n.jsx";

export default function RecurringScopeDialog({ onChoose, onCancel }) {
  const { t } = useLang();
  return (
    <div className="schedule-panel-overlay" onClick={onCancel}>
      <div className="schedule-panel" onClick={e => e.stopPropagation()}>
        <div className="schedule-panel-handle" />
        <div className="section-title" style={{ fontSize: 17 }}>{t("recurringScopeTitle")}</div>
        <div className="recurring-scope-btns">
          <button type="button" className="btn btn-primary" onClick={() => onChoose("single")}>
            {t("recurringScopeSingle")}
          </button>
          <button type="button" className="btn btn-outline" onClick={() => onChoose("forward")}>
            {t("recurringScopeForward")}
          </button>
          <button type="button" className="btn btn-outline" onClick={onCancel}>{t("cancel")}</button>
        </div>
      </div>
    </div>
  );
}
