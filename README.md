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
- `SPONSORS_CONFIG_JSON` (optional, JSON string for tier config)
- `SPECIAL_LOGO_KV_BINDING` (optional, default `SPONSOR_ASSETS`)

Workers note:
- `SPONSORS_CONFIG_JSON` enables the same `special` / `all` tier rendering on the edge route.
- In Workers runtime, `special.sponsors[].logo` supports URL / data URI / KV reference.
- KV reference format: `kv:logo-key` or `kv://logo-key?mime=image/png`.
- Default KV binding name is `SPONSOR_ASSETS` (override by `SPECIAL_LOGO_KV_BINDING`).

With `SPONSOR_ASSETS` bound, `/` and `/sponsors.svg` without rendering parameters
share a persistent rendered SVG under `sponsor-wall-svg-v1:<renderer revision>`.
The README's `?v=1` (and other `v` values) uses this same persistent cache and the
same edge cache as the URL without `v`; it never triggers a separate render. Edge
cache misses read this finished image from KV instead of downloading every avatar.
After 30 minutes, requests return the previous SVG immediately and refresh it in
the background. Failed refreshes keep the last successful SVG; the stored image
has no expiration. Rendering query variants keep their own edge cache and never replace the
canonical snapshot. Concurrent refreshes are coalesced within each Worker isolate.
An entirely empty persistent cache requires one initial render.

`X-Sponsors-Cache` distinguishes `HIT`, `KV-HIT`, `STALE`, and `MISS`;
`X-Sponsors-Generated-At` reports when the persistent image was last generated.

Example KV upload:

```bash
npx wrangler kv key put --binding SPONSOR_ASSETS special/xxx.png --path ./assets/special/xxx.png
```

Example `SPONSORS_CONFIG_JSON` snippet:

```json
{
  "tiers": [
    {
      "type": "special",
      "title": "Special Sponsors",
      "sponsors": [
        { "name": "SAI", "logo": "kv:special/xxx.png" }
      ]
    },
    { "type": "all", "title": "All Sponsors", "sources": ["afdian", "opencollective"] }
  ]
}
```

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

## Display profiles (AstrBot deployment)

The Worker reads optional per-sponsor display overrides from `SPONSOR_ASSETS` KV
using `sponsor-profile-v1:<source:id>`. Values contain optional `name`, `avatarUrl`,
and `profileUrl`; blank fields use platform defaults. The shared validator and
merge logic live in `src/core/profiles.js`. The Access-protected editor is served
by the companion `astrbot-sponsors-catalog` Worker at `/webui/people`.

Canonical requests (no query string) store original display fields in
`sponsor-directory-v1` for the editor. Query-limited requests do not replace this
snapshot. Sort amounts and identity fields never come from display overrides.

Names are hidden by default in the Worker; `?showNames=true` enables labels.
The default grid contains at most 50 slots: 49 sponsors plus a circular more link
when the list exceeds 50. The link opens `https://astrbot.app/#/sponsors`. Direct renderer/CLI callers can opt in via `showNames: true` in SVG
options. All modes include full-name SVG titles, and custom links include both
avatar and visible name. Custom images fall back to platform images on failure.


### Independent special sections

The companion panel at `/webui/sections` publishes `sponsor-wall-sections-v1` to
`SPONSOR_ASSETS`. This config contains separate Special Sponsors and Special
Contributors sections, editable titles, `logos` or `avatars` layouts, and ordered
entries with `id`, `name`, `logo`, and optional `profileUrl`. Empty sections hide.
The managed sections replace legacy special tiers only after the first publication;
until then `SPONSORS_CONFIG_JSON` still supplies legacy specials. Personal Afdian
sponsors keep their existing sorting and display overrides. The original AI4S and
SSYCloud logos/links are included as defaults by the administration Worker.
