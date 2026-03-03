import { onRequestGet } from "./functions/sponsors.svg.js";

export default {
  fetch(request, env, ctx) {
    return onRequestGet({
      request,
      env,
      waitUntil: (promise) => ctx.waitUntil(promise)
    });
  }
};
