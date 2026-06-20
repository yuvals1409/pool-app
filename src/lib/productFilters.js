export function productTextFields(product) {
  return [product.name, product.level_label].filter(Boolean);
}

export function productSearchBlob(product) {
  return productTextFields(product).join(" ");
}

const GRADE_RE = /כיתות[^)\n]*/g;
const AGE_PATTERNS = [
  /גילאי?\s*\d+\s*[\-–]\s*\d+/g,
  /\(\s*\d+\s*[\-–]\s*\d+\s*(?:שנים?|לט)?\s*\)/g,
  /גיל\s*\d+\s*[\-–]\s*\d+/g,
];

function normalizeAgeTag(raw) {
  return raw.replace(/[()]/g, "").trim();
}

export function extractGradesFromText(text) {
  if (!text) return [];
  const tags = [];
  let m;
  while ((m = GRADE_RE.exec(text))) {
    const tag = m[0].replace(/^[(\s]+|[)\s]+$/g, "").trim();
    if (tag && !tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

export function extractAgesFromText(text) {
  if (!text) return [];
  const tags = [];
  for (const re of AGE_PATTERNS) {
    const r = new RegExp(re.source, re.flags);
    let m;
    while ((m = r.exec(text))) {
      const tag = normalizeAgeTag(m[0]);
      if (tag && !tags.includes(tag)) tags.push(tag);
    }
  }
  return tags;
}

export function collectGradeOptions(products) {
  const set = new Set();
  for (const p of products) {
    for (const text of productTextFields(p)) {
      for (const g of extractGradesFromText(text)) set.add(g);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, "he"));
}

export function collectAgeOptions(products) {
  const set = new Set();
  for (const p of products) {
    for (const text of productTextFields(p)) {
      for (const a of extractAgesFromText(text)) set.add(a);
    }
  }
  return [...set].sort((a, b) => {
    const na = parseInt(a.match(/\d+/)?.[0] ?? "0", 10);
    const nb = parseInt(b.match(/\d+/)?.[0] ?? "0", 10);
    return na - nb || a.localeCompare(b, "he");
  });
}

export function productMatchesDay(product, dayFilter) {
  if (dayFilter === "" || dayFilter == null) return true;
  const day = Number(dayFilter);
  const code = product.product_templates?.code;
  const pattern = product.schedule_pattern || {};
  if (code === "summer_course" || pattern.type === "course_series") {
    const weekdays = Array.isArray(pattern.weekdays) ? pattern.weekdays : [];
    return weekdays.includes(day);
  }
  return product.day_of_week === day;
}

export function filterProducts(products, filters) {
  const search = (filters.search || "").trim().toLowerCase();
  return products.filter((p) => {
    if (filters.instructorId && p.instructor_id !== filters.instructorId) return false;
    if (!productMatchesDay(p, filters.day)) return false;
    if (filters.grade && !productSearchBlob(p).includes(filters.grade)) return false;
    if (filters.age && !productSearchBlob(p).includes(filters.age)) return false;
    if (filters.templateCode) {
      const code = p.product_templates?.code || "annual_section";
      if (code !== filters.templateCode) return false;
    }
    if (search) {
      const hay = [p.name, p.instructor_name, p.level_label]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
}
