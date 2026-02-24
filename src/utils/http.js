const DEFAULT_TIMEOUT_MS = 20_000;

export async function fetchJson(url, init = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const response = await fetchWithTimeout(url, init, timeoutMs);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText} - ${url} - ${text.slice(0, 200)}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON from ${url}: ${String(error)}`);
  }
}

export async function fetchText(url, init = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const response = await fetchWithTimeout(url, init, timeoutMs);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText} - ${url} - ${text.slice(0, 200)}`);
  }
  return text;
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "user-agent": "sponsor-avatar-svg/0.1 (+https://github.com)",
        ...init.headers
      }
    });
  } finally {
    clearTimeout(timeout);
  }
}
