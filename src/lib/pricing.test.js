import { describe, expect, it, vi } from "vitest";

vi.mock("./supabase.js", () => ({
  supabase: {},
}));

import { applySiblingDiscount } from "./pricing.js";

describe("applySiblingDiscount", () => {
  it("returns zero for non-finite amounts", () => {
    expect(applySiblingDiscount("abc", 10)).toBe(0);
  });

  it("applies percentage discount and rounds to 2 decimals", () => {
    expect(applySiblingDiscount(1000, 10)).toBe(900);
    expect(applySiblingDiscount(100, 15)).toBe(85);
    expect(applySiblingDiscount(99.99, 5)).toBe(94.99);
  });

  it("treats missing discount as zero", () => {
    expect(applySiblingDiscount(500, null)).toBe(500);
    expect(applySiblingDiscount(500)).toBe(500);
  });
});
