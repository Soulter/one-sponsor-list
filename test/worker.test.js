import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../functions/sponsors.svg.js';
import { DIRECTORY_KEY } from '../src/core/profiles.js';
import { SECTIONS_KEY, DEFAULT_SECTIONS } from '../src/core/sections.js';

test('managed production wall matches compact preview despite legacy settings and seeds the full directory', async (t) => {
  const pending = [], writes = new Map();
  let cacheUrl;
  t.mock.method(globalThis, 'fetch', async () => Response.json({ec: 200, data: {list:
    Array.from({length: 83}, (_, i) => ({user: {user_id: String(i), name: `Person ${i}`, avatar: 'data:image/png;base64,AAAA'}, all_sum_amount: 83 - i}))
  }}));
  const originalCaches = globalThis.caches;
  globalThis.caches = {default: {match: async request => { cacheUrl = request.url; }, put: async () => {}}};
  t.after(() => { if (originalCaches === undefined) delete globalThis.caches; else globalThis.caches = originalCaches; });
  const response = await onRequestGet({
    request: new Request('https://sponsors.astrbot.app/'),
    env: {AFDIAN_USER_ID: 'test', AFDIAN_TOKEN: 'test', SPONSORS_CONFIG_JSON: JSON.stringify({svg: {showNames: true, allAvatarSize: 96, columns: 4}, tiers: [{id: 'all', type: 'all', sources: ['afdian']}]}),
      SPONSOR_CATALOG: {fetch: async input => {
        assert.match(input, /^https:\/\/sponsors.astrbot.app\/section-logos\//);
        return new Response(new Uint8Array([1, 2, 3]), {headers: {'Content-Type': 'image/png'}});
      }},
      SPONSOR_ASSETS: {get: async key => key === SECTIONS_KEY ? DEFAULT_SECTIONS : null,
        put: async (key, value) => writes.set(key, JSON.parse(value))}},
    waitUntil: promise => pending.push(promise)
  });
  await Promise.all(pending);
  const svg = await response.text();
  assert.equal(response.status, 200);
  assert.equal([...svg.matchAll(/<image /g)].length, 51);
  assert.equal([...svg.matchAll(/<circle /g)].length, 4);
  assert.equal([...svg.matchAll(/<text /g)].length, 2);
  assert.match(svg, /https:\/\/astrbot.app\/#\/sponsors/);
  assert.match(svg, /width="40" height="40"/);
  assert.equal(writes.get(DIRECTORY_KEY).sponsors.length, 83);
  assert.match(cacheUrl, /_wall_revision=compact-v5-original-logos/);
});
