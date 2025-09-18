import { expect, test } from "bun:test";
import { resolveDollar, resolveDollarPath } from "../interp/resolveDollar";

test("resolveDollarPath resolves plain dollar paths", () => {
  const value = resolveDollarPath("$profile.picture", { "$profile": { picture: "https://example/p.png" } });
  expect(value).toBe("https://example/p.png");
});

test("resolveDollarPath preserves suffix like query params", () => {
  const value = resolveDollarPath("$profile.picture?w=48", { "$profile": { picture: "https://example/p.png" } });
  expect(value).toBe("https://example/p.png?w=48");
});

test("resolveDollar returns suffix metadata", () => {
  const result = resolveDollar("$profile.picture?w=48", { "$profile": { picture: "https://example/p.png" } });
  expect(result).toEqual({ value: "https://example/p.png", suffix: "?w=48" });
});
