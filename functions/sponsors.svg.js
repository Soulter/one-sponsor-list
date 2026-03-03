import { sortSponsors } from "../src/core/sorter.js";
import { embedSponsorAvatars } from "../src/core/sponsor-images.js";
import { fetchImageAsDataUri, isDataUri, isHttpUrl } from "../src/core/images.js";
import { renderSponsorSvg, renderSponsorTierSvg } from "../src/render/svg.js";
import { md5 } from "../src/edge/md5.js";

const CACHE_SECONDS = 60 * 30;
const AFDIAN_API_URL = "https://afdian.com/api/open/query-sponsor";
const OPENCOLLECTIVE_BASE_URL = "https://opencollective.com";

export async function onRequestGet(context) {
  const cache = caches.default;
  const cacheKey = new Request(context.request.url, context.request);
  const cached = await cache.match(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const url = new URL(context.request.url);
    const userId = requireEnv(context.env.AFDIAN_USER_ID, "AFDIAN_USER_ID");
    const token = requireEnv(context.env.AFDIAN_TOKEN, "AFDIAN_TOKEN");
    const perPage = parseNumber(url.searchParams.get("perPage"), 100, 1, 100);
    const maxPages = parseNumber(url.searchParams.get("maxPages"), 30, 1, 100);
    const limit = parseNumber(url.searchParams.get("limit"), 120, 1, 2000);
    const sortBy = pick(url.searchParams.get("sortBy"), ["amount", "time"], "amount");
    const sortOrder = pick(url.searchParams.get("sortOrder"), ["asc", "desc"], "desc");
    const ocSlugs = parseCsv(url.searchParams.get("ocSlugs") ?? context.env.OPENCOLLECTIVE_SLUGS);
    const ocBaseUrl = context.env.OPENCOLLECTIVE_BASE_URL ?? OPENCOLLECTIVE_BASE_URL;
    const ocOptional = parseBoolean(context.env.OPENCOLLECTIVE_OPTIONAL, true);

    const sponsors = await fetchAfdianSponsors({
      userId,
      token,
      perPage,
      maxPages
    });
    for (const slug of ocSlugs) {
      try {
        const list = await fetchOpenCollectiveSponsors(slug, ocBaseUrl);
        sponsors.push(...list);
      } catch (error) {
        if (!ocOptional) {
          throw error;
        }
      }
    }
    const sorted = sortSponsors(sponsors, { by: sortBy, order: sortOrder });
    const limited = sorted.slice(0, limit);
    const embedded = await embedSponsorAvatars(limited, { fetchImpl: fetch });
    const renderedCount = embedded.filter((sponsor) => Boolean(sponsor.avatarDataUri)).length;
    const workerTierConfig = parseWorkerTierConfig(context.env);
    const useTier = parseBoolean(url.searchParams.get("useTier"), workerTierConfig.enabled);
    const svgOptions = buildSvgOptions(url, workerTierConfig.config.svg ?? {});

    let svg;
    if (useTier) {
      const tierSections = await buildWorkerTierSections(workerTierConfig.config, embedded);
      svg = renderSponsorTierSvg(tierSections, svgOptions);
    } else {
      svg = renderSponsorSvg(embedded, svgOptions);
    }

    const response = new Response(svg, {
      status: 200,
      headers: {
        "content-type": "image/svg+xml; charset=utf-8",
        "cache-control": `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=300`,
        "x-sponsors-count": String(renderedCount),
        "x-cache-ttl": String(CACHE_SECONDS)
      }
    });
    context.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (error) {
    return new Response(String(error.message ?? error), {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }
    });
  }
}

function requireEnv(value, name) {
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

function pick(input, allowed, fallback) {
  if (!input) {
    return fallback;
  }
  return allowed.includes(input) ? input : fallback;
}

function parseNumber(input, fallback, min, max) {
  if (input == null || input === "") {
    return fallback;
  }
  const n = Number(input);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function parseCsv(input) {
  if (!input) {
    return [];
  }
  return String(input)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBoolean(input, fallback) {
  if (input == null || input === "") {
    return fallback;
  }
  const lower = String(input).toLowerCase();
  if (["1", "true", "yes", "on"].includes(lower)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(lower)) {
    return false;
  }
  return fallback;
}

async function fetchAfdianSponsors({ userId, token, perPage, maxPages }) {
  const all = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const ts = Math.floor(Date.now() / 1000);
    const paramsJson = JSON.stringify({ page, per_page: perPage });
    const sign = md5(`${token}params${paramsJson}ts${ts}user_id${userId}`);
    const body = {
      user_id: userId,
      params: paramsJson,
      ts,
      sign
    };

    const response = await fetch(AFDIAN_API_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      throw new Error(`Afdian API HTTP ${response.status}`);
    }
    const data = await response.json();
    if (data.ec !== 200 || !data.data) {
      throw new Error(`Afdian API error: ${JSON.stringify(data).slice(0, 300)}`);
    }
    const list = Array.isArray(data.data.list) ? data.data.list : [];
    for (const item of list) {
      all.push(toSponsor(item));
    }
    if (list.length < perPage) {
      break;
    }
  }
  return all.filter((item) => item.avatarUrl);
}

async function fetchOpenCollectiveSponsors(slug, baseUrl) {
  const endpoint = `${baseUrl.replace(/\/$/, "")}/${slug}/members/all.json`;
  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`OpenCollective API HTTP ${response.status} for ${slug}`);
  }
  const members = await response.json();
  if (!Array.isArray(members)) {
    throw new Error(`Unexpected OpenCollective response for ${slug}`);
  }

  return members
    .filter((member) => member && member.image)
    .map((member) => {
      const amountCents = Number(member.totalAmountDonated ?? member.totalDonations ?? 0);
      const amount = Number.isFinite(amountCents) ? amountCents / 100 : null;
      const id = member.MemberId ?? member.id ?? member.slug ?? member.name;
      return {
        id: `opencollective:${slug}:${id}`,
        source: "opencollective",
        sourceLabel: slug,
        name: member.name ?? member.slug ?? "OpenCollective Sponsor",
        profileUrl: member.profile ?? member.website ?? null,
        avatarUrl: member.image,
        amount,
        lastPaidAt: member.lastTransactionAt ?? member.createdAt ?? null
      };
    });
}

function toSponsor(item) {
  const user = item?.user ?? {};
  const userId = user.user_id ?? user.id ?? "unknown";
  return {
    id: `afdian:${userId}`,
    source: "afdian",
    sourceLabel: "afdian",
    name: user.name ?? user.nick_name ?? "Afdian Sponsor",
    profileUrl: user.url ?? (user.user_id ? `https://afdian.com/u/${user.user_id}` : null),
    avatarUrl: user.avatar ?? null,
    amount: toNumber(item.all_sum_amount ?? item.current_amount ?? null),
    lastPaidAt: normalizeTimestamp(item.last_pay_time ?? item.last_pay_at ?? null)
  };
}

function toNumber(value) {
  if (value == null) {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeTimestamp(input) {
  if (input == null || input === "") {
    return null;
  }
  if (typeof input === "number" && Number.isFinite(input)) {
    return new Date(input > 1e12 ? input : input * 1000).toISOString();
  }
  if (/^\d+$/.test(String(input))) {
    const num = Number(input);
    return new Date(String(input).length > 10 ? num : num * 1000).toISOString();
  }
  const parsed = Date.parse(String(input));
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function buildSvgOptions(url, baseSvgConfig = {}) {
  return {
    ...baseSvgConfig,
    avatarSize: parseNumber(url.searchParams.get("avatarSize"), Number(baseSvgConfig.avatarSize ?? 60), 16, 512),
    allAvatarSize: parseNumber(
      url.searchParams.get("allAvatarSize"),
      Number(baseSvgConfig.allAvatarSize ?? baseSvgConfig.avatarSize ?? 60),
      16,
      512
    ),
    specialLogoWidth: parseNumber(
      url.searchParams.get("specialLogoWidth"),
      Number(baseSvgConfig.specialLogoWidth ?? baseSvgConfig.specialLogoSize ?? 200),
      16,
      1024
    ),
    gap: parseNumber(url.searchParams.get("gap"), Number(baseSvgConfig.gap ?? 10), 0, 128),
    padding: parseNumber(url.searchParams.get("padding"), Number(baseSvgConfig.padding ?? 20), 0, 512),
    columns: parseNumber(url.searchParams.get("columns"), Number(baseSvgConfig.columns ?? 10), 1, 100),
    width: parseNumber(url.searchParams.get("width"), Number(baseSvgConfig.width ?? 800), 100, 4096),
    titleSize: parseNumber(url.searchParams.get("titleSize"), Number(baseSvgConfig.titleSize ?? 22), 8, 256),
    specialTitleSize: parseNumber(
      url.searchParams.get("specialTitleSize"),
      Number(baseSvgConfig.specialTitleSize ?? baseSvgConfig.titleSize ?? 22),
      8,
      256
    ),
    allTitleSize: parseNumber(
      url.searchParams.get("allTitleSize"),
      Number(baseSvgConfig.allTitleSize ?? baseSvgConfig.titleSize ?? 22),
      8,
      256
    ),
    sectionGap: parseNumber(url.searchParams.get("sectionGap"), Number(baseSvgConfig.sectionGap ?? 24), 0, 512),
    titleGap: parseNumber(url.searchParams.get("titleGap"), Number(baseSvgConfig.titleGap ?? 10), 0, 512),
    specialTitleGap: parseNumber(
      url.searchParams.get("specialTitleGap"),
      Number(baseSvgConfig.specialTitleGap ?? baseSvgConfig.titleGap ?? 4),
      0,
      512
    ),
    allTitleGap: parseNumber(
      url.searchParams.get("allTitleGap"),
      Number(baseSvgConfig.allTitleGap ?? baseSvgConfig.titleGap ?? 10),
      0,
      512
    ),
    specialLogoGap: parseNumber(
      url.searchParams.get("specialLogoGap"),
      Number(baseSvgConfig.specialLogoGap ?? 16),
      0,
      256
    ),
    background: url.searchParams.get("background") ?? baseSvgConfig.background ?? "#f7fafc",
    titleColor: url.searchParams.get("titleColor") ?? baseSvgConfig.titleColor ?? "#777777",
    radius: url.searchParams.get("radius") ?? baseSvgConfig.radius ?? "50%"
  };
}

function parseWorkerTierConfig(env) {
  const raw = env.SPONSORS_CONFIG_JSON;
  if (!raw) {
    return {
      enabled: false,
      config: defaultWorkerTierConfig()
    };
  }
  let parsed;
  try {
    parsed = JSON.parse(String(raw));
  } catch (error) {
    throw new Error(`Invalid SPONSORS_CONFIG_JSON: ${String(error.message ?? error)}`);
  }
  return {
    enabled: true,
    config: normalizeWorkerTierConfig(parsed)
  };
}

function normalizeWorkerTierConfig(input) {
  const output = defaultWorkerTierConfig();
  if (!input || typeof input !== "object") {
    return output;
  }
  if (input.svg && typeof input.svg === "object") {
    output.svg = { ...input.svg };
  }
  if (!Array.isArray(input.tiers) || input.tiers.length === 0) {
    return output;
  }
  output.tiers = input.tiers
    .map((tier, index) => normalizeWorkerTier(tier, index))
    .filter(Boolean);
  if (output.tiers.length === 0) {
    output.tiers = defaultWorkerTierConfig().tiers;
  }
  return output;
}

function normalizeWorkerTier(tier, index) {
  if (!tier || typeof tier !== "object") {
    return null;
  }
  const type = String(tier.type ?? "").trim().toLowerCase();
  if (type !== "special" && type !== "all") {
    return null;
  }
  const id = String(tier.id ?? `${type}-${index + 1}`);
  const title = String(tier.title ?? (type === "special" ? "Special Sponsors" : "All Sponsors"));
  if (type === "special") {
    return {
      id,
      type,
      title,
      sponsors: normalizeWorkerSpecialSponsors(tier.sponsors)
    };
  }
  return {
    id,
    type,
    title,
    sources: normalizeWorkerSources(tier.sources)
  };
}

function normalizeWorkerSpecialSponsors(sponsors) {
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
      expiresAt: normalizeWorkerExpiresAt(item.expiresAt ?? item.expiredAt ?? item.expiredTime ?? null)
    }));
}

function normalizeWorkerExpiresAt(input) {
  if (input == null || input === "") {
    return null;
  }
  return String(input);
}

function normalizeWorkerSources(sources) {
  if (!Array.isArray(sources) || sources.length === 0) {
    return ["afdian", "opencollective"];
  }
  const list = sources.map((item) => String(item).trim().toLowerCase()).filter(Boolean);
  return list.length > 0 ? Array.from(new Set(list)) : ["afdian", "opencollective"];
}

async function buildWorkerTierSections(config, sponsors) {
  const now = Date.now();
  const output = [];

  for (const tier of config.tiers ?? []) {
    if (tier.type === "special") {
      const activeSpecials = [];
      for (const sponsor of tier.sponsors ?? []) {
        if (isExpiredSpecial(sponsor, now)) {
          continue;
        }
        const logoDataUri = await resolveWorkerSpecialLogo(sponsor.logo);
        if (!logoDataUri) {
          continue;
        }
        activeSpecials.push({
          ...sponsor,
          logoDataUri
        });
      }
      output.push({
        id: tier.id,
        type: "special",
        title: tier.title,
        sponsors: activeSpecials
      });
      continue;
    }

    if (tier.type === "all") {
      const sourceSet = new Set((tier.sources ?? []).map((item) => String(item).toLowerCase()));
      const list =
        sourceSet.size === 0
          ? sponsors
          : sponsors.filter((sponsor) => sourceSet.has(String(sponsor.source ?? "").toLowerCase()));
      output.push({
        id: tier.id,
        type: "all",
        title: tier.title,
        sponsors: list
      });
    }
  }

  return output;
}

async function resolveWorkerSpecialLogo(logo) {
  if (!logo) {
    return null;
  }
  const value = String(logo);
  if (isDataUri(value)) {
    return value;
  }
  if (isHttpUrl(value)) {
    try {
      return await fetchImageAsDataUri(value, { fetchImpl: fetch });
    } catch (error) {
      return null;
    }
  }
  return null;
}

function isExpiredSpecial(sponsor, nowMs) {
  const raw = sponsor?.expiresAt;
  if (!raw) {
    return false;
  }
  const parsed = Date.parse(String(raw));
  if (Number.isNaN(parsed)) {
    return false;
  }
  return parsed <= nowMs;
}

function defaultWorkerTierConfig() {
  return {
    tiers: [
      {
        id: "special",
        type: "special",
        title: "Special Sponsors",
        sponsors: []
      },
      {
        id: "all",
        type: "all",
        title: "All Sponsors",
        sources: ["afdian", "opencollective"]
      }
    ],
    svg: {}
  };
}
