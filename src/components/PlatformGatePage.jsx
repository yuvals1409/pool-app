import { useLang } from "../i18n.jsx";
import { Button } from "./ui/ds/index.js";

export default function PlatformGatePage({ gate, onLogout }) {
  const { t } = useLang();
  const isMobileOnly = gate === "mobile_only";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: 24,
        background: "var(--canvas)",
      }}
    >
      <div style={{ maxWidth: 400, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🏊</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>
          {isMobileOnly ? t("platformMobileOnlyTitle") : t("platformDesktopOnlyTitle")}
        </h1>
        <p style={{ fontSize: 15, color: "var(--ink-soft)", lineHeight: 1.5, marginBottom: 24 }}>
          {isMobileOnly ? t("platformMobileOnly") : t("platformDesktopOnly")}
        </p>
        {onLogout ? (
          <Button variant="secondary" onClick={onLogout}>{t("logout")}</Button>
        ) : null}
      </div>
    </div>
  );
}
