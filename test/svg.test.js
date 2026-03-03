import test from "node:test";
import assert from "node:assert/strict";
import { renderSponsorSvg, renderSponsorTierSvg } from "../src/render/svg.js";

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
  assert.match(svg, /clip-path="url\(#clip-plain-0\)"/);
  assert.match(svg, /width="800"/);
});

test("render tier svg without sponsor names", () => {
  const svg = renderSponsorTierSvg(
    [
      {
        id: "special",
        type: "special",
        title: "Special Sponsor",
        sponsors: [
          {
            name: "ACME",
            profileUrl: "https://example.com/acme",
            logoDataUri: "data:image/png;base64,AAAA"
          }
        ]
      },
      {
        id: "all",
        type: "all",
        title: "All Sponsor",
        sponsors: [
          {
            id: "s1",
            name: "Alice",
            avatarDataUri: "data:image/png;base64,BBBB"
          }
        ]
      }
    ],
    {
      columns: 2,
      avatarSize: 40,
      gap: 8,
      padding: 10
    }
  );

  assert.match(svg, /Special Sponsor/);
  assert.match(svg, /fill="#777777"/);
  assert.match(svg, /data:image\/png;base64,AAAA/);
  assert.match(svg, /data:image\/png;base64,BBBB/);
  assert.match(svg, /<image x="380" y="167" width="40"/);
  assert.doesNotMatch(svg, /ACME/);
  assert.doesNotMatch(svg, /Alice/);
});

test("render special tier logos in horizontal layout", () => {
  const svg = renderSponsorTierSvg(
    [
      {
        id: "special",
        type: "special",
        title: "Special Sponsor",
        sponsors: [
          { id: "sp1", logoDataUri: "data:image/png;base64,AAAA" },
          { id: "sp2", logoDataUri: "data:image/png;base64,BBBB" }
        ]
      }
    ],
    { padding: 10 }
  );

  assert.match(svg, /<image x="192" y="36" width="200" height="75"/);
  assert.match(svg, /<image x="408" y="36" width="200" height="75"/);
});
