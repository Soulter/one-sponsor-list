const DEFAULT_OPTIONS = {
  by: "amount",
  order: "desc"
};

export function sortSponsors(sponsors, options = DEFAULT_OPTIONS) {
  const by = options.by ?? DEFAULT_OPTIONS.by;
  const order = options.order ?? DEFAULT_OPTIONS.order;
  const direction = order === "asc" ? 1 : -1;

  const enriched = sponsors.map((sponsor, index) => ({
    sponsor,
    index
  }));

  enriched.sort((a, b) => {
    const va = getSortValue(a.sponsor, by);
    const vb = getSortValue(b.sponsor, by);
    if (va === vb) {
      return a.index - b.index;
    }
    return va > vb ? direction : -direction;
  });

  return enriched.map((entry) => entry.sponsor);
}

function getSortValue(sponsor, by) {
  if (by === "time") {
    if (!sponsor.lastPaidAt) {
      return Number.NEGATIVE_INFINITY;
    }
    const raw = sponsor.lastPaidAt;
    if (typeof raw === "number" && Number.isFinite(raw)) {
      return raw > 1e12 ? raw : raw * 1000;
    }
    const text = String(raw).trim();
    if (/^\d+$/.test(text)) {
      const num = Number(text);
      if (Number.isFinite(num)) {
        return text.length > 10 ? num : num * 1000;
      }
    }
    const value = Date.parse(text);
    return Number.isNaN(value) ? Number.NEGATIVE_INFINITY : value;
  }
  return Number(sponsor.amount ?? Number.NEGATIVE_INFINITY);
}
