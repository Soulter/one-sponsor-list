import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSponsorHidden, publicProviderCatalog } from '../catalog/visibility.mjs';
import { integrateVisibility, patchCatalogWorker } from '../scripts/patch-catalog-worker.mjs';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('existing records remain visible, and hidden flags must be booleans', () => {
  assert.equal(parseSponsorHidden(undefined), false);
  assert.equal(parseSponsorHidden(false), false);
  assert.equal(parseSponsorHidden(true), true);
  for (const invalid of [null, 0, 1, 'false', 'true', {}, []]) {
    assert.throws(() => parseSponsorHidden(invalid), /Invalid sponsor hidden flag/);
  }
});

test('hide and restore preserve the complete record and its position without exposing hidden presets', () => {
  const sponsor = {id: 'second', title: 'Second', order: 10, api_base: 'https://second.test/v1',
    i18n: {'en-US': {subtitle: 'Preserved translation'}}};
  const catalog = {version: 1, updated_at: '2026-10-26T00:00:00Z', sponsors: [
    {id: 'first', order: 0}, {...sponsor, hidden: true}, {id: 'third', order: 20, hidden: false}
  ]};
  const original = structuredClone(catalog);
  assert.deepEqual(publicProviderCatalog(catalog), {...catalog, sponsors: [
    {id: 'first', order: 0}, {id: 'third', order: 20}
  ]});
  assert.deepEqual(catalog, original);
  catalog.sponsors[1].hidden = false;
  const restored = publicProviderCatalog(catalog);
  assert.deepEqual(restored.sponsors[1], sponsor);
  assert.deepEqual(restored.sponsors.map(item => item.id), ['first', 'second', 'third']);
});

test('hiding every provider publishes a valid empty list', () => {
  const catalog = {version: 1, updated_at: '2026-10-26T00:00:00Z', sponsors: [{id: 'only', hidden: true}]};
  assert.deepEqual(publicProviderCatalog(catalog).sponsors, []);
});

const source = `import script from "./hash-app.txt";
import css from "./hash-style.css";
function parseSponsorCatalog(input) {
  return input.sponsors.map(item => {
    const sponsor = {...item};
    sponsor.order = item.order;
    return sponsor;
  });
}
function servePublic(catalog) { const body = JSON.stringify(catalog); return body; }
function serveAdmin(catalog) { return Response.json({catalog}); }
`;

test('integration leaves the administrative response intact and fails closed on unexpected source changes', () => {
  const result = integrateVisibility(source);
  assert.match(result, /sponsor.hidden = parseSponsorHidden\(item.hidden\)/);
  assert.match(result, /JSON.stringify\(publicProviderCatalog\(catalog\)\)/);
  assert.match(result, /return Response.json\(\{catalog\}\)/);
  assert.equal(integrateVisibility(result), result);
  assert.throws(() => integrateVisibility(source.replace('    sponsor.order = item.order;', '')), /review integration point/);
  assert.throws(() => integrateVisibility(source + 'const body = JSON.stringify(catalog);'), /review integration point/);
});

test('preparing the companion bundle preserves unrelated modules and is repeatable', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'catalog-visibility-test-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const input = join(directory, 'original'), output = join(directory, 'updated'), repeated = join(directory, 'repeated');
  await mkdir(input);
  for (const [name, content] of Object.entries({'index.js': source, 'hash-app.txt': 'old app',
    'hash-style.css': 'body {margin: 0}', 'unrelated.svg': '<svg/>', 'analytics.txt': 'analytics unchanged'})) {
    await writeFile(join(input, name), content);
  }
  await patchCatalogWorker(input, output);
  await patchCatalogWorker(output, repeated);
  for (const name of ['index.js', 'hash-app.txt', 'hash-style.css', 'sponsor-visibility.mjs', 'unrelated.svg', 'analytics.txt']) {
    assert.equal(await readFile(join(output, name), 'utf8'), await readFile(join(repeated, name), 'utf8'));
  }
  assert.equal(await readFile(join(output, 'analytics.txt'), 'utf8'), 'analytics unchanged');
  assert.match(await readFile(join(output, 'hash-app.txt'), 'utf8'), /恢复显示/);
  assert.match(await readFile(join(output, 'hash-style.css'), 'utf8'), /\.sponsor\.is-hidden/);
});
