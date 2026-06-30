import { describe, expect, it, vi } from "vitest";

vi.mock("./supabase.js", () => ({ supabase: {} }));

import { billingTypeForTemplate } from "./billing.js";

describe("billingTypeForTemplate", () => {
  it("maps summer course", () => {
    expect(billingTypeForTemplate("summer_course")).toBe("swim_course");
  });

  it("maps annual section", () => {
    expect(billingTypeForTemplate("annual_section")).toBe("annual_monthly");
  });

  it("maps adult style improvement", () => {
    expect(billingTypeForTemplate("adult_style_improvement")).toBe("annual_monthly");
  });

  it("returns null for unknown template", () => {
    expect(billingTypeForTemplate("unknown")).toBeNull();
  });
});
