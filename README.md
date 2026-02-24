# sponsor-avatar-svg

Generate a sponsor avatar collage SVG from Afdian and OpenCollective.

Supported sources:
- Afdian (`api/open/query-sponsor`)
- OpenCollective (`/{slug}/members/all.json`)

## Features

- Sort by amount or time
- Generate pure SVG output for README/web/docs usage
- Deduplicate sponsors by profile URL or avatar URL

## Requirements

- Node.js `>=18`

## Quick Start

```bash
cp .env.example .env
# Edit .env and fill AFDIAN_USER_ID / AFDIAN_TOKEN
node src/cli.js
```

Default output path: `dist/sponsors.svg`.

## Environment Variables

Template: [.env.example](/Users/soulter/Developer/opensponsor/.env.example)

Required:
- `AFDIAN_USER_ID`
- `AFDIAN_TOKEN`

Optional:
- `AFDIAN_PER_PAGE` (default `100`)
- `AFDIAN_MAX_PAGES` (default `30`)
- `OPENCOLLECTIVE_SLUGS` comma-separated slugs, e.g. `opencollective,webpack`
- `OPENCOLLECTIVE_BASE_URL` (default `https://opencollective.com`)
- `OPENCOLLECTIVE_OPTIONAL` `true/false` (default `true`)
- `OUTPUT_PATH` (default `dist/sponsors.svg`)
- `SORT_BY` `amount|time` (default `amount`)
- `SORT_ORDER` `asc|desc` (default `desc`)
- `LIMIT` (default `120`)
- `SVG_AVATAR_SIZE` (default `60`)
- `SVG_GAP` (default `10`)
- `SVG_PADDING` (default `20`)
- `SVG_COLUMNS` (default `10`)
- `SVG_BACKGROUND` (default `#f7fafc`)
- `SVG_RADIUS` (default `50%`)

## Cloudflare Pages Dynamic SVG (30-Min Cache)

Built-in Pages Function route: `/sponsors.svg`  
File: [sponsors.svg.js](/Users/soulter/Developer/opensponsor/functions/sponsors.svg.js)

Set environment variables in Cloudflare Pages:
- `AFDIAN_USER_ID`
- `AFDIAN_TOKEN`
- `OPENCOLLECTIVE_SLUGS` (optional)

Example request:

```text
/sponsors.svg?sortBy=amount&sortOrder=desc&limit=120&columns=10&ocSlugs=opencollective,webpack
```

Cache policy:
- `Cache-Control: public, max-age=1800, s-maxage=1800`
- Edge cache via `caches.default`

## CLI

```bash
node src/cli.js \
  --env-file .env \
  --output dist/sponsors.svg \
  --sort-by amount \
  --sort-order desc \
  --limit 120 \
  --opencollective-slugs opencollective,webpack \
  --stdout \
  --stdout-format jsonl \
  --debug
```

Notes:
- `--stdout` prints sponsor data to stdout
- `--stdout-format jsonl` prints one sponsor per line (default)
- `--stdout-format json` prints one JSON array
- `--debug` prints provider diagnostics to stderr

## Tests

```bash
node --test
```
