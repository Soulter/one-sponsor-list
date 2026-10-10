import { onRequestGet } from "./functions/sponsors.svg.js";
import { PhotonImage, resize, SamplingFilter } from '@cf-wasm/photon/workerd';
import { createRasterThumbnail } from './src/core/raster-thumbnail.js';

const transformImage = createRasterThumbnail({ PhotonImage, resize, SamplingFilter });

export default {
  fetch(request, env, ctx) {
    return onRequestGet({
      request,
      env,
      transformImage,
      waitUntil: (promise) => ctx.waitUntil(promise)
    });
  }
};
