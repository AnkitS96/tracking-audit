// Run: node test.js
const assert = require('assert');
const A = require('./audit.js');
const S = require('./samples.js');

const has = (list, rule, text) => list.some((x) => x.rule === rule && (!text || x.message.includes(text)));

// GTM: the sample has a duplicated Purchase tag, a dead tag, a double init and a paused tag
const gtm = A.auditGtm(S.gtm);
assert(has(gtm, 'duplicate-event', 'meta "Purchase" is sent 2 times'), 'duplicate Purchase tag');
assert(has(gtm, 'tag-no-trigger', 'TikTok - Complete Payment'), 'tag without trigger');
assert(has(gtm, 'multiple-init', '111222333'), 'pixel initialised twice');
assert(has(gtm, 'tag-paused'), 'paused tag');
assert(!has(gtm, 'duplicate-event', 'snapchat'), 'single Snap purchase is fine');
assert(!has(gtm, 'duplicate-event', 'ga4'), 'single GA4 purchase is fine');
assert(has(gtm, 'undefined-variable', 'Order total'), 'undefined variable');
assert(!has(gtm, 'undefined-variable', 'Order value'), 'defined variable is fine');
assert(has(gtm, 'firing-unlimited', 'Meta - Purchase'), 'unlimited firing on purchase');
assert(has(gtm, 'trigger-too-broad', 'Meta - Lead'), 'lead on every page');
assert(!has(gtm, 'trigger-too-broad', 'Meta - Purchase'), 'purchase trigger has a condition');
assert(has(gtm, 'no-consent-settings', 'Meta - Purchase'), 'no consent settings');
assert(!has(gtm, 'no-consent-settings', 'Meta Pixel - Base"'), 'consent set on base tag');
assert(has(gtm, 'tag-not-read', 'Meta (gallery template)'), 'template tag not silently passed');
assert(has(A.auditGtm({ tag: [{ name: 'X', firingTriggerId: ['99'], parameter: [{ key: 'html', value: "fbq('track','Lead');" }] }] }), 'trigger-missing'), 'missing trigger');

// Events
const ev = A.auditEvents(S.events);
assert(has(ev, 'double-fire', 'o-1001'), 'same event_id sent twice');
assert(has(ev, 'event-name-case', 'Use "Purchase"'), 'lowercase purchase');
assert(has(ev, 'purchase-value'), 'value as string');
assert(has(ev, 'purchase-currency'), 'currency missing');
assert(has(ev, 'no-event-id'), 'missing event_id');
assert(has(ev, 'event-name', 'CompletePayment'), 'tiktok purchase alias');
assert(has(ev, 'dedup-summary', '1 browser/server pairs'), 'one deduplicated pair');

// Server payload
const sv = A.auditServer(S.server);
assert(has(sv, 'test-event-code'), 'test_event_code left on');
assert(has(sv, 'event-time-ms'), 'time in ms');
assert(has(sv, 'event-time-old'), 'time too old');
assert(has(sv, 'not-hashed', 'em is not'), 'plain email');
assert(has(sv, 'hashed-cookie', 'fbp'), 'hashed fbp');
assert(has(sv, 'private-ip'), 'private ip');
assert(has(sv, 'no-action-source'), 'no action_source');
assert(has(sv, 'no-event-id'), 'no event_id');
assert(has(sv, 'purchase-value'), 'value as string');
assert(has(sv, 'purchase-currency'), 'lowercase currency');
assert(has(sv, 'no-content-ids'), 'no content ids');
assert(has(sv, 'duplicate-event-id', 'o-2001'), 'retry duplicate');
assert(!sv.some((x) => x.where.startsWith('event 1 ') && x.severity === 'error'), 'good event has no errors');
assert(!JSON.stringify(sv).includes('anna@shop.example'), 'findings never echo personal data');
assert(has(A.auditServer([{ event_name: 'Lead', event_time: 5, user_data: { em: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' } }], 100), 'hashed-empty'), 'hash of empty value');

// Events against catalog
const mt = A.auditMatch(S.match, S.catalogMeta, 'meta');
assert(has(mt, 'id-case', 'SKU-3'), 'case mismatch');
assert(has(mt, 'id-not-in-catalog', '12345'), 'unknown id');
assert(has(mt, 'price-mismatch', 'SKU-2'), 'price differs');
assert(has(mt, 'no-content-type'), 'no content_type');
assert(has(mt, 'no-content-ids', '1 product event'), 'event without ids');
assert(has(mt, 'match-summary', '2 of 4'), 'summary counts');
assert(!has(mt, 'id-not-in-catalog', 'SKU-1'), 'good id is fine');
const variantCsv = 'id,price\nSHIRT-M,10.00 EUR\nSHIRT-L,10.00 EUR';
assert(has(A.auditMatch([{ event_name: 'Purchase', custom_data: { content_ids: ['SHIRT'], content_type: 'product' } }], variantCsv, 'meta'), 'id-not-in-catalog', 'SHIRT-M'), 'product id versus variant id hint');
assert(has(A.auditMatch({ data: [{ event_name: 'Purchase', custom_data: { content_ids: [123], content_type: 'product' } }] }, 'id,price\n123,5 EUR', 'meta'), 'match-summary', '1 of 1'), 'numeric id and CAPI body');

// Totals against real orders
const tt = A.auditTotals(S.totals);
const on = (rule, name) => tt.some((x) => x.rule === rule && x.where === name);
assert(on('dedup-failing', 'meta'), 'meta counted twice');
assert(on('count-ok', 'tiktok'), 'tiktok in range');
assert(on('value-high', 'snapchat'), 'snap value includes tax');
assert(on('low-count', 'ga4'), 'ga4 low');
assert(on('undercount', 'linkedin'), 'linkedin undercount');
assert(!on('overcount', 'meta'), 'dedup message replaces generic overcount');
assert(A.auditTotals({ shop: { orders: 100 }, platforms: { a: { purchases: 250 } } }).some((x) => x.rule === 'overcount' && x.message.includes('2.5x')), '2.5x story');
assert(A.auditTotals({ shop: { orders: 0 }, platforms: { a: { purchases: 1 } } })[0].rule === 'no-totals', 'zero orders');

// Catalog
const cat = A.auditCatalog(S.catalogMeta, 'meta');
assert(has(cat, 'bad-value', 'available'), 'bad availability');
assert(has(cat, 'price-format', '19.99'), 'price without currency');
assert(has(cat, 'not-https'), 'http image');
assert(has(cat, 'empty-value', 'description'), 'empty description');
assert(has(cat, 'empty-value', 'brand'), 'empty brand');
assert(has(cat, 'duplicate-id', 'SKU-2'), 'duplicate id');
assert(has(A.auditCatalog('id,title\nA,B', 'meta'), 'missing-column'), 'missing columns');

// Clean inputs produce no errors
const clean = { containerVersion: { trigger: [{ triggerId: '2', name: 'Purchase' }], tag: [{ name: 'Meta - Purchase', parameter: [{ key: 'html', value: "fbq('track','Purchase');" }], firingTriggerId: ['2'] }] } };
assert.strictEqual(A.summarize(A.auditGtm(clean)).error, 0, 'clean GTM');
const cleanEv = [{ platform: 'meta', event_name: 'Purchase', source: 'browser', event_id: 'a', value: 5, currency: 'EUR' }, { platform: 'meta', event_name: 'Purchase', source: 'server', event_id: 'a', value: 5, currency: 'EUR' }];
assert.strictEqual(A.summarize(A.auditEvents(cleanEv)).error, 0, 'clean events');
const cleanCat = 'id,title,description,availability,condition,price,link,image_link,brand\nA,T,D,in stock,new,1.00 EUR,https://x.example/a,https://x.example/a.jpg,B';
assert.strictEqual(A.summarize(A.auditCatalog(cleanCat, 'meta')).error, 0, 'clean catalog');

console.log('all checks passed');
