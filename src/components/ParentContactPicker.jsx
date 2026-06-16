import { useMemo, useState } from "react";
import { useLang } from "../i18n.jsx";
import { isContactPickerSupported, pickParentContact } from "../lib/contactPicker.js";

export default function ParentContactPicker({ value, onChange, onError }) {
  const { t } = useLang();
  const pickerAvailable = useMemo(() => isContactPickerSupported(), []);
  const [contactName, setContactName] = useState("");
  const [picking, setPicking] = useState(false);
  const [showManual, setShowManual] = useState(!pickerAvailable);

  const pick = async () => {
    if (!pickerAvailable) {
      setShowManual(true);
      onError?.(t("contactPickerEnableIOS"));
      return;
    }

    setPicking(true);
    try {
      const result = await pickParentContact();
      if (result) {
        setContactName(result.name);
        onChange?.(result.phone);
      }
    } catch (err) {
      const code = err?.code || err?.message;
      if (code === "no-phone") onError?.(t("contactPickerNoPhone"));
      else {
        setShowManual(true);
        onError?.(t("contactPickerEnableIOS"));
      }
    } finally {
      setPicking(false);
    }
  };

  if (showManual && !pickerAvailable) {
    return (
      <div className="contact-picker">
        <input
          className="input"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="050-0000000"
          value={value}
          onChange={e => onChange?.(e.target.value)}
          dir="ltr"
        />
        <div className="contact-picker-hint">{t("parentPhoneManualHint")}</div>
        <div className="contact-picker-hint">{t("contactPickerEnableIOS")}</div>
      </div>
    );
  }

  if (!value) {
    return (
      <div className="contact-picker">
        <button type="button" className="btn btn-outline contact-picker-btn" onClick={pick} disabled={picking}>
          {picking ? <><div className="spinner" /> {t("openingContacts")}</> : <>📇 {t("selectParentContact")}</>}
        </button>
        <div className="contact-picker-hint">{t("parentPhoneHint")}</div>
        {showManual && (
          <div className="contact-picker-manual-fallback">
            <div className="contact-picker-hint">{t("parentPhoneManualHint")}</div>
            <input
              className="input"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="050-0000000"
              value={value}
              onChange={e => onChange?.(e.target.value)}
              dir="ltr"
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="contact-picker">
      <div className="contact-picker-selected">
        <div className="contact-picker-info">
          {contactName && <div className="contact-picker-name">{contactName}</div>}
          <div className="contact-picker-phone" dir="ltr">{value}</div>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={pick} disabled={picking}>
          {picking ? <><div className="spinner" /> {t("openingContacts")}</> : t("changeParentContact")}
        </button>
      </div>
    </div>
  );
}
