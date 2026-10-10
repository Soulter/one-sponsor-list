// Shared by the wall renderer and the Access-protected administration Worker.
export const PROFILE_PREFIX = 'sponsor-profile-v1:';
export const DIRECTORY_KEY = 'sponsor-directory-v1';

export function validateSponsorId(id) {
  if (typeof id !== 'string' || id.length > 200 || !/^(afdian:[a-zA-Z0-9_-]+|opencollective:[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+)$/.test(id)) {
    throw new TypeError('无效的赞助者 ID');
  }
  return id;
}

export function safeHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

export function parseProfile(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('无效的展示资料');
  const result = {};
  for (const [key, limit] of [['name', 80], ['avatarUrl', 2048], ['profileUrl', 2048]]) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== 'string' || input[key].length > limit) throw new TypeError(`${key} 格式或长度不正确`);
    const value = input[key].trim();
    if (!value) continue;
    if (key !== 'name' && !safeHttpsUrl(value)) throw new TypeError('头像和主页请使用不含账号密码的 HTTPS 链接');
    result[key] = value;
  }
  return result;
}

export function applyProfile(sponsor, input) {
  const profile = parseProfile(input);
  return {
    ...sponsor,
    ...profile,
    ...(profile.avatarUrl ? { avatarDataUri: null, fallbackAvatarUrl: sponsor.avatarUrl } : {})
  };
}

export function directoryEntry(sponsor) {
  return { id: sponsor.id, name: String(sponsor.name ?? ''), source: sponsor.source,
    avatarUrl: safeHttpsUrl(sponsor.avatarUrl), profileUrl: safeHttpsUrl(sponsor.profileUrl) };
}

export async function loadProfiles(sponsors, kv) {
  if (!kv) return sponsors;
  return Promise.all(sponsors.map(async sponsor => {
    try {
      const input = await kv.get(PROFILE_PREFIX + sponsor.id, 'json');
      return input ? applyProfile(sponsor, input) : sponsor;
    } catch {
      // A malformed/unavailable customization must not remove the original sponsor.
      return sponsor;
    }
  }));
}
