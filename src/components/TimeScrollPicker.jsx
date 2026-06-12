import { useEffect, useRef } from "react";
import { isValidStartTime } from "../lib/lessonDates.js";

const PICKER_HOURS = Array.from({ length: 19 }, (_, i) => i + 5);
const PICKER_MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const PICKER_ITEM_H = 44;

function minutesForHour(hour) {
  return hour === 23 ? [0] : PICKER_MINUTES;
}

function snapMinute(m, options = PICKER_MINUTES) {
  return options.reduce((best, n) => Math.abs(n - m) < Math.abs(best - m) ? n : best, options[0]);
}

function parsePickerTime(value) {
  if (!value) return [9, 0];
  const [hh, mm] = value.split(":").map(Number);
  const hour = PICKER_HOURS.includes(hh) ? hh : 9;
  const mins = minutesForHour(hour);
  const minute = hour === 23 ? 0 : snapMinute(mm, mins);
  return [hour, minute];
}

export { isValidStartTime };

export default function TimeScrollPicker({ value, onChange }) {
  const hourRef = useRef(null);
  const minRef = useRef(null);
  const [hour, minute] = parsePickerTime(value);
  const minuteOptions = minutesForHour(hour);

  const scrollTo = (ref, index) => {
    if (ref.current) ref.current.scrollTop = index * PICKER_ITEM_H;
  };

  useEffect(() => {
    const [h, m] = parsePickerTime(value);
    scrollTo(hourRef, PICKER_HOURS.indexOf(h));
    scrollTo(minRef, minutesForHour(h).indexOf(m));
  }, []);

  useEffect(() => {
    if (hour === 23) scrollTo(minRef, 0);
  }, [hour]);

  const emit = (h, m) => onChange(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);

  const onHourScroll = () => {
    const idx = Math.round(hourRef.current.scrollTop / PICKER_ITEM_H);
    const h = PICKER_HOURS[Math.max(0, Math.min(PICKER_HOURS.length - 1, idx))];
    const m = h === 23 ? 0 : minute;
    if (h !== hour || m !== minute) emit(h, m);
  };

  const onMinScroll = () => {
    if (hour === 23) return;
    const idx = Math.round(minRef.current.scrollTop / PICKER_ITEM_H);
    const m = minuteOptions[Math.max(0, Math.min(minuteOptions.length - 1, idx))];
    if (m !== minute) emit(hour, m);
  };

  return (
    <div className="time-picker">
      <div className="time-col" ref={hourRef} onScroll={onHourScroll}>
        <div className="time-col-spacer" />
        {PICKER_HOURS.map(h => (
          <div key={h} className={`time-item ${h === hour ? "active" : ""}`}>{String(h).padStart(2, "0")}</div>
        ))}
        <div className="time-col-spacer" />
      </div>
      <span className="time-sep">:</span>
      <div className="time-col" ref={minRef} onScroll={onMinScroll}>
        <div className="time-col-spacer" />
        {minuteOptions.map(m => (
          <div key={m} className={`time-item ${m === minute ? "active" : ""}`}>{String(m).padStart(2, "0")}</div>
        ))}
        <div className="time-col-spacer" />
      </div>
    </div>
  );
}
