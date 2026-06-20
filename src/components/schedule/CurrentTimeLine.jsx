import { useEffect, useState } from "react";
import {
  getNowLineTop,
  shouldShowNowLine,
  SCHEDULE_AXIS_W,
} from "../../lib/scheduleNow.js";

export default function CurrentTimeLine({ anchorDate, variant }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
    const msToNextMinute = 60000 - (Date.now() % 60000);
    let intervalId;
    const timeoutId = setTimeout(() => {
      tick();
      intervalId = setInterval(tick, 60000);
    }, msToNextMinute);
    return () => {
      clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  const top = getNowLineTop(now);
  if (top == null || !shouldShowNowLine(anchorDate, variant, now)) return null;

  const weekStyle = variant === "week"
    ? { top, insetInlineStart: SCHEDULE_AXIS_W }
    : { top };

  return (
    <div
      className={`schedule-now-line schedule-now-line--${variant}`}
      style={weekStyle}
      aria-hidden
    />
  );
}
