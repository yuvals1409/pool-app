import { useState, useEffect, useCallback, useMemo } from "react";
import { useLang } from "../../i18n.jsx";
import { SCHEDULE_HOURS, fmt_time, timeToMinutes } from "../../lib/lessonDates.js";
import {
  assignSlotProduct,
  buildDayLayout,
  deleteScheduleSlot,
  getSeasonMasterSchedule,
  layoutStyleForEvent,
  PLANNING_DAYS,
  slotToEvent,
  upsertScheduleSlot,
} from "../../lib/seasonMasterSchedule.js";
import { Button, Card, Field, Select, Spinner } from "../ui/ds/index.js";

const SLOT_H = 27;
const AXIS_W = 48;
const DAY_NUM_TO_IDX = Object.fromEntries(PLANNING_DAYS.map((d, i) => [d, i]));

function slotTop(startTime) {
  const mins = timeToMinutes(String(startTime).slice(0, 5));
  const base = SCHEDULE_HOURS[0] * 60;
  return ((mins - base) / 30) * SLOT_H;
}

function slotHeight(startTime, endTime) {
  const start = timeToMinutes(String(startTime).slice(0, 5));
  const end = timeToMinutes(String(endTime).slice(0, 5));
  const slots = Math.max(1, (end - start) / 30);
  return slots * SLOT_H;
}

const LAYER_CLASS = { annual: "plan-slot-annual", summer: "plan-slot-summer" };

export default function SeasonMasterScheduleGrid({
  seasonId,
  mode = "annual",
  products = [],
  onUpdated,
  toast,
}) {
  const { t, days: dayNames } = useLang();
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [newSlot, setNewSlot] = useState({ day: 1, start: "16:00", end: "17:00" });

  const editableLayer = mode === "annual" ? "annual" : mode === "summer" ? "summer" : null;

  const load = useCallback(async () => {
    if (!seasonId) {
      setSlots([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await getSeasonMasterSchedule(seasonId);
      setSlots(rows);
    } catch (e) {
      toast?.show(e.message);
      setSlots([]);
    }
    setLoading(false);
  }, [seasonId, toast]);

  useEffect(() => { load(); }, [load]);

  const visibleSlots = useMemo(() => {
    if (mode === "annual") {
      return slots.filter((s) => s.layer === "annual");
    }
    return slots;
  }, [slots, mode]);

  const eventsByDay = useMemo(() => {
    const map = {};
    for (const day of PLANNING_DAYS) map[day] = [];
    for (const slot of visibleSlots) {
      const readOnly = mode === "summer" && slot.layer === "annual";
      map[slot.day_of_week]?.push(slotToEvent({ ...slot, readOnly }));
    }
    return map;
  }, [visibleSlots, mode]);

  const gridHeight = SCHEDULE_HOURS.length * 2 * SLOT_H;
  const gridCols = `${AXIS_W}px repeat(${PLANNING_DAYS.length}, 1fr)`;

  const handleAssign = async (slotId, productId) => {
    setBusy(slotId);
    try {
      await assignSlotProduct(slotId, productId || null);
      await load();
      onUpdated?.();
      setSelectedSlot(null);
    } catch (e) {
      toast?.show(e.message);
    }
    setBusy("");
  };

  const handleDelete = async (slotId) => {
    if (!confirm(t("seasonScheduleDeleteConfirm"))) return;
    setBusy(slotId);
    try {
      await deleteScheduleSlot(slotId);
      await load();
      onUpdated?.();
      setSelectedSlot(null);
    } catch (e) {
      toast?.show(e.message);
    }
    setBusy("");
  };

  const handleAddSlot = async () => {
    if (!editableLayer) return;
    setBusy("add");
    try {
      await upsertScheduleSlot({
        seasonId,
        layer: editableLayer,
        dayOfWeek: Number(newSlot.day),
        startTime: newSlot.start,
        endTime: newSlot.end,
      });
      await load();
      onUpdated?.();
    } catch (e) {
      toast?.show(e.message);
    }
    setBusy("");
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
        <Spinner />
      </div>
    );
  }

  return (
    <Card>
      <div style={{ fontWeight: 600, marginBottom: 12 }}>
        {mode === "summer" ? t("seasonScheduleMerged") : t("seasonScheduleAnnual")}
      </div>

      {editableLayer && (
        <div className="filter-bar" style={{ marginBottom: 12, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
          <Field label={t("courseWeekdays")} style={{ marginBottom: 0, minWidth: 100 }}>
            <Select value={newSlot.day} onChange={(e) => setNewSlot((s) => ({ ...s, day: e.target.value }))}>
              {PLANNING_DAYS.map((d) => (
                <option key={d} value={d}>{dayNames[d]}</option>
              ))}
            </Select>
          </Field>
          <Field label={t("startTime")} style={{ marginBottom: 0, minWidth: 100 }}>
            <Select value={newSlot.start} onChange={(e) => setNewSlot((s) => ({ ...s, start: e.target.value }))}>
              {SCHEDULE_HOURS.flatMap((h) => [`${String(h).padStart(2, "0")}:00`, `${String(h).padStart(2, "0")}:30`]).map((timeOpt) => (
                <option key={timeOpt} value={timeOpt}>{timeOpt}</option>
              ))}
            </Select>
          </Field>
          <Field label={t("endTime")} style={{ marginBottom: 0, minWidth: 100 }}>
            <Select value={newSlot.end} onChange={(e) => setNewSlot((s) => ({ ...s, end: e.target.value }))}>
              {SCHEDULE_HOURS.flatMap((h) => [`${String(h).padStart(2, "0")}:00`, `${String(h).padStart(2, "0")}:30`]).map((timeOpt) => (
                <option key={`e-${timeOpt}`} value={timeOpt}>{timeOpt}</option>
              ))}
            </Select>
          </Field>
          <Button variant="secondary" size="sm" onClick={handleAddSlot} disabled={!!busy}>
            {t("seasonScheduleAddSlot")}
          </Button>
        </div>
      )}

      <div className="schedule-calendar week-grid-card">
        <div className="week-grid-header" style={{ gridTemplateColumns: gridCols }}>
          <div className="week-grid-corner" />
          {PLANNING_DAYS.map((day) => (
            <div key={day} className="week-grid-day-header">
              <div className="week-grid-day-name">{dayNames[day]}</div>
            </div>
          ))}
        </div>

        <div className="week-grid-body" style={{ gridTemplateColumns: gridCols, minHeight: gridHeight }}>
          <div className="week-grid-axis">
            {SCHEDULE_HOURS.map((h) => (
              <div key={h} className="week-grid-hour" style={{ height: SLOT_H * 2 }}>
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>

          {PLANNING_DAYS.map((day) => {
            const events = eventsByDay[day] || [];
            const layout = buildDayLayout(events);
            return (
              <div key={day} className="week-grid-day-col" style={{ position: "relative", minHeight: gridHeight }}>
                {events.map((event) => {
                  const top = slotTop(event.start_time);
                  const height = slotHeight(event.start_time, event.end_time);
                  const canEdit = editableLayer === event.layer && !event.readOnly;
                  return (
                    <button
                      key={event.id}
                      type="button"
                      className={`plan-schedule-block ${LAYER_CLASS[event.layer] || ""}`}
                      style={layoutStyleForEvent(event, layout, { top, height })}
                      onClick={() => canEdit && setSelectedSlot(event)}
                      disabled={!canEdit}
                      title={event.product_name || event.label || ""}
                    >
                      <div className="plan-schedule-block-title">{event.product_name || event.label || "—"}</div>
                      <div className="plan-schedule-block-meta">
                        {fmt_time(event.start_time)}–{fmt_time(event.end_time)}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {selectedSlot && (
        <div className="modal-overlay" onClick={() => setSelectedSlot(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360, width: "100%" }}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>{t("seasonScheduleAssign")}</div>
            <Field label={t("tabProducts")}>
              <Select
                value={selectedSlot.product_id || ""}
                onChange={(e) => handleAssign(selectedSlot.id, e.target.value || null)}
                disabled={!!busy}
              >
                <option value="">{t("seasonScheduleUnassigned")}</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {dayNames[p.day_of_week]} {fmt_time(p.start_time)}
                  </option>
                ))}
              </Select>
            </Field>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <Button variant="secondary" size="sm" onClick={() => setSelectedSlot(null)}>{t("cancel")}</Button>
              <Button variant="danger" size="sm" onClick={() => handleDelete(selectedSlot.id)} disabled={!!busy}>
                {t("delete")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
