const PALETTE = [
  { bg: "#0077B6", text: "#FFFFFF" },
  { bg: "#00B894", text: "#FFFFFF" },
  { bg: "#6C5CE7", text: "#FFFFFF" },
  { bg: "#E17055", text: "#FFFFFF" },
  { bg: "#0984E3", text: "#FFFFFF" },
  { bg: "#FDCB6E", text: "#012A4A" },
  { bg: "#A29BFE", text: "#FFFFFF" },
  { bg: "#00CEC9", text: "#012A4A" },
];

function hashId(id) {
  if (!id) return 0;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function getInstructorColor(instructorId) {
  return PALETTE[hashId(instructorId) % PALETTE.length];
}

export function buildInstructorMap(lessons) {
  const map = new Map();
  for (const l of lessons) {
    if (!l.instructor_id) continue;
    if (!map.has(l.instructor_id)) {
      map.set(l.instructor_id, {
        id: l.instructor_id,
        name: l.instructor_name,
        color: getInstructorColor(l.instructor_id),
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "he"));
}
