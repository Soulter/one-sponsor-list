import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet, SNAPSHOT_KEY } from '../functions/sponsors.svg.js';
import { DIRECTORY_KEY } from '../src/core/profiles.js';

const oldSvg = '<svg xmlns="http://www.w3.org/2000/svg"><title>Last good wall</title></svg>';
const upstream = () => Response.json({ec: 200, data: {list: [
  {user: {user_id: '123', name: 'Updated sponsor', avatar: 'data:image/png;base64,AAAA'}}
]}});

function setup(t, snapshot) {
  const store = new Map(snapshot ? [[SNAPSHOT_KEY, snapshot]] : []);
  const pending = [], writes = [], cached = new Map();
  const original = globalThis.caches;
  globalThis.caches = {default: {
    match: async request => cached.get(request.url)?.clone(),
    put: async (request, response) => cached.set(request.url, response)
  }};
  t.after(() => { globalThis.caches = original; });
  const env = {AFDIAN_USER_ID: 'test', AFDIAN_TOKEN: 'test', SPONSOR_ASSETS: {
    get: async key => store.get(key),
    put: async (key, value) => { writes.push(key); store.set(key, JSON.parse(value)); }
  }};
  return {store, writes, cached, env,
    run: (path = '/') => onRequestGet({
      request: new Request('https://sponsors.astrbot.app' + path), env,
      waitUntil: promise => pending.push(promise)
    }),
    drain: async () => { while (pending.length) await Promise.all(pending.splice(0)); }
  };
}

test('a fresh persisted wall fills an empty edge cache without fetching upstream', async t => {
  const fixture = setup(t, {svg: oldSvg, count: 49, generatedAt: Date.now() - 10_000});
  t.mock.method(globalThis, 'fetch', async () => assert.fail('must not regenerate a fresh snapshot'));
  const response = await fixture.run();
  assert.equal(response.headers.get('x-sponsors-cache'), 'KV-HIT');
  assert.equal(await response.text(), oldSvg);
  await fixture.drain();
  assert.equal((await fixture.run()).headers.get('x-sponsors-cache'), 'HIT');
  assert.deepEqual(fixture.writes, []);
});

test('README version URLs share the canonical persistent and edge caches', async t => {
  const fixture = setup(t, {svg: oldSvg, count: 49, generatedAt: Date.now()});
  t.mock.method(globalThis, 'fetch', async () => assert.fail('README URLs must not regenerate on a fresh snapshot'));
  assert.equal((await fixture.run('/?v=1')).headers.get('x-sponsors-cache'), 'KV-HIT');
  await fixture.drain();
  for (const path of ['/', '/?v=2', '/?v=1&v=2']) {
    const response = await fixture.run(path);
    assert.equal(response.headers.get('x-sponsors-cache'), 'HIT');
    assert.equal(await response.text(), oldSvg);
  }
  assert.equal(await (await fixture.run('/sponsors.svg?v=1')).text(), oldSvg);
  await fixture.drain();
  assert.deepEqual(fixture.writes, []);
});

test('README URLs keep serving the persisted image when Afdian returns HTTP 521', async t => {
  const snapshot = {svg: oldSvg, count: 49, generatedAt: Date.now() - 3_600_000};
  const fixture = setup(t, snapshot);
  t.mock.method(console, 'warn', () => {});
  t.mock.method(globalThis, 'fetch', async () => new Response('Origin down', {status: 521}));
  const response = await fixture.run('/?v=1');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-sponsors-cache'), 'STALE');
  assert.equal(await response.text(), oldSvg);
  await fixture.drain();
  assert.equal(fixture.store.get(SNAPSHOT_KEY), snapshot);
});

test('a README-triggered background refresh also updates the complete sponsor directory', async t => {
  const fixture = setup(t, {svg: oldSvg, count: 49, generatedAt: Date.now() - 3_600_000});
  t.mock.method(globalThis, 'fetch', async () => upstream());
  assert.equal(await (await fixture.run('/?v=1')).text(), oldSvg);
  await fixture.drain();
  assert.equal(fixture.store.get(DIRECTORY_KEY).sponsors[0].name, 'Updated sponsor');
  assert.match(fixture.store.get(SNAPSHOT_KEY).svg, /Updated sponsor/);
});

test('stale requests return immediately, share a background refresh, then serve the updated wall', async t => {
  const fixture = setup(t, {svg: oldSvg, count: 49, generatedAt: Date.now() - 1_800_001});
  let finish, fetches = 0;
  t.mock.method(globalThis, 'fetch', () => { fetches++; return new Promise(resolve => { finish = resolve; }); });
  const first = await fixture.run();
  assert.equal(first.headers.get('x-sponsors-cache'), 'STALE');
  assert.equal(await first.text(), oldSvg);
  assert.equal(first.headers.get('x-cache-ttl'), '60');
  const second = await fixture.run('/sponsors.svg');
  assert.equal(await second.text(), oldSvg);
  assert.equal(fetches, 1);
  finish(upstream());
  await fixture.drain();
  assert.equal(fixture.writes.filter(key => key === SNAPSHOT_KEY).length, 1);
  assert.match(fixture.store.get(SNAPSHOT_KEY).svg, /Updated sponsor/);
  fixture.cached.clear();
  const updated = await fixture.run();
  assert.equal(updated.headers.get('x-sponsors-cache'), 'KV-HIT');
  assert.match(await updated.text(), /Updated sponsor/);
  assert.equal(fetches, 1);
});

test('a failed background refresh keeps the last good persisted wall', async t => {
  const snapshot = {svg: oldSvg, count: 49, generatedAt: Date.now() - 3_600_000};
  const fixture = setup(t, snapshot);
  t.mock.method(console, 'warn', () => {});
  t.mock.method(globalThis, 'fetch', async () => new Response('upstream unavailable', {status: 503}));
  const response = await fixture.run();
  assert.equal(response.status, 200);
  assert.equal(await response.text(), oldSvg);
  await fixture.drain();
  assert.equal(fixture.store.get(SNAPSHOT_KEY), snapshot);
  assert.ok(!fixture.writes.includes(SNAPSHOT_KEY));
});

test('complete avatar download failure cannot replace a good wall with a blank one', async t => {
  const snapshot = {svg: oldSvg, count: 49, generatedAt: Date.now() - 3_600_000};
  const fixture = setup(t, snapshot);
  t.mock.method(console, 'warn', () => {});
  t.mock.method(globalThis, 'fetch', async url => String(url).includes('query-sponsor')
    ? Response.json({ec: 200, data: {list: [{user: {user_id: '123', name: 'Sponsor', avatar: 'https://example.com/avatar.png'}}]}})
    : new Response('unavailable', {status: 503}));
  assert.equal(await (await fixture.run()).text(), oldSvg);
  await fixture.drain();
  assert.equal(fixture.store.get(SNAPSHOT_KEY), snapshot);
});

test('query previews neither use nor replace the canonical persisted SVG', async t => {
  const snapshot = {svg: oldSvg, count: 49, generatedAt: Date.now()};
  const fixture = setup(t, snapshot);
  t.mock.method(globalThis, 'fetch', async () => upstream());
  const preview = await fixture.run('/?v=1&limit=1&showNames=true');
  assert.equal(preview.headers.get('x-sponsors-cache'), 'MISS');
  assert.match(await preview.text(), /Updated sponsor/);
  await fixture.drain();
  assert.equal(fixture.store.get(SNAPSHOT_KEY), snapshot);
  assert.deepEqual(fixture.writes, []);
});

test('an empty persistent cache generates once for concurrent requests and saves the result', async t => {
  const fixture = setup(t);
  let finish, fetches = 0;
  t.mock.method(globalThis, 'fetch', () => { fetches++; return new Promise(resolve => { finish = resolve; }); });
  const first = fixture.run(), second = fixture.run('/sponsors.svg');
  await new Promise(setImmediate);
  assert.equal(fetches, 1);
  finish(upstream());
  for (const response of await Promise.all([first, second])) {
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-sponsors-cache'), 'MISS');
    assert.match(await response.text(), /Updated sponsor/);
  }
  await fixture.drain();
  assert.equal(fixture.store.get(SNAPSHOT_KEY).count, 1);
  assert.equal(fixture.writes.filter(key => key === SNAPSHOT_KEY).length, 1);
});

test('a persistent write failure still returns a successfully generated SVG', async t => {
  const fixture = setup(t);
  t.mock.method(console, 'warn', () => {});
  fixture.env.SPONSOR_ASSETS.put = async () => { throw new Error('KV unavailable'); };
  t.mock.method(globalThis, 'fetch', async () => upstream());
  const response = await fixture.run();
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Updated sponsor/);
  await fixture.drain();
  assert.ok(!fixture.store.has(SNAPSHOT_KEY));
});

test('an unavailable edge cache does not prevent serving a persisted wall', async t => {
  const fixture = setup(t, {svg: oldSvg, count: 49, generatedAt: Date.now()});
  t.mock.method(console, 'warn', () => {});
  globalThis.caches.default.match = async () => { throw new Error('Edge cache unavailable'); };
  globalThis.caches.default.put = async () => { throw new Error('Edge cache unavailable'); };
  t.mock.method(globalThis, 'fetch', async () => assert.fail('persisted SVG should still be available'));
  const response = await fixture.run();
  assert.equal(response.status, 200);
  assert.equal(await response.text(), oldSvg);
  await fixture.drain();
});
