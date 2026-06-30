import { describe, expect, it, vi } from "vitest";

vi.mock("./supabase.js", () => ({ supabase: {} }));

import { getPriceFromList, itemsToMatrix } from "./priceList.js";

describe("priceList", () => {
  describe("itemsToMatrix", () => {
    it("builds matrix from flat items", () => {
      const matrix = itemsToMatrix([
        { product_code: "swim_course_12", tier: "external", amount: 1600 },
        { product_code: "swim_course_12", tier: "subscriber", amount: 1400 },
      ]);
      expect(matrix.swim_course_12.external).toBe(1600);
      expect(matrix.swim_course_12.subscriber).toBe(1400);
      expect(matrix.swim_course_12.shareholder).toBeNull();
    });

    it("initializes all product codes", () => {
      const matrix = itemsToMatrix([]);
      expect(matrix.private_single).toEqual({
        external: null,
        subscriber: null,
        shareholder: null,
      });
    });
  });

  describe("getPriceFromList", () => {
    const list = {
      items: [
        { product_code: "swim_course_12", tier: "external", amount: 1600 },
        { product_code: "annual_monthly_1x", tier: "subscriber", amount: 500 },
        { product_code: "annual_monthly_1x", tier: "shareholder", amount: 450 },
      ],
    };

    it("finds price by product and tier", () => {
      expect(getPriceFromList(list, "swim_course_12", "external")).toBe(1600);
    });

    it("maps shareholder to subscriber for non-course products", () => {
      expect(getPriceFromList(list, "annual_monthly_1x", "shareholder")).toBe(500);
    });

    it("returns null when not found", () => {
      expect(getPriceFromList(list, "private_single", "external")).toBeNull();
    });
  });
});
