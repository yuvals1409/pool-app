import { useState, useRef } from "react";
import { useLang } from "../i18n.jsx";
import { staffSetParticipantPhoto, fileToBase64 } from "../lib/childPortal.js";
import { canUpdateParticipantPhoto } from "../lib/permissions.js";
import { Button, Spinner } from "./ui/ds/index.js";

export default function ParticipantPhotoEditor({
  participantId,
  profile,
  photoUrl,
  toast,
  onUpdated,
}) {
  const { t } = useLang();
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);

  if (!canUpdateParticipantPhoto(profile)) {
    if (!photoUrl) return null;
    return (
      <img
        src={photoUrl}
        alt=""
        className="child-portal-photo-preview"
        style={{ marginTop: 8 }}
      />
    );
  }

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const b64 = await fileToBase64(file);
      const data = await staffSetParticipantPhoto(participantId, b64, file.type);
      if (data?.result === "ok") {
        toast?.show(t("portalPhotoSaved"));
        onUpdated?.();
      } else {
        toast?.show(t("systemError"));
      }
    } catch (err) {
      toast?.show(err.message || t("systemError"));
    }
    setUploading(false);
    e.target.value = "";
  };

  return (
    <div style={{ marginTop: 12 }}>
      {photoUrl && (
        <img src={photoUrl} alt="" className="child-portal-photo-preview" />
      )}
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={handleFile} />
      <Button
        variant="outline"
        size="sm"
        style={{ marginTop: 8 }}
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? <Spinner /> : (photoUrl ? t("portalPhotoUpload") : t("portalPhotoUpload"))}
      </Button>
    </div>
  );
}
