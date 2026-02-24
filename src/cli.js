#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { collectSponsors } from "./core/aggregator.js";
import { loadDotEnv } from "./env.js";
import { renderSponsorSvg } from "./render/svg.js";
import { listSupportedProviders } from "./providers/index.js";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  await loadDotEnv(args.envFile ?? ".env");
  const config = buildConfigFromEnv(args);

  const stdoutEnabled = Boolean(args.stdout);
  const stdoutFormat = normalizeStdoutFormat(args.stdoutFormat);
  const sponsors = await collectSponsors(config, {
    onProviderResult: ({ provider, sponsors: providerSponsors }) => {
      if (args.debug) {
        console.error(`[provider:${provider.type}] fetched ${providerSponsors.length}`);
      }
      if (!stdoutEnabled || stdoutFormat !== "jsonl") {
        return;
      }
      for (const sponsor of providerSponsors) {
        process.stdout.write(`${JSON.stringify(sponsor)}\n`);
      }
    },
    onProviderError: ({ provider, error }) => {
      console.error(
        `[provider:${provider.type}] failed${provider.optional ? " (optional)" : ""}: ${String(error.message ?? error)}`
      );
    }
  });
  if (stdoutEnabled && stdoutFormat === "json") {
    process.stdout.write(`${JSON.stringify(sponsors, null, 2)}\n`);
  }

  const svg = renderSponsorSvg(sponsors, config.svg);
  const outputPath = path.resolve(config.output);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, svg, "utf8");

  if (stdoutEnabled) {
    console.error(`Generated ${sponsors.length} avatars -> ${outputPath}`);
  } else {
    console.log(`Generated ${sponsors.length} avatars -> ${outputPath}`);
  }
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--help" || key === "-h") {
      args.help = true;
      continue;
    }
    if (key.startsWith("--")) {
      const name = toCamelCase(key.slice(2));
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        args[name] = true;
      } else {
        args[name] = next;
        i += 1;
      }
    }
  }
  if (args.limit != null) {
    args.limit = Number(args.limit);
  }
  return args;
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
}

function printHelp() {
  const providers = listSupportedProviders().join(", ");
  console.log(
    [
      "Usage:",
      "  node src/cli.js [--output dist/sponsors.svg]",
      "",
      "Options:",
      "  --env-file <path>     Load env file (default: .env)",
      "  --output <path>       Override output SVG path",
      "  --sort-by <amount|time>",
      "  --sort-order <asc|desc>",
      "  --limit <number>",
      "  --opencollective-slugs <slug1,slug2>",
      "  --stdout              Print sponsor data to stdout while running",
      "  --stdout-format <jsonl|json> (default: jsonl)",
      "  --debug               Print provider diagnostics to stderr",
      "  --help",
      "",
      `Supported providers: ${providers}`
    ].join("\n")
  );
}

function normalizeStdoutFormat(value) {
  if (value == null || value === true) {
    return "jsonl";
  }
  if (value === "json" || value === "jsonl") {
    return value;
  }
  throw new Error(`Invalid --stdout-format: ${value}. Use jsonl or json.`);
}

function buildConfigFromEnv(args) {
  const userId = required("AFDIAN_USER_ID");
  const token = required("AFDIAN_TOKEN");
  const sortBy = pick(args.sortBy ?? process.env.SORT_BY, ["amount", "time"], "amount");
  const sortOrder = pick(args.sortOrder ?? process.env.SORT_ORDER, ["asc", "desc"], "desc");
  const limit = parseNumber(args.limit ?? process.env.LIMIT, 120, 1, 5000);
  const ocSlugs = parseCsv(args.opencollectiveSlugs ?? process.env.OPENCOLLECTIVE_SLUGS);
  const ocOptional = parseBoolean(process.env.OPENCOLLECTIVE_OPTIONAL, true);
  const providers = [
    {
      type: "afdian",
      mode: "api",
      userId,
      token,
      perPage: parseNumber(process.env.AFDIAN_PER_PAGE, 100, 1, 100),
      maxPages: parseNumber(process.env.AFDIAN_MAX_PAGES, 30, 1, 200),
      optional: false
    },
    ...ocSlugs.map((slug) => ({
      type: "opencollective",
      slug,
      baseUrl: process.env.OPENCOLLECTIVE_BASE_URL ?? "https://opencollective.com",
      optional: ocOptional
    }))
  ];

  return {
    output: args.output ?? process.env.OUTPUT_PATH ?? "dist/sponsors.svg",
    sort: {
      by: sortBy,
      order: sortOrder
    },
    limit,
    svg: {
      avatarSize: parseNumber(process.env.SVG_AVATAR_SIZE, 60, 16, 512),
      gap: parseNumber(process.env.SVG_GAP, 10, 0, 128),
      padding: parseNumber(process.env.SVG_PADDING, 20, 0, 512),
      columns: parseNumber(process.env.SVG_COLUMNS, 10, 1, 200),
      background: process.env.SVG_BACKGROUND ?? "#f7fafc",
      radius: process.env.SVG_RADIUS ?? "50%"
    },
    providers
  };
}

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function pick(value, allowed, fallback) {
  if (!value) {
    return fallback;
  }
  if (!allowed.includes(value)) {
    throw new Error(`Invalid value: ${value}. Allowed: ${allowed.join(", ")}`);
  }
  return value;
}

function parseNumber(input, fallback, min, max) {
  if (input == null || input === "") {
    return fallback;
  }
  const value = Number(input);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(value)));
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

main().catch((error) => {
  console.error(error.stack ?? String(error));
  process.exitCode = 1;
});
