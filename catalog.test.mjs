import test from 'node:test';
import assert from 'node:assert/strict';
import { assess, availability, bestOffer, deskEnvelope, filterProducts, pairPrice, safeUrl, toggleSelection } from './catalog.mjs';

const offer = (overrides = {}) => ({ status: 'inStock', kind: 'official', priceTwd: 15000, pairAvailability: 'unknown', ...overrides });
const product = (overrides = {}) => ({ id: 'a', brand: 'Example', model: 'A32', sizeInches: 31.5, flat: true, resolution: [3840, 2160], refreshHz: 60, panel: 'IPS', screenType: 'LCD', specSourceIds: ['official'], offers: [offer()], ...overrides });

test('hard requirements distinguish unsupported claims, unknowns, and exclusions', () => {
  assert.equal(assess(product()), 'eligible');
  assert.equal(assess(product({ comfort: [] })), 'eligible');
  assert.equal(assess(product({ flat: false })), 'excluded');
  assert.equal(assess(product({ resolution: [3840, 1600] })), 'excluded');
  assert.equal(assess(product({ sizeInches: 34 })), 'excluded');
  assert.equal(assess(product({ refreshHz: 30 })), 'excluded');
  assert.equal(assess(product({ resolution: [6016, 3384], refreshHz: 60 })), 'eligible');
  assert.equal(assess(product({ flat: null })), 'pending');
  assert.equal(assess(product({ specSourceIds: [] })), 'pending');
});

test('availability never treats a page or a single unit as proof of supply', () => {
  assert.equal(availability(product()), 'available');
  assert.equal(availability(product({ offers: [offer({ status: 'preorder' })] })), 'available');
  assert.equal(availability(product({ offers: [offer({ status: 'outOfStock' })] })), 'outOfStock');
  assert.equal(availability(product({ offers: [offer({ status: 'outOfStock' }), offer({ status: 'unconfirmed' })] })), 'unconfirmed');
  assert.equal(availability(product({ offers: [] })), 'unconfirmed');
  assert.equal(availability(product({ flat: null })), 'pending');
  assert.equal(availability(product({ flat: false })), 'excluded');
});

test('prices ignore invalid values and unavailable bargains; quantity is explicit', () => {
  const p = product({ offers: [offer({ priceTwd: 8000, status: 'outOfStock' }), offer({ priceTwd: 18000 }), offer({ priceTwd: null })] });
  assert.equal(bestOffer(p).priceTwd, 18000);
  assert.deepEqual(pairPrice(bestOffer(p)), { value: 36000, confirmed: false });
  assert.deepEqual(pairPrice(offer({ pairAvailability: 'two' })), { value: 30000, confirmed: true });
  assert.equal(pairPrice(offer({ priceTwd: NaN })), null);
  assert.equal(pairPrice(offer({ priceTwd: Infinity })), null);
  assert.equal(pairPrice(offer({ priceTwd: '1000' })), null);
  assert.equal(bestOffer(product({ offers: [] })), null);
  assert.equal(bestOffer(product({ offers: [offer({ priceTwd: null })] })).priceTwd, null);
});

test('warranty and budget must match the same offer', () => {
  const p = product({ offers: [offer({ kind: 'official', priceTwd: 30000 }), offer({ kind: 'parallel', priceTwd: 10000 })] });
  assert.equal(filterProducts([p], { status: 'all', kind: 'official', budget: '20000' }).length, 0);
  assert.equal(filterProducts([p], { status: 'all', kind: 'parallel', budget: '20000' }).length, 1);
  assert.equal(bestOffer(p, { kind: 'official' }).priceTwd, 30000);
});

test('warranty keyword is literal, case-insensitive, and matches budget and kind on one offer', () => {
  const p = product({ offers: [
    offer({ kind: 'official', priceTwd: 30000, warranty: 'Dell 3年，包含烙印' }),
    offer({ kind: 'parallel', priceTwd: 10000, warranty: '店家1年' }),
    offer({ kind: 'official', priceTwd: 12000 }),
  ] });
  assert.equal(filterProducts([p], { status: 'all', warranty: '烙印', budget: '20000' }).length, 0);
  assert.equal(filterProducts([p], { status: 'all', warranty: '3年', kind: 'parallel' }).length, 0);
  assert.equal(filterProducts([p], { status: 'all', warranty: '  dElL  ', kind: 'official', budget: '30000' }).length, 1);
  assert.equal(bestOffer(p, { warranty: 'DELL' }).priceTwd, 30000);
  assert.equal(bestOffer(p, { warranty: '烙印', budget: '20000' }), null);
  assert.equal(filterProducts([p], { status: 'all', warranty: '3 年' }).length, 0);
  assert.equal(filterProducts([product()], { status: 'all', warranty: '3年' }).length, 0);
  assert.equal(filterProducts([p], { status: 'all', warranty: '   ' }).length, 1);
});

test('filters cover search, brand, pixels, Hz, panel, status, and mount evidence', () => {
  const a = product({ vesa: '100 × 100', weightKg: 6, portrait: 'unknown' });
  const b = product({ id: 'b', brand: 'Other', model: 'B6K', resolution: [6016, 3384], refreshHz: 120, screenType: 'OLED', panel: 'QD-OLED', portrait: 'yes', weightKg: null });
  const all = [a, b];
  assert.equal(filterProducts(all, { status: 'all', query: ' example  ' }).length, 1);
  assert.equal(filterProducts(all, { status: 'all', brand: 'Other' })[0].id, 'b');
  assert.equal(filterProducts(all, { status: 'all', resolution: 'higher' })[0].id, 'b');
  assert.equal(filterProducts([product({ resolution: [3840, 2400] })], { status: 'all', resolution: 'higher' }).length, 1);
  assert.equal(filterProducts(all, { status: 'all', resolution: '4k' })[0].id, 'a');
  assert.equal(filterProducts(all, { status: 'all', hz: '120' })[0].id, 'b');
  assert.equal(filterProducts(all, { status: 'all', panel: 'OLED' })[0].id, 'b');
  assert.equal(filterProducts(all, { status: 'all', mount: 'vesa' })[0].id, 'a');
  assert.equal(filterProducts(all, { status: 'all', mount: 'weight' })[0].id, 'a');
  assert.equal(filterProducts(all, { status: 'all', mount: 'portrait' })[0].id, 'b');
  assert.equal(filterProducts(all, { status: 'all', mount: 'unknown' })[0].id, 'a');
  assert.equal(filterProducts(all, { status: 'all', query: '<script>' }).length, 0);
  assert.equal(filterProducts(all, { brand: 'Missing' }).length, 0);
});

test('unknown prices sort last in both directions and unknown price does not meet budget', () => {
  const a = product({ id: 'a' }), b = product({ id: 'b', offers: [offer({ priceTwd: null })] }), c = product({ id: 'c', offers: [offer({ priceTwd: 20000 })] });
  assert.deepEqual(filterProducts([b, c, a], { status: 'all' }).map(p => p.id), ['a', 'c', 'b']);
  assert.deepEqual(filterProducts([b, c, a], { status: 'all', sort: 'price-desc' }).map(p => p.id), ['c', 'a', 'b']);
  assert.deepEqual(filterProducts([b], { status: 'all', budget: '20000' }), []);
});

test('compare holds at most three and supports remove without mutating the input', () => {
  const initial = ['a', 'b', 'c'];
  assert.deepEqual(toggleSelection(initial, 'd'), initial);
  assert.deepEqual(toggleSelection(initial, 'b'), ['a', 'c']);
  assert.deepEqual(toggleSelection([], 'a'), ['a']);
  assert.deepEqual(initial, ['a', 'b', 'c']);
});

test('only absolute HTTPS sources become outbound links', () => {
  assert.equal(safeUrl('https://example.com/a?q=1'), 'https://example.com/a?q=1');
  for (const value of ['javascript:alert(1)', 'http://example.com', '//example.com', '/local', '', null, 'https://user:secret@example.com']) assert.equal(safeUrl(value), null);
});

test('landscape plus portrait envelope uses bare exterior dimensions, with a stated 20mm gap', () => {
  assert.deepEqual(deskEnvelope(product({ dimensionsMm: { width: 700, height: 420, depth: 60 } })), {
    widthMm: 1140, portraitHeightMm: 700, centerMinMm: 350, remainingMm: 660, fitsWidth: true,
  });
  assert.equal(deskEnvelope(product({ dimensionsMm: { width: 1000, height: 800 } })).fitsWidth, false);
  assert.equal(deskEnvelope(product({ dimensionsMm: { width: 1000, height: 780 } })).fitsWidth, true);
  for (const dimensionsMm of [null, {width:null,height:420}, {width:0,height:420}, {width:700,height:-1}]) {
    assert.equal(deskEnvelope(product({ dimensionsMm })), null);
  }
});
