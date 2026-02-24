import crypto from "node:crypto";
import { fetchJson } from "../utils/http.js";

const AFDIAN_OPEN_API = "https://afdian.com/api/open/query-sponsor";

export async function fetchAfdianSponsors(config) {
  const mode = config.mode ?? "api";
  if (mode !== "api") {
    throw new Error("Only Afdian API mode is supported. Set `mode` to `api`.");
  }

  const userId = config.userId;
  const token = config.token;
  if (!userId || !token) {
    throw new Error("Afdian API mode requires `userId` and `token`.");
  }

  const perPage = Number(config.perPage ?? 100);
  const maxPages = Number(config.maxPages ?? 100);
  const output = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const ts = Math.floor(Date.now() / 1000);
    const params = { page, per_page: perPage };
    const paramsJson = JSON.stringify(params);
    const sign = createAfdianSign(token, userId, paramsJson, ts);

    const body = {
      user_id: userId,
      params: paramsJson,
      ts,
      sign
    };

    const data = await fetchJson(
      AFDIAN_OPEN_API,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      },
      Number(config.timeoutMs ?? 20_000)
    );

    if (data.ec !== 200 || !data.data) {
      throw new Error(`Afdian API error: ${JSON.stringify(data).slice(0, 500)}`);
    }

    const list = Array.isArray(data.data.list) ? data.data.list : [];
    output.push(...list.map((item, index) => mapAfdianApiItem(item, page, index)));
    if (list.length < perPage) {
      break;
    }
  }

  return output;
}

function createAfdianSign(token, userId, paramsJson, ts) {
  const raw = `${token}params${paramsJson}ts${ts}user_id${userId}`;
  return crypto.createHash("md5").update(raw).digest("hex");
}

function mapAfdianApiItem(item, page, index) {
  const user = item.user ?? {};
  const userId = user.user_id ?? user.id ?? `p${page}-${index}`;
  const name = user.name ?? user.nick_name ?? "Afdian Sponsor";
  const avatarUrl = user.avatar ?? null;
  const amount = toNumber(item.all_sum_amount ?? item.current_amount ?? null);
  const lastPaidAt = normalizeTimestamp(item.last_pay_time ?? item.last_pay_at ?? null);

  return {
    id: `afdian:${userId}`,
    source: "afdian",
    sourceLabel: "afdian",
    name,
    profileUrl: user.url ?? (user.user_id ? `https://afdian.com/u/${user.user_id}` : null),
    avatarUrl,
    amount,
    lastPaidAt
  };
}

function toNumber(input) {
  if (input == null) {
    return null;
  }
  const value = Number(input);
  return Number.isFinite(value) ? value : null;
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
    if (Number.isFinite(num)) {
      return new Date(String(input).length > 10 ? num : num * 1000).toISOString();
    }
  }
  const parsed = Date.parse(String(input));
  if (Number.isNaN(parsed)) {
    return null;
  }
  return new Date(parsed).toISOString();
}
