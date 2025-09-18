import { expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { renderMarkdownAst } from "./MarkdownRenderer";

test("image renderer sets width/height from ?w= suffix", () => {
  const scope = { globals: {}, queries: { "$profile": { picture: "https://example.com/a.png" } } };
  const node = renderMarkdownAst([
    {
      type: "paragraph",
      children: [
        {
          type: "image",
          url: "{{ $profile.picture?w=48 }}",
          alt: "avatar",
        },
      ],
    },
  ], scope);
  const html = renderToStaticMarkup(<>{node}</>);
  expect(html.includes('width="48"') || html.includes('width=48')).toBe(true);
  expect(html.includes('height="48"') || html.includes('height=48')).toBe(false);
  expect(html).toContain("src=\"https://example.com/a.png?w=48\"");
});
