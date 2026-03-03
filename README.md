# sponsor-avatar-svg

Generate a sponsor avatar collage SVG from Afdian and OpenCollective.

Supported sources:
- Afdian (`api/open/query-sponsor`)
- OpenCollective (`/{slug}/members/all.json`)

## Features

- Sort by amount or time
- Generate pure SVG output for README/web/docs usage
- Deduplicate sponsors by profile URL or avatar URL
- Embed all avatars/logos as base64 data URIs (CSP-friendly: `img-src data:`)
- Tier rendering via config file (`special` + `all`)

## Requirements

- Node.js `>=18`

## Quick Start

```bash
cp .env.example .env
# Edit .env and fill AFDIAN_USER_ID / AFDIAN_TOKEN
node src/cli.js
```

Default output path: `dist/sponsors.svg`.

Default tier config: [sponsors.config.json](/Users/soulter/Developer/opensponsor/sponsors.config.json)

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

## Tier Config (`sponsors.config.json`)

```json
{
  "tiers": [
    {
      "id": "special",
      "type": "special",
      "title": "Special Sponsor",
      "sponsors": [
        {
          "name": "Your Company",
          "profileUrl": "https://example.com",
          "logo": "./assets/your-logo.png",
          "expiresAt": "2026-12-31T23:59:59Z"
        }
      ]
    },
    {
      "id": "all",
      "type": "all",
      "title": "All Sponsor",
      "sources": ["afdian", "opencollective"]
    }
  ]
}
```

Notes:
- `special.sponsors[].logo` supports local file path / remote URL / data URI
- `special.sponsors[].expiresAt` supports ISO datetime; expired entries are skipped
- `special` tier renders centered logo (no sponsor name text)
- `special` logos are laid out horizontally and auto-wrap by canvas width
- `all` tier merges Afdian + OpenCollective and renders avatar grid
- You can tune tier sizes with `svg.specialTitleSize`, `svg.allTitleSize`, `svg.specialLogoWidth`, `svg.allAvatarSize`
- `special` logo is always rendered with a fixed `200:75` ratio (height auto-derived from width)
- Final `<image href="...">` values are base64 data URIs

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
  --config sponsors.config.json \
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
