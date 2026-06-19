const PALETTE_SIZE = 8;

function hashId(id) {
  if (!id) return 0;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function getInstructorClass(instructorId) {
  const index = hashId(instructorId) % PALETTE_SIZE;
  return `instr-${index + 1}`;
}

export function buildInstructorMap(lessons) {
  const map = new Map();
  for (const l of lessons) {
    if (!l.instructor_id) continue;
    if (!map.has(l.instructor_id)) {
      map.set(l.instructor_id, {
        id: l.instructor_id,
        name: l.instructor_name,
        className: getInstructorClass(l.instructor_id),
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "he"));
}
