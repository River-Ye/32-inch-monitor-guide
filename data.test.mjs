import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assess, availability, pairPrice, safeUrl } from './catalog.mjs';

const data = JSON.parse(await readFile(new URL('./products.json', import.meta.url), 'utf8'));
const sources = new Map(data.sources.map(source => [source.id, source]));
const references = ids => ids.forEach(id => assert.ok(sources.has(id), `Missing source: ${id}`));

test('published catalog has unique model and source identities with usable evidence links', () => {
  assert.ok(data.products.length > 0);
  assert.equal(new Set(data.products.map(p => p.id)).size, data.products.length);
  assert.equal(new Set(data.products.map(p => `${p.brand}|${p.model}`)).size, data.products.length);
  assert.equal(sources.size, data.sources.length);
  for (const source of data.sources) {
    assert.ok(source.title);
    assert.ok(safeUrl(source.url), source.id);
    assert.match(source.checkedAt, /^\d{4}-\d{2}-\d{2}$/);
  }
  for (const product of data.products) {
    references(product.specSourceIds);
    for (const evidence of product.comfort) {
      assert.ok(['manufacturer', 'measured', 'unknown'].includes(evidence.kind), product.id);
      references(evidence.sourceIds);
    }
    for (const offer of product.offers) references([offer.sourceId]);
  }
});

test('every publicly available model passes all hard gates with exact-model specification evidence', () => {
  for (const product of data.products.filter(p => availability(p) === 'available')) {
    assert.equal(assess(product), 'eligible');
    assert.ok(product.sizeInches >= 31.5 && product.sizeInches <= 32);
    assert.equal(product.flat, true);
    assert.ok(product.resolution[0] >= 3840 && product.resolution[1] >= 2160);
    assert.ok(product.refreshHz >= 60);
    assert.ok(product.specSourceIds.length);
    assert.ok(product.offers.some(o => ['inStock', 'preorder'].includes(o.status)));
  }
});

test('seller state, quantity and reference-only prices cannot silently become confirmed pair offers', () => {
  for (const product of data.products) for (const offer of product.offers) {
    assert.ok(safeUrl(offer.url), product.id);
    assert.ok(['official', 'parallel', 'unknown'].includes(offer.kind));
    assert.ok(['inStock', 'preorder', 'outOfStock', 'unconfirmed'].includes(offer.status));
    assert.ok(['two', 'one', 'unknown'].includes(offer.pairAvailability));
    assert.ok(offer.priceTwd === null || typeof offer.priceTwd === 'number' && Number.isFinite(offer.priceTwd) && offer.priceTwd >= 0);
    if (offer.priceTwd !== null) {
      assert.equal(pairPrice(offer).value, offer.priceTwd * 2);
      assert.equal(pairPrice(offer).confirmed, offer.pairAvailability === 'two');
    }
    if (['index', 'quotation'].includes(offer.priceEvidence)) {
      assert.equal(offer.status, 'unconfirmed', product.id);
      assert.equal(offer.pairAvailability, 'unknown', product.id);
      assert.ok(offer.listingTitle, product.id);
    }
  }
});
