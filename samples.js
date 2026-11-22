/* Synthetic sample data. No real client or shop data. Each sample contains deliberate mistakes. */
(function (root) {
  const tag = (name, html, triggers, extra) => Object.assign({ name, type: 'html', parameter: [{ key: 'html', value: html }], firingTriggerId: triggers }, extra || {});

  const gtm = {
    containerVersion: {
      variable: [{ name: 'Order value' }, { name: 'Order ID' }],
      trigger: [{ triggerId: '1', name: 'All Pages', type: 'PAGEVIEW' }, { triggerId: '2', name: 'Purchase event', type: 'CUSTOM_EVENT', customEventFilter: [{ type: 'EQUALS' }] }],
      tag: [
        tag('Meta Pixel - Base', "fbq('init','111222333'); fbq('track','PageView');", ['1'], { consentSettings: { consentStatus: 'NEEDED' } }),
        tag('Meta - Purchase', "fbq('track','Purchase',{value:{{Order value}},currency:'EUR'},{eventID:{{Order ID}}});", ['2'], { tagFiringOption: 'UNLIMITED' }),
        tag('Meta - Purchase (copy)', "fbq('track','Purchase',{value:{{Order value}},currency:'EUR'},{eventID:{{Order ID}}});", ['2']),
        tag('Meta Pixel - Base (old)', "fbq('init','111222333');", ['1']),
        tag('TikTok - Complete Payment', "ttq.track('CompletePayment',{value:{{Order value}},currency:'EUR'});", []),
        tag('Snap - Purchase', "snaptr('track','PURCHASE',{price:{{Order total}},currency:'EUR'});", ['2']),
        tag('Meta - Lead', "fbq('track','Lead');", ['1']),
        { name: 'GA4 - purchase', type: 'gaawe', parameter: [{ key: 'eventName', value: 'purchase' }], firingTriggerId: ['2'] },
        { name: 'Meta (gallery template)', type: 'cvt_123_456', parameter: [{ key: 'pixelId', value: '111222333' }], firingTriggerId: ['2'] },
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

  const now = Math.floor(Date.now() / 1000);
  const EM = '1add7f5415d97550c5c3bb7f2eab072c48dcc77d5b66d1ff41ee466cbd01530d', PH = '536afd523e19dc83fccba822ef5e4ca646111314aaf0aa286667c5bea18dd70b';
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
  const good = { event_name: 'Purchase', event_time: now - 60, event_id: 'o-2001', action_source: 'website', event_source_url: 'https://shop.example/thank-you',
    user_data: { em: EM, ph: PH, fbp: 'fb.1.1700000000000.123456789', client_ip_address: '203.0.113.7', client_user_agent: ua },
    custom_data: { value: 49.9, currency: 'EUR', content_ids: ['SKU-1'], content_type: 'product' } };
  const server = { test_event_code: 'TEST12345', data: [
    good,
    { event_name: 'Purchase', event_time: now * 1000, event_id: 'o-2002', action_source: 'website', event_source_url: 'https://shop.example/thank-you',
      user_data: { em: 'anna@shop.example', fbp: EM, client_ip_address: '10.0.0.12', client_user_agent: ua }, custom_data: { value: '30.00', currency: 'eur' } },
    { event_name: 'Lead', event_time: now - 10 * 86400, user_data: { client_ip_address: '203.0.113.7', client_user_agent: ua } },
    Object.assign({}, good),
  ] };

  const match = [
    { event_name: 'ViewContent', custom_data: { content_ids: ['SKU-1'], content_type: 'product' } },
    { event_name: 'AddToCart', custom_data: { contents: [{ id: 'SKU-2', quantity: 1, item_price: 24.99 }], content_type: 'product' } },
    { event_name: 'Purchase', custom_data: { content_ids: ['sku-3', '12345'], content_type: 'product', value: 60, currency: 'EUR' } },
    { event_name: 'Purchase', custom_data: { content_ids: ['SKU-1'], value: 49.9, currency: 'EUR' } },
    { event_name: 'AddToCart', custom_data: { value: 10, currency: 'EUR' } },
  ];
  const totals = { shop: { orders: 100, revenue: 5000 }, platforms: {
    meta: { purchases: 200, value: 10000, browser: 100, server: 100 },
    tiktok: { purchases: 92, value: 4600 },
    snapchat: { purchases: 100, value: 5900 },
    ga4: { purchases: 55, value: 2000 },
    linkedin: { purchases: 20, value: 900 },
  } };
  const gtmSnippet = (id) => "<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','" + id + "');</script>";
  const metaSnippet = "<script>!function(f,b,e,v,n,t,s){/* base code */}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');\nfbq('init','111222333'); fbq('track','PageView');</script>";
  const source = [
    '<!DOCTYPE html><html><head>',
    gtmSnippet('GTM-ABC123'),
    metaSnippet,
    metaSnippet,
    '<script async src="https://www.googletagmanager.com/gtag/js?id=G-ABCDE12345"></script>',
    "<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-ABCDE12345');gtag('config','G-ABCDE12345');</script>",
    '<link rel="stylesheet" href="/wp-content/plugins/pixelyoursite/style.css">',
    '</head><body>',
    "<script>dataLayer.push({event:'view_item',ecommerce:{items:[{item_id:'SKU-1',price:'49,90'}]}});</script>",
    "<script>dataLayer.push({event:'purchase',ecommerce:{value:49.9,currency:'EUR'}});</script>",
    "<script>fbq('track','Purchase',{value:49.9,currency:'EUR'});</script>",
    gtmSnippet('GTM-XYZ789'),
    '</body></html>',
  ].join('\n');
  const samples = { gtm, events, server, match, totals, source, catalogMeta };
  if (typeof module !== 'undefined' && module.exports) module.exports = samples;
  else root.SAMPLES = samples;
})(typeof window !== 'undefined' ? window : globalThis);
