import { useState, useEffect, useCallback } from "react";
import { useLang } from "../i18n.jsx";
import {
  staffGetPortalCredentials,
  staffResetPortalPin,
  copyPortalCredentials,
  buildPortalWhatsAppUrl,
  getChildPortalUrl,
} from "../lib/childPortal.js";
import { canResetPortalPin, canViewPortalCredentials } from "../lib/permissions.js";
import { Button, Card, Spinner } from "./ui/ds/index.js";

export default function PortalCredentialsCard({
  participantId,
  profile,
  phone,
  toast,
  onCredentialsLoaded,
}) {
  const { t } = useLang();
  const [loading, setLoading] = useState(false);
  const [creds, setCreds] = useState(null);

  const load = useCallback(async () => {
    if (!participantId || !canViewPortalCredentials(profile)) return;
    setLoading(true);
    try {
      const data = await staffGetPortalCredentials(participantId);
      if (data?.result === "ok") {
        setCreds(data);
        onCredentialsLoaded?.(data);
      } else {
        setCreds(null);
      }
    } catch (e) {
      toast?.show(e.message || t("systemError"));
    }
    setLoading(false);
  }, [participantId, profile, toast, t, onCredentialsLoaded]);

  useEffect(() => { load(); }, [load]);

  const handleReset = async () => {
    if (!confirm(`${t("portalResetPin")}?`)) return;
    setLoading(true);
    try {
      const data = await staffResetPortalPin(participantId);
      if (data?.result === "ok") {
        setCreds(data);
        toast?.show(t("portalResetPinDone"));
      } else {
        toast?.show(t("systemError"));
      }
    } catch (e) {
      toast?.show(e.message || t("systemError"));
    }
    setLoading(false);
  };

  if (!canViewPortalCredentials(profile)) return null;

  return (
    <Card style={{ marginTop: 16 }}>
      <div className="child-portal-section-title">{t("portalCardTitle")}</div>
      {loading && !creds ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 16 }}><Spinner /></div>
      ) : !creds?.portal_token ? (
        <p style={{ fontSize: 13, color: "var(--ink-mid)" }}>{t("portalNotFound")}</p>
      ) : (
        <>
          {creds.portal_locked && (
            <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 8 }}>{t("portalLockedBadge")}</p>
          )}
          <div className="lesson-info" style={{ marginTop: 0 }}>
            <div className="lesson-info-row">
              <span className="li-key">{t("portalLink")}</span>
              <span className="li-val" style={{ fontSize: 12, wordBreak: "break-all" }}>
                {getChildPortalUrl(creds.portal_token)}
              </span>
            </div>
            <div className="lesson-info-row">
              <span className="li-key">{t("portalPin")}</span>
              <span className="li-val" style={{ fontFamily: "var(--font-mono)" }}>{creds.portal_pin}</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            <Button
              variant="outline"
              fullWidth
              onClick={() => copyPortalCredentials(creds.portal_token, creds.portal_pin, toast, t)}
            >
              {t("portalCopy")}
            </Button>
            {phone && (
              <Button
                variant="outline"
                fullWidth
                onClick={() => window.open(
                  buildPortalWhatsAppUrl(phone, creds.portal_token, creds.portal_pin, t),
                  "_blank",
                )}
              >
                {t("portalSendWa")}
              </Button>
            )}
            {canResetPortalPin(profile) && (
              <Button variant="secondary" fullWidth onClick={handleReset} disabled={loading}>
                {t("portalResetPin")}
              </Button>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
