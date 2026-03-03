import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadTierConfig } from "../src/config/tier-config.js";
import { buildTierSections } from "../src/core/tiers.js";

test("loadTierConfig returns defaults when file is missing", async () => {
  const missingPath = path.join(os.tmpdir(), `missing-${Date.now()}.json`);
  const result = await loadTierConfig(missingPath);
  assert.equal(result.exists, false);
  assert.equal(result.config.tiers.length, 2);
  assert.equal(result.config.tiers[0].type, "special");
  assert.equal(result.config.tiers[1].type, "all");
});

test("buildTierSections resolves local logo file as data URI", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sponsor-tier-"));
  const logoPath = path.join(tempDir, "logo.svg");
  await fs.writeFile(
    logoPath,
    '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2"/></svg>',
    "utf8"
  );

  const tiers = await buildTierSections(
    {
      tiers: [
        {
          id: "special",
          type: "special",
          title: "Special Sponsor",
          sponsors: [
            {
              name: "ACME",
              logo: "./logo.svg"
            }
          ]
        },
        {
          id: "all",
          type: "all",
          title: "All Sponsor",
          sources: ["afdian", "opencollective"]
        }
      ],
      sponsors: [
        { id: "1", source: "afdian", avatarDataUri: "data:image/png;base64,AAAA" },
        { id: "2", source: "github", avatarDataUri: "data:image/png;base64,BBBB" }
      ]
    },
    { configDir: tempDir }
  );

  assert.equal(tiers.length, 2);
  assert.match(tiers[0].sponsors[0].logoDataUri, /^data:image\/svg\+xml;base64,/);
  assert.equal(tiers[1].sponsors.length, 1);
  assert.equal(tiers[1].sponsors[0].id, "1");
});

test("buildTierSections skips expired special sponsors", async () => {
  const tiers = await buildTierSections(
    {
      tiers: [
        {
          id: "special",
          type: "special",
          title: "Special Sponsor",
          sponsors: [
            {
              id: "expired",
              name: "Expired",
              logo: "data:image/png;base64,AAAA",
              expiresAt: "2026-01-01T00:00:00Z"
            },
            {
              id: "active",
              name: "Active",
              logo: "data:image/png;base64,BBBB",
              expiresAt: "2027-01-01T00:00:00Z"
            }
          ]
        }
      ],
      sponsors: []
    },
    { now: "2026-03-03T00:00:00Z" }
  );

  assert.equal(tiers.length, 1);
  assert.equal(tiers[0].sponsors.length, 1);
  assert.equal(tiers[0].sponsors[0].id, "active");
});
