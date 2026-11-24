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
  assert.match(svg, /<image x="380" y="179" width="40"/);
  assert.match(svg, /<title>ACME<\/title>/);
  assert.doesNotMatch(svg, /<text[^>]*>Alice<\/text>/);
  assert.match(svg, /<title>Alice<\/title>/);
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

  assert.match(svg, /<image x="192" y="48" width="200" height="75"/);
  assert.match(svg, /<image x="408" y="48" width="200" height="75"/);
});

test('wrapped brands use a smaller row gap without narrowing columns or title spacing', () => {
  const svg = renderSponsorTierSvg([
    {id: 'special', type: 'special', title: 'Special Sponsors', sponsors:
      ['First', 'Second', 'Third', 'Fourth'].map(name => ({name, logoDataUri: 'data:image/png;base64,AAAA'}))},
    {id: 'all', type: 'all', title: 'All Sponsors', sponsors:
      [{name: 'Person', avatarDataUri: 'data:image/png;base64,BBBB'}]}
  ], {padding: 24, specialTitleGap: 32, allTitleGap: 32, specialLogoGap: 47,
    specialLogoRowGap: 16, sectionGap: 40, allAvatarSize: 40});
  const images = [...svg.matchAll(/<image x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)]
    .map(match => match.slice(1).map(Number));
  const titles = [...svg.matchAll(/<text x="[\d.]+" y="([\d.]+)"/g)].map(match => Number(match[1]));
  assert.equal(images[0][1] - titles[0], 32);
  assert.equal(images[1][0] - images[0][0] - images[0][2], 47);
  assert.equal(images[3][1] - images[0][1] - images[0][3], 16);
  assert.equal(images[4][1] - titles[1], 32);
  assert.equal(titles[1] - 22 - images[3][1] - images[3][3], 40, 'following title has its own space above it');
  const canvasHeight = Number(svg.match(/^<svg[^>]* height="(\d+)"/)[1]);
  assert.equal(canvasHeight, images[4][1] + images[4][3] + 24);
});
