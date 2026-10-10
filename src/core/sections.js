import { parseProfile } from './profiles.js';
import { embedSponsorAvatars } from './sponsor-images.js';

export const SECTIONS_KEY = 'sponsor-wall-sections-v1';
export const DEFAULT_SECTIONS = {
  version: 1,
  sections: [
    { id:'special-sponsors', title:'Special Sponsors', layout:'logos', entries:[
      {id:'ai4s',name:'AI4S',logo:'https://sponsors.astrbot.app/section-logos/ai4s.svg',profileUrl:'https://www.ai-4s.com/'},
      {id:'ssycloud',name:'胜算云',logo:'https://sponsors.astrbot.app/section-logos/ssycloud.svg',profileUrl:'https://www.shengsuanyun.com/?from=CH_T70U2X9L'}
    ]},
    { id:'special-contributors', title:'Special Contributors', layout:'avatars', entries:[] }
  ]
};

export function parseSections(input) {
  if (!input || input.version !== 1 || !Array.isArray(input.sections) || input.sections.length !== 2) throw new TypeError('需要两个独立的特别展示分区');
  const sections = DEFAULT_SECTIONS.sections.map(defaultSection => {
    const matches = input.sections.filter(section => section?.id === defaultSection.id);
    if (matches.length !== 1) throw new TypeError('分区 ID 无效或重复');
    const section = matches[0];
    if (typeof section.title !== 'string' || !section.title.trim() || section.title.length > 80) throw new TypeError('分区标题需要 1–80 个字符');
    if (!['logos','avatars'].includes(section.layout)) throw new TypeError('无效的展示样式');
    if (!Array.isArray(section.entries) || section.entries.length > 100) throw new TypeError('每个分区最多 100 个条目');
    const ids = new Set();
    const entries = section.entries.map(entry => {
      if (!entry || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(entry.id) || typeof entry.id !== 'string' || ids.has(entry.id)) throw new TypeError('条目 ID 无效或重复');
      ids.add(entry.id);
      const profile = parseProfile({name:entry.name, avatarUrl:entry.logo, profileUrl:entry.profileUrl});
      if (!profile.name || !profile.avatarUrl) throw new TypeError('请填写名称和 HTTPS Logo 地址');
      return {id:entry.id,name:profile.name,logo:profile.avatarUrl,...(profile.profileUrl ? {profileUrl:profile.profileUrl} : {})};
    });
    return {id:section.id,title:section.title.trim(),layout:section.layout,entries};
  });
  return {version:1,sections};
}

export async function readSections(kv) {
  const stored = kv ? await kv.get(SECTIONS_KEY,'json') : null;
  return parseSections(stored ?? DEFAULT_SECTIONS);
}

// Empty sections do not leave orphan headings on the wall.
export async function renderSections(catalog, options = {}) {
  const sections = parseSections(catalog).sections.filter(section => section.entries.length);
  return Promise.all(sections.map(async section => {
    const entries = section.entries.map(entry => ({...entry,avatarUrl:entry.logo}));
    const embedded = await embedSponsorAvatars(entries, options);
    return {id:section.id,title:section.title,type:section.layout === 'logos' ? 'special' : 'all',
      sponsors:embedded.map(entry => ({...entry,logoDataUri:entry.avatarDataUri}))};
  }));
}
