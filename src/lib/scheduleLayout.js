import { timeToMinutes } from "./lessonDates.js";
import { eventDurationMinutes } from "./scheduleEvents.js";

export function eventTimeRange(event) {
  const start = timeToMinutes(event.start_time);
  const end = start + eventDurationMinutes(event);
  return { start, end };
}

export function eventsOverlap(a, b) {
  const ra = eventTimeRange(a);
  const rb = eventTimeRange(b);
  return ra.start < rb.end && rb.start < ra.end;
}

function mergeOverlapClusters(clusters) {
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const overlaps = clusters[i].some((a) =>
          clusters[j].some((b) => eventsOverlap(a, b))
        );
        if (overlaps) {
          clusters[i] = [...clusters[i], ...clusters[j]];
          clusters.splice(j, 1);
          merged = true;
          break;
        }
      }
      if (merged) break;
    }
  }
  return clusters;
}

/**
 * Assign side-by-side columns for overlapping events on the same day.
 * Returns Map<eventId, { column, totalColumns }>.
 */
export function assignEventColumns(events) {
  const layout = new Map();
  if (!events?.length) return layout;

  const clusters = mergeOverlapClusters(events.map((event) => [event]));

  for (const cluster of clusters) {
    const sorted = [...cluster].sort((a, b) => {
      const ra = eventTimeRange(a);
      const rb = eventTimeRange(b);
      if (ra.start !== rb.start) return ra.start - rb.start;
      return rb.end - ra.end;
    });

    const columnEnds = [];
    const assignments = new Map();

    for (const event of sorted) {
      const { start, end } = eventTimeRange(event);
      let column = columnEnds.findIndex((endMin) => endMin <= start);
      if (column === -1) {
        column = columnEnds.length;
        columnEnds.push(end);
      } else {
        columnEnds[column] = end;
      }
      assignments.set(event.id, column);
    }

    const totalColumns = columnEnds.length;
    for (const event of cluster) {
      layout.set(event.id, {
        column: assignments.get(event.id),
        totalColumns,
      });
    }
  }

  return layout;
}

const COLUMN_GAP_PX = 2;
const COLUMN_EDGE_PX = 3;

export function eventColumnStyle({ column, totalColumns }, baseStyle = {}) {
  if (!totalColumns || totalColumns <= 1) {
    return {
      ...baseStyle,
      insetInlineStart: COLUMN_EDGE_PX,
      insetInlineEnd: COLUMN_EDGE_PX,
    };
  }

  const widthPct = 100 / totalColumns;
  return {
    ...baseStyle,
    insetInlineStart: `calc(${column * widthPct}% + ${COLUMN_GAP_PX}px)`,
    insetInlineEnd: "auto",
    width: `calc(${widthPct}% - ${COLUMN_GAP_PX * 2}px)`,
  };
}

export function buildTimedEventStyle(lesson, layout, { top, height }) {
  const columnLayout = layout.get(lesson.id) || { column: 0, totalColumns: 1 };
  return eventColumnStyle(columnLayout, {
    position: "absolute",
    top,
    height,
    zIndex: 2 + columnLayout.column,
  });
}
