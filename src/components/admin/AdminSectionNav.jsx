import { useLang } from "../../i18n.jsx";
import { useIsDesktop } from "../../lib/useBreakpoint.js";
import {
  getAdminNavGroups,
  getAdminGroupForSection,
  getVisibleSectionsInGroup,
  adminGroupLabel,
  adminSectionLabel,
} from "../../lib/navigationPolicy.js";
import { NavItem } from "../ui/ds/navigation/Sidebar.jsx";
import { Button, SegmentedControl } from "../ui/ds/index.js";

export function AdminGroupNav({ variant, profile, adminSection, onAdminSectionChange }) {
  const { t } = useLang();
  const isDesktop = useIsDesktop();
  const groups = getAdminNavGroups(profile, isDesktop);
  const activeGroupId = getAdminGroupForSection(adminSection);

  const handleGroupClick = (group) => {
    if (group.id === activeGroupId) return;
    const first = group.sectionIds[0];
    if (first) onAdminSectionChange(first);
  };

  if (variant === "rail") {
    return (
      <aside className="admin-rail" style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {groups.map((group) => (
          <NavItem
            key={group.id}
            label={adminGroupLabel(group.id, t)}
            active={activeGroupId === group.id}
            onClick={() => handleGroupClick(group)}
          />
        ))}
      </aside>
    );
  }

  return (
    <div
      className="admin-nav-mobile admin-group-nav-mobile"
      style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 8 }}
    >
      {groups.map((group) => (
        <Button
          key={group.id}
          size="sm"
          variant={activeGroupId === group.id ? "secondary" : "ghost"}
          onClick={() => handleGroupClick(group)}
          style={{ flexShrink: 0 }}
        >
          {adminGroupLabel(group.id, t)}
        </Button>
      ))}
    </div>
  );
}

export function AdminSectionSubNav({ profile, adminSection, onAdminSectionChange }) {
  const { t } = useLang();
  const isDesktop = useIsDesktop();
  const activeGroupId = getAdminGroupForSection(adminSection);
  if (!activeGroupId) return null;

  const sections = getVisibleSectionsInGroup(activeGroupId, profile, isDesktop);
  if (sections.length <= 1) return null;

  const options = sections.map((id) => ({
    value: id,
    label: adminSectionLabel(id, t),
  }));

  if (sections.length <= 4) {
    return (
      <div className="admin-section-subnav">
        <SegmentedControl
          options={options}
          value={adminSection}
          onChange={onAdminSectionChange}
          size="sm"
        />
      </div>
    );
  }

  return (
    <div className="admin-section-subnav admin-section-subnav--scroll">
      {options.map((opt) => (
        <Button
          key={opt.value}
          size="sm"
          variant={adminSection === opt.value ? "secondary" : "ghost"}
          onClick={() => onAdminSectionChange(opt.value)}
          style={{ flexShrink: 0 }}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}
