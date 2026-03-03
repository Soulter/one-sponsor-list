const MIME_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon"
};

const DEFAULT_MIME = "application/octet-stream";

export async function fetchImageAsDataUri(url, options = {}) {
  if (!isHttpUrl(url)) {
    throw new Error(`Only http/https URLs are supported: ${url}`);
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Image fetch failed: HTTP ${response.status} - ${url}`);
  }
  const contentType = normalizeContentType(response.headers.get("content-type"));
  const buffer = await response.arrayBuffer();
  const mime = contentType ?? guessMimeFromPath(url) ?? DEFAULT_MIME;
  return bytesToDataUri(new Uint8Array(buffer), mime);
}

export function bytesToDataUri(bytes, mime) {
  const safeMime = normalizeContentType(mime) ?? DEFAULT_MIME;
  const base64 = bytesToBase64(bytes);
  return `data:${safeMime};base64,${base64}`;
}

export function guessMimeFromPath(input) {
  if (!input) {
    return null;
  }
  const normalized = String(input).split(/[?#]/, 1)[0].toLowerCase();
  const match = normalized.match(/(\.[a-z0-9]+)$/);
  if (!match) {
    return null;
  }
  return MIME_BY_EXT[match[1]] ?? null;
}

export function isHttpUrl(input) {
  return /^https?:\/\//i.test(String(input));
}

export function isDataUri(input) {
  return /^data:/i.test(String(input));
}

function normalizeContentType(raw) {
  if (!raw) {
    return null;
  }
  const value = String(raw).split(";", 1)[0].trim().toLowerCase();
  return value || null;
}

function bytesToBase64(bytes) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}
