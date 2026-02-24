# sponsor-avatar-svg

自动从爱发电（Afdian）与 OpenCollective 拉取赞助者并生成头像集合 SVG。

当前支持：
- 爱发电（`api` 官方开放接口）
- OpenCollective（`members/all.json`）

## 特性

- 支持按金额或时间排序
- 输出纯 SVG，可直接用于 README、官网、文档页
- 支持去重（按 profile URL 或 avatar URL）

## 环境要求

- Node.js `>=18`

## 快速开始

```bash
cp .env.example .env
# 编辑 .env 填入 AFDIAN_USER_ID / AFDIAN_TOKEN
node src/cli.js
```

默认输出 `dist/sponsors.svg`。

## 环境变量

参考模板：[.env.example](/Users/soulter/Developer/opensponsor/.env.example)

必填：
- `AFDIAN_USER_ID`
- `AFDIAN_TOKEN`

可选：
- `AFDIAN_PER_PAGE`（默认 `100`）
- `AFDIAN_MAX_PAGES`（默认 `30`）
- `OPENCOLLECTIVE_SLUGS`：逗号分隔 slug（例如 `opencollective,webpack`）
- `OPENCOLLECTIVE_BASE_URL`（默认 `https://opencollective.com`）
- `OPENCOLLECTIVE_OPTIONAL`：`true/false`（默认 `true`，请求失败时是否忽略）
- `OUTPUT_PATH`（默认 `dist/sponsors.svg`）
- `SORT_BY`：`amount` / `time`（默认 `amount`）
- `SORT_ORDER`：`asc` / `desc`（默认 `desc`）
- `LIMIT`（默认 `120`）
- `SVG_AVATAR_SIZE`（默认 `60`）
- `SVG_GAP`（默认 `10`）
- `SVG_PADDING`（默认 `20`）
- `SVG_COLUMNS`（默认 `10`）
- `SVG_BACKGROUND`（默认 `#f7fafc`）
- `SVG_RADIUS`（默认 `50%`）

## Cloudflare Pages 动态 SVG（30 分钟缓存）

已内置 Pages Functions 路由：`/sponsors.svg`  
文件位置：[sponsors.svg.js](/Users/soulter/Developer/opensponsor/functions/sponsors.svg.js)

部署时在 Cloudflare Pages 配置环境变量：
- `AFDIAN_USER_ID`
- `AFDIAN_TOKEN`
- `OPENCOLLECTIVE_SLUGS`（可选）

请求示例：

```text
/sponsors.svg?sortBy=amount&sortOrder=desc&limit=120&columns=10&ocSlugs=opencollective,webpack
```

缓存策略已内置为 30 分钟：
- `Cache-Control: public, max-age=1800, s-maxage=1800`
- 并使用 `caches.default` 做边缘缓存

## CLI 参数

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

`--stdout` 开启后会把 sponsor 数据输出到标准输出。
- `--stdout-format jsonl`：每行一条 sponsor（默认，适合管道处理）
- `--stdout-format json`：最后输出完整 JSON 数组
- `--debug`：把每个 provider 的抓取结果和错误输出到标准错误

## 自动化（可选）

可使用 GitHub Actions 定时生成并提交 SVG，见 [generate-sponsors-svg.yml](/Users/soulter/Developer/opensponsor/.github/workflows/generate-sponsors-svg.yml)。

## 开发测试

```bash
node --test
```
