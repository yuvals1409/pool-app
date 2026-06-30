import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./supabase.js", () => ({ supabase: {} }));

import { getWaitlistOfferToken, getWaitlistOfferUrl } from "./waitlist.js";

function stubWindow({ origin = "http://localhost:5174", pathname = "/", search = "" } = {}) {
  vi.stubGlobal("window", {
    location: { origin, pathname, search },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getWaitlistOfferUrl", () => {
  it("builds assessment registration URL", () => {
    stubWindow({ pathname: "/app" });
    expect(getWaitlistOfferUrl("tok-abc")).toBe(
      "http://localhost:5174/app/register/assessment?offer=tok-abc",
    );
  });

  it("builds summer registration URL", () => {
    stubWindow();
    expect(getWaitlistOfferUrl("tok-summer", "summer")).toBe(
      "http://localhost:5174/register/summer?offer=tok-summer",
    );
  });

  it("strips trailing slash from pathname", () => {
    stubWindow({ pathname: "/app/" });
    expect(getWaitlistOfferUrl("x")).toBe(
      "http://localhost:5174/app/register/assessment?offer=x",
    );
  });
});

describe("getWaitlistOfferToken", () => {
  it("reads offer query param", () => {
    stubWindow({ search: "?offer=waitlist-token-1&foo=bar" });
    expect(getWaitlistOfferToken()).toBe("waitlist-token-1");
  });

  it("returns null when offer is missing", () => {
    stubWindow({ search: "?foo=bar" });
    expect(getWaitlistOfferToken()).toBeNull();
  });
});
