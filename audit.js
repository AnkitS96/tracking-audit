/* Tracking Audit: checks for pixel / Conversions API setups and product catalogs.
 * Pure functions, no dependencies. Works in the browser (window.TrackingAudit) and Node (module.exports).
 * ponytail: rules are starter rules kept in plain tables below. Verify against each platform's current docs. */
(function (root) {
  const f = (severity, rule, message, where) => ({ severity, rule, message, where: where || '' });

  // ---------- Google Tag Manager container export ----------
  const PLATFORMS = [
    { id: 'meta', has: /fbq\s*\(/, track: /fbq\s*\(\s*['"]track(?:Custom)?['"]\s*,\s*['"]([^'"]+)['"]/g, init: /fbq\s*\(\s*['"]init['"]\s*,\s*['"]?(\d+)/g },
    { id: 'tiktok', has: /ttq\./, track: /ttq\.track\s*\(\s*['"]([^'"]+)['"]/g, init: /ttq\.load\s*\(\s*['"]([^'"]+)['"]/g },
    { id: 'snapchat', has: /snaptr\s*\(/, track: /snaptr\s*\(\s*['"]track['"]\s*,\s*['"]([^'"]+)['"]/g, init: /snaptr\s*\(\s*['"]init['"]\s*,\s*['"]([^'"]+)['"]/g },
    { id: 'linkedin', has: /lintrk\s*\(/, track: /conversion_id\s*:\s*['"]?(\d+)/g, init: /_linkedin_partner_id\s*=\s*['"]?(\d+)/g },
  ];
  // Gallery/template tags have no code to read. Guess the platform from type or name, and read an event name parameter if there is one.
  const TEMPLATE_PLATFORMS = [['meta', /meta|facebook|fbq/i], ['tiktok', /tiktok/i], ['snapchat', /snap/i], ['linkedin', /linkedin/i], ['ga4', /ga4|gaawe|google analytics/i]];
  const EVENT_PARAM = /^(eventName|event_name|standardEventName|eventType)$/;
  const CONVERSION = /^(purchase|completepayment|lead|completeregistration|signup|sign_up|submitform|generate_lead)$/i;
  const BUILTIN_VARS = ['Page URL', 'Page Hostname', 'Page Path', 'Referrer', 'Event', 'Environment Name', 'Container ID', 'Container Version', 'Random Number', 'Debug Mode', 'Click Element', 'Click Classes', 'Click ID', 'Click Target', 'Click URL', 'Click Text', 'Form Element', 'Form Classes', 'Form ID', 'Form Target', 'Form URL', 'Form Text', 'New History Fragment', 'Old History Fragment', 'New History State', 'Old History State', 'History Source', 'Error Message', 'Error URL', 'Error Line', 'Video Title', 'Video Provider', 'Scroll Depth Threshold'];

  function auditGtm(input) {
    const out = [];
    const cv = (input && input.containerVersion) || input || {};
    const tags = cv.tag || [];
    const triggers = cv.trigger || [];
    const defined = new Set(BUILTIN_VARS.concat((cv.variable || []).map((v) => v.name)));
    const triggerOf = (id) => triggers.find((t) => String(t.triggerId) === String(id));
    const trig = (id) => (triggerOf(id) || {}).name || 'trigger ' + id;
    if (!tags.length) return [f('warning', 'no-tags', 'No tags found. Is this a Google Tag Manager container export (JSON)?')];

    const fired = {}; // platform|event|trigger -> tag names
    const inits = {}; // platform|pixel id -> tag names
    const notRead = [];
    tags.forEach((tag) => {
      const params = tag.parameter || [];
      const html = params.filter((p) => p.key === 'html').map((p) => p.value).join('\n');
      const triggersOf = tag.firingTriggerId || [];
      if (tag.paused) out.push(f('info', 'tag-paused', `Tag "${tag.name}" is paused.`, tag.name));
      else if (!triggersOf.length) out.push(f('error', 'tag-no-trigger', `Tag "${tag.name}" has no firing trigger, so it never fires.`, tag.name));
      if (tag.paused) return;

      // what does this tag send?
      const events = []; // { platform, event }
      PLATFORMS.forEach((p) => {
        if (!html || !p.has.test(html)) return;
        for (const m of html.matchAll(p.init)) (inits[p.id + '|' + m[1]] = inits[p.id + '|' + m[1]] || []).push(tag.name);
        for (const m of html.matchAll(p.track)) events.push({ platform: p.id, event: m[1] });
      });
      if (!html) {
        const ev = params.find((p) => EVENT_PARAM.test(p.key) && typeof p.value === 'string');
        const plat = (TEMPLATE_PLATFORMS.find(([, re]) => re.test(tag.type + ' ' + tag.name)) || ['other'])[0];
        if (ev) events.push({ platform: plat, event: ev.value });
        else notRead.push(tag.name);
      }

      // variables that do not exist
      const text = html || JSON.stringify(params);
      new Set([...text.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1].trim())).forEach((v) => {
        if (!defined.has(v)) out.push(f('error', 'undefined-variable', `Tag "${tag.name}" uses {{${v}}}, which is not defined in this container. It will send an empty value.`, tag.name));
      });

      triggersOf.forEach((tid) => {
        const t = triggerOf(tid);
        if (!t && Number(tid) < 2147000000) out.push(f('error', 'trigger-missing', `Tag "${tag.name}" points to trigger ${tid}, which does not exist.`, tag.name));
        events.forEach((e) => { const k = [e.platform, e.event, tid].join('|'); (fired[k] = fired[k] || []).push(tag.name); });
      });

      if (!events.length) return;
      // conversion tags: how often and when can they fire?
      const conv = events.filter((e) => e.platform === 'linkedin' || CONVERSION.test(e.event));
      conv.forEach((e) => {
        if (tag.tagFiringOption === 'UNLIMITED') out.push(f('warning', 'firing-unlimited', `Tag "${tag.name}" sends ${e.platform} "${e.event}" with firing option "unlimited". It can fire more than once per page, so one order could count twice. Use "once per event".`, tag.name));
        triggersOf.forEach((tid) => {
          const t = triggerOf(tid);
          const everyPage = (tid === '2147479553') || (t && /^(PAGEVIEW|DOM_READY|WINDOW_LOADED)$/.test(t.type || '') && !(t.filter || []).length);
          if (everyPage) out.push(f('error', 'trigger-too-broad', `Tag "${tag.name}" sends ${e.platform} "${e.event}" on trigger "${trig(tid)}", which has no condition, so it fires on every page. Use a trigger that only fires on the order confirmation.`, tag.name));
        });
      });
      if (!tag.consentSettings || !tag.consentSettings.consentStatus || tag.consentSettings.consentStatus === 'NOT_SET') {
        out.push(f('warning', 'no-consent-settings', `Tag "${tag.name}" has no consent settings. If the visitor has not agreed yet, it may still fire, which is a problem under GDPR and Consent Mode. Ignore this if a consent trigger already blocks it.`, tag.name));
      }
    });

    Object.entries(fired).forEach(([k, names]) => {
      if (names.length < 2) return;
      const [p, ev, tid] = k.split('|');
      out.push(f('error', 'duplicate-event',
        `${p} "${ev}" is sent ${names.length} times on the same trigger ("${trig(tid)}") by: ${names.join(', ')}. Every conversion would be counted ${names.length}x.`, names.join(', ')));
    });
    Object.entries(inits).forEach(([k, names]) => {
      if (names.length < 2) return;
      const [p, id] = k.split('|');
      out.push(f('warning', 'multiple-init', `${p} pixel ${id} is initialised in ${names.length} tags (${names.join(', ')}). Initialise it once.`, names.join(', ')));
    });
    if (notRead.length) out.push(f('info', 'tag-not-read', `${notRead.length} template tag(s) have no readable event name (${notRead.join(', ')}), so they were not checked for duplicates. Check them by hand.`, notRead.join(', ')));
    if (!out.some((x) => x.severity === 'error')) out.push(f('info', 'gtm-ok', `Read ${tags.length - notRead.length} of ${tags.length} tags: no errors found in those.`));
    return out;
  }

  // ---------- Browser vs server events (deduplication) ----------
  const STANDARD = {
    meta: ['PageView', 'ViewContent', 'AddToCart', 'InitiateCheckout', 'AddPaymentInfo', 'Purchase', 'Lead', 'CompleteRegistration', 'Search'],
    tiktok: ['ViewContent', 'AddToCart', 'InitiateCheckout', 'AddPaymentInfo', 'CompletePayment', 'Search'],
    snapchat: ['PAGE_VIEW', 'VIEW_CONTENT', 'ADD_CART', 'START_CHECKOUT', 'PURCHASE', 'SIGN_UP'],
  };
  const PURCHASE = { meta: 'Purchase', tiktok: 'CompletePayment', snapchat: 'PURCHASE' };
  const ALIASES = { tiktok: { purchase: 'CompletePayment' }, snapchat: { purchase: 'PURCHASE' } };

  function auditEvents(events) {
    const out = [];
    if (!Array.isArray(events) || !events.length) return [f('warning', 'no-events', 'No events found. Expected a JSON array of events.')];
    const key = (e) => [e.platform, e.event_name, e.source, e.event_id].join('|');
    const counts = {};
    const ids = { browser: new Set(), server: new Set() };
    events.forEach((e, i) => {
      const where = `event ${i + 1} (${e.platform} ${e.event_name}, ${e.source})`;
      const std = STANDARD[e.platform];
      if (std) {
        const alias = (ALIASES[e.platform] || {})[String(e.event_name).toLowerCase()];
        const exact = std.includes(e.event_name);
        const ci = std.find((s) => s.toLowerCase() === String(e.event_name).toLowerCase());
        if (!exact && alias) out.push(f('warning', 'event-name', `${e.platform} uses "${alias}" for purchases, not "${e.event_name}".`, where));
        else if (!exact && ci) out.push(f('error', 'event-name-case', `"${e.event_name}" is not a standard ${e.platform} event. Use "${ci}" (names are case sensitive).`, where));
        else if (!exact) out.push(f('info', 'custom-event', `"${e.event_name}" is not a standard ${e.platform} event, so it is treated as a custom event.`, where));
      }
      if (e.event_name === PURCHASE[e.platform]) {
        const v = Number(e.value);
        if (e.value === undefined || e.value === '' || !isFinite(v) || typeof e.value === 'string') out.push(f('error', 'purchase-value', 'Purchase value is missing or not a number.', where));
        else if (v <= 0) out.push(f('warning', 'purchase-value-zero', 'Purchase value is zero or negative.', where));
        if (!/^[A-Z]{3}$/.test(e.currency || '')) out.push(f('error', 'purchase-currency', 'Purchase currency is missing or not a 3 letter uppercase code (for example EUR).', where));
      }
      if (!e.event_id) {
        out.push(f(e.source === 'server' ? 'error' : 'warning', 'no-event-id',
          e.source === 'server' ? 'Server event has no event_id, so it cannot be matched to the browser event and will count twice.' : 'Browser event has no event_id, so the platform cannot remove duplicates against the server event.', where));
        return;
      }
      ids[e.source] && ids[e.source].add([e.platform, e.event_name, e.event_id].join('|'));
      counts[key(e)] = (counts[key(e)] || 0) + 1;
    });
    Object.entries(counts).forEach(([k, n]) => {
      if (n > 1) { const [p, ev, src, id] = k.split('|'); out.push(f('error', 'double-fire', `${p} ${ev} (${src}, event_id ${id}) was sent ${n} times.`, k)); }
    });
    let matched = 0;
    ids.server.forEach((k) => {
      if (ids.browser.has(k)) matched++;
      else out.push(f('info', 'server-only', `Server event ${k.split('|').join(' / ')} has no browser twin (fine for offline events, a problem if the pixel should have fired).`, k));
    });
    ids.browser.forEach((k) => { if (!ids.server.has(k)) out.push(f('info', 'browser-only', `Browser event ${k.split('|').join(' / ')} has no server twin.`, k)); });
    out.push(f('info', 'dedup-summary', `${matched} browser/server pairs share an event_id and will be deduplicated.`));
    return out;
  }

  // ---------- Server events (Conversions API payload) ----------
  const SHA = /^[a-f0-9]{64}$/i;
  const EMPTY_SHA = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  const HASHED = ['em', 'ph', 'fn', 'ln', 'ge', 'db', 'ct', 'st', 'zp', 'country'];
  const ACTION_SOURCES = ['website', 'app', 'email', 'phone_call', 'chat', 'physical_store', 'system_generated', 'business_messaging', 'other'];
  const PRIVATE_IP = /^(10.|127.|192.168.|172.(1[6-9]|2d|3[01]).|169.254.|::1$|f[cd][0-9a-f]{2}:)/i;

  // input: the body sent to the Conversions API ({"data":[...]}) or just the data array. "now" (seconds) is for tests.
  function auditServer(input, now) {
    const out = [];
    const nowS = now || Math.floor(Date.now() / 1000);
    const events = Array.isArray(input) ? input : input && input.data;
    if (!Array.isArray(events) || !events.length) return [f('warning', 'no-events', 'No events found. Expected {"data":[...]} as sent to the Conversions API.')];
    if (!Array.isArray(input) && input.test_event_code) out.push(f('error', 'test-event-code', 'test_event_code is set. Events sent with it show up in the Test Events tab and are not meant for production. Remove it when you go live.'));
    const seen = {};
    events.forEach((e, i) => {
      const where = `event ${i + 1} (${e.event_name || 'no name'})`;
      const add = (sev, rule, msg) => out.push(f(sev, rule, msg, where));
      if (!e.event_name) add('error', 'no-event-name', 'event_name is missing.');
      const t = Number(e.event_time);
      if (!e.event_time || !isFinite(t)) add('error', 'event-time', 'event_time is missing or not a number (it must be Unix time in seconds).');
      else if (t > 1e11) add('error', 'event-time-ms', 'event_time looks like milliseconds. It must be in seconds.');
      else if (nowS - t > 7 * 86400) add('error', 'event-time-old', 'event_time is more than 7 days old. Meta rejects events that old.');
      else if (t - nowS > 300) add('warning', 'event-time-future', 'event_time is in the future.');
      if (!e.event_id) add('error', 'no-event-id', 'event_id is missing, so this event cannot be matched to the browser event and will count twice.');
      else { const k = e.event_name + '|' + e.event_id; if (seen[k]) add('error', 'duplicate-event-id', `event_id "${e.event_id}" is already used by event ${seen[k]} with the same name. Meta keeps one. If this is a retry, send the same event once.`); else seen[k] = i + 1; }
      if (!e.action_source) add('error', 'no-action-source', 'action_source is missing (for a web shop use "website").');
      else if (!ACTION_SOURCES.includes(e.action_source)) add('error', 'bad-action-source', `action_source "${e.action_source}" is not one of: ${ACTION_SOURCES.join(', ')}.`);
      const u = e.user_data;
      if (!u || !Object.keys(u).length) { add('error', 'no-user-data', 'user_data is missing, so the event cannot be matched to a person.'); return; }
      if (e.action_source === 'website') {
        if (!e.event_source_url) add('error', 'no-source-url', 'event_source_url is required for website events.');
        if (!u.client_user_agent) add('error', 'no-user-agent', 'client_user_agent is required for website events.');
        if (!u.client_ip_address) add('error', 'no-ip', 'client_ip_address is required for website events.');
        else if (PRIVATE_IP.test(String(u.client_ip_address))) add('error', 'private-ip', 'client_ip_address is a private or local address, so it is probably your server or proxy, not the visitor. Pass on the visitor IP.');
      }
      HASHED.forEach((k) => [].concat(u[k] === undefined ? [] : u[k]).forEach((v) => {
        if (String(v).toLowerCase() === EMPTY_SHA) add('error', 'hashed-empty', `${k} is the hash of an empty value. Leave the field out when you have no data.`);
        else if (!SHA.test(String(v))) add('error', 'not-hashed', `${k} is not a SHA-256 hash (64 hex characters). Hash it after trimming and lowercasing. Never send it as plain text.`);
      }));
      ['fbp', 'fbc'].forEach((k) => {
        if (!u[k]) return;
        if (SHA.test(String(u[k]))) add('error', 'hashed-cookie', `${k} must be sent as it is in the cookie, not hashed.`);
        else if (!/^fb.d.d{10,13}.S+$/.test(String(u[k]))) add('warning', 'cookie-format', `${k} does not look like the cookie value (expected fb.1.<time>.<id>).`);
      });
      if (!['em', 'ph', 'external_id', 'fbp', 'fbc'].some((k) => u[k])) add('warning', 'weak-match', 'No email, phone, external_id, fbp or fbc. Match quality will be very low.');
      else if (!u.em && !u.ph) add('info', 'no-email-phone', 'No email or phone. Matching relies on cookies and external_id only.');
      const c = e.custom_data || {};
      if (e.event_name === 'Purchase') {
        if (typeof c.value !== 'number' || !isFinite(c.value)) add('error', 'purchase-value', 'Purchase value is missing or not a number.');
        if (!/^[A-Z]{3}$/.test(c.currency || '')) add('error', 'purchase-currency', 'Purchase currency is missing or not a 3 letter uppercase code (for example EUR).');
        if (!c.content_ids && !c.contents) add('warning', 'no-content-ids', 'No content_ids or contents. Catalog and dynamic ads cannot use this purchase.');
      }
    });
    out.push(f('info', 'server-summary', `Checked ${events.length} server event(s).`));
    return out;
  }

  // ---------- Catalog feed (CSV) ----------
  const REQUIRED = {
    meta: ['id', 'title', 'description', 'availability', 'condition', 'price', 'link', 'image_link', 'brand'],
    tiktok: ['sku_id', 'title', 'description', 'availability', 'condition', 'price', 'link', 'image_link', 'brand'],
    snapchat: ['id', 'title', 'description', 'availability', 'condition', 'price', 'link', 'image_link', 'brand'],
  };
  const ALLOWED = {
    meta: { availability: ['in stock', 'out of stock', 'preorder', 'available for order', 'discontinued'], condition: ['new', 'refurbished', 'used'] },
  };

  function parseCsv(text) {
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; rows.push(row); row = []; }
      else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    const useful = rows.filter((r) => r.some((x) => x.trim() !== ''));
    if (!useful.length) return { headers: [], rows: [] };
    const headers = useful[0].map((h) => h.trim());
    return { headers, rows: useful.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] || '').trim()]))) };
  }

  function auditCatalog(csv, platform) {
    const out = [];
    const need = REQUIRED[platform];
    if (!need) return [f('error', 'platform', `Unknown platform "${platform}".`)];
    const { headers, rows } = parseCsv(csv);
    if (!rows.length) return [f('warning', 'no-rows', 'No product rows found. Expected a CSV with a header row.')];
    const missing = need.filter((h) => !headers.includes(h));
    if (missing.length) out.push(f('error', 'missing-column', `Missing required column(s) for ${platform}: ${missing.join(', ')}.`));
    const idCol = platform === 'tiktok' ? 'sku_id' : 'id';
    const seen = {};
    rows.forEach((r, i) => {
      const where = `row ${i + 2} (${r[idCol] || 'no id'})`;
      need.filter((h) => headers.includes(h) && r[h] === '').forEach((h) => out.push(f('error', 'empty-value', `${h} is empty.`, where)));
      if (r[idCol]) { if (seen[r[idCol]]) out.push(f('error', 'duplicate-id', `${idCol} "${r[idCol]}" is also used in row ${seen[r[idCol]]}.`, where)); else seen[r[idCol]] = i + 2; }
      if (r.price && !/^\d+(\.\d{1,2})?\s[A-Z]{3}$/.test(r.price)) out.push(f(platform === 'meta' ? 'error' : 'warning', 'price-format', `price "${r.price}" should look like "19.99 EUR" (number, space, currency code).`, where));
      ['link', 'image_link'].forEach((h) => { if (r[h] && !/^https:\/\//i.test(r[h])) out.push(f('warning', 'not-https', `${h} should start with https:// ("${r[h]}").`, where)); });
      const allowed = ALLOWED[platform] || {};
      Object.keys(allowed).forEach((h) => { if (r[h] && !allowed[h].includes(r[h].toLowerCase())) out.push(f('error', 'bad-value', `${h} "${r[h]}" is not one of: ${allowed[h].join(', ')}.`, where)); });
    });
    out.push(f('info', 'catalog-summary', `Checked ${rows.length} products against ${platform} starter rules.`));
    return out;
  }

  // ---------- Events against the catalog (do content_ids exist?) ----------
  // events: a Conversions API body ({"data":[...]}) or a list of events. Product ids are read from custom_data (or the event itself): content_ids and contents[].id.
  function auditMatch(events, csv, platform) {
    const out = [];
    const list = Array.isArray(events) ? events : events && events.data;
    if (!Array.isArray(list) || !list.length) return [f('warning', 'no-events', 'No events found. Paste a list of events or a Conversions API body.')];
    const { headers, rows } = parseCsv(csv);
    const idCol = platform === 'tiktok' ? 'sku_id' : 'id';
    if (!rows.length || !headers.includes(idCol)) return [f('error', 'catalog', `The catalog needs a header row with an "${idCol}" column.`)];
    const byId = {}, lower = {};
    rows.forEach((r) => { if (!byId[r[idCol]]) byId[r[idCol]] = r; lower[r[idCol].toLowerCase()] = r[idCol]; });
    const ids = Object.keys(byId);
    const seen = new Set(), matched = new Set();
    let noIds = 0;
    list.forEach((e, i) => {
      const c = e.custom_data || e;
      const where = `event ${i + 1} (${e.event_name || 'no name'})`;
      const items = {};
      [].concat(c.content_ids || []).forEach((id) => { items[String(id)] = items[String(id)] || {}; });
      (Array.isArray(c.contents) ? c.contents : []).forEach((x) => { if (x && x.id !== undefined) items[String(x.id)] = { price: x.item_price }; });
      const keys = Object.keys(items);
      if (!keys.length) { if (/^(ViewContent|AddToCart|Purchase|InitiateCheckout)$/.test(e.event_name || '')) noIds++; return; }
      if (!c.content_type) out.push(f('warning', 'no-content-type', 'content_ids are sent without content_type ("product" or "product_group"). The platform may not match them to the catalog.', where));
      keys.forEach((id) => {
        seen.add(id);
        const clean = id.trim();
        if (byId[clean]) {
          matched.add(id);
          const p = parseFloat(byId[clean].price), ip = Number(items[id].price);
          if (items[id].price !== undefined && isFinite(p) && isFinite(ip) && Math.abs(p - ip) > 0.01) out.push(f('warning', 'price-mismatch', `"${id}" is sent with item_price ${ip} but the catalog price is ${p}.`, where));
          if (id !== clean) out.push(f('warning', 'id-whitespace', `content id "${id}" has spaces around it. It only matches after trimming.`, where));
        } else if (lower[clean.toLowerCase()]) out.push(f('error', 'id-case', `content id "${id}" only matches catalog id "${lower[clean.toLowerCase()]}" if upper and lower case are ignored. Platforms compare them exactly.`, where));
        else {
          const kin = ids.filter((x) => x.startsWith(clean + '-') || x.startsWith(clean + '_') || clean.startsWith(x + '-') || clean.startsWith(x + '_'));
          out.push(f('error', 'id-not-in-catalog', `content id "${id}" is not in the catalog.` + (kin.length ? ` Similar catalog ids: ${kin.slice(0, 3).join(', ')}. Is the event sending a product id where the catalog uses a variant id, or the other way round?` : ''), where));
        }
      });
    });
    if (noIds) out.push(f('warning', 'no-content-ids', `${noIds} product event(s) (ViewContent, AddToCart, InitiateCheckout, Purchase) have no content_ids. They cannot feed catalog ads.`));
    out.push(f('info', 'match-summary', `${matched.size} of ${seen.size} distinct product id(s) in the events exist in the catalog (${ids.length} products).`));
    return out;
  }

  // ---------- Totals: platform purchases against real orders ----------
  // input: {"shop":{"orders":N,"revenue":N},"platforms":{"meta":{"purchases":N,"value":N,"browser":N,"server":N}}}
  // Thresholds are rules of thumb, not platform rules.
  function auditTotals(input) {
    const out = [];
    const shop = input && input.shop, plats = input && input.platforms;
    if (!shop || !(shop.orders > 0) || !plats || !Object.keys(plats).length) return [f('warning', 'no-totals', 'Expected {"shop":{"orders":100,"revenue":5000},"platforms":{"meta":{"purchases":100,"value":5000}}}. Orders must be above 0.')];
    const x = (r) => Math.round(r * 10) / 10 + 'x', pct = (r) => Math.round(r * 100) + '%';
    Object.entries(plats).forEach(([name, p]) => {
      const r = Number(p.purchases) / shop.orders;
      if (!isFinite(r)) { out.push(f('error', 'bad-number', `${name}: purchases is missing or not a number.`, name)); return; }
      const dedupFail = p.browser >= 0.8 * shop.orders && p.server >= 0.8 * shop.orders && p.purchases > 1.5 * shop.orders;
      if (dedupFail) out.push(f('error', 'dedup-failing', `${name} received ${p.browser} browser and ${p.server} server purchases for ${shop.orders} real orders and counted ${p.purchases} (${x(r)}). Browser and server events are not being deduplicated. Check that both send the same event_name and event_id.`, name));
      else if (r > 1.05) out.push(f('error', 'overcount', `${name} reports ${p.purchases} purchases for ${shop.orders} real orders (${x(r)}). It cannot see more purchases than the shop took, so something is counted twice: a duplicate tag, a thank-you page reload, or browser and server events without a shared event_id.`, name));
      else if (r < 0.4) out.push(f('error', 'undercount', `${name} reports only ${pct(r)} of real orders. Most purchases are not arriving: check the purchase trigger, consent handling and whether the server side events are being sent.`, name));
      else if (r < 0.7) out.push(f('warning', 'low-count', `${name} reports ${pct(r)} of real orders. Usual causes: consent banner, ad blockers, no server side events, or the purchase tag missing on some payment methods.`, name));
      else out.push(f('info', 'count-ok', `${name}: purchases are ${pct(r)} of real orders, which is in the normal range.`, name));
      if (shop.revenue > 0 && p.value !== undefined && r >= 0.7 && r <= 1.05) {
        const vr = Number(p.value) / shop.revenue;
        if (vr > 1.1) out.push(f('warning', 'value-high', `${name} value is ${pct(vr)} of shop revenue although the order count fits. Is tax or shipping included, or is the currency wrong?`, name));
        else if (vr < 0.9) out.push(f('warning', 'value-low', `${name} value is only ${pct(vr)} of shop revenue although the order count fits. Some purchases may be sent with a missing or zero value.`, name));
      }
    });
    out.push(f('info', 'totals-note', 'Use all purchase events received (for Meta, Events Manager), not ad attributed conversions, for the same period and currency as the shop figures. Shop orders should exclude cancelled and test orders.'));
    return out;
  }

  function summarize(findings) {
    const s = { error: 0, warning: 0, info: 0 };
    findings.forEach((x) => s[x.severity]++);
    return s;
  }

  const api = { auditGtm, auditEvents, auditServer, auditMatch, auditTotals, auditCatalog, parseCsv, summarize };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TrackingAudit = api;
})(typeof window !== 'undefined' ? window : globalThis);
