const DEFAULT_OPTIONS = {
  avatarSize: 56,
  gap: 8,
  padding: 12,
  columns: 10,
  background: "#ffffff",
  radius: "50%"
};

export function renderSponsorSvg(sponsors, options = {}) {
  const opt = { ...DEFAULT_OPTIONS, ...options };
  const columns = Math.max(1, Number(opt.columns));
  const rows = Math.max(1, Math.ceil(Math.max(sponsors.length, 1) / columns));
  const width = opt.padding * 2 + columns * opt.avatarSize + (columns - 1) * opt.gap;
  const height = opt.padding * 2 + rows * opt.avatarSize + (rows - 1) * opt.gap;
  const radius = resolveRadius(opt.radius, opt.avatarSize);

  const items = sponsors.map((sponsor, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = opt.padding + col * (opt.avatarSize + opt.gap);
    const y = opt.padding + row * (opt.avatarSize + opt.gap);
    return renderAvatarNode(sponsor, x, y, opt.avatarSize, radius, index);
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">`,
    `  <rect width="${width}" height="${height}" fill="${escapeXml(opt.background)}"/>`,
    ...items.map((line) => `  ${line}`),
    "</svg>"
  ].join("\n");
}

function renderAvatarNode(sponsor, x, y, size, radius, index) {
  const clipId = `clip-${index}`;
  const title = escapeXml(sponsor.name ?? sponsor.id);
  const image = [
    `<defs><clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${radius}" ry="${radius}"/></clipPath></defs>`,
    `<image x="${x}" y="${y}" width="${size}" height="${size}" href="${escapeXml(sponsor.avatarUrl)}" clip-path="url(#${clipId})" preserveAspectRatio="xMidYMid slice">`,
    `<title>${title}</title>`,
    "</image>"
  ].join("");

  if (sponsor.profileUrl) {
    return `<a href="${escapeXml(sponsor.profileUrl)}" target="_blank" rel="noopener noreferrer">${image}</a>`;
  }
  return image;
}

function resolveRadius(raw, size) {
  if (raw === "50%") {
    return size / 2;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(0, value) : size / 2;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
