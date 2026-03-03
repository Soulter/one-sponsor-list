const DEFAULT_OPTIONS = {
  avatarSize: 56,
  gap: 8,
  padding: 12,
  columns: 10,
  width: 800,
  background: "#ffffff",
  radius: "50%",
  sectionGap: 24,
  titleSize: 22,
  specialTitleSize: 22,
  allTitleSize: 22,
  titleGap: 10,
  specialTitleGap: 4,
  allTitleGap: 10,
  titleColor: "#777777",
  fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
  specialLogoWidth: 200,
  specialLogoGap: 16
};

export function renderSponsorSvg(sponsors, options = {}) {
  const opt = { ...DEFAULT_OPTIONS, ...options };
  const width = resolveCanvasWidth([], opt);
  const columns = Math.max(1, Number(opt.columns));
  const rows = Math.max(1, Math.ceil(Math.max(sponsors.length, 1) / columns));
  const height = opt.padding * 2 + rows * opt.avatarSize + (rows - 1) * opt.gap;
  const radius = resolveRadius(opt.radius, opt.avatarSize);

  const items = sponsors.map((sponsor, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const gridWidth = columns * opt.avatarSize + (columns - 1) * opt.gap;
    const startX = (width - gridWidth) / 2;
    const x = startX + col * (opt.avatarSize + opt.gap);
    const y = opt.padding + row * (opt.avatarSize + opt.gap);
    return renderAvatarNode(sponsor, x, y, opt.avatarSize, radius, index, "plain");
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">`,
    `  <rect width="${width}" height="${height}" fill="${escapeXml(opt.background)}"/>`,
    ...items.map((line) => `  ${line}`),
    "</svg>"
  ].join("\n");
}

export function renderSponsorTierSvg(tiers, options = {}) {
  const opt = { ...DEFAULT_OPTIONS, ...options };
  const width = resolveCanvasWidth(tiers, opt);
  let y = opt.padding;
  const nodes = [];
  let avatarIndex = 0;

  for (const tier of tiers) {
    const titleSize = resolveTierTitleSize(tier, opt);
    const titleGap = resolveTierTitleGap(tier, opt);
    nodes.push(
      `<text x="${width / 2}" y="${y + titleSize}" text-anchor="middle" fill="${escapeXml(opt.titleColor)}" font-size="${titleSize}" font-family="${escapeXml(opt.fontFamily)}" font-weight="400">${escapeXml(tier.title)}</text>`
    );
    y += titleSize + titleGap;

    if (tier.type === "special") {
      const special = renderSpecialTierItems(tier.sponsors ?? [], {
        startY: y,
        width,
        options: opt
      });
      nodes.push(...special.nodes);
      y += special.height;
    } else if (tier.type === "all") {
      const grid = renderAvatarGrid(tier.sponsors ?? [], {
        startY: y,
        width,
        options: opt,
        avatarSize: resolveTierAvatarSize(tier, opt),
        baseIndex: avatarIndex,
        idPrefix: tier.id ?? "all"
      });
      nodes.push(...grid.nodes);
      y += grid.height;
      avatarIndex += (tier.sponsors ?? []).length;
    } else {
      throw new Error(`Unsupported tier type: ${tier.type}`);
    }

    y += opt.sectionGap;
  }

  const height = Math.max(y - opt.sectionGap + opt.padding, opt.padding * 2 + opt.avatarSize);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">`,
    `  <rect width="${width}" height="${height}" fill="${escapeXml(opt.background)}"/>`,
    ...nodes.map((line) => `  ${line}`),
    "</svg>"
  ].join("\n");
}

function calcBaseWidth(options) {
  const columns = Math.max(1, Number(options.columns));
  return options.padding * 2 + columns * options.avatarSize + (columns - 1) * options.gap;
}

function renderAvatarGrid(sponsors, input) {
  const options = input.options;
  const avatarSize = Math.max(1, Number(input.avatarSize ?? options.avatarSize));
  const radius = resolveRadius(options.radius, avatarSize);
  if (!Array.isArray(sponsors) || sponsors.length === 0) {
    return {
      nodes: [],
      height: 0
    };
  }
  const columns = Math.max(1, Number(options.columns));
  const totalRows = Math.ceil(sponsors.length / columns);
  const nodes = sponsors.map((sponsor, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const rowCount = Math.min(columns, sponsors.length - row * columns);
    const rowWidth = rowCount * avatarSize + (rowCount - 1) * options.gap;
    const rowStartX = (input.width - rowWidth) / 2;
    const x = rowStartX + col * (avatarSize + options.gap);
    const y = input.startY + row * (avatarSize + options.gap);
    return renderAvatarNode(
      sponsor,
      x,
      y,
      avatarSize,
      radius,
      input.baseIndex + index,
      input.idPrefix ?? "tier"
    );
  });

  return {
    nodes,
    height: totalRows * avatarSize + (totalRows - 1) * options.gap
  };
}

function renderSpecialTierItems(sponsors, input) {
  if (!Array.isArray(sponsors) || sponsors.length === 0) {
    return {
      nodes: [],
      height: 0
    };
  }
  const opt = input.options;
  const renderableSponsors = sponsors.filter((sponsor) => Boolean(sponsor.logoDataUri));
  if (renderableSponsors.length === 0) {
    return {
      nodes: [],
      height: 0
    };
  }

  const logoWidth = resolveSpecialLogoWidth(opt);
  const logoHeight = Math.round((logoWidth * 75) / 200);
  const logoGap = Math.max(0, Number(opt.specialLogoGap ?? 16));
  const contentWidth = Math.max(logoWidth, input.width - opt.padding * 2);
  const maxPerRow = Math.max(1, Math.floor((contentWidth + logoGap) / (logoWidth + logoGap)));
  const rows = Math.ceil(renderableSponsors.length / maxPerRow);
  const nodes = [];

  for (let index = 0; index < renderableSponsors.length; index += 1) {
    const sponsor = renderableSponsors[index];
    const row = Math.floor(index / maxPerRow);
    const col = index % maxPerRow;
    const rowItemCount = Math.min(maxPerRow, renderableSponsors.length - row * maxPerRow);
    const rowWidth = rowItemCount * logoWidth + (rowItemCount - 1) * logoGap;
    const rowStartX = (input.width - rowWidth) / 2;
    const logoX = rowStartX + col * (logoWidth + logoGap);
    const logoY = input.startY + row * (logoHeight + logoGap);
    const imageNode = `<image x="${logoX}" y="${logoY}" width="${logoWidth}" height="${logoHeight}" href="${escapeXml(sponsor.logoDataUri)}" preserveAspectRatio="xMidYMid meet"/>`;
    if (sponsor.profileUrl) {
      nodes.push(
        `<a href="${escapeXml(sponsor.profileUrl)}" target="_blank" rel="noopener noreferrer">${imageNode}</a>`
      );
    } else {
      nodes.push(imageNode);
    }
  }

  return {
    nodes,
    height: rows * logoHeight + (rows - 1) * logoGap
  };
}

function renderAvatarNode(sponsor, x, y, size, radius, index, idPrefix) {
  const clipId = `clip-${sanitizeId(idPrefix)}-${index}`;
  const imageHref = sponsor.avatarDataUri ?? sponsor.avatarUrl;
  if (!imageHref) {
    return "";
  }
  const image = [
    `<defs><clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${radius}" ry="${radius}"/></clipPath></defs>`,
    `<image x="${x}" y="${y}" width="${size}" height="${size}" href="${escapeXml(imageHref)}" clip-path="url(#${clipId})" preserveAspectRatio="xMidYMid slice"/>`
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

function sanitizeId(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "tier";
}

function calcTierWidth(tiers, options) {
  const columns = Math.max(1, Number(options.columns));
  const gridSizes = (Array.isArray(tiers) ? tiers : [])
    .filter((tier) => tier?.type === "all")
    .map((tier) => resolveTierAvatarSize(tier, options));
  const maxAvatarSize = Math.max(Math.max(1, Number(options.avatarSize)), ...gridSizes);
  return options.padding * 2 + columns * maxAvatarSize + (columns - 1) * options.gap;
}

function resolveCanvasWidth(tiers, options) {
  const explicit = Number(options.width ?? options.fixedWidth);
  if (Number.isFinite(explicit) && explicit > 0) {
    return explicit;
  }
  return calcTierWidth(tiers, options);
}

function resolveTierTitleSize(tier, options) {
  if (tier?.type === "special") {
    return Math.max(1, Number(options.specialTitleSize ?? options.titleSize));
  }
  if (tier?.type === "all") {
    return Math.max(1, Number(options.allTitleSize ?? options.titleSize));
  }
  return Math.max(1, Number(options.titleSize));
}

function resolveTierAvatarSize(tier, options) {
  if (tier?.type === "all") {
    return Math.max(1, Number(options.allAvatarSize ?? options.avatarSize));
  }
  return Math.max(1, Number(options.avatarSize));
}

function resolveTierTitleGap(tier, options) {
  if (tier?.type === "special") {
    return Math.max(0, Number(options.specialTitleGap ?? options.titleGap));
  }
  if (tier?.type === "all") {
    return Math.max(0, Number(options.allTitleGap ?? options.titleGap));
  }
  return Math.max(0, Number(options.titleGap));
}

function resolveSpecialLogoWidth(options) {
  const raw = options.specialLogoWidth ?? options.specialLogoSize ?? 200;
  return Math.max(1, Number(raw));
}
