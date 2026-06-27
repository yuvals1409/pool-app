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
    <Card className="sp-portal-card">
      <h3 className="sp-section-heading">{t("portalCardTitle")}</h3>
      {loading && !creds ? (
        <div className="sp-loading"><Spinner /></div>
      ) : !creds?.portal_token ? (
        <p className="sp-empty">{t("portalNotFound")}</p>
      ) : (
        <>
          {creds.portal_locked && (
            <p className="sp-portal-locked">{t("portalLockedBadge")}</p>
          )}
          <div className="sp-cred-box">
            <div className="sp-cred-block">
              <span className="sp-cred-label">{t("portalLink")}</span>
              <span className="sp-cred-value link">{getChildPortalUrl(creds.portal_token)}</span>
            </div>
            <div className="sp-cred-block">
              <span className="sp-cred-label">{t("portalPin")}</span>
              <span className="sp-cred-value mono">{creds.portal_pin}</span>
            </div>
          </div>
          <div className="sp-cred-actions">
            <Button
              variant="outline"
              size="lg"
              fullWidth
              onClick={() => copyPortalCredentials(creds.portal_token, creds.portal_pin, toast, t)}
            >
              {t("portalCopy")}
            </Button>
            {phone && (
              <Button
                variant="outline"
                size="lg"
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
              <Button variant="secondary" size="lg" fullWidth onClick={handleReset} disabled={loading}>
                {t("portalResetPin")}
              </Button>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
