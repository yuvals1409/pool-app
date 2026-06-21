import { useRef } from "react";
import { useLang } from "../i18n.jsx";
import {
  getPersonalSections,
  personalSectionLabel,
} from "../lib/navigationPolicy.js";
import ScheduleTab from "./schedule/ScheduleTab.jsx";
import InstructorPayrollSummary from "./InstructorPayrollSummary.jsx";
import InstructorAssessmentResults from "./InstructorAssessmentResults.jsx";
import { Button, Card } from "./ui/ds/index.js";

export default function InstructorPersonalTab({
  profile,
  toast,
  personalSection,
  onPersonalSectionChange,
  onMarkAttendance,
}) {
  const { t } = useLang();
  const scheduleRef = useRef(null);
  const sections = getPersonalSections().map((id) => ({
    id,
    label: personalSectionLabel(id, t),
  }));

  const renderSection = () => {
    switch (personalSection) {
      case "schedule":
        return (
          <ScheduleTab
            ref={scheduleRef}
            profile={profile}
            toast={toast}
            embedded
            onMarkAttendance={onMarkAttendance}
          />
        );
      case "payroll":
        return <InstructorPayrollSummary profile={profile} toast={toast} />;
      case "assessments":
        return <InstructorAssessmentResults toast={toast} />;
      case "pending":
        return (
          <Card style={{ padding: 20, marginTop: 12 }}>
            <p style={{ fontSize: 14, color: "var(--ink-mid)", lineHeight: 1.5 }}>
              {t("portalPinSub")}
            </p>
          </Card>
        );
      default:
        return null;
    }
  };

  return (
    <div>
      <div className="admin-nav-mobile" style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 12 }}>
        {sections.map((section) => (
          <Button
            key={section.id}
            size="sm"
            variant={personalSection === section.id ? "secondary" : "ghost"}
            onClick={() => onPersonalSectionChange(section.id)}
            style={{ flexShrink: 0 }}
          >
            {section.label}
          </Button>
        ))}
      </div>

      {personalSection !== "schedule" && (
        <div className="page-header">
          <h1 className="page-title">
            {sections.find((s) => s.id === personalSection)?.label}
          </h1>
        </div>
      )}

      {renderSection()}
    </div>
  );
}
