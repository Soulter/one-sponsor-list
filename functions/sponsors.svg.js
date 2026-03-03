import { sortSponsors } from "../src/core/sorter.js";
import { embedSponsorAvatars } from "../src/core/sponsor-images.js";
import { renderSponsorSvg } from "../src/render/svg.js";
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

    const svg = renderSponsorSvg(embedded, {
      avatarSize: parseNumber(url.searchParams.get("avatarSize"), 60, 16, 256),
      gap: parseNumber(url.searchParams.get("gap"), 10, 0, 64),
      padding: parseNumber(url.searchParams.get("padding"), 20, 0, 200),
      columns: parseNumber(url.searchParams.get("columns"), 10, 1, 100),
      background: url.searchParams.get("background") ?? "#f7fafc",
      radius: url.searchParams.get("radius") ?? "50%"
    });

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
