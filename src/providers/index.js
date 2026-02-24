import { fetchAfdianSponsors } from "./afdian.js";
import { fetchOpenCollectiveSponsors } from "./opencollective.js";

const providerMap = {
  afdian: fetchAfdianSponsors,
  opencollective: fetchOpenCollectiveSponsors
};

export async function fetchFromProvider(providerConfig) {
  const providerType = providerConfig.type;
  const fn = providerMap[providerType];
  if (!fn) {
    throw new Error(`Unsupported provider type: ${providerType}`);
  }
  const sponsors = await fn(providerConfig);
  return sponsors.filter((sponsor) => sponsor.avatarUrl);
}

export function listSupportedProviders() {
  return Object.keys(providerMap);
}
