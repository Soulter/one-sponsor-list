import test from "node:test";
import assert from "node:assert/strict";
import { renderSponsorSvg } from "../src/render/svg.js";

test("render sponsor svg with links", () => {
  const svg = renderSponsorSvg(
    [
      {
        id: "s1",
        name: "Alice",
        avatarUrl: "https://cdn.example.com/a.jpg",
        profileUrl: "https://example.com/alice"
      },
      {
        id: "s2",
        name: "Bob",
        avatarUrl: "https://cdn.example.com/b.jpg",
        profileUrl: null
      }
    ],
    { columns: 2, avatarSize: 40, gap: 8, padding: 10 }
  );

  assert.match(svg, /<svg/);
  assert.match(svg, /<a href="https:\/\/example.com\/alice"/);
  assert.match(svg, /clip-path="url\(#clip-0\)"/);
  assert.match(svg, /width="108"/);
});
