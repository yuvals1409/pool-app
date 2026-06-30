import { describe, expect, it } from "vitest";
import {
  extractGradesFromText,
  extractAgesFromText,
  productMatchesDay,
  filterProducts,
} from "./productFilters.js";

const baseProduct = {
  id: "p1",
  name: "חוג שחייה",
  instructor_id: "i1",
  instructor_name: "מדריך",
  target_audience: "גילאי 6-8 (כיתות א-ב)",
  day_of_week: 1,
  product_templates: { code: "annual_section" },
};

describe("extractGradesFromText", () => {
  it("extracts grade tags from Hebrew text", () => {
    expect(extractGradesFromText("קבוצה (כיתות א-ב)")).toEqual(["כיתות א-ב"]);
    expect(extractGradesFromText("כיתות ג")).toEqual(["כיתות ג"]);
  });

  it("returns empty array for missing text", () => {
    expect(extractGradesFromText("")).toEqual([]);
  });
});

describe("extractAgesFromText", () => {
  it("extracts age ranges", () => {
    expect(extractAgesFromText("קבוצה לגילאי 6-8")).toContain("גילאי 6-8");
  });
});

describe("productMatchesDay", () => {
  it("matches day_of_week when no schedule pattern", () => {
    expect(productMatchesDay(baseProduct, 1)).toBe(true);
    expect(productMatchesDay(baseProduct, 2)).toBe(false);
  });

  it("matches schedule pattern slots", () => {
    const product = {
      ...baseProduct,
      schedule_pattern: { schedule: [{ day: 3, startTime: "16:00" }] },
    };
    expect(productMatchesDay(product, 3)).toBe(true);
    expect(productMatchesDay(product, 1)).toBe(false);
  });

  it("allows all days when filter is empty", () => {
    expect(productMatchesDay(baseProduct, "")).toBe(true);
    expect(productMatchesDay(baseProduct, null)).toBe(true);
  });
});

describe("filterProducts", () => {
  const products = [
    baseProduct,
    {
      ...baseProduct,
      id: "p2",
      name: "טניס",
      instructor_id: "i2",
      day_of_week: 2,
      target_audience: "גילאי 10-12",
    },
  ];

  it("filters by instructor", () => {
    expect(filterProducts(products, { instructorId: "i2" })).toHaveLength(1);
    expect(filterProducts(products, { instructorId: "i2" })[0].name).toBe("טניס");
  });

  it("filters by search text", () => {
    expect(filterProducts(products, { search: "טניס" })).toHaveLength(1);
  });

  it("filters by grade substring", () => {
    expect(filterProducts(products, { grade: "כיתות א-ב" })).toHaveLength(1);
  });
});
