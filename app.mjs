import { availability, bestOffer, deskEnvelope, filterProducts, pairPrice, safeUrl, toggleSelection } from './catalog.mjs';

const $ = id => document.getElementById(id);
const money = value => typeof value === 'number' && Number.isFinite(value) ? new Intl.NumberFormat('zh-TW').format(value) : '未確認';
const text = value => value === null || value === undefined || value === '' ? '未確認' : String(value);
const statusNames = { available: '現貨／預購', eligible: '基本規格符合', pending: '規格待確認', unconfirmed: '供貨待確認', outOfStock: '暫時缺貨', excluded: '不符基本條件' };
const offerStatus = { inStock: '現貨', preorder: '可預購', outOfStock: '缺貨', unconfirmed: '供貨未確認' };
const kindNames = { official: '公司貨', parallel: '平行輸入', unknown: '版本待確認' };
const portraitNames = { yes: '原廠確認可直立操作', no: '原廠限制直立操作', unknown: '直立操作未確認' };
const evidenceNames = { manufacturer: '原廠規格／聲明', measured: '獨立實測', measurement: '獨立實測', unknown: '尚未確認' };
const controls = ['query', 'brand', 'budget', 'resolution', 'hz', 'panel', 'kind', 'warranty', 'mount', 'sort'];
let data = { products: [], sources: [], coverage: [], meta: {} }, selected = [], currentStatus = 'available';

function el(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = text(content);
  return element;
}
function append(parent, ...children) {
  parent.append(...children.flat().filter(child => child !== null && child !== undefined));
  return parent;
}
function button(label, className, action) {
  const element = el('button', className, label);
  element.type = 'button'; element.addEventListener('click', action);
  return element;
}
function externalLink(label, url) {
  const href = safeUrl(url);
  if (!href) return el('span', 'unavailable-link', `${label}（連結未確認）`);
  const link = el('a', '', label);
  link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer';
  return link;
}
function filters() { return { ...Object.fromEntries(controls.map(id => [id, $(id).value])), status: currentStatus }; }
function resolution(product) { return product.resolution?.every(value => typeof value === 'number' && Number.isFinite(value)) ? product.resolution.join(' × ') : '未確認'; }
function numberUnit(value, unit) { return typeof value === 'number' && Number.isFinite(value) ? `${value}${unit}` : '未確認'; }
function priceOrigin(offer) { return ({ index: '搜尋索引參考價', quotation: '估價單參考價' })[offer?.priceEvidence] || '商品頁標價'; }
function offerDescription(offer) { return offer ? `${priceOrigin(offer)}${offer.listingTitle ? `｜商品名稱：${offer.listingTitle}` : ''}` : '價格來源未確認'; }
function weightCondition(product) {
  const weight = product.weightKg;
  if (typeof weight !== 'number' || !Number.isFinite(weight)) return '無底座重量未確認，Arco 2–27 kg 重量條件待核對。';
  return `無底座 ${weight} kg，${weight >= 2 && weight <= 27 ? '落在' : '超出'} Arco 2–27 kg 標示範圍；轉接件與完整安裝仍待核對。`;
}
function envelopeText(product) {
  const envelope = deskEnvelope(product);
  return envelope ? `一橫一直約寬 ${(envelope.widthMm / 10).toFixed(1)} cm（含兩台間隔 2 cm）；直立機身高 ${(envelope.portraitHeightMm / 10).toFixed(1)} cm。` : '機身外廓資料不足，尚無法估算一橫一直尺寸。';
}
function vesa(product) { return product.vesa ? (typeof product.vesa === 'string' ? product.vesa : JSON.stringify(product.vesa)) : 'VESA 未確認'; }
function badge(label, state = '') { return el('span', `badge ${state}`, label); }
function announcement(value) { $('announcement').textContent = value; }
function sourceLinks(ids = []) {
  const group = el('div', 'source-links');
  for (const id of ids) {
    const source = data.sources.find(item => item.id === id);
    if (source) group.append(externalLink(source.title, source.url));
  }
  if (!group.children.length) group.append(el('span', '', '尚無可核對來源'));
  return group;
}
function specRow(label, value) { return append(el('div'), el('dt', '', label), el('dd', '', value)); }

function selectProduct(id) {
  const previous = selected;
  selected = toggleSelection(selected, id);
  if (!previous.includes(id) && !selected.includes(id)) {
    announcement('最多可比較三款；請先移除一款。');
    return;
  }
  renderSelection();
  announcement(selected.includes(id) ? '已加入比較。' : '已從比較移除。');
}
function renderSelection() {
  $('compare-bar').hidden = !selected.length;
  $('selection-count').textContent = `${selected.length} / 3`;
  $('selection-names').textContent = selected.map(id => data.products.find(product => product.id === id)?.model).filter(Boolean).join('、');
  document.querySelectorAll('[data-select]').forEach(element => {
    const active = selected.includes(element.dataset.select);
    const full = selected.length >= 3 && !active;
    element.setAttribute('aria-pressed', String(active));
    element.textContent = active ? '✓ 已選比較' : full ? '最多比較 3 款' : '＋ 加入比較';
    element.disabled = full;
    element.closest('.product-card')?.classList.toggle('is-selected', active);
  });
  if ($('compare-dialog').open) {
    if (selected.length) { renderCompare(); $('compare-body').querySelector('button')?.focus(); }
    else $('compare-dialog').close();
  }
}

function productCard(product) {
  const state = availability(product), offer = bestOffer(product, filters()), pair = pairPrice(offer);
  const card = el('article', 'product-card');
  const knownSupply = state === 'available' ? offerStatus[offer?.status] || statusNames[state] : statusNames[state];
  append(card, append(el('div', 'card-topline'), el('span', 'brand-name', product.brand), badge(knownSupply, state)), el('h3', '', product.model), el('p', 'panel-line', `${text(product.panel)} · ${text(product.screenType)}`));
  append(card, append(el('dl', 'card-specs'), specRow('原生解析度', resolution(product)), specRow('更新率', numberUnit(product.refreshHz, 'Hz')), specRow('尺寸', numberUnit(product.sizeInches, '″'))));
  const mount = el('p', 'card-note');
  append(mount, el('strong', '', '安裝待核對 '), document.createTextNode(`${vesa(product)}；${portraitNames[product.portrait] || portraitNames.unknown}。${weightCondition(product)}`));
  card.append(mount);
  card.append(el('p', 'card-note card-dimensions', envelopeText(product)));
  const comfort = product.comfort?.find(item => item.kind !== 'unknown') || product.comfort?.[0];
  const caution = product.cautions?.[0] || comfort?.value || '長時間舒適度、電腦輸出與支架相容仍須逐項核對。';
  card.append(el('p', 'card-caution', caution));
  const price = el('div', 'price-main');
  if (offer && pair) append(price, el('span', 'currency', 'NT$'), document.createTextNode(money(offer.priceTwd)));
  else { price.classList.add('is-unknown'); price.textContent = '價格未確認'; }
  const priceColumn = append(el('div'), price, el('p', 'price-caption', offer ? `${offer.seller} · ${kindNames[offer.kind] || kindNames.unknown}` : '尚無已確認賣場價格'));
  if (offer) priceColumn.append(el('p', 'price-provenance', offerDescription(offer)));
  const pairColumn = append(el('div', 'pair-cost'), document.createTextNode(pair?.confirmed ? '雙台可供貨' : '雙台費用估算'), el('strong', '', pair ? `NT$${money(pair.value)}` : '—'));
  append(card, append(el('div', 'card-price'), priceColumn, pairColumn));
  const select = button('＋ 加入比較', 'compare-toggle', () => selectProduct(product.id));
  select.dataset.select = product.id; select.setAttribute('aria-pressed', 'false'); select.setAttribute('aria-label', `${product.model} 加入或移除比較`);
  append(card, append(el('div', 'card-actions'), button('型號、賣場與證據 ↗', 'detail-button', () => openDetails(product)), select));
  return card;
}

function renderProducts() {
  const visible = filterProducts(data.products, filters());
  $('products').replaceChildren(...visible.map(productCard));
  $('products').setAttribute('aria-busy', 'false');
  $('result-count').textContent = `顯示 ${visible.length} 款 · 共建檔 ${data.products.length} 款`;
  $('empty-state').hidden = !!visible.length;
  const descriptions = {
    available: '已確認基本規格，且至少有一個現貨或可下單預購賣場。長時間舒適度、雙台數量及安裝仍須另行核對。',
    pending: '仍缺基本規格的精確型號證據；暫不列入已符合清單。缺乏獨立舒適度評測本身不會被排除。',
    unconfirmed: '基本規格已有資料，但現貨／可下單預購與交期仍待確認。商品頁或購物按鈕不等於現貨。',
    outOfStock: '目前已查得的賣場均顯示缺貨；價格僅供查核參考，不代表現在能購買。',
    excluded: '查得規格有至少一項不符合尺寸、平面、解析度或更新率門檻，保留資料供核對。',
    all: '包含已符合、待確認、缺貨與不符條件的全部建檔型號；請看各型號的狀態與證據。',
  };
  $('status-explainer').textContent = descriptions[currentStatus];
  renderSelection();
}

function section(title, ...children) { return append(el('section', 'detail-section'), el('h3', '', title), children); }
function openDetails(product) {
  $('detail-title').textContent = `${product.brand} ${product.model}`;
  const body = $('detail-body'); body.replaceChildren();
  const dimensions = product.dimensionsMm;
  const dimensionsText = dimensions && ['width', 'height', 'depth'].every(key => typeof dimensions[key] === 'number' && Number.isFinite(dimensions[key])) ? `${dimensions.width} × ${dimensions.height} × ${dimensions.depth} mm` : '尚無完整外廓尺寸';
  append(body, el('p', 'dialog-note', `查核狀態：${statusNames[availability(product)]}。基本規格符合不等於長時間舒適度或支架已確認。`), append(el('dl', 'detail-specs'), specRow('原生解析度／更新率', `${resolution(product)} / ${numberUnit(product.refreshHz, 'Hz')}`), specRow('尺寸／面板', `${numberUnit(product.sizeInches, '″')} / ${text(product.panel)}`), specRow('VESA／無底座重量', `${vesa(product)} / ${numberUnit(product.weightKg, 'kg')}`), specRow('螢幕本體外廓（寬 × 高 × 深）', dimensionsText)));
  append(body, section('介面與雙電腦連接', el('p', '', product.ports || '介面與供電資料未確認。'), el('p', '', 'Windows／macOS 電腦型號尚未指定；本頁未保證雙台同時輸出或任何轉接方案。')));
  const envelope = deskEnvelope(product);
  const clearance = envelope ? `與 180 cm 桌寬相比${envelope.fitsWidth ? '剩餘' : '超出'}約 ${(Math.abs(envelope.remainingMm) / 10).toFixed(1)} cm。若 VESA 正好位於機身中央，中心至少需高於桌面 ${(envelope.centerMinMm / 10).toFixed(1)} cm 才不觸桌（尚未含額外間距）；VESA 偏心、支臂行程、實際視距與夾座位置仍待確認。` : '資料不足以評估橫直並排的外廓。';
  append(body, section('支架與一橫一直配置', el('p', '', portraitNames[product.portrait] || portraitNames.unknown), el('p', '', weightCondition(product)), el('p', '', envelopeText(product)), el('p', '', clearance), el('p', '', product.mountNotes || '完整安裝相容仍待核對。'), el('p', '', 'Arco 標示 VESA 75×75／100×100、螢幕旋轉 ±90°。3.3 cm 桌板位於夾桌 1.2–4.5 cm 厚度範圍；桌板結構、桌架與夾具空間尚未現場驗證。原廠未公布最大 VESA 中心高度及臂長，無法確認直立淨空或收合深度。'), sourceLinks([...(product.specSourceIds || []), 'setup-arco-spec-image', 'setup-arco-single-manual'])));
  const comfort = section('長時間閱讀：已知與未知');
  for (const evidence of product.comfort || []) append(comfort, append(el('div', 'evidence-row'), el('strong', '', evidence.topic), badge(evidenceNames[evidence.kind] || evidenceNames.unknown, evidence.kind), el('p', '', evidence.value), sourceLinks(evidence.sourceIds)));
  if (!product.comfort?.length) comfort.append(el('p', '', '尚未取得可核對的精確型號舒適度實測資料。'));
  body.append(comfort);
  if (product.cautions?.length) body.append(section('購買前留意', append(el('ul'), product.cautions.map(caution => el('li', '', caution)))));
  const offers = section('台灣通路與保固');
  offers.append(el('p', '', '以下資訊各自屬於該賣場，不跨賣場轉用保固、價格或數量。雙台估算不含未確認的運費、轉接座與活動折扣。'));
  for (const offer of product.offers || []) {
    const pair = pairPrice(offer), box = el('article', 'offer-box');
    append(box, append(el('div', 'offer-heading'), el('h4', '', offer.seller), badge(offerStatus[offer.status] || offerStatus.unconfirmed, offer.status === 'inStock' || offer.status === 'preorder' ? 'available' : 'unconfirmed')), el('p', 'offer-price', pair ? `NT$${money(offer.priceTwd)} / 台` : '價格未確認'), el('p', 'price-provenance', offerDescription(offer)), el('p', '', `版本：${kindNames[offer.kind] || kindNames.unknown}`), el('p', '', `保固：${offer.warranty || '未確認'}`), el('p', '', `雙台數量：${offer.pairAvailability === 'two' ? '已確認兩台可供貨' : offer.pairAvailability === 'one' ? '僅確認一台' : '未確認'}`), el('p', '', pair ? `單價 × 2：NT$${money(pair.value)}${pair.confirmed ? '；兩台數量已確認，實付仍以賣場為準。' : '（估算；兩台供貨未確認）'}` : '雙台費用尚無法估算'), el('p', '', `查核：${offer.checkedAt || data.meta.checkedAt || '未確認'}`), externalLink('前往該型號賣場 ↗', offer.url), sourceLinks(offer.sourceId ? [offer.sourceId] : []));
    offers.append(box);
  }
  if (!product.offers?.length) offers.append(el('p', '', '尚無已確認的台灣賣場資料。'));
  body.append(offers, section('原廠規格來源', sourceLinks(product.specSourceIds)));
  $('detail-dialog').showModal();
}

function renderCompare() {
  const products = selected.map(id => data.products.find(product => product.id === id)).filter(Boolean);
  const offerFilters = filters();
  const table = el('table', 'compare-table'), head = el('thead'), headRow = el('tr');
  const topLeft = el('th', '', '比較項目'); topLeft.scope = 'col'; headRow.append(topLeft);
  for (const product of products) {
    const th = el('th'); th.scope = 'col';
    append(th, el('span', 'brand-name', product.brand), el('div', '', product.model), button('移除此款', '', () => selectProduct(product.id)));
    headRow.append(th);
  }
  append(table, append(head, headRow));
  const rows = [
    ['查核狀態', p => statusNames[availability(p)]], ['尺寸／面板', p => `${numberUnit(p.sizeInches, '″')} / ${text(p.panel)}`], ['解析度／更新率', p => `${resolution(p)} / ${numberUnit(p.refreshHz, 'Hz')}`],
    ['單台價格', p => { const o = bestOffer(p, offerFilters); return pairPrice(o) ? `NT$${money(o.priceTwd)} · ${o.seller} · ${kindNames[o.kind] || kindNames.unknown}；${offerDescription(o)}` : '價格未確認'; }],
    ['雙台費用', p => { const o = bestOffer(p, offerFilters), pair = pairPrice(o); return pair ? `NT$${money(pair.value)}${pair.confirmed ? ' · 兩台可供貨' : '（估算，數量未確認）'}；${offerDescription(o)}` : '未確認'; }],
    ['該價格賣場保固', p => bestOffer(p, offerFilters)?.warranty || '未確認'], ['一橫一直外廓估算', envelopeText], ['Arco 重量條件', weightCondition], ['VESA', vesa], ['直立操作', p => portraitNames[p.portrait] || portraitNames.unknown], ['安裝限制', p => p.mountNotes || '安裝相容待核對'], ['介面／供電', p => p.ports || '未確認'],
    ['長時間閱讀證據', p => p.comfort?.map(e => `${evidenceNames[e.kind] || evidenceNames.unknown}｜${e.topic}：${e.value}`).join('；') || '未取得精確型號實測'], ['留意事項', p => p.cautions?.join('；') || '尚無完整資料'],
  ];
  const tbody = el('tbody');
  for (const [label, getValue] of rows) {
    const row = el('tr'), th = el('th', '', label); th.scope = 'row'; row.append(th);
    for (const product of products) row.append(el('td', '', getValue(product)));
    tbody.append(row);
  }
  const links = el('tr'), linksTitle = el('th', '', '完整資料'); linksTitle.scope = 'row'; links.append(linksTitle);
  for (const product of products) links.append(append(el('td'), button('查看型號與所有賣場 ↗', '', () => openDetails(product))));
  tbody.append(links); table.append(tbody);
  const scroll = append(el('div', 'compare-scroll'), table); scroll.tabIndex = 0; scroll.setAttribute('aria-label', '螢幕比較表，可水平捲動');
  $('compare-body').replaceChildren(scroll);
}

function renderConclusions() {
  const groups = [
    { title: '長時間工作：先比較 LCD', intro: '以文字與固定桌面為主的比較起點。', models: [
      { id: 'dell-u3225qe', note: '4K 120Hz。RTINGS 受測樣機文字清晰度佳；強光反射、快速動態拖影及區域控光仍有取捨。', sources: ['dell-u3225qe-rtings', 'dell-u3225qe-spec'] },
      { id: 'benq-rd320u', note: '4K 60Hz。原廠主打 Nano Matte、B.I. 與程式設計模式；這些屬原廠功能聲明，精確型號的獨立文字實測仍待確認。', sources: ['benq-rd320u-spec'] },
    ] },
    { title: '更細緻文字：再看 6K', intro: '像素更多，雙台輸出條件也要先核對。', models: [
      { id: 'acer-pe320qxt', note: '6016×3384、60Hz 觸控 LCD；裸機 6.6 kg。獨立文字實測、台灣裸機完整外廓與直立操作仍未確認。', sources: ['acer-pe320qxt-tw-store', 'acer-pe320qxt-uk-spec'] },
      { id: 'lg-32u990a-s', note: '6144×3456、60Hz。實測文字精細，但塗層與 60Hz 捲動有取捨；裸機重量、直立操作及主機雙 6K 能力仍待核對。', sources: ['lg-32u990a-avforums', 'lg-32u990a-pcworld'] },
    ] },
    { title: '影音優先：理解 OLED 取捨', intro: '深黑與影片之外，也要看固定桌面風險。', models: [
      { id: 'samsung-s32hg802sc-g80sh-', note: '4K 240Hz。RTINGS 肯定反射處理與 HDR，亦記錄字緣彩邊、暗部 VRR 閃爍及固定桌面烙印風險。', sources: ['samsung-g80sh-rtings'] },
      { id: 'dell-u3226q', note: '4K 120Hz。原廠列 AGLR 低反射表面及含烙印的保固；精確型號文字、亮度變化與維護頻率獨立實測仍待確認。', sources: ['dell-u3226q-spec'] },
    ] },
  ];
  $('conclusion-groups').replaceChildren(...groups.map(group => {
    const article = append(el('article', 'conclusion-group'), el('h3', '', group.title), el('p', 'conclusion-intro', group.intro));
    for (const item of group.models) {
      const product = data.products.find(p => p.id === item.id);
      if (!product) continue;
      const state = availability(product);
      article.append(append(el('div', 'conclusion-model'), append(el('div', 'conclusion-model-heading'), button(`${product.brand} ${product.model} ↗`, '', () => openDetails(product)), badge(statusNames[state], state)), el('p', '', item.note), sourceLinks(item.sources)));
    }
    return article;
  }));
  $('guide-text-sources').replaceChildren(sourceLinks(['setup-windows-layout', 'setup-windows-refresh', 'setup-apple-rotation']));
  $('guide-connection-sources').replaceChildren(sourceLinks(['setup-apple-air-displays', 'setup-apple-pro-displays', 'setup-apple-m3-displays', 'setup-dell-mac-mst', 'setup-apple-adapters', 'setup-vesa-usbc']));
  $('guide-mount-sources').replaceChildren(sourceLinks(['setup-arco-spec-image', 'setup-arco-single-manual']));
}

function renderResearch() {
  renderConclusions();
  const date = data.meta.checkedAt || data.checkedAt || '未確認';
  $('checked-date').textContent = date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) $('checked-date').dateTime = date;
  $('stat-total').textContent = data.products.length;
  $('stat-available').textContent = data.products.filter(product => availability(product) === 'available').length;
  $('stat-brands').textContent = new Set(data.products.map(product => product.brand)).size;
  for (const brand of [...new Set(data.products.map(product => product.brand))].sort((a, b) => a.localeCompare(b))) {
    const option = el('option', '', brand); option.value = brand; $('brand').append(option);
  }
  document.querySelectorAll('[data-count]').forEach(element => { element.textContent = data.products.filter(product => availability(product) === element.dataset.count).length; });
  $('limitations').replaceChildren(...(data.meta.limitations || data.limitations || []).map(limit => el('li', '', limit)));
  const coverageNames = { complete: '已處理列示範圍', partial: '部分完成', blocked: '頁面存取受限' };
  $('coverage-log').replaceChildren(...data.coverage.map(item => append(el('details', 'coverage-item'), append(el('summary'), el('span', 'coverage-brand', item.brand), badge(coverageNames[item.status] || '未確認', item.status === 'complete' ? 'available' : 'pending')), el('p', '', item.scope), el('p', '', item.notes), el('p', 'coverage-models', item.candidateModels?.length ? `查得型號：${item.candidateModels.join('、')}` : '尚無可核對的候選型號紀錄'), externalLink('查看查核入口 ↗', item.url))));
  $('source-count').textContent = `${data.sources.length} 筆`;
  $('source-library').replaceChildren(...data.sources.map(source => append(el('article', 'source-item'), externalLink(source.title, source.url), el('p', '', `${({ manufacturer: '原廠', measurement: '獨立實測', measured: '獨立實測', retailer: '通路', coverage: '盤點入口' })[source.kind] || '來源'} · ${source.checkedAt || date}`), el('p', '', source.notes || '來源內容以精確型號與記錄範圍為限。'))));
}

function resetFilters() {
  controls.forEach(id => { $(id).value = id === 'query' || id === 'warranty' ? '' : id === 'sort' ? 'price-asc' : 'all'; });
  currentStatus = 'available';
  document.querySelectorAll('[data-status]').forEach(element => element.setAttribute('aria-pressed', String(element.dataset.status === currentStatus)));
  renderProducts();
}
controls.forEach(id => $(id).addEventListener(id === 'query' || id === 'warranty' ? 'input' : 'change', renderProducts));
document.querySelectorAll('[data-status]').forEach(element => element.addEventListener('click', () => {
  currentStatus = element.dataset.status;
  document.querySelectorAll('[data-status]').forEach(button => button.setAttribute('aria-pressed', String(button === element)));
  renderProducts();
}));
$('reset-filters').addEventListener('click', resetFilters);
$('retry-load').addEventListener('click', () => location.reload());
$('empty-reset').addEventListener('click', resetFilters);
$('clear-selection').addEventListener('click', () => { selected = []; renderSelection(); announcement('已清空比較。'); });
$('open-compare').addEventListener('click', () => { renderCompare(); $('compare-dialog').showModal(); });
document.querySelectorAll('[data-close]').forEach(element => element.addEventListener('click', () => $(element.dataset.close).close()));
for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
});

try {
  const response = await fetch(new URL('products.json', import.meta.url), { cache: 'no-cache' });
  if (!response.ok) throw new Error(`資料回應 ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload.products) || !Array.isArray(payload.sources) || !Array.isArray(payload.coverage)) throw new Error('資料格式不完整');
  data = { ...payload, meta: payload.meta || {} };
  renderResearch(); renderProducts();
} catch (error) {
  $('load-error').hidden = false; $('products').setAttribute('aria-busy', 'false');
  $('result-count').textContent = '資料載入失敗；可使用上方按鈕重新載入。';
  console.error('Monitor data could not be loaded:', error);
}
