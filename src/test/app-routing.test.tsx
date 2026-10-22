import { matchRoutes } from "react-router";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { routes } from "@/router";
import { formatWan, priceLine } from "@/lib/cars";
import { publicName, safeNext } from "@/lib/profile";

// Match routes without running loaders or rendering: loaders need Supabase,
// which the test run lacks.
function leafPath(url: string) {
  const matches = matchRoutes(routes, url) ?? [];
  const leaf = matches.at(-1)?.route;
  return leaf?.index ? "(index)" : leaf?.path;
}

describe("App routing", () => {
  it.each([
    ["/", "(index)"],
    ["/sign-in", "sign-in"],
    ["/sign-up", "sign-up"],
    ["/forgot-password", "forgot-password"],
    ["/reset-password", "reset-password"],
    ["/consent", "consent"],
    ["/cars", "cars"],
    ["/wanted", "wanted"],
    ["/listings/0b6c6f43-6a52-4a8e-9a8a-0f3a3c1f2b10", "listings/:id"],
    ["/listings/0b6c6f43-6a52-4a8e-9a8a-0f3a3c1f2b10/edit", "listings/:id/edit"],
    ["/post", "post"],
    ["/my", "my"],
    ["/messages", "messages"],
    ["/account", "account"],
    ["/admin", "admin"],
    ["/terms", "terms"],
    ["/privacy", "privacy"],
    ["/disclaimer", "disclaimer"],
    ["/login", "login"],
  ])("matches a page for %s", (url, expected) => {
    expect(leafPath(url)).toBe(expected);
  });

  it("falls back to not found for unknown paths", () => {
    expect(leafPath("/nope")).toBe("*");
  });
});

describe("helpers", () => {
  it("formats prices in 萬", () => {
    expect(formatWan(1150000)).toBe("115 萬");
    expect(formatWan(1155000)).toBe("115.5 萬");
    expect(priceLine({ kind: "want", price: null, budget_min: 1000000, budget_max: 1200000 })).toBe(
      "100 萬 – 120 萬",
    );
    expect(priceLine({ kind: "want", price: null, budget_min: null, budget_max: 900000 })).toBe(
      "90 萬 以內",
    );
  });

  it("names dealers by company", () => {
    expect(publicName({ role: "dealer", display_name: "王先生", company_name: "好車行" })).toBe(
      "好車行",
    );
    expect(publicName({ role: "buyer", display_name: null, company_name: null })).toBe("買家");
  });

  it("only follows same-site next paths", () => {
    expect(safeNext("/cars")).toBe("/cars");
    expect(safeNext("//evil.com")).toBeNull();
    expect(safeNext("https://evil.com")).toBeNull();
  });
});
