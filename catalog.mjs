const knownNumber = value => typeof value === 'number' && Number.isFinite(value);
const knownPrice = value => knownNumber(value) && value >= 0;
const purchasable = offer => ['inStock', 'preorder'].includes(offer.status);

export function assess(product) {
  const tests = [
    knownNumber(product.sizeInches) ? product.sizeInches >= 31.5 && product.sizeInches <= 32 : null,
    typeof product.flat === 'boolean' ? product.flat : null,
    product.resolution?.length === 2 && product.resolution.every(knownNumber) ? product.resolution[0] >= 3840 && product.resolution[1] >= 2160 : null,
    knownNumber(product.refreshHz) ? product.refreshHz >= 60 : null,
  ];
  if (tests.includes(false)) return 'excluded';
  return tests.every(value => value === true) && product.specSourceIds?.length ? 'eligible' : 'pending';
}

export function availability(product) {
  const state = assess(product);
  if (state !== 'eligible') return state;
  const offers = product.offers || [];
  if (offers.some(purchasable)) return 'available';
  return offers.length && offers.every(offer => offer.status === 'outOfStock') ? 'outOfStock' : 'unconfirmed';
}

function matchingOffers(product, filters = {}) {
  const all = product.offers || [];
  const offers = all.some(purchasable) ? all.filter(purchasable) : all;
  const warranty = (filters.warranty || '').trim().toLocaleLowerCase();
  return offers.filter(offer => (!filters.kind || filters.kind === 'all' || offer.kind === filters.kind)
    && (!filters.budget || filters.budget === 'all' || knownPrice(offer.priceTwd) && offer.priceTwd <= Number(filters.budget))
    && (!warranty || (offer.warranty || '').toLocaleLowerCase().includes(warranty)));
}

export function bestOffer(product, filters = {}) {
  return matchingOffers(product, filters).sort((a, b) => (knownPrice(a.priceTwd) ? a.priceTwd : Infinity) - (knownPrice(b.priceTwd) ? b.priceTwd : Infinity))[0] || null;
}

export function pairPrice(offer) {
  return offer && knownPrice(offer.priceTwd) ? { value: offer.priceTwd * 2, confirmed: offer.pairAvailability === 'two' } : null;
}

export function deskEnvelope(product) {
  const { width, height } = product.dimensionsMm || {};
  if (![width, height].every(value => knownNumber(value) && value > 0)) return null;
  const widthMm = width + height + 20;
  return { widthMm, portraitHeightMm: width, centerMinMm: width / 2, remainingMm: 1800 - widthMm, fitsWidth: widthMm <= 1800 };
}

export function filterProducts(products, filters = {}) {
  const query = (filters.query || '').trim().toLocaleLowerCase();
  return products.filter(product => {
    const status = filters.status || 'available';
    if (status !== 'all' && availability(product) !== status) return false;
    if (query && !`${product.brand} ${product.model}`.toLocaleLowerCase().includes(query)) return false;
    if (filters.brand && filters.brand !== 'all' && product.brand !== filters.brand) return false;
    if (filters.resolution === '4k' && (product.resolution?.[0] !== 3840 || product.resolution?.[1] !== 2160)) return false;
    if (filters.resolution === 'higher' && !(product.resolution?.[0] >= 3840 && product.resolution?.[1] >= 2160 && (product.resolution[0] > 3840 || product.resolution[1] > 2160))) return false;
    if (filters.hz && filters.hz !== 'all' && !(product.refreshHz >= Number(filters.hz))) return false;
    if (filters.panel && filters.panel !== 'all' && product.screenType !== filters.panel) return false;
    if (filters.mount === 'vesa' && !product.vesa) return false;
    if (filters.mount === 'weight' && !knownNumber(product.weightKg)) return false;
    if (filters.mount === 'portrait' && product.portrait !== 'yes') return false;
    if (filters.mount === 'unknown' && product.portrait === 'yes') return false;
    if ((filters.kind && filters.kind !== 'all' || filters.budget && filters.budget !== 'all' || filters.warranty?.trim()) && !matchingOffers(product, filters).length) return false;
    return true;
  }).sort((a, b) => {
    const first = bestOffer(a, filters)?.priceTwd, second = bestOffer(b, filters)?.priceTwd;
    if (!knownPrice(first)) return knownPrice(second) ? 1 : 0;
    if (!knownPrice(second)) return -1;
    return filters.sort === 'price-desc' ? second - first : first - second;
  });
}

export function toggleSelection(selected, id) {
  if (selected.includes(id)) return selected.filter(value => value !== id);
  return selected.length < 3 ? [...selected, id] : selected;
}

export function safeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
