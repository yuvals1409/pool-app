import { AnimatePresence } from "framer-motion";
import { useLang } from "../i18n.jsx";
import { AnimatedSheetOverlay, AnimatedSheetPanel } from "./ui/AnimatedSheet.jsx";
import PortalCredentialsCard from "./PortalCredentialsCard.jsx";
import ParticipantPhotoEditor from "./ParticipantPhotoEditor.jsx";
import { Button } from "./ui/ds/index.js";

export default function PortalEnrollmentModal({
  open,
  onClose,
  participantId,
  phone,
  profile,
  toast,
}) {
  const { t } = useLang();
  if (!open || !participantId) return null;

  return (
    <AnimatePresence>
      {open && (
        <AnimatedSheetOverlay onClose={onClose}>
          <AnimatedSheetPanel onClick={(e) => e.stopPropagation()}>
            <div className="section-title">{t("enrollmentAdded")}</div>
            <p className="section-sub" style={{ marginBottom: 12 }}>{t("portalPinSub")}</p>
            <PortalCredentialsCard
              participantId={participantId}
              profile={profile}
              phone={phone}
              toast={toast}
            />
            <ParticipantPhotoEditor
              participantId={participantId}
              profile={profile}
              toast={toast}
              photoUrl={null}
              onUpdated={onClose}
            />
            <Button variant="secondary" fullWidth style={{ marginTop: 16 }} onClick={onClose}>
              {t("close")}
            </Button>
          </AnimatedSheetPanel>
        </AnimatedSheetOverlay>
      )}
    </AnimatePresence>
  );
}
