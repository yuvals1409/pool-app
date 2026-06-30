import { Sidebar, NavItem } from "../ui/ds/navigation/Sidebar.jsx";
import { TopBar } from "../ui/ds/navigation/TopBar.jsx";
import { Avatar } from "../ui/ds/core/Avatar.jsx";
import { TabIcon } from "../../lib/tabIcons.jsx";

function BrandLogo({ height = 28 }) {
  return (
    <img
      src="/stream-line-logo.jpeg"
      alt=""
      style={{ width: height, height, borderRadius: 6, objectFit: "cover" }}
      onError={(e) => { e.currentTarget.src = "/logo.png"; }}
    />
  );
}

export default function AppWorkspaceShell({
  tabs,
  activeTab,
  onTabChange,
  profile,
  brandTitle,
  brandSubtitle,
  roleLabel,
  topBarTitle,
  topBarSubtitle,
  topBarActions = null,
  topBarTrailing = null,
  children,
}) {
  return (
    <div className="app-workspace-shell">
      <Sidebar
        header={(
          <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "2px 4px" }}>
            <BrandLogo height={28} />
            <div style={{ lineHeight: 1.1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {brandTitle}
              </div>
              {brandSubtitle ? (
                <div style={{ fontSize: 11, color: "var(--ink-soft)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {brandSubtitle}
                </div>
              ) : null}
            </div>
          </div>
        )}
        footer={(
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <Avatar name={profile.full_name || profile.email} src={profile.avatar_url} size={28} />
            <div style={{ flex: 1, lineHeight: 1.15, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {profile.full_name || profile.email}
              </div>
              {roleLabel ? (
                <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>{roleLabel}</div>
              ) : null}
            </div>
          </div>
        )}
      >
        {tabs.map((tabItem) => (
          <NavItem
            key={tabItem.id}
            data-testid={`nav-tab-${tabItem.id}`}
            icon={<TabIcon id={tabItem.id} active={activeTab === tabItem.id} />}
            label={tabItem.label}
            active={activeTab === tabItem.id}
            onClick={() => onTabChange(tabItem.id)}
          />
        ))}
      </Sidebar>

      <div className="app-workspace-main">
        <TopBar
          title={topBarTitle}
          subtitle={topBarSubtitle}
          actions={topBarActions || topBarTrailing ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {topBarActions}
              {topBarTrailing}
            </div>
          ) : null}
        />
        <div className="app-workspace-content tab-stage">
          {children}
        </div>
      </div>
    </div>
  );
}
