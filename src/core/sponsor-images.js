import { fetchImageAsDataUri, isDataUri } from "./images.js";

// Embed a thumbnail, not the multi-megapixel original, in the public SVG.
// Leave custom/signed URLs untouched: only this known CDN supports imageView2.
export function avatarThumbnailUrl(source) {
  try {
    const url = new URL(source);
    if (url.protocol !== 'https:' || !/^pic\d+\.afdiancdn\.com$/.test(url.hostname)
        || (url.search && !/^\?imageView2\//.test(url.search))) return source;
    url.search = '?imageView2/1/w/160/h/160/q/85/format/webp';
    return url.href;
  } catch { return source; }
}

export async function embedSponsorAvatars(sponsors, options = {}) {
  const cache = options.cache ?? new Map();
  const fetchImpl = options.fetchImpl ?? fetch;
  const strict = options.strict === true;
  const onImageError = options.onImageError;

  return Promise.all(
    sponsors.map(async (sponsor) => {
      const source = sponsor.avatarDataUri ?? sponsor.avatarUrl;
      if (!source) {
        return sponsor;
      }
      if (isDataUri(source)) {
        return {
          ...sponsor,
          avatarDataUri: source
        };
      }
      if (cache.has(source)) {
        return {
          ...sponsor,
          avatarDataUri: cache.get(source)
        };
      }
      try {
        const thumbnail = avatarThumbnailUrl(source);
        const imageOptions = {
          fetchImpl: (url) => fetchImpl(url, { signal: AbortSignal.timeout(8000) }),
          maxBytes: 2 * 1024 * 1024,
          transformImage: options.transformImage,
          requireImage: true
        };
        let dataUri;
        try {
          dataUri = await fetchImageAsDataUri(thumbnail, imageOptions);
        } catch (error) {
          if (thumbnail === source) throw error;
          if (options.onThumbnailError) options.onThumbnailError(error);
          dataUri = await fetchImageAsDataUri(source, imageOptions);
        }
        cache.set(source, dataUri);
        return {
          ...sponsor,
          avatarDataUri: dataUri
        };
      } catch (error) {
        if (typeof onImageError === "function") {
          onImageError({ sponsor, source, error });
        }
        if (strict) {
          throw error;
        }
        if (sponsor.fallbackAvatarUrl && sponsor.fallbackAvatarUrl !== source) {
          const [fallback] = await embedSponsorAvatars([{
            ...sponsor, avatarUrl: sponsor.fallbackAvatarUrl,
            avatarDataUri: null, fallbackAvatarUrl: null
          }], options);
          return fallback;
        }
        return {
          ...sponsor,
          avatarUrl: null,
          avatarDataUri: null
        };
      }
    })
  );
}
