import { describe, expect, it, vi } from "vitest";

vi.mock("./supabase.js", () => ({ supabase: {} }));

import { resolveSessionTemplateCode, templateLabel } from "./attendance.js";

describe("resolveSessionTemplateCode", () => {
  it("returns explicit template_code when set", () => {
    expect(resolveSessionTemplateCode({ template_code: "summer_course" })).toBe("summer_course");
  });

  it("maps private session type", () => {
    expect(resolveSessionTemplateCode({ session_type: "private" })).toBe("private_lesson");
  });

  it("maps group session type to annual section", () => {
    expect(resolveSessionTemplateCode({ session_type: "group" })).toBe("annual_section");
  });

  it("returns null for unknown session", () => {
    expect(resolveSessionTemplateCode({})).toBeNull();
  });
});

describe("templateLabel", () => {
  const t = (key) => key;

  it("maps known template codes", () => {
    expect(templateLabel(t, "annual_section")).toBe("productTypeAnnual");
    expect(templateLabel(t, "summer_course")).toBe("productTypeSummer");
    expect(templateLabel(t, "swim_assessment")).toBe("tabAssessment");
    expect(templateLabel(t, "private_lesson")).toBe("lessonOnce");
  });

  it("returns null for missing code", () => {
    expect(templateLabel(t, null)).toBeNull();
  });

  it("falls back to raw code for unknown templates", () => {
    expect(templateLabel(t, "custom_type")).toBe("custom_type");
  });
});
