export const SPONSOR_DIRECTORY_URL = 'https://astrbot.app/#/sponsors';

// The last slot is a directory link only when additional sponsors are hidden.
export function compactSponsors(sponsors, slots = 50) {
  const count = Math.max(1, Math.min(50, Math.floor(slots)));
  return sponsors.length <= count ? sponsors : [
    ...sponsors.slice(0, count - 1),
    {id:'all-sponsors-link', isMore:true, name:'查看完整赞助名单 · View all sponsors', profileUrl:SPONSOR_DIRECTORY_URL}
  ];
}
