import { useLang } from "../../i18n.jsx";
import { Button, Card } from "../ui/ds/index.js";

export default function RecurringScopeDialog({ onChoose, onCancel }) {
  const { t } = useLang();
  return (
    <div className="schedule-panel-overlay" onClick={onCancel}>
      <Card className="schedule-panel" padded={false} onClick={e => e.stopPropagation()} style={{ borderRadius: "16px 16px 0 0" }}>
        <div className="schedule-panel-handle" />
        <div className="section-title" style={{ fontSize: 17 }}>{t("recurringScopeTitle")}</div>
        <div className="recurring-scope-btns">
          <Button variant="primary" onClick={() => onChoose("single")}>
            {t("recurringScopeSingle")}
          </Button>
          <Button variant="secondary" onClick={() => onChoose("forward")}>
            {t("recurringScopeForward")}
          </Button>
          <Button variant="secondary" onClick={onCancel}>{t("cancel")}</Button>
        </div>
      </Card>
    </div>
  );
}
