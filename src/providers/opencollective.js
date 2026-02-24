import { fetchJson } from "../utils/http.js";

const DEFAULT_BASE_URL = "https://opencollective.com";

export async function fetchOpenCollectiveSponsors(config) {
  const slug = config.slug;
  if (!slug) {
    throw new Error("OpenCollective provider requires `slug`.");
  }

  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const endpoint = `${baseUrl.replace(/\/$/, "")}/${slug}/members/all.json`;
  const members = await fetchJson(endpoint);
  if (!Array.isArray(members)) {
    throw new Error(`Unexpected OpenCollective response for ${slug}`);
  }

  return members
    .filter((member) => member && member.image)
    .map((member) => {
      const amountCents = Number(member.totalAmountDonated ?? member.totalDonations ?? 0);
      const amount = Number.isFinite(amountCents) ? amountCents / 100 : null;
      const id = member.MemberId ?? member.id ?? member.slug ?? member.name;
      const name = member.name ?? member.slug ?? "OpenCollective Sponsor";
      return {
        id: `opencollective:${slug}:${id}`,
        source: "opencollective",
        sourceLabel: slug,
        name,
        profileUrl: member.profile ?? member.website ?? null,
        avatarUrl: member.image,
        amount,
        lastPaidAt: member.lastTransactionAt ?? member.createdAt ?? null
      };
    });
}
