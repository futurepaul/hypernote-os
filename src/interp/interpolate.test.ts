import { expect, test } from "bun:test";
import { interpolate } from "./interpolate";

test("interpolate resolves query path with suffix appended", () => {
  const out = interpolate("Image: {{ queries.item.picture }}?w=48", {
    globals: {},
    queries: { item: { picture: "https://example/p.png" } },
  });
  expect(out).toBe("Image: https://example/p.png?w=48");
});

test("interpolate resolves globals with suffix", () => {
  const out = interpolate("Avatar: {{ app[1].picture }}?w=48", {
    globals: { app: [{}, { picture: "https://example.com/a.png" }] },
    queries: {},
  });
  expect(out).toBe("Avatar: https://example.com/a.png?w=48");
});

test("interpolate still resolves globals", () => {
  const out = interpolate("User: {{ user.name }}", {
    globals: { user: { name: "paul" } },
    queries: {},
  });
  expect(out).toBe("User: paul");
});

test("interpolate supports fallback expressions", () => {
  const out = interpolate("Name: {{ app[1].display_name || app[1].name }}", {
    globals: { app: [{}, { name: "Fallback" }] },
    queries: {},
  });
  expect(out).toBe("Name: Fallback");
});

test("interpolate fallback works with query paths", () => {
  const out = interpolate("Avatar: {{ queries.profile.picture || queries.profile.avatar }}", {
    globals: {},
    queries: { profile: { avatar: "https://example.com/avatar.png" } },
  });
  expect(out).toBe("Avatar: https://example.com/avatar.png");
});
