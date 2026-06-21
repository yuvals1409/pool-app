/** Isolate LTR fragments (numbers, dates) for correct display in RTL UI. */
export function ltrIsolate(text) {
  if (text == null || text === "") return "";
  return `\u2066${String(text)}\u2069`;
}

/** Season <option> label — keeps year/name LTR and Hebrew suffix readable. */
export function seasonOptionLabel(name, { active = false, activeLabel = "", planningLabel = "", lifecycle = "" } = {}) {
  const isolated = ltrIsolate(name);
  const tags = [];
  if (active && activeLabel) tags.push(activeLabel);
  else if (lifecycle === "planning" && planningLabel) tags.push(planningLabel);
  else if (lifecycle === "ended" && planningLabel) tags.push(planningLabel);
  if (!tags.length) return isolated;
  return `${isolated} (${tags.join(", ")})`;
}
