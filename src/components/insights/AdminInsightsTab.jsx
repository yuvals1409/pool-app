import { useState } from "react";
import { useLang } from "../../i18n.jsx";
import { useIsDesktop } from "../../lib/useBreakpoint.js";
import { SegmentedControl } from "../ui/ds/index.js";
import DashboardOverviewPanel from "./DashboardOverviewPanel.jsx";
import StudentsInsightsPanel from "./StudentsInsightsPanel.jsx";
import InstructorsInsightsPanel from "./InstructorsInsightsPanel.jsx";
import HealthInsightsPanel from "./HealthInsightsPanel.jsx";

export default function AdminInsightsTab({ toast }) {
  const { t } = useLang();
  const isDesktop = useIsDesktop();
  const [insightsView, setInsightsView] = useState("overview");

  const viewOptions = [
    { value: "overview", label: t("insightsPanelOverview") },
    { value: "students", label: t("insightsPanelStudents") },
    { value: "instructors", label: t("insightsPanelInstructors") },
    { value: "health", label: t("insightsPanelHealth") },
  ];

  return (
    <div>
      {!isDesktop && (
        <div className="page-header">
          <h1 className="page-title">{t("tabDashboard")}</h1>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <SegmentedControl
          options={viewOptions}
          value={insightsView}
          onChange={setInsightsView}
          size="sm"
        />
      </div>

      {insightsView === "overview" && (
        <DashboardOverviewPanel
          toast={toast}
          onNavigateHealth={() => setInsightsView("health")}
        />
      )}
      {insightsView === "students" && <StudentsInsightsPanel toast={toast} />}
      {insightsView === "instructors" && <InstructorsInsightsPanel toast={toast} />}
      {insightsView === "health" && <HealthInsightsPanel toast={toast} />}
    </div>
  );
}
