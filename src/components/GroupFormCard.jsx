import { useMemo, useState } from "react";
import {
  GROUP_TYPE_ANNUAL,
  GROUP_TYPE_SUMMER,
  classifyAudienceKind,
  emptyScheduleSlot,
} from "../lib/groupConstants.js";
import { computeFormGroupName } from "../lib/groupModel.js";
import {
  Button,
  Card,
  Field,
  Input,
  Select,
  Spinner,
} from "./ui/ds/index.js";

function patchForm(setFormState, patch) {
  setFormState((prev) => ({ ...prev, ...patch }));
}

export default function GroupFormCard({
  formState,
  setFormState,
  instructors,
  days,
  t,
  audienceOptions,
  onAddAudience,
  saving,
  onSave,
  onCancel,
}) {
  const [newAudience, setNewAudience] = useState("");
  const [showNewAudience, setShowNewAudience] = useState(false);
  const [addingAudience, setAddingAudience] = useState(false);

  const generatedName = useMemo(
    () => computeFormGroupName(formState, days),
    [formState, days],
  );

  const pickInstructor = (id) => {
    const inst = instructors.find((x) => x.id === id);
    patchForm(setFormState, {
      instructorId: id,
      instructorName: inst ? (inst.full_name || inst.email || "") : "",
    });
  };

  const setType = (type) => {
    const next = { type };
    if (type === GROUP_TYPE_SUMMER) {
      next.level = null;
      if (!formState.targetAudience || classifyAudienceKind(formState.targetAudience) === "grade") {
        next.targetAudience = "";
      }
    }
    patchForm(setFormState, next);
  };

  const updateScheduleSlot = (index, patch) => {
    setFormState((prev) => {
      const schedule = prev.schedule.map((slot, i) => (i === index ? { ...slot, ...patch } : slot));
      return { ...prev, schedule };
    });
  };

  const removeScheduleSlot = (index) => {
    setFormState((prev) => ({
      ...prev,
      schedule: prev.schedule.filter((_, i) => i !== index),
    }));
  };

  const addScheduleSlot = () => {
    setFormState((prev) => ({
      ...prev,
      schedule: [...prev.schedule, emptyScheduleSlot(1)],
    }));
  };

  const handleAddAudience = async () => {
    setAddingAudience(true);
    try {
      await onAddAudience(newAudience.trim());
      patchForm(setFormState, { targetAudience: newAudience.trim() });
      setNewAudience("");
      setShowNewAudience(false);
    } catch {
      // Parent shows validation toast.
    } finally {
      setAddingAudience(false);
    }
  };

  return (
    <Card style={{ marginBottom: 20 }}>
      <Field label={t("productType")}>
        <Select
          value={formState.type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value={GROUP_TYPE_ANNUAL}>{t("productTypeAnnual")}</option>
          <option value={GROUP_TYPE_SUMMER}>{t("productTypeSummer")}</option>
        </Select>
      </Field>

      {formState.type === GROUP_TYPE_ANNUAL && (
        <Field label={t("groupLevel")}>
          <Select
            value={formState.level ?? ""}
            onChange={(e) => patchForm(setFormState, {
              level: e.target.value ? Number(e.target.value) : null,
            })}
          >
            <option value="">{t("selectLevel")}</option>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </Select>
        </Field>
      )}

      <Field label={t("groupGender")}>
        <Select
          value={formState.gender}
          onChange={(e) => patchForm(setFormState, { gender: e.target.value })}
        >
          <option value="male">{t("groupGenderMale")}</option>
          <option value="female">{t("groupGenderFemale")}</option>
          <option value="mixed">{t("groupGenderMixed")}</option>
        </Select>
      </Field>

      <Field label={t("groupTargetAudience")}>
        <Select
          value={formState.targetAudience}
          onChange={(e) => patchForm(setFormState, { targetAudience: e.target.value })}
        >
          <option value="">{t("selectTargetAudience")}</option>
          {audienceOptions.map((label) => (
            <option key={label} value={label}>{label}</option>
          ))}
        </Select>
        {!showNewAudience ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            style={{ marginTop: 8 }}
            onClick={() => setShowNewAudience(true)}
          >
            {t("addTargetAudience")}
          </Button>
        ) : (
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <Input
              value={newAudience}
              onChange={(e) => setNewAudience(e.target.value)}
              placeholder={t("groupTargetAudiencePlaceholder")}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={addingAudience}
              onClick={handleAddAudience}
            >
              {addingAudience ? <Spinner size={14} /> : t("save")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { setShowNewAudience(false); setNewAudience(""); }}
            >
              {t("cancel")}
            </Button>
          </div>
        )}
      </Field>

      <Field label={t("groupSchedule")}>
        {formState.schedule.map((slot, index) => (
          <div
            key={`schedule-${index}`}
            style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "flex-end" }}
          >
            <Select
              value={slot.day}
              onChange={(e) => updateScheduleSlot(index, { day: Number(e.target.value) })}
              style={{ minWidth: 120 }}
            >
              {days.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </Select>
            <Input
              type="time"
              value={slot.startTime}
              onChange={(e) => updateScheduleSlot(index, { startTime: e.target.value })}
              dir="ltr"
            />
            <Input
              type="time"
              value={slot.endTime}
              onChange={(e) => updateScheduleSlot(index, { endTime: e.target.value })}
              dir="ltr"
            />
            {formState.schedule.length > 1 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => removeScheduleSlot(index)}
              >
                {t("removeSession")}
              </Button>
            )}
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addScheduleSlot}>
          {t("addSession")}
        </Button>
      </Field>

      {formState.type === GROUP_TYPE_SUMMER && (
        <Field label={t("courseDateRange")}>
          <div style={{ display: "flex", gap: 8 }}>
            <Input
              type="date"
              value={formState.courseStart}
              onChange={(e) => patchForm(setFormState, { courseStart: e.target.value })}
              dir="ltr"
            />
            <Input
              type="date"
              value={formState.courseEnd}
              onChange={(e) => patchForm(setFormState, { courseEnd: e.target.value })}
              dir="ltr"
            />
          </div>
        </Field>
      )}

      <Field label={t("groupNamePreview")}>
        <Input value={generatedName} readOnly disabled />
      </Field>

      <Field label={t("instructor")}>
        <Select value={formState.instructorId} onChange={(e) => pickInstructor(e.target.value)}>
          <option value="">{t("selectInstructor")}</option>
          {instructors.map((inst) => (
            <option key={inst.id} value={inst.id}>{inst.full_name || inst.email}</option>
          ))}
        </Select>
      </Field>

      <Field label={t("assessmentCapacity")}>
        <Input
          type="number"
          min={1}
          value={formState.capacity}
          onChange={(e) => patchForm(setFormState, { capacity: e.target.value })}
          dir="ltr"
        />
      </Field>

      <Field label={t("productPrice")}>
        <Input
          type="number"
          min={0}
          step="0.01"
          value={formState.price}
          onChange={(e) => patchForm(setFormState, { price: e.target.value })}
          dir="ltr"
          placeholder={t("productPriceOptional")}
        />
      </Field>

      <div style={{ display: "flex", gap: 8 }}>
        <Button type="button" variant="primary" onClick={onSave} disabled={saving}>
          {saving ? <><Spinner size={14} color="var(--on-primary)" /> {t("saving")}</> : t("saveProduct")}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>{t("cancel")}</Button>
      </div>
    </Card>
  );
}
