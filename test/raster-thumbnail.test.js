import test from 'node:test';
import assert from 'node:assert/strict';
import { randomFillSync } from 'node:crypto';
import { imageSize } from 'image-size';
import * as photon from '@cf-wasm/photon/node';
import { createRasterThumbnail } from '../src/core/raster-thumbnail.js';
import { DEFAULT_SECTIONS, renderSections } from '../src/core/sections.js';

const transform = createRasterThumbnail(photon);
test('large rasters become small WebP images while preserving aspect ratio', () => {
  const pixels = randomFillSync(new Uint8Array(512 * 256 * 4));
  const image = new photon.PhotonImage(pixels, 512, 256);
  try {
    const bytes = image.get_bytes();
    const result = transform(bytes, 'image/png');
    assert.equal(result.mime, 'image/webp');
    assert.equal(imageSize(result.bytes).width, 160);
    assert.equal(imageSize(result.bytes).height, 80);
    assert.ok(result.bytes.length < bytes.length / 4);

    // Reject an excessive decoded size before allocating its pixel buffer.
    const huge = new Uint8Array(bytes);
    const view = new DataView(huge.buffer);
    view.setUint32(16, 10000); view.setUint32(20, 10000);
    const guarded = createRasterThumbnail({PhotonImage: {new_from_byteslice() {assert.fail('must not decode huge image');}}});
    assert.equal(guarded(huge, 'image/png').bytes, huge);
  } finally { image.free(); }
});

test('small images, vector logos and unrecognized content remain intact', () => {
  for (const [bytes, mime] of [[new Uint8Array(10), 'image/png'], [new Uint8Array(40000), 'image/svg+xml'], [new Uint8Array(40000), 'image/png']]) {
    assert.deepEqual(transform(bytes, mime), {bytes, mime});
  }
});

test('logo sections preserve original PNG pixels while avatar sections use thumbnails', async () => {
  const image = new photon.PhotonImage(randomFillSync(new Uint8Array(512 * 256 * 4)), 512, 256);
  try {
    const original = image.get_bytes();
    const catalog = structuredClone(DEFAULT_SECTIONS);
    for (const section of catalog.sections) {
      section.entries = [{id: 'sponsor', name: 'Sponsor', logo: 'https://example.com/logo.png'}];
    }
    const [logos, avatars] = await renderSections(catalog, {
      fetchImpl: async () => new Response(original, {headers: {'content-type': 'image/png'}}),
      transformImage: transform
    });
    const logo = logos.sponsors[0].logoDataUri;
    assert.match(logo, /^data:image\/png;base64,/);
    assert.deepEqual(Buffer.from(logo.split(',')[1], 'base64'), Buffer.from(original));
    const avatar = avatars.sponsors[0].avatarDataUri;
    assert.match(avatar, /^data:image\/webp;base64,/);
    assert.equal(imageSize(Buffer.from(avatar.split(',')[1], 'base64')).width, 160);
  } finally { image.free(); }
});
