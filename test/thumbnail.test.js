import test from 'node:test';
import assert from 'node:assert/strict';
import { avatarThumbnailUrl, embedSponsorAvatars } from '../src/core/sponsor-images.js';

const original = 'https://pic1.afdiancdn.com/user/example/avatar/photo.png';
test('only supported unsigned Afdian URLs are resized, including existing imageView2 variants', () => {
  const expected = original + '?imageView2/1/w/160/h/160/q/85/format/webp';
  assert.equal(avatarThumbnailUrl(original), expected);
  assert.equal(avatarThumbnailUrl(original + '?imageView2/1/'), expected);
  for (const url of [original + '?token=signed', 'https://example.com/avatar.png', 'https://pic1.afdiancdn.com.evil.test/avatar.png', 'data:image/png;base64,AAAA']) {
    assert.equal(avatarThumbnailUrl(url), url);
  }
});

test('embedding uses the small response while preserving the original public profile', async () => {
  const urls = [];
  const person = {name: 'Sponsor', avatarUrl: original};
  const [result] = await embedSponsorAvatars([person], {fetchImpl: async url => {
    urls.push(url);
    return new Response('small webp', {headers: {'content-type': 'image/webp'}});
  }});
  assert.deepEqual(urls, [avatarThumbnailUrl(original)]);
  assert.equal(result.avatarUrl, original);
  assert.match(result.avatarDataUri, /^data:image\/webp;base64,/);
});

test('an unavailable thumbnail falls back to the original image', async () => {
  const urls = [];
  const [result] = await embedSponsorAvatars([{avatarUrl: original}], {fetchImpl: async url => {
    urls.push(url);
    return url === original ? new Response('original', {headers: {'content-type': 'image/png'}}) : new Response('', {status: 404});
  }});
  assert.deepEqual(urls, [avatarThumbnailUrl(original), original]);
  assert.match(result.avatarDataUri, /^data:image\/png;base64,/);
});
