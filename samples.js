/* Synthetic sample data. No real client or shop data. Each sample contains deliberate mistakes. */
(function (root) {
  const tag = (name, html, triggers, extra) => Object.assign({ name, type: 'html', parameter: [{ key: 'html', value: html }], firingTriggerId: triggers }, extra || {});

  const gtm = {
    containerVersion: {
      trigger: [{ triggerId: '1', name: 'All Pages' }, { triggerId: '2', name: 'Purchase event' }],
      tag: [
        tag('Meta Pixel - Base', "fbq('init','111222333'); fbq('track','PageView');", ['1']),
        tag('Meta - Purchase', "fbq('track','Purchase',{value:{{Order value}},currency:'EUR'},{eventID:{{Order ID}}});", ['2']),
        tag('Meta - Purchase (copy)', "fbq('track','Purchase',{value:{{Order value}},currency:'EUR'},{eventID:{{Order ID}}});", ['2']),
        tag('Meta Pixel - Base (old)', "fbq('init','111222333');", ['1']),
        tag('TikTok - Complete Payment', "ttq.track('CompletePayment',{value:{{Order value}},currency:'EUR'});", []),
        tag('Snap - Purchase', "snaptr('track','PURCHASE',{price:{{Order value}},currency:'EUR'});", ['2']),
        tag('TikTok - Old test', "ttq.track('ViewContent');", ['1'], { paused: true }),
      ],
    },
  };

  const events = [
    { platform: 'meta', event_name: 'Purchase', source: 'browser', event_id: 'o-1001', value: 49.9, currency: 'EUR' },
    { platform: 'meta', event_name: 'Purchase', source: 'server', event_id: 'o-1001', value: 49.9, currency: 'EUR' },
    { platform: 'meta', event_name: 'Purchase', source: 'browser', value: 19, currency: 'EUR' },
    { platform: 'meta', event_name: 'Purchase', source: 'server', event_id: 'o-1003', value: 30, currency: 'EUR' },
    { platform: 'meta', event_name: 'purchase', source: 'browser', event_id: 'o-1004', value: 12, currency: 'EUR' },
    { platform: 'meta', event_name: 'Purchase', source: 'browser', event_id: 'o-1005', value: '25.00' },
    { platform: 'tiktok', event_name: 'Purchase', source: 'browser', event_id: 't-1', value: 10, currency: 'EUR' },
    { platform: 'meta', event_name: 'Purchase', source: 'browser', event_id: 'o-1001', value: 49.9, currency: 'EUR' },
    { platform: 'snapchat', event_name: 'PURCHASE', source: 'browser', event_id: 's-1', value: 20, currency: 'EUR' },
    { platform: 'meta', event_name: 'Lead', source: 'server', value: 0, currency: 'EUR' },
  ];

  const catalogMeta = [
    'id,title,description,availability,condition,price,link,image_link,brand',
    'SKU-1,Linen shirt,Soft linen shirt,in stock,new,49.90 EUR,https://shop.example/shirt,https://shop.example/img/shirt.jpg,Northwind',
    'SKU-2,Wool scarf,Warm scarf,available,new,19.99,https://shop.example/scarf,http://shop.example/img/scarf.jpg,Northwind',
    'SKU-3,Canvas bag,,in stock,new,25.00 EUR,https://shop.example/bag,https://shop.example/img/bag.jpg,',
    'SKU-2,Leather belt,Belt,out of stock,new,35.00 EUR,https://shop.example/belt,https://shop.example/img/belt.jpg,Northwind',
  ].join('\n');

  const samples = { gtm, events, catalogMeta };
  if (typeof module !== 'undefined' && module.exports) module.exports = samples;
  else root.SAMPLES = samples;
})(typeof window !== 'undefined' ? window : globalThis);
