import { describe, expect, it } from "vitest";
import { buildGroupName, hasStructuredGroupFields } from "./groupName.js";
import {
  isAgeAudience,
  validateCustomAudience,
  GROUP_TYPE_ANNUAL,
  GROUP_TYPE_SUMMER,
} from "./groupConstants.js";

describe("buildGroupName", () => {
  it("builds annual group name with level and audience", () => {
    const name = buildGroupName({
      type: GROUP_TYPE_ANNUAL,
      level: 3,
      gender: "mixed",
      targetAudience: "גילאי 6-8",
      schedule: [{ day: 1, startTime: "16:00" }],
      days: ["ראשון", "שני"],
    });
    expect(name).toContain("חוג שנתי");
    expect(name).toContain("רמה 3");
    expect(name).toContain("גילאי 6-8");
    expect(name).toContain("16:00");
  });

  it("builds summer name without level", () => {
    const name = buildGroupName({
      type: GROUP_TYPE_SUMMER,
      targetAudience: "גילאי 5-7",
      schedule: [{ day: 0, startTime: "09:00" }],
    });
    expect(name).toContain("קורס קיץ");
    expect(name).not.toContain("רמה");
  });
});

describe("hasStructuredGroupFields", () => {
  it("detects structured products", () => {
    expect(hasStructuredGroupFields({ target_audience: "גילאי 6-8" })).toBe(true);
    expect(hasStructuredGroupFields({ name: "X" })).toBe(false);
  });
});

describe("isAgeAudience", () => {
  it("matches Hebrew age labels", () => {
    expect(isAgeAudience("גילאי 6-8")).toBe(true);
    expect(isAgeAudience("כיתות א-ב")).toBe(false);
  });
});

describe("validateCustomAudience", () => {
  it("requires age audience for summer", () => {
    expect(validateCustomAudience(GROUP_TYPE_SUMMER, "כיתות א")).toBe("summerAgeOnly");
    expect(validateCustomAudience(GROUP_TYPE_SUMMER, "גילאי 6-8")).toBeNull();
  });

  it("rejects invalid annual audience", () => {
    expect(validateCustomAudience(GROUP_TYPE_ANNUAL, "משהו")).toBe("invalidAudience");
    expect(validateCustomAudience(GROUP_TYPE_ANNUAL, "כיתות ג")).toBeNull();
  });

  it("rejects empty label", () => {
    expect(validateCustomAudience(GROUP_TYPE_ANNUAL, "  ")).toBe("empty");
  });
});
