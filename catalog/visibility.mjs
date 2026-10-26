// Missing flags on existing records mean the sponsor remains visible.
export function parseSponsorHidden(value) {
  if (value === undefined) return false;
  if (typeof value !== 'boolean') throw new TypeError('Invalid sponsor hidden flag');
  return value;
}

// Filter on the server so older clients also respect temporary hiding.
export function publicProviderCatalog(catalog) {
  return {
    ...catalog,
    sponsors: catalog.sponsors.filter(sponsor => !sponsor.hidden).map(({hidden, ...sponsor}) => sponsor)
  };
}
