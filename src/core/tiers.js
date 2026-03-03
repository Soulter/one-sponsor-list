import fs from "node:fs/promises";
import path from "node:path";
import {
  bytesToDataUri,
  fetchImageAsDataUri,
  guessMimeFromPath,
  isDataUri,
  isHttpUrl
} from "./images.js";

export async function buildTierSections(input, options = {}) {
  const tiers = input?.tiers ?? [];
  const sponsors = input?.sponsors ?? [];
  const configDir = options.configDir ?? process.cwd();
  const cache = options.cache ?? new Map();
  const fetchImpl = options.fetchImpl ?? fetch;

  return Promise.all(
    tiers.map(async (tier) => {
      if (tier.type === "special") {
        return {
          id: tier.id,
          type: "special",
          title: tier.title,
          sponsors: await Promise.all(
            (tier.sponsors ?? []).map(async (sponsor) => ({
              ...sponsor,
              logoDataUri: await resolveLogoSource(sponsor.logo, {
                baseDir: configDir,
                cache,
                fetchImpl
              })
            }))
          )
        };
      }

      if (tier.type === "all") {
        const sourceSet = new Set((tier.sources ?? []).map((source) => String(source).toLowerCase()));
        const filtered =
          sourceSet.size === 0
            ? sponsors
            : sponsors.filter((sponsor) => sourceSet.has(String(sponsor.source ?? "").toLowerCase()));
        return {
          id: tier.id,
          type: "all",
          title: tier.title,
          sponsors: filtered
        };
      }

      throw new Error(`Unsupported tier type: ${tier.type}`);
    })
  );
}

export async function resolveLogoSource(source, options = {}) {
  if (!source) {
    return null;
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const cache = options.cache ?? new Map();
  const key = String(source);

  if (cache.has(key)) {
    return cache.get(key);
  }
  if (isDataUri(key)) {
    cache.set(key, key);
    return key;
  }
  if (isHttpUrl(key)) {
    const result = await fetchImageAsDataUri(key, { fetchImpl });
    cache.set(key, result);
    return result;
  }

  const baseDir = options.baseDir ?? process.cwd();
  const absolutePath = path.resolve(baseDir, key);
  const file = await fs.readFile(absolutePath);
  const mime = guessMimeFromPath(absolutePath) ?? "application/octet-stream";
  const result = bytesToDataUri(file, mime);
  cache.set(key, result);
  return result;
}
