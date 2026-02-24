import { fetchFromProvider } from "../providers/index.js";
import { sortSponsors } from "./sorter.js";

export async function collectSponsors(config, hooks = {}) {
  const providers = config.providers ?? [];
  if (!Array.isArray(providers) || providers.length === 0) {
    throw new Error("No providers configured.");
  }

  const results = await Promise.all(
    providers.map(async (provider) => {
      try {
        const sponsors = await fetchFromProvider(provider);
        if (typeof hooks.onProviderResult === "function") {
          hooks.onProviderResult({
            provider,
            sponsors
          });
        }
        return sponsors;
      } catch (error) {
        if (typeof hooks.onProviderError === "function") {
          hooks.onProviderError({
            provider,
            error
          });
        }
        if (provider.optional) {
          return [];
        }
        throw new Error(`[${provider.type}] ${String(error.message ?? error)}`);
      }
    })
  );

  const merged = dedupeSponsors(results.flat());
  const sorted = sortSponsors(merged, config.sort);
  const limit = Number(config.limit ?? 0);
  if (limit > 0) {
    return sorted.slice(0, limit);
  }
  return sorted;
}

function dedupeSponsors(sponsors) {
  const output = [];
  const byKey = new Set();
  for (const sponsor of sponsors) {
    const key = dedupeKey(sponsor);
    if (byKey.has(key)) {
      continue;
    }
    byKey.add(key);
    output.push(sponsor);
  }
  return output;
}

function dedupeKey(sponsor) {
  if (sponsor.profileUrl) {
    return `profile:${sponsor.profileUrl.toLowerCase()}`;
  }
  if (sponsor.avatarUrl) {
    return `avatar:${sponsor.avatarUrl.toLowerCase()}`;
  }
  return sponsor.id;
}
