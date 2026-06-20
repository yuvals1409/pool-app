/** Isolate LTR fragments (numbers, dates) for correct display in RTL UI. */
export function ltrIsolate(text) {
  if (text == null || text === "") return "";
  return `\u2066${String(text)}\u2069`;
}

/** Season <option> label — keeps year/name LTR and Hebrew suffix readable. */
export function seasonOptionLabel(name, { active = false, activeLabel = "" } = {}) {
  const isolated = ltrIsolate(name);
  if (!active || !activeLabel) return isolated;
  return `${isolated} (${activeLabel})`;
}
