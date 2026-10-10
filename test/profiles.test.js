import test from 'node:test';
import assert from 'node:assert/strict';
import { applyProfile, parseProfile, validateSponsorId, loadProfiles, PROFILE_PREFIX, DIRECTORY_KEY } from '../src/core/profiles.js';
import { embedSponsorAvatars } from '../src/core/sponsor-images.js';
import { renderSponsorSvg, renderSponsorTierSvg } from '../src/render/svg.js';
import { onRequestGet } from '../functions/sponsors.svg.js';

const original = { id: 'afdian:123', name: 'Platform', avatarUrl: 'https://cdn.example/original.png', profileUrl: 'https://afdian.com/u/123', source: 'afdian', amount: 100, lastPaidAt: '2026-09-10' };
test('partial overrides survive upstream changes without changing identity or payment rank', async () => {
  const patch = { name: ' Custom ', profileUrl: 'https://github.com/xmlans', amount: 9999, id: 'afdian:other' };
  const merged = applyProfile(original, patch);
  assert.equal(merged.name, 'Custom'); assert.equal(merged.id, original.id); assert.equal(merged.amount, 100);
  assert.equal(merged.avatarUrl, original.avatarUrl);
  const latest = { ...original, name: 'New upstream name', amount: 200 };
  const [updated] = await loadProfiles([latest], { get: async key => { assert.equal(key, PROFILE_PREFIX + original.id); return patch; } });
  assert.equal(updated.name, 'Custom'); assert.equal(updated.amount, 200);
  assert.deepEqual(applyProfile(latest, {name:' ',avatarUrl:'',profileUrl:''}), latest);
  assert.deepEqual(await loadProfiles([original], { get: async () => { throw new Error('KV down'); } }), [original]);
});
test('unsafe links and invalid values are rejected, blanks reset individual fields', () => {
  for (const value of ['javascript:alert(1)', 'http://example.com', 'https://user:secret@example.com', 'data:image/svg+xml,test', '//example.com']) {
    for (const key of ['avatarUrl', 'profileUrl']) assert.throws(() => parseProfile({ [key]: value }));
  }
  assert.throws(() => parseProfile({name:'x'.repeat(81)}));
  assert.throws(() => validateSponsorId('afdian:123/../../other'));
  assert.deepEqual(parseProfile({name:'  ',avatarUrl:'',profileUrl:' https://github.com/xmlans '}), {profileUrl:'https://github.com/xmlans'});
});
test('a broken custom avatar falls back to the original with the custom name and link', async () => {
  const urls = [];
  const [result] = await embedSponsorAvatars([applyProfile(original, { name:'Custom', avatarUrl:'https://cdn.example/broken.png' })], {
    fetchImpl: async url => { urls.push(url); return url.includes('broken') ? new Response('', {status:404}) : new Response('png', {headers:{'content-type':'image/png'}}); }
  });
  assert.deepEqual(urls, ['https://cdn.example/broken.png', original.avatarUrl]);
  assert.equal(result.name, 'Custom'); assert.match(result.avatarDataUri, /^data:image\/png;base64,/);
});
test('both SVG layouts show escaped names and custom links and retain compact mode', () => {
  const person = applyProfile(original, {name:'Alice <&" long name',profileUrl:'https://example.com/?a=1&b=2'});
  for (const render of [list => renderSponsorSvg(list, {showNames:true, width:200, columns:10}), list => renderSponsorTierSvg([{id:'all',type:'all',title:'All',sponsors:list}], {showNames:true,width:200,columns:10})]) {
    const svg = render([person, person, person]);
    assert.match(svg, /<title>Alice &lt;&amp;&quot; long name<\/title>/);
    assert.match(svg, /href="https:\/\/example.com\/\?a=1&amp;b=2"/);
    assert.match(svg, /font-size="12"/);
    assert.doesNotMatch(svg, /<title>Alice <&/);
    for (const match of svg.matchAll(/<image x="([\d.]+)"/g)) assert.ok(Number(match[1]) >= 0 && Number(match[1]) <= 144);
  }
  const compact = renderSponsorSvg([person], {showNames:false});
  assert.doesNotMatch(compact, /font-size="12"/); assert.match(compact, /<title>/);
});
test('wall uses saved profiles, caches SVG, and stores only original directory fields', async t => {
  const store = new Map([[PROFILE_PREFIX + original.id, {name:'Custom',avatarUrl:'https://cdn.example/custom.png',profileUrl:'https://github.com/xmlans'}]]);
  const pending = [], cached = new Map();
  t.mock.method(globalThis, 'fetch', async url => String(url).includes('query-sponsor')
    ? Response.json({ec:200,data:{list:[{user:{user_id:'123',name:original.name,avatar:original.avatarUrl},all_sum_amount:100}]}})
    : new Response('png',{headers:{'content-type':'image/png'}}));
  const oldCaches = globalThis.caches;
  globalThis.caches = {default:{match:async req => cached.get(req.url)?.clone(),put:async (req,res) => cached.set(req.url,res)}};
  t.after(() => { globalThis.caches = oldCaches; });
  const env = {AFDIAN_USER_ID:'test',AFDIAN_TOKEN:'test',SPONSOR_ASSETS:{get:async key=>store.get(key),put:async (key,value)=>store.set(key,JSON.parse(value))}};
  const run = query => onRequestGet({request:new Request('https://example.com/'+query),env,waitUntil:p=>pending.push(p)});
  const response = await run(''); assert.equal(response.status,200);
  const svg = await response.text(); assert.match(svg, /<title>Custom<\/title>/); assert.match(svg,/https:\/\/github.com\/xmlans/);
  await Promise.all(pending);
  assert.deepEqual(Object.keys(store.get(DIRECTORY_KEY).sponsors[0]).sort(), ['avatarUrl','id','name','profileUrl','source']);
  assert.equal(store.get(DIRECTORY_KEY).sponsors[0].name, 'Platform');
  const directory = store.get(DIRECTORY_KEY);
  await run('?limit=1&showNames=false'); await Promise.all(pending);
  assert.equal(store.get(DIRECTORY_KEY), directory);
  assert.equal(await (await run('')).text(),svg);
});

test('managed sections replace legacy specials without changing the personal sponsor list',async t=>{
  const { SECTIONS_KEY, DEFAULT_SECTIONS } = await import('../src/core/sections.js');
  const managed=structuredClone(DEFAULT_SECTIONS);
  managed.sections[0].title='Partner title';
  managed.sections[1].entries=[{id:'contributor',name:'Contributor',logo:'https://example.com/avatar.png',profileUrl:'https://example.com/profile'}];
  t.mock.method(globalThis,'fetch',async url=>String(url).includes('query-sponsor') ? Response.json({ec:200,data:{list:[{user:{user_id:'123',name:'Sponsor',avatar:'https://example.com/avatar.png'}}]}}) : new Response('png',{headers:{'content-type':'image/png'}}));
  const old=globalThis.caches;globalThis.caches={default:{match:async()=>null,put:async()=>{}}};t.after(()=>{globalThis.caches=old});
  const pending=[];
  const response=await onRequestGet({request:new Request('https://example.com/'),env:{AFDIAN_USER_ID:'test',AFDIAN_TOKEN:'test',SPONSOR_ASSETS:{get:async key=>key===SECTIONS_KEY?managed:null,put:async()=>{}}},waitUntil:p=>pending.push(p)});
  assert.equal(response.status,200);const svg=await response.text();await Promise.all(pending);
  assert.match(svg,/Partner title/);assert.match(svg,/Special Contributors/);assert.match(svg,/<title>Sponsor<\/title>/);
  assert.equal([...svg.matchAll(/https:\/\/www.ai-4s.com\//g)].length,1);
});
