import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getInstructorColor } from "../../lib/instructorColors.js";
import { fmt_time } from "../../lib/lessonDates.js";

export function useLessonDrag({ enabled, onDrop }) {
  const [dragLesson, setDragLesson] = useState(null);
  const [ghostPos, setGhostPos] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const dragging = useRef(false);

  const findDropTarget = useCallback((clientX, clientY, lessonDate) => {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return null;
    const slot = el.closest("[data-drop-time]");
    if (!slot) return null;
    const date = slot.getAttribute("data-drop-date");
    const time = slot.getAttribute("data-drop-time");
    if (!date || !time || date !== lessonDate) return null;
    return { date, time, key: `${date}|${time}` };
  }, []);

  const startDrag = useCallback((lesson, e) => {
    if (!enabled) return;
    dragging.current = true;
    setDragLesson(lesson);
    setGhostPos({ x: e.clientX, y: e.clientY });
    e.target.setPointerCapture?.(e.pointerId);
  }, [enabled]);

  useEffect(() => {
    if (!dragLesson) return;

    const onMove = (e) => {
      if (!dragging.current) return;
      setGhostPos({ x: e.clientX, y: e.clientY });
      const target = findDropTarget(e.clientX, e.clientY, dragLesson.lesson_date);
      setDropTarget(target?.key || null);
    };

    const onUp = (e) => {
      if (!dragging.current) return;
      dragging.current = false;
      const target = findDropTarget(e.clientX, e.clientY, dragLesson.lesson_date);
      if (target && dragLesson) {
        const newTime = target.time;
        if (newTime !== dragLesson.start_time?.slice(0, 5)) {
          onDrop(dragLesson, dragLesson.lesson_date, newTime);
        }
      }
      setDragLesson(null);
      setGhostPos(null);
      setDropTarget(null);
    };

    const onKey = (e) => {
      if (e.key === "Escape") {
        dragging.current = false;
        setDragLesson(null);
        setGhostPos(null);
        setDropTarget(null);
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
    };
  }, [dragLesson, findDropTarget, onDrop]);

  const ghost = dragLesson && ghostPos ? createPortal(
    <div
      className="lesson-block lesson-block-ghost"
      style={{
        left: ghostPos.x,
        top: ghostPos.y,
        background: getInstructorColor(dragLesson.instructor_id).bg,
        color: getInstructorColor(dragLesson.instructor_id).text,
      }}
    >
      <div className="lesson-block-name">{dragLesson.child_name}</div>
      <div className="lesson-block-time">{fmt_time(dragLesson.start_time)}</div>
    </div>,
    document.body,
  ) : null;

  return { startDrag, dropTarget, ghost };
}
