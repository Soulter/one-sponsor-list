import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_CONFIG = Object.freeze({
  tiers: [
    {
      id: "special",
      type: "special",
      title: "Special Sponsor",
      sponsors: []
    },
    {
      id: "all",
      type: "all",
      title: "All Sponsor",
      sources: ["afdian", "opencollective"]
    }
  ]
});

export async function loadTierConfig(inputPath = "sponsors.config.json") {
  const absolutePath = path.resolve(inputPath);
  let raw;
  try {
    raw = await fs.readFile(absolutePath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return {
        path: absolutePath,
        exists: false,
        config: cloneDefaultConfig()
      };
    }
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in ${absolutePath}: ${String(error.message ?? error)}`);
  }

  return {
    path: absolutePath,
    exists: true,
    config: normalizeTierConfig(parsed)
  };
}

function normalizeTierConfig(input) {
  const output = cloneDefaultConfig();
  if (!input || typeof input !== "object") {
    return output;
  }

  if (input.svg && typeof input.svg === "object") {
    output.svg = { ...input.svg };
  }

  if (!Array.isArray(input.tiers) || input.tiers.length === 0) {
    return output;
  }

  output.tiers = input.tiers.map((tier, index) => normalizeTier(tier, index));
  return output;
}

function normalizeTier(tier, index) {
  if (!tier || typeof tier !== "object") {
    throw new Error(`Invalid tier at index ${index}.`);
  }
  const type = String(tier.type ?? "").trim().toLowerCase();
  if (type !== "special" && type !== "all") {
    throw new Error(`Unsupported tier type at index ${index}: ${String(tier.type)}`);
  }

  const id = String(tier.id ?? `${type}-${index + 1}`);
  const title = String(tier.title ?? (type === "special" ? "Special Sponsor" : "All Sponsor"));
  if (type === "special") {
    return {
      id,
      type,
      title,
      sponsors: normalizeSpecialSponsors(tier.sponsors)
    };
  }
  return {
    id,
    type,
    title,
    sources: normalizeSources(tier.sources)
  };
}

function normalizeSpecialSponsors(sponsors) {
  if (!Array.isArray(sponsors)) {
    return [];
  }
  return sponsors
    .filter((item) => item && typeof item === "object")
    .map((item, index) => ({
      id: String(item.id ?? `special-${index + 1}`),
      name: String(item.name ?? "Special Sponsor"),
      profileUrl: item.profileUrl ? String(item.profileUrl) : null,
      logo: item.logo ? String(item.logo) : null,
      expiresAt: normalizeExpiresAt(item.expiresAt ?? item.expiredAt ?? item.expiredTime ?? null)
    }));
}

function normalizeSources(sources) {
  if (!Array.isArray(sources) || sources.length === 0) {
    return ["afdian", "opencollective"];
  }
  const list = sources.map((item) => String(item).trim().toLowerCase()).filter(Boolean);
  return list.length > 0 ? Array.from(new Set(list)) : ["afdian", "opencollective"];
}

function cloneDefaultConfig() {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

function normalizeExpiresAt(input) {
  if (input == null || input === "") {
    return null;
  }
  return String(input);
}
