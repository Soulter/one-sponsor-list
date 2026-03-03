import { fetchImageAsDataUri, isDataUri } from "./images.js";

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
        const dataUri = await fetchImageAsDataUri(source, { fetchImpl });
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
        return {
          ...sponsor,
          avatarUrl: null,
          avatarDataUri: null
        };
      }
    })
  );
}
