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
