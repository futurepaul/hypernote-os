import { expect, test } from "bun:test";
import { parseReference, resolveReference } from "../interp/reference";

test("parseReference reads bracket notation", () => {
  const ref = parseReference("queries.feed[0].content");
  expect(ref).toEqual({ root: "queries", segments: ["feed", 0, "content"] });
});

test("resolveReference navigates arrays and objects", () => {
  const scope = {
    queries: {
      feed: [
        { content: "hello" },
        { content: "world" },
      ],
    },
  };
  expect(resolveReference("queries.feed[1].content", scope)).toBe("world");
});

test("resolveReference falls back to globals", () => {
  const scope = {
    globals: {
      user: { pubkey: "abc" },
    },
  };
  expect(resolveReference("user.pubkey", scope)).toBe("abc");
});
